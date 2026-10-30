// The ground of a continent, from wow-data's terrain_chunk (one row per map
// chunk, 33.3 yards a side): the height under a point, the water over it,
// a hole in it, the area the client names there. And the WMOs' boxes
// (wmo_placement), to keep cameras out of buildings.
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
export type WmoRow = { unique_id: number; min_x: number; min_y: number; min_z: number; max_x: number; max_y: number; max_z: number };

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
