// The user's own landmarks (src/extra-landmarks.json): a name a player knows
// (a peak, a camp, a statue, a creature's lair) and its zone, found in
// wow-data by its card's resolver (wow-data/src/card.ts' resolve: an area,
// a creature or an object by its exact name), placed where the game has it
// (an area: the middle of its ground in the zone; a creature or an object:
// its spawn nearest that middle), then pictured as a spot (src/spots.ts):
// the doodads around it, or, with none, the ground itself (a box 30 yards
// across and 20 high over it). An area is where its creatures gather most
// (Marshal's Refuge is its camp, not the jungle in its middle), else its
// middle; a peak (kind peak: a volcano, a mountain) is its area's highest
// ground, framed whole from farther off (a box 80 yards across, from 40
// under its top).
import type { Doodads, Ground } from "./ground";
import type { Landmark, Limits } from "./landmarks";
import { type Spot, spotKey, spotLandmark } from "./spots";

export type Extra = { name: string; zone: string; kind?: "place" | "peak" | "npc" | "object"; hint?: string };
// top: a peak's highest ground (its box is measured from it)
export type Found = { extra: Extra; map: number; x: number; y: number; top?: number };
export type Placed = Found | { extra: Extra; why: string };

// what pick.ts gives it: the zone's id by name, an area's ground (its
// chunks' middles and highest points, by map), the creatures standing in an
// area, a thing's spawns
type At = { map: number; x: number; y: number; zone: number };
export type Lookup = {
  zoneId: (name: string) => number | null;
  // every id of the name (wow-data's first, then its others): two areas or
  // creatures may share a name, the zone tells them apart
  resolve: (kind: "place" | "npc" | "object", name: string) => number[];
  areaGround: (area: number) => (At & { top: number })[];
  areaCreatures: (area: number) => At[];
  spawns: (kind: "npc" | "object", id: number) => At[];
};
// creatures gathered this close, this many at least, make an area's camp
const GATHER = 20, CAMP = 3;

// an extra placed, or why not: its zone unknown, its name unknown in it,
// nowhere in its zone. Its kind tried as given, else place, then npc, then
// object.
export function place(e: Extra, look: Lookup): Placed {
  const zone = look.zoneId(e.zone);
  if (zone == null) return { extra: e, why: `no zone named ${e.zone}` };
  let named = false;
  for (const kind of e.kind ? [e.kind] : (["place", "npc", "object"] as const))
    for (const id of look.resolve(kind === "peak" ? "place" : kind, e.name)) {
      named = true;
      if (kind === "peak") {
        const ground = look.areaGround(id).filter((p) => p.zone === zone);
        if (!ground.length) continue;
        const top = ground.reduce((a, b) => (b.top > a.top ? b : a));
        return { extra: e, map: top.map, x: top.x, y: top.y, top: top.top };
      }
      if (kind === "place") {
        const people = look.areaCreatures(id).filter((p) => p.zone === zone);
        const crowd = (p: At) => people.filter((q) => q.map === p.map && Math.hypot(q.x - p.x, q.y - p.y) <= GATHER).length;
        const camp = people.reduce<{ p: At; n: number } | null>((best, p) => {
          const n = crowd(p);
          return !best || n > best.n ? { p, n } : best;
        }, null);
        if (camp && camp.n >= CAMP) return { extra: e, map: camp.p.map, x: camp.p.x, y: camp.p.y };
      }
      const at = (kind === "place" ? look.areaGround(id) : look.spawns(kind, id)).filter((p) => p.zone === zone);
      if (!at.length) continue;
      // the one of its own nearest its middle (an area's chunk, a thing's
      // spawn: a crescent's average lies on someone else's ground)
      const mx = at.reduce((s, p) => s + p.x, 0) / at.length, my = at.reduce((s, p) => s + p.y, 0) / at.length;
      const p = at.reduce((a, b) => (Math.hypot(b.x - mx, b.y - my) < Math.hypot(a.x - mx, a.y - my) ? b : a));
      return { extra: e, map: p.map, x: p.x, y: p.y };
    }
  if (named) return { extra: e, why: `${e.name} is nowhere in ${e.zone}` };
  return { extra: e, why: `no place, creature or object named ${e.name} in ${e.zone}` };
}

// an extra's key: from its name and zone, so the list can be reordered
export const extraId = (e: Extra) => Number(BigInt(Bun.hash(`${e.zone}:${e.name}`.toLowerCase())) % 1_000_000_000n);

// a placed extra's landmark: its doodads', else its ground's, named as the
// user named it
export function extraLandmark(p: Found, ground: Ground, leaves: Doodads, zoneOf: (a: number) => number, limits: Limits): Landmark | null {
  const spot: Spot = { map: p.map, x: p.x, y: p.y, kind: "listed", id: extraId(p.extra) };
  const peak = p.extra.kind === "peak";
  const l = peak ? null : spotLandmark(spot, ground, leaves, zoneOf, () => true, { ...limits, zoneNamed: true });
  if (l) return { ...l, name: p.extra.name };
  const g = ground.height(p.x, p.y), area = ground.area(p.x, p.y);
  if (g == null || !area) return null;
  const top = peak ? Math.max(g, p.top ?? g) : g;
  const key = spotKey(spot), half = peak ? 40 : 15, low = peak ? top - 40 : g;
  return {
    map: p.map, area, floor: low, size: half * 2, kind: "listed", name: p.extra.name, at: [p.x, p.y, peak ? top - 10 : g + 10],
    box: { unique_id: key, file_id: key, min_x: p.x - half, max_x: p.x + half, min_y: p.y - half, max_y: p.y + half, min_z: low, max_z: peak ? top + 5 : g + 20 },
  };
}
