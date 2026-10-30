// The ground of a continent, from wow-data's terrain_chunk (one row per map
// chunk, 33.3 yards a side): the height under a point, the water over it,
// a hole in it, the area the client names there. The WMOs' boxes
// (wmo_placement), to keep cameras out of buildings, and the solid doodads
// (doodad_placement, doodad_model), to keep trunks and rocks out of the lens.
export const ORIGIN = 17066.666666, CHUNK = 533.333333 / 16, UNIT = CHUNK / 8;

export type ChunkRow = {
  row: number;
  col: number;
  x: number;
  y: number;
  area_id: number;
  z_min: number;
  z_max: number;
  heights: Uint8Array;
  holes: Uint8Array | null;
  liquid_type: number | null;
  liquid_min: number | null;
  liquid_max: number | null;
  liquid_cells: Uint8Array | null;
};
export type WmoRow = { unique_id: number; file_id: number; min_x: number; min_y: number; min_z: number; max_x: number; max_y: number; max_z: number };

// a bit of an 8x8 mask kept as 8 bytes, little end first
const bit = (m: Uint8Array | null, i: number) => !!m && !!(m[i >> 3] & (1 << (i & 7)));

export class Ground {
  private chunks = new Map<number, ChunkRow>();
  constructor(rows: ChunkRow[]) {
    for (const r of rows) this.chunks.set(r.row * 1024 + r.col, r);
  }
  get all(): Iterable<ChunkRow> {
    return this.chunks.values();
  }
  chunk(x: number, y: number): ChunkRow | undefined {
    return this.chunks.get(Math.floor((ORIGIN - x) / CHUNK) * 1024 + Math.floor((ORIGIN - y) / CHUNK));
  }
  // the cell (0-63) of the chunk's 8x8 a point is in, and where in it
  private cell(c: ChunkRow, x: number, y: number) {
    const fr = Math.min(7.9999, Math.max(0, (c.x - x) / UNIT)), fk = Math.min(7.9999, Math.max(0, (c.y - y) / UNIT));
    const r = Math.floor(fr), k = Math.floor(fk);
    return { r, k, u: fr - r, v: fk - k };
  }
  // the ground's height (bilinear between the chunk's corner vertices); null off the map
  height(x: number, y: number): number | null {
    const c = this.chunk(x, y);
    if (!c) return null;
    const { r, k, u, v } = this.cell(c, x, y);
    const h = (i: number, j: number) => c.z_min + (c.heights[i * 9 + j] / 255) * (c.z_max - c.z_min);
    return (h(r, k) * (1 - v) + h(r, k + 1) * v) * (1 - u) + (h(r + 1, k) * (1 - v) + h(r + 1, k + 1) * v) * u;
  }
  // the surface of the liquid over a point (its highest in the chunk), null when dry
  liquid(x: number, y: number): { type: number; level: number } | null {
    const c = this.chunk(x, y);
    if (!c || c.liquid_type == null || c.liquid_max == null) return null;
    const { r, k } = this.cell(c, x, y);
    return bit(c.liquid_cells, r * 8 + k) ? { type: c.liquid_type, level: c.liquid_max } : null;
  }
  hole(x: number, y: number): boolean {
    const c = this.chunk(x, y);
    if (!c) return false;
    const { r, k } = this.cell(c, x, y);
    return bit(c.holes, r * 8 + k);
  }
  area(x: number, y: number): number | null {
    return this.chunk(x, y)?.area_id ?? null;
  }
}

// A box is a building when it is small: a city, a canyon or a cave system
// (Stormwind's is 1300 yards across) holds outdoor ground in its box.
export const BUILDING = 160;
export const isBuilding = (w: WmoRow) => w.max_x - w.min_x < BUILDING && w.max_y - w.min_y < BUILDING;

export class Wmos {
  private grid = new Map<number, WmoRow[]>();
  private static readonly CELL = 64;
  constructor(rows: WmoRow[]) {
    const c = Wmos.CELL;
    for (const w of rows)
      for (let i = Math.floor(w.min_x / c); i <= Math.floor(w.max_x / c); i++)
        for (let j = Math.floor(w.min_y / c); j <= Math.floor(w.max_y / c); j++) {
          const key = i * 100_000 + j;
          const list = this.grid.get(key);
          if (list) list.push(w);
          else this.grid.set(key, [w]);
        }
  }
  // the boxes holding a point (z: within their height too)
  at(x: number, y: number, z?: number): WmoRow[] {
    const list = this.grid.get(Math.floor(x / Wmos.CELL) * 100_000 + Math.floor(y / Wmos.CELL)) ?? [];
    return list.filter(
      (w) => x >= w.min_x && x <= w.max_x && y >= w.min_y && y <= w.max_y && (z === undefined || (z >= w.min_z && z <= w.max_z)),
    );
  }
  // the buildings within a distance of a point (their boxes' centres)
  near(x: number, y: number, radius: number): WmoRow[] {
    const c = Wmos.CELL, seen = new Set<WmoRow>();
    for (let i = Math.floor((x - radius) / c); i <= Math.floor((x + radius) / c); i++)
      for (let j = Math.floor((y - radius) / c); j <= Math.floor((y + radius) / c); j++)
        for (const w of this.grid.get(i * 100_000 + j) ?? []) if (isBuilding(w)) seen.add(w);
    return [...seen].filter((w) => Math.hypot((w.min_x + w.max_x) / 2 - x, (w.min_y + w.max_y) / 2 - y) <= radius);
  }
}

