// The cities' districts: a city is one big WMO (Stormwind's box is 1300
// yards across, mostly air), but the client names its parts, WMO groups
// (wow-data's wmo_group, client_WMOAreaTable): the Trade District, the
// Valley of Strength, the Great Forge. A district's landmark is its biggest
// group (15 to 250 yards across: a street, a square, a hall). Its floor is
// the WMO's, not the terrain under it, and nothing in the boxes says where it
// is, so a camera stands where the game puts a creature (a guard at his post,
// a patrol's waypoint: their heights are on the floor), 25 to 80 yards from
// the district's middle, not inside a small group (a shop, a room), and
// looks at it, down 12 degrees at most. The render says what it saw.
import type { Vec, View } from "./frame";
import type { WmoRow } from "./ground";

const DEG = Math.PI / 180;
// a district's landmark group this wide (its longer side), and a group
// narrower than ROOM a room a camera must not stand in
const SMALLEST = 15, LARGEST = 250, ROOM = 30;
// a camera this far from the district's middle, best near BEST
const NEAR = 25, FAR = 80, BEST = 40;
// an eye this high over the creature's feet
export const EYE = 2.5;
// looking down at most, up at most
const DOWN = 12 * DEG, UP = 15 * DEG;

export type Group = WmoRow & { map: number; placement: number; index: number; name: string; zone: number };
// parts: how many groups carry its name (the Canals 52, the Trade District
// 37, the War Room 1): a big district is the one a player knows
export type District = { group: Group; view: View; distance: number; parts: number };

const side = (g: WmoRow) => Math.max(g.max_x - g.min_x, g.max_y - g.min_y);
const inside = (g: WmoRow, p: Vec) => p[0] >= g.min_x && p[0] <= g.max_x && p[1] >= g.min_y && p[1] <= g.max_y && p[2] >= g.min_z && p[2] <= g.max_z;

// the districts of the cities' WMOs: one a name a placement, its biggest
// group the landmark, a camera at the creature's spot best placed for it
// (points: where creatures stand or walk, world yards, by map), not inside a
// room among every group of the placement (all: the unnamed ones too, a hall
// WMOAreaTable names for the city itself); a district with no spot is left
// out (a name in two cases, Darnassus' "Tradesmen's terrace", is one)
export type Placed = WmoRow & { map: number; placement: number };
export function districts(groups: Group[], points: Map<number, Vec[]>, all: Placed[] = groups): District[] {
  const byName = new Map<string, Group[]>();
  for (const g of groups) {
    const key = `${g.map}:${g.placement}:${g.name.toLowerCase()}`;
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(g);
  }
  const rooms = new Map<string, Placed[]>();
  for (const g of all) if (side(g) < ROOM) (rooms.get(`${g.map}:${g.placement}`) ?? rooms.set(`${g.map}:${g.placement}`, []).get(`${g.map}:${g.placement}`)!).push(g);
  const out: District[] = [];
  for (const list of byName.values()) {
    const fit = list.filter((g) => side(g) >= SMALLEST && side(g) <= LARGEST);
    if (!fit.length) continue;
    const g = fit.sort((a, b) => (b.max_x - b.min_x) * (b.max_y - b.min_y) - (a.max_x - a.min_x) * (a.max_y - a.min_y) || a.index - b.index)[0];
    const cx = (g.min_x + g.max_x) / 2, cy = (g.min_y + g.max_y) / 2;
    const small = rooms.get(`${g.map}:${g.placement}`) ?? [];
    let best: District | null = null;
    for (const p of points.get(g.map) ?? []) {
      const d = Math.hypot(p[0] - cx, p[1] - cy);
      if (d < NEAR || d > FAR || p[2] < g.min_z - 4 || p[2] > g.min_z + 30) continue;
      if (small.some((r) => r.unique_id !== g.unique_id && inside(r, p))) continue;
      const eye: Vec = [p[0], p[1], p[2] + EYE];
      const lowest = eye[2] - d * Math.tan(DOWN), highest = eye[2] + d * Math.tan(UP);
      const at: Vec = [cx, cy, Math.min(highest, Math.max(lowest, g.min_z + 6))];
      if (!best || Math.abs(d - BEST) < Math.abs(best.distance - BEST)) best = { group: g, view: { eye, at }, distance: d, parts: list.length };
    }
    if (best) out.push(best);
  }
  return out;
}
