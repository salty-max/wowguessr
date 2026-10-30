// Landmarks that aren't buildings: a spot the game's data names (a camp where
// creatures gather, a flight master, a graveyard) and the doodads standing
// around it (tents, a roost, tombstones, a campfire's logs: what the map
// files draw there; the game's objects and creatures are not drawn). Its box
// is those doodads' boxes together, its name its subzone's, and a camera is
// chosen around it as around a building (viewpoint), the doodads inside its
// box left out of what stands in the way.
import type { Vec } from "./frame";
import type { Doodads, Ground, Solid, WmoRow } from "./ground";
import { type Landmark, type Limits, STRICT } from "./landmarks";

// id: the database's own (a camp's seed spawn's spawn_id, a flight master's
// TaxiNodes ID, a graveyard's id): its key stays while the data does
export type Spot = { map: number; x: number; y: number; kind: string; id: number };
// (listed: the user's own, src/extras.ts)
export const KINDS = ["camp", "flight master", "graveyard", "listed"];
// a spot's key in drops.json and locations.json's wmo: negative, from its
// kind and its database id, apart from the districts' (under 600 million)
export const spotKey = (s: Spot) => -((2 + KINDS.indexOf(s.kind)) * 1e9 + s.id);

// the doodads standing within REACH of the spot (their middles), each at
// least TALL high and at most PIECE across (a tent, a totem, not a tree's
// crown or a cliff piece touching the circle), make its box; a box under
// SMALLEST across or LOWEST high over the ground is nothing to see (a lone
// campfire, a sign)
const REACH = 14, TALL = 1.5, PIECE = 10, SMALLEST = 6, LOWEST = 3;
// a camp: this many creatures within CAMP yards of the first of them
const CAMP = 20, GATHER = 3;

// the camps: places GATHER or more creature spawns stand within CAMP yards of
// one, the seed (each spawn counted in one camp, the densest first); ids: the
// spawns' own (spawn_id), a camp keyed by its seed's
export function camps(map: number, points: Vec[], ids: number[]): Spot[] {
  const cell = (v: number) => Math.floor(v / CAMP);
  const grid = new Map<string, number[]>();
  points.forEach((p, i) => {
    const k = `${cell(p[0])}:${cell(p[1])}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  const near = (p: Vec) => {
    const out: number[] = [];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const i of grid.get(`${cell(p[0]) + a}:${cell(p[1]) + b}`) ?? []) if (Math.hypot(points[i][0] - p[0], points[i][1] - p[1]) <= CAMP) out.push(i);
    return out;
  };
  const order = points.map((p, i) => ({ i, n: near(p).length })).sort((a, b) => b.n - a.n || a.i - b.i);
  const used = new Set<number>(), out: Spot[] = [];
  for (const { i, n } of order) {
    if (n < GATHER || used.has(i)) continue;
    const members = near(points[i]).filter((j) => !used.has(j));
    if (members.length < GATHER) continue;
    for (const j of members) used.add(j);
    const x = members.reduce((s, j) => s + points[j][0], 0) / members.length, y = members.reduce((s, j) => s + points[j][1], 0) / members.length;
    out.push({ map, x, y, kind: "camp", id: ids[i] });
  }
  return out;
}

// a spot's landmark: its doodads' box, named by the subzone under it, or
// null: off the map, in water, nothing standing around it, or (as a
// building) on the zone's own ground (limits.zoneNamed) or not a place
export function spotLandmark(s: Spot, ground: Ground, leaves: Doodads, zoneOf: (a: number) => number, place: (a: number) => boolean, limits: Limits = STRICT): Landmark | null {
  const g = ground.height(s.x, s.y), area = ground.area(s.x, s.y);
  if (g == null || !area || !place(area) || (zoneOf(area) === area && !limits.zoneNamed)) return null;
  const water = ground.liquid(s.x, s.y);
  if (water && water.level > g) return null;
  const key = spotKey(s);
  const around = leaves.near(s.x, s.y, REACH).filter((d: Solid) => d.top - d.bottom >= TALL && d.reach <= PIECE && Math.hypot(d.cx - s.x, d.cy - s.y) <= REACH);
  if (!around.length) return null;
  const xs: number[] = [], ys: number[] = [];
  for (const d of around)
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      xs.push(d.cx + a * d.hx * d.fx - b * d.hy * d.fy);
      ys.push(d.cy + a * d.hx * d.fy + b * d.hy * d.fx);
    }
  const box: WmoRow = {
    unique_id: key, file_id: key,
    min_x: Math.min(...xs), max_x: Math.max(...xs), min_y: Math.min(...ys), max_y: Math.max(...ys),
    min_z: Math.min(g, ...around.map((d) => d.bottom)), max_z: Math.max(...around.map((d) => d.top)),
  };
  const size = Math.max(box.max_x - box.min_x, box.max_y - box.min_y);
  if (size < SMALLEST || size >= 160 || box.max_z - g < LOWEST) return null;
  const cx = (box.min_x + box.max_x) / 2, cy = (box.min_y + box.max_y) / 2;
  return { map: s.map, area, box, floor: g, at: [cx, cy, g + Math.min(box.max_z - g, 20) / 2], size, kind: s.kind };
}

// the spots' landmarks, as landmarks() keeps buildings: the biggest of a
// subzone first, a second 80 yards from it (skip: keys left out before)
export function spotLandmarks(spots: Spot[], ground: Ground, leaves: Doodads, zoneOf: (a: number) => number, place: (a: number) => boolean, limits: Limits = STRICT, skip: (key: number) => boolean = () => false): Landmark[] {
  const byArea = new Map<number, Landmark[]>();
  for (const s of spots) {
    if (skip(spotKey(s))) continue;
    const l = spotLandmark(s, ground, leaves, zoneOf, place, limits);
    if (l) (byArea.get(l.area) ?? byArea.set(l.area, []).get(l.area)!).push(l);
  }
  const out: Landmark[] = [];
  const foot = (l: Landmark) => (l.box.max_x - l.box.min_x) * (l.box.max_y - l.box.min_y);
  for (const list of byArea.values()) {
    const kept: Landmark[] = [];
    for (const l of list.sort((a, b) => foot(b) - foot(a) || a.box.unique_id - b.box.unique_id)) {
      if (kept.length >= 2) break;
      if (kept.every((k) => Math.hypot(k.at[0] - l.at[0], k.at[1] - l.at[1]) >= 80)) kept.push(l);
    }
    out.push(...kept);
  }
  return out;
}
