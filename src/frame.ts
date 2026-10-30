// What a camera sees of a landmark, before anything is rendered: the
// landmark's box projected through the renderer's lens, and a coarse grid of
// rays over the ground, the other WMOs' boxes and the sky, so a viewpoint is
// scored on what the picture will be of.
import type { Ground, Solid, WmoRow } from "./ground";

const DEG = Math.PI / 180;
// the renderer's lens: 53.97 degrees high (its DEFAULT_FOV_VALUE), 16:9
export const FOV_Y = 53.9726294579437 * DEG, ASPECT = 16 / 9;
const TAN_Y = Math.tan(FOV_Y / 2), TAN_X = TAN_Y * ASPECT;

export type Vec = [number, number, number];
export type View = { eye: Vec; at: Vec };
type Basis = { f: Vec; r: Vec; u: Vec };

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

// the camera's axes: forward to the look-at, right and up of the picture
// (world z up; the game's x north, y west, so right is forward x up)
function basis(v: View): Basis {
  const f = norm(sub(v.at, v.eye));
  const r = norm(cross(f, [0, 0, 1]));
  return { f, r, u: cross(r, f) };
}

// where a world point falls in the picture, -1 to 1 each way (y up), and
// whether it is in front of the camera
export function project(v: View, p: Vec, b = basis(v)): { x: number; y: number; front: boolean } {
  const d = sub(p, v.eye);
  const z = dot(d, b.f);
  return { x: dot(d, b.r) / (Math.max(z, 1e-6) * TAN_X), y: dot(d, b.u) / (Math.max(z, 1e-6) * TAN_Y), front: z > 0.1 };
}

const corners = (w: WmoRow, floor: number): Vec[] => {
  const out: Vec[] = [];
  for (const x of [w.min_x, w.max_x]) for (const y of [w.min_y, w.max_y]) for (const z of [Math.max(w.min_z, floor), w.max_z]) out.push([x, y, z]);
  return out;
};

// the share of the picture the box's projection covers (its bounding
// rectangle, clipped to the frame), and whether the frame cuts it; floor:
// the box's part under the ground is left out
export function boxShare(v: View, w: WmoRow, floor: number): { share: number; clipped: boolean; behind: boolean } {
  const b = basis(v);
  const ps = corners(w, floor).map((p) => project(v, p, b));
  if (ps.some((p) => !p.front)) return { share: 0, clipped: true, behind: true };
  const x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x));
  const y0 = Math.min(...ps.map((p) => p.y)), y1 = Math.max(...ps.map((p) => p.y));
  const cx0 = Math.max(-1, x0), cx1 = Math.min(1, x1), cy0 = Math.max(-1, y0), cy1 = Math.min(1, y1);
  const share = cx1 > cx0 && cy1 > cy0 ? ((cx1 - cx0) * (cy1 - cy0)) / 4 : 0;
  return { share, clipped: x0 < -1 || x1 > 1 || y0 < -1 || y1 > 1, behind: false };
}

// where a ray enters a box (its distance), or null (slab test)
export function rayBox(o: Vec, d: Vec, w: WmoRow, floor = -Infinity): number | null {
  let t0 = 0, t1 = Infinity;
  const lo = [w.min_x, w.min_y, Math.max(w.min_z, floor)], hi = [w.max_x, w.max_y, w.max_z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    let a = (lo[i] - o[i]) / d[i], c = (hi[i] - o[i]) / d[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

// where a ray enters a doodad's turned box (its rectangle on the ground and
// the heights it spans), or null: the slab test in the box's own axes
export function raySolid(o: Vec, d: Vec, s: Solid): number | null {
  const ox = o[0] - s.cx, oy = o[1] - s.cy;
  const lo = [-s.hx, -s.hy, s.bottom], hi = [s.hx, s.hy, s.top];
  const p = [ox * s.fx + oy * s.fy, -ox * s.fy + oy * s.fx, o[2]], q = [d[0] * s.fx + d[1] * s.fy, -d[0] * s.fy + d[1] * s.fx, d[2]];
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(q[i]) < 1e-9) {
      if (p[i] < lo[i] || p[i] > hi[i]) return null;
      continue;
    }
    let a = (lo[i] - p[i]) / q[i], c = (hi[i] - p[i]) / q[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

// where a ray meets the ground, marching (2 yards near, 4 farther), or null
// within reach
export function rayGround(o: Vec, d: Vec, ground: Ground, reach = 400): number | null {
  for (let t = 1; t <= reach; t += t < 40 ? 2 : 4) {
    const h = ground.height(o[0] + d[0] * t, o[1] + d[1] * t);
    if (h != null && o[2] + d[2] * t <= h) return t;
  }
  return null;
}

export type Shot = {
  fill: number; // the share of rays that see the landmark first
  hidden: number; // of the rays that pass through its box, the share something else stops first
  sky: number; // the share of rays that meet nothing within reach
  near: number; // the share of the middle third's rays stopped within 8 yards (a wall in the face)
};

// a grid of rays over the picture, each stopped by the ground, the
// landmark's box (above its floor), another WMO's box or a doodad (its whole
// box, leaves too: blockers)
export function shoot(v: View, target: WmoRow, floor: number, others: WmoRow[], ground: Ground, blockers: Solid[] = [], cols = 16, rows = 9): Shot {
  const b = basis(v);
  let seen = 0, through = 0, hidden = 0, sky = 0, mid = 0, near = 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const sx = ((i + 0.5) / cols) * 2 - 1, sy = 1 - ((j + 0.5) / rows) * 2;
      const d = norm([
        b.f[0] + b.r[0] * sx * TAN_X + b.u[0] * sy * TAN_Y,
        b.f[1] + b.r[1] * sx * TAN_X + b.u[1] * sy * TAN_Y,
        b.f[2] + b.r[2] * sx * TAN_X + b.u[2] * sy * TAN_Y,
      ]);
      const tTarget = rayBox(v.eye, d, target, floor);
      let tFirst = rayGround(v.eye, d, ground) ?? Infinity;
      for (const w of others) {
        const t = rayBox(v.eye, d, w);
        if (t != null && t > 0.5 && t < tFirst) tFirst = t;
      }
      for (const s of blockers) {
        const t = raySolid(v.eye, d, s);
        if (t != null && t > 0.5 && t < tFirst) tFirst = t;
      }
      if (tTarget != null) {
        through++;
        if (tTarget <= tFirst) seen++;
        else hidden++;
      } else if (tFirst === Infinity) sky++;
      if (Math.abs(sx) < 1 / 3 && Math.abs(sy) < 1 / 3) {
        mid++;
        if (Math.min(tFirst, tTarget ?? Infinity) < 8) near++;
      }
    }
  const n = cols * rows;
  return { fill: seen / n, hidden: through ? hidden / through : 0, sky: sky / n, near: mid ? near / mid : 0 };
}
