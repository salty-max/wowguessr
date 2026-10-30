// Where a camera stands and where it looks: a candidate point (a spawn, a
// patrol's road, a flight master, a subzone's middle) is kept when a
// character could stand there outdoors, dry, on ground that isn't a cliff,
// and then turned to the most open heading, a building in view preferred.
import { type Ground, isBuilding, type Wmos } from "./ground";

export type Kind = "subzone" | "road" | "taxi" | "spawn";
export type Candidate = { kind: Kind; map: number; x: number; y: number; z: number | null; ref: string };
export type Reason = "off-map" | "hole" | "underground" | "indoors" | "water" | "steep" | "boxed-in";
export type Aim = { yaw: number; pitch: number; lookAt: [number, number, number] };

const DEG = Math.PI / 180;
// how far a spawn may stand off the ground and still be on it (a log, a step)
const ON_GROUND = 2;
// water deeper than this at the feet: swimming
const WADING = 0.5;
// the steepest ground a camera stands on (rise over run, 2 yards each way)
const STEEPEST = 1.2;

// A seeded random (mulberry32): the same seed, the same picks.
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The ground a character stands on at a candidate, or why it can't: the
// terrain's height, or a spawn's own z where it stands on a city's floor (a
// big WMO over the terrain). Under the terrain is a cave or a cellar, inside a
// building's box is indoors, and a point with no height of its own inside any
// box is refused (its floor unknown).
export function stand(c: Candidate, ground: Ground, wmos: Wmos): { base: number } | { reason: Reason } {
  const g = ground.height(c.x, c.y);
  if (g == null) return { reason: "off-map" };
  if (ground.hole(c.x, c.y)) return { reason: "hole" };
  let base = g;
  // no height of its own (a subzone's middle) inside a city's or a cave's box:
  // the floor may be the WMO's, over or under the terrain, and nothing says which
  if (c.z == null && wmos.at(c.x, c.y, g + 1).length) return { reason: "indoors" };
  if (c.z != null) {
    if (c.z < g - ON_GROUND) return { reason: "underground" };
    if (c.z > g + ON_GROUND) {
      const boxes = wmos.at(c.x, c.y, c.z);
      if (boxes.some(isBuilding)) return { reason: "indoors" };
      // on a city's floor or a bridge (a big box): its own height; else a
      // flyer or a creature on a rock: the ground under it
      if (boxes.length) base = c.z;
    }
  }
  if (wmos.at(c.x, c.y, base + 1).some(isBuilding)) return { reason: "indoors" };
  const water = ground.liquid(c.x, c.y);
  if (water && water.level > base + WADING) return { reason: "water" };
  if (base === g) {
    const h = (dx: number, dy: number) => ground.height(c.x + dx, c.y + dy) ?? g;
    const rise = Math.max(Math.abs(h(2, 0) - h(-2, 0)), Math.abs(h(0, 2) - h(0, -2))) / 4;
    if (rise > STEEPEST) return { reason: "steep" };
  }
  return { base };
}

