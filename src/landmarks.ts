// The picture is of something: a landmark is a WMO standing on the ground in
// a named place (an inn, a keep, a tower, a ruin, a bridge: the subzone names
// it). A camera is chosen around each, looking at it: on rings 12 to 80
// yards beyond the box's corners (at least 25 from its middle), its eye 3
// to 10 yards up, kept where the landmark fills a fair
// share of the picture, whole, not hidden, with some sky. A big WMO (160
// yards or more: a city, a fortress, Gadgetzan's walls) is no landmark: its
// box is mostly air, so what a camera sees of it can't be told from the box.
import { boxShare, shoot, type Shot, type Vec, type View } from "./frame";
import { apart, corners, type Doodads, type Ground, isBuilding, type WmoRow, type Wmos } from "./ground";
import { type Candidate, stand } from "./pick";

const DEG = Math.PI / 180;
export type Landmark = {
  map: number;
  area: number; // the subzone the client names where it stands (AreaTable id)
  box: WmoRow;
  floor: number; // the ground under its middle: its part below is left out
  at: Vec; // the point a camera looks at
  size: number; // its footprint's longer side, yards
};

// smaller than this across, or lower over the ground: a well, a cart, a
// dock's planks, not a place
const SMALLEST = 8, LOWEST = 6;
// up to this many a subzone, this far apart
const PER_AREA = 2, APART = 80;
// the steepest a camera looks down at a landmark
const STEEPEST = 12 * DEG;

// The landmarks of a map: its WMOs standing on the ground (their box rising 6
// yards over the ground at their middle: not a cave, whose box barely clears
// the hill it is dug into; their foot no more than 6 over it: not a thing in
// the sky; a crypt under a church goes deep and is fine), not in water (a
// wreck, a dock), under 160 yards across, in a named subzone that is a place
// (place(area): scripts/pick.ts drops a sea, a coast, a strand), the biggest
// of a subzone first, a second one 80 yards from it.
export function landmarks(map: number, ground: Ground, rows: WmoRow[], zoneOf: (area: number) => number, place: (area: number) => boolean = () => true): Landmark[] {
  const all: Landmark[] = [];
  for (const w of rows) {
    const cx = (w.min_x + w.max_x) / 2, cy = (w.min_y + w.max_y) / 2;
    const g = ground.height(cx, cy), area = ground.area(cx, cy);
    if (g == null || area == null || !area) continue;
    if (w.max_z - g < LOWEST || w.min_z > g + 6) continue;
    const size = Math.max(w.max_x - w.min_x, w.max_y - w.min_y);
    if (size < SMALLEST || !isBuilding(w) || zoneOf(area) === area || !place(area)) continue;
    const floor = Math.max(w.min_z, g);
    // a wreck or a dock standing in the sea or a lake: water, not a place
    const water = ground.liquid(cx, cy);
    if (water && water.level > g) continue;
    // its lower middle: a tall tower's top is sky, its door is the place
    all.push({ map, area, box: w, floor, at: [cx, cy, floor + Math.min(w.max_z - floor, 40) / 2], size });
  }
  const byArea = new Map<number, Landmark[]>();
  for (const l of all) (byArea.get(l.area) ?? byArea.set(l.area, []).get(l.area)!).push(l);
  const out: Landmark[] = [];
  for (const list of byArea.values()) {
    const kept: Landmark[] = [];
    const area = (l: Landmark) => (l.box.max_x - l.box.min_x) * (l.box.max_y - l.box.min_y);
    for (const l of list.sort((a, b) => area(b) - area(a) || a.box.unique_id - b.box.unique_id)) {
      if (kept.length >= PER_AREA) break;
      if (kept.every((k) => Math.hypot(k.at[0] - l.at[0], k.at[1] - l.at[1]) >= APART)) kept.push(l);
    }
    out.push(...kept);
  }
  return out;
}

// doodads: their collision boxes (what stands in the way of a camera);
// leaves: their whole boxes (what hides a landmark from it)
export type World = { ground: Ground; wmos: Wmos; doodads: Doodads; leaves: Doodads };
export type Viewpoint = { view: View; shot: Shot; share: number; distance: number; height: number; score: number };