// A doodad a camera can't see through: a placement whose model has a
// collision box (a trunk, a rock, a wall; grass and flowers have none), as
// that box turned and scaled on the ground (a rectangle: its centre, its long
// and short half-sides along its axes) and the heights it spans. The model's
// +x axis lies along the game's facing yaw + 180 degrees (noggit's transform:
// the line checked by a render of a turned wall in Darkshore, not which end
// is which), +y a quarter turn left of it.
export type Solid = { cx: number; cy: number; fx: number; fy: number; hx: number; hy: number; bottom: number; top: number; reach: number };
export type DoodadRow = {
  x: number; y: number; z: number; yaw: number; scale: number;
  col_min_x: number; col_min_y: number; col_min_z: number; col_max_x: number; col_max_y: number; col_max_z: number;
};
// thinner than this across (yards) or lower (yards): not in the way
const THIN = 0.3, LOW = 0.5;
export function solid(d: DoodadRow): Solid | null {
  if (d.col_min_x > d.col_max_x || d.col_min_y > d.col_max_y || d.col_min_z > d.col_max_z) return null;
  const s = d.scale, hx = ((d.col_max_x - d.col_min_x) / 2) * s, hy = ((d.col_max_y - d.col_min_y) / 2) * s;
  const bottom = d.z + s * d.col_min_z, top = d.z + s * d.col_max_z;
  if (Math.max(hx, hy) * 2 < THIN || top - bottom < LOW) return null;
  const t = ((d.yaw + 180) * Math.PI) / 180, fx = Math.cos(t), fy = Math.sin(t);
  const mx = ((d.col_min_x + d.col_max_x) / 2) * s, my = ((d.col_min_y + d.col_max_y) / 2) * s;
  // the box's centre: along +x by mx, along +y (left: -fy, fx) by my
  return { cx: d.x + mx * fx - my * fy, cy: d.y + mx * fy + my * fx, fx, fy, hx, hy, bottom, top, reach: Math.hypot(hx, hy) };
}
// how far a point is from a solid's rectangle (0: inside it)
export function apart(d: Solid, x: number, y: number): number {
  const dx = x - d.cx, dy = y - d.cy;
  const a = Math.abs(dx * d.fx + dy * d.fy) - d.hx, b = Math.abs(-dx * d.fy + dy * d.fx) - d.hy;
  return Math.hypot(Math.max(a, 0), Math.max(b, 0));
}
// the bearings of its four corners from a point (radians, the game's facing)
export function corners(d: Solid, x: number, y: number): number[] {
  const out: number[] = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = d.cx + a * d.hx * d.fx - b * d.hy * d.fy, py = d.cy + a * d.hx * d.fy + b * d.hy * d.fx;
    out.push(Math.atan2(py - y, px - x));
  }
  return out;
}

export class Doodads {
  private grid = new Map<number, Solid[]>();
  private static readonly CELL = 64;
  // each solid in every cell its rectangle may touch (a cliff piece is 600
  // yards across), so a lookup reads only the cells around a point
  constructor(rows: DoodadRow[]) {
    const c = Doodads.CELL;
    for (const row of rows) {
      const d = solid(row);
      if (!d) continue;
      for (let i = Math.floor((d.cx - d.reach) / c); i <= Math.floor((d.cx + d.reach) / c); i++)
        for (let j = Math.floor((d.cy - d.reach) / c); j <= Math.floor((d.cy + d.reach) / c); j++) {
          const key = i * 100_000 + j;
          const list = this.grid.get(key);
          if (list) list.push(d);
          else this.grid.set(key, [d]);
        }
    }
  }
  // the solids whose rectangle comes within radius of a point
  near(x: number, y: number, radius: number): Solid[] {
    const c = Doodads.CELL, seen = new Set<Solid>();
    for (let i = Math.floor((x - radius) / c); i <= Math.floor((x + radius) / c); i++)
      for (let j = Math.floor((y - radius) / c); j <= Math.floor((y + radius) / c); j++)
        for (const d of this.grid.get(i * 100_000 + j) ?? []) if (!seen.has(d) && apart(d, x, y) <= radius) seen.add(d);
    return [...seen];
  }
}