// The heading a camera at eye height looks along, or null when every way is
// a wall: 16 headings (the game's facing: 0 north, +x, a quarter turn west, +y),
// each blocked by ground rising to the eye close by, a cliff in the first 20
// yards, a building's box in the first 12 or the map's edge in the first 20,
// the rest scored by how far it sees (ground under the eye line) and by a
// building 25 to 200 yards ahead (a place a player knows). One is drawn by
// score, its pitch slight: 0.4 of the slope to the ground 40 yards ahead, 2
// degrees down to 3 up on top, within 6 down and 8 up (lower, the first
// sample's pictures were mostly ground).
export function aim(x: number, y: number, eye: number, ground: Ground, wmos: Wmos, rand: () => number): Aim | null {
  const headings: { yaw: number; score: number }[] = [];
  const buildings = wmos.near(x, y, 200).map((w) => ({ x: (w.min_x + w.max_x) / 2, y: (w.min_y + w.max_y) / 2 }));
  for (let i = 0; i < 16; i++) {
    const yaw = (((i + (rand() - 0.5) * 0.5) * Math.PI) / 8 + 2 * Math.PI) % (2 * Math.PI);
    const dx = Math.cos(yaw), dy = Math.sin(yaw);
    let blocked = false;
    for (const d of [2, 3, 4, 6, 8, 10, 13, 16, 20]) {
      const px = x + dx * d, py = y + dy * d, h = ground.height(px, py);
      if (h == null || (d <= 5 && h > eye - 0.5) || Math.atan2(h - eye, d) > 30 * DEG || (d <= 12 && wmos.at(px, py, eye).some(isBuilding))) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const far = [30, 45, 60, 90, 120, 160].map((d) => {
      const h = ground.height(x + dx * d, y + dy * d);
      return h == null ? null : Math.atan2(h - eye, d);
    });
    const seen = far.filter((e) => e != null && e < 8 * DEG).length / far.length;
    let score = 0.3 + seen;
    if (far.some((e) => e == null)) score *= 0.2; // the map's edge: the void
    if (far.some((e) => e != null && e > 35 * DEG)) score *= 0.3; // a mountain's wall
    if (buildings.some((b) => {
      const d = Math.hypot(b.x - x, b.y - y);
      const off = Math.abs(((Math.atan2(b.y - y, b.x - x) - yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      return d >= 25 && off < 25 * DEG;
    }))
      score += 0.6;
    headings.push({ yaw, score });
  }
  if (!headings.length) return null;
  const total = headings.reduce((s, h) => s + h.score ** 2, 0);
  let draw = rand() * total, pick = headings[0];
  for (const h of headings) if ((draw -= h.score ** 2) <= 0) { pick = h; break; }
  const ahead = ground.height(x + Math.cos(pick.yaw) * 40, y + Math.sin(pick.yaw) * 40) ?? eye;
  const pitch = Math.min(8 * DEG, Math.max(-6 * DEG, Math.atan2(ahead - eye, 40) * 0.4 + (rand() * 5 - 2) * DEG));
  const d = 30;
  return {
    yaw: pick.yaw,
    pitch,
    lookAt: [x + Math.cos(pick.yaw) * Math.cos(pitch) * d, y + Math.sin(pick.yaw) * Math.cos(pitch) * d, eye + Math.sin(pitch) * d],
  };
}

// n split over weights, largest remainders first: the counts sum to n
export function quotas<K>(weights: Map<K, number>, n: number): Map<K, number> {
  const sum = [...weights.values()].reduce((a, b) => a + b, 0);
  const exact = [...weights].map(([k, w]) => ({ k, q: (w / sum) * n }));
  const out = new Map(exact.map((e) => [e.k, Math.floor(e.q)]));
  let left = n - [...out.values()].reduce((a, b) => a + b, 0);
  for (const e of [...exact].sort((a, b) => (b.q % 1) - (a.q % 1))) {
    if (left-- <= 0) break;
    out.set(e.k, out.get(e.k)! + 1);
  }
  return out;
}

// a list shuffled in place (Fisher-Yates)
export function shuffle<T>(list: T[], rand: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// A zone's candidates in the order they are tried: a subzone's middle, a
// road, a flight master and a spawn in turn, each kind shuffled.
export function order(cands: Candidate[], rand: () => number): Candidate[] {
  const kinds = (["subzone", "road", "taxi", "spawn"] as Kind[]).map((k) => shuffle(cands.filter((c) => c.kind === k), rand));
  const out: Candidate[] = [];
  for (let i = 0; kinds.some((l) => i < l.length); i++) for (const l of kinds) if (i < l.length) out.push(l[i]);
  return out;
}

export type Location = {
  id: number; map: number; x: number; y: number; z: number; yaw: number; pitch: number; lookAt: [number, number, number];
  ground: number; zone: number; subzone: number; kind: Kind; ref: string;
};
export type Spread = { picked: Location[]; rejects: Record<Reason, number>; tried: number; short: number };

// Each zone's share (want) from its candidates in turn (queues, consumed): no
// two cameras of a zone within spacing yards, at most perSubzone a subzone.
// The share of a zone that ran dry (a city underground) goes to the zones
// that still have candidates, one at a time, spacing halved only when a whole
// pass gives none, down to 20 yards.
export function spread(
  want: Map<number, number>,
  queues: Map<number, Candidate[]>,
  worlds: Map<number, { ground: Ground; wmos: Wmos }>,
  rand: () => number,
  spacing = 150,
  perSubzone = 3,
): Spread {
  const picked: Location[] = [];
  const rejects: Record<Reason, number> = { "off-map": 0, hole: 0, underground: 0, indoors: 0, water: 0, steep: 0, "boxed-in": 0 };
  const perSub = new Map<number, number>();
  // candidates too close to a pick, kept for a pass with a smaller spacing
  const aside = new Map<number, Candidate[]>();
  let tried = 0;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const fill = (zone: number, n: number, apart: number) => {
    const queue = queues.get(zone) ?? [];
    let got = 0;
    while (got < n && queue.length) {
      const c = queue.shift()!;
      const { ground, wmos } = worlds.get(c.map)!;
      const subzone = ground.area(c.x, c.y)!;
      if ((perSub.get(subzone) ?? 0) >= perSubzone) continue;
      if (picked.some((p) => p.zone === zone && p.map === c.map && Math.hypot(p.x - c.x, p.y - c.y) < apart)) {
        (aside.get(zone) ?? aside.set(zone, []).get(zone)!).push(c);
        continue;
      }
      tried++;
      const s = stand(c, ground, wmos);
      if ("reason" in s) {
        rejects[s.reason]++;
        continue;
      }
      const eye = s.base + 2 + rand();
      const a = aim(c.x, c.y, eye, ground, wmos, rand);
      if (!a) {
        rejects["boxed-in"]++;
        continue;
      }
      picked.push({
        id: picked.length + 1, map: c.map, x: r2(c.x), y: r2(c.y), z: r2(eye),
        yaw: Math.round(a.yaw * 1000) / 1000, pitch: Math.round(a.pitch * 1000) / 1000,
        lookAt: a.lookAt.map(r2) as [number, number, number],
        ground: r2(s.base), zone, subzone, kind: c.kind, ref: c.ref,
      });
      perSub.set(subzone, (perSub.get(subzone) ?? 0) + 1);
      got++;
    }
    return got;
  };
  let short = 0;
  for (const [zone, n] of want) short += n - fill(zone, n, spacing);
  for (let apart = spacing / 2; short > 0 && apart >= 20; apart /= 2) {
    for (const [zone, list] of aside) queues.set(zone, [...list, ...(queues.get(zone) ?? [])]);
    aside.clear();
    for (let gave = 1; short > 0 && gave; ) {
      gave = 0;
      for (const zone of want.keys()) if (short > 0) {
        const got = fill(zone, 1, apart);
        short -= got;
        gave += got;
      }
    }
  }
  return { picked, rejects, tried, short };
}
