// Where a camera can stand: on ground a character could stand on outdoors,
// dry, not a cliff, clear of buildings and doodads (src/landmarks.ts puts the
// cameras around landmarks and asks this of each). And the picker's small
// tools: a seeded random, a shuffle, a split by weights.
import { Doodads, type Ground, isBuilding, type Wmos } from "./ground";

// a point a camera may stand at: z, the height of what stood there (a spawn's),
// or null (the ground's)
export type Candidate = { x: number; y: number; z: number | null };
export type Reason = "off-map" | "hole" | "underground" | "indoors" | "doodad" | "water" | "steep";

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

// The ground a camera stands on at a point, or why it can't: the terrain's
// height, or (a point with a height of its own, a spawn's: the tests' and the
// first picker's) that height where it stands on a city's floor (a big WMO
// over the terrain). Under the terrain is a cave or a cellar, inside a
// building's box is indoors, and a point with no height of its own inside any
// box is refused (its floor unknown), unless inBig: then it stands on the
// terrain inside a big box (a canyon, a lake, a cave system around a town:
// the Pool of Tears' around Stonard), the render to show it wasn't a city's
// floor.
const NO_DOODADS = new Doodads([]);
export function stand(c: Candidate, ground: Ground, wmos: Wmos, doodads = NO_DOODADS, inBig = false): { base: number } | { reason: Reason } {
  const g = ground.height(c.x, c.y);
  if (g == null) return { reason: "off-map" };
  if (ground.hole(c.x, c.y)) return { reason: "hole" };
  let base = g;
  // no height of its own (a subzone's middle) inside a city's or a cave's box:
  // the floor may be the WMO's, over or under the terrain, and nothing says which
  if (c.z == null && !inBig && wmos.at(c.x, c.y, g + 1).length) return { reason: "indoors" };
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
  // inside a trunk or a rock, or a yard from one, anywhere the eye may be
  // (2 to 3 yards up) give or take half a yard
  if (doodads.near(c.x, c.y, 1).some((d) => d.bottom <= base + 3.5 && d.top >= base + 1.5)) return { reason: "doodad" };
  const water = ground.liquid(c.x, c.y);
  if (water && water.level > base + WADING) return { reason: "water" };
  if (base === g) {
    const h = (dx: number, dy: number) => ground.height(c.x + dx, c.y + dy) ?? g;
    const rise = Math.max(Math.abs(h(2, 0) - h(-2, 0)), Math.abs(h(0, 2) - h(0, -2))) / 4;
    if (rise > STEEPEST) return { reason: "steep" };
  }
  return { base };
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