// a heading kept clear close by: no ground at the eye within 5 yards, no
// other building's box within 12, no solid doodad near the middle of the
// frame (any part of it within 30 degrees, looking wider than 20 or within 3
// yards: the picker's doodad rule)
export function clear(x: number, y: number, eye: number, yaw: number, world: World, target: WmoRow): boolean {
  const dx = Math.cos(yaw), dy = Math.sin(yaw);
  for (const d of [2, 3, 4, 6, 8, 10, 12]) {
    const px = x + dx * d, py = y + dy * d, h = world.ground.height(px, py);
    if (h == null || (d <= 5 && h > eye - 0.5)) return false;
    if (world.wmos.at(px, py, eye).some((w) => isBuilding(w) && w.unique_id !== target.unique_id)) return false;
  }
  return !world.doodads
    .near(x, y, 60)
    .filter((d) => d.bottom <= eye + 0.5 && d.top >= eye - 0.5)
    .some((d) => {
      const offs = corners(d, x, y).map((b) => ((b - yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      const lo = Math.min(...offs), hi = Math.max(...offs);
      if (hi - lo > Math.PI) return false;
      return lo < 30 * DEG && hi > -30 * DEG && (hi - lo > 20 * DEG || apart(d, x, y) < 3);
    });
}

// The best viewpoint of a landmark, or null: 16 bearings, 4 distances (12,
// 30, 55 and 80 yards beyond its box's corners, at least 25 from its
// middle), eyes 3, 6 and 10 yards up, looking down 12 degrees at most. A
// camera must stand
// (the picker's rules), see the landmark along a clear heading and frame it
// (its box 12 to 75% of the picture, whole). The 12 best framed are cast
// through (the ground, other WMOs, doodads with their leaves): kept when no
// more than a third of the box is hidden, the middle of the picture isn't a
// wall within 8 yards, and it fills 8% of the picture; scored by fill (best
// near a third), sky (best 10 to 35%) and less for what is hidden.
export function viewpoint(l: Landmark, world: World): Viewpoint | null {
  const half = Math.hypot(l.box.max_x - l.box.min_x, l.box.max_y - l.box.min_y) / 2;
  const rings = [Math.max(25, half + 12), half + 30, half + 55, half + 80];
  const framed: { view: View; share: number; distance: number; height: number }[] = [];
  for (let b = 0; b < 16; b++) {
    const bearing = (b * Math.PI) / 8;
    for (const distance of rings) {
      const x = l.at[0] + Math.cos(bearing) * distance, y = l.at[1] + Math.sin(bearing) * distance;
      const c: Candidate = { x, y, z: null };
      const s = stand(c, world.ground, world.wmos, world.doodads);
      if ("reason" in s) continue;
      for (const height of [3, 6, 10]) {
        const eye = s.base + height;
        // looking down no more than 12 degrees: the horizon stays in the
        // picture (the lens is 27 degrees each way), a place, not a map
        if (Math.atan2(l.at[2] - eye, distance) < -STEEPEST) continue;
        const yaw = Math.atan2(l.at[1] - y, l.at[0] - x);
        if (!clear(x, y, eye, yaw, world, l.box)) continue;
        const view: View = { eye: [x, y, eye], at: l.at };
        const { share, clipped, behind } = boxShare(view, l.box, l.floor);
        if (behind) continue;
        if (share < 0.12 || share > 0.75 || clipped) continue;
        framed.push({ view, share, distance, height });
      }
    }
  }
  // the 12 framed nearest a third of the picture, cast through
  framed.sort((a, b) => Math.abs(a.share - 0.33) - Math.abs(b.share - 0.33) || a.distance - b.distance || a.height - b.height);
  let best: Viewpoint | null = null;
  for (const f of framed.slice(0, 12)) {
    const others = world.wmos.near(f.view.eye[0], f.view.eye[1], f.distance + 60).filter((w) => w.unique_id !== l.box.unique_id);
    // (the doodads between the camera and the landmark's far side, ahead of it)
    const [ex, ey] = f.view.eye, toward = Math.atan2(l.at[1] - ey, l.at[0] - ex);
    const blockers = world.leaves.near(ex, ey, Math.hypot(l.at[0] - ex, l.at[1] - ey) + half).filter((d) => {
      const off = Math.abs(((Math.atan2(d.cy - ey, d.cx - ex) - toward + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      return off < 60 * DEG || Math.hypot(d.cx - ex, d.cy - ey) < d.reach + 2;
    });
    const shot = shoot(f.view, l.box, l.floor, others, world.ground, blockers);
    if (shot.hidden > 1 / 3 || shot.near > 0.25 || shot.fill < 0.08) continue;
    const fit = 1 - Math.min(1, Math.abs(shot.fill - 0.33) / 0.33);
    const sky = shot.sky < 0.1 ? shot.sky / 0.1 : shot.sky > 0.35 ? Math.max(0, 1 - (shot.sky - 0.35) / 0.35) : 1;
    const score = fit + 0.5 * sky - shot.hidden;
    if (!best || score > best.score) best = { ...f, shot, score };
  }
  return best;
}

// The landmarks kept, the best first in each zone, up to its share: at most
// 2 a subzone (PER_AREA), no two closer than APART yards.
export function choose<T extends { landmark: Landmark; view: Viewpoint; zone: number }>(found: T[], want: Map<number, number>): T[] {
  const out: T[] = [];
  for (const [zone, n] of want) {
    const list = found.filter((f) => f.zone === zone).sort((a, b) => b.view.score - a.view.score || a.landmark.box.unique_id - b.landmark.box.unique_id);
    const kept: T[] = [];
    for (const f of list) {
      if (kept.length >= n) break;
      if (kept.filter((k) => k.landmark.area === f.landmark.area).length >= PER_AREA) continue;
      if (kept.some((k) => Math.hypot(k.landmark.at[0] - f.landmark.at[0], k.landmark.at[1] - f.landmark.at[1]) < APART)) continue;
      kept.push(f);
    }
    out.push(...kept);
  }
  return out;
}
