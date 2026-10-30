// The picker's parts on a made-up patch of ground: no database, no game file.
import { describe, expect, test } from "bun:test";
import { apart, CHUNK, type ChunkRow, type DoodadRow, Doodads, Ground, ORIGIN, solid, UNIT, type WmoRow, Wmos } from "../src/ground";
import { aim, type Candidate, order, quotas, random, spread, stand } from "../src/pick";
import { check, grayWorld } from "../src/imagecheck";

// a chunk at (row, col): flat at z, or its heights from a function of the vertex
function chunk(row: number, col: number, z: number | ((r: number, k: number) => number), more: Partial<ChunkRow> = {}): ChunkRow {
  const f = typeof z === "number" ? () => z : z;
  const hs = Array.from({ length: 81 }, (_, i) => f(Math.floor(i / 9), i % 9));
  const lo = Math.min(...hs), hi = Math.max(...hs);
  return {
    row, col, x: ORIGIN - row * CHUNK, y: ORIGIN - col * CHUNK, area_id: 12, z_min: lo, z_max: hi,
    heights: Uint8Array.from(hs, (h) => (hi > lo ? Math.round(((h - lo) / (hi - lo)) * 255) : 0)),
    holes: null, liquid_type: null, liquid_min: null, liquid_max: null, liquid_cells: null, ...more,
  };
}
// a 9x9 field of flat chunks around (500, 500), at z 50
const field = (center: (r: number, c: number) => ChunkRow | null = () => null) => {
  const rows: ChunkRow[] = [];
  for (let r = 496; r <= 504; r++) for (let c = 496; c <= 504; c++) rows.push(center(r, c) ?? chunk(r, c, 50));
  return rows;
};
// the middle of chunk (500, 500)
const mx = ORIGIN - 500.5 * CHUNK, my = ORIGIN - 500.5 * CHUNK;
const at = (more: Partial<Candidate> = {}): Candidate => ({ kind: "spawn", map: 0, x: mx, y: my, z: 50, ref: "test", ...more });
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): WmoRow =>
  ({ unique_id: 1, min_x: x0, min_y: y0, min_z: z0, max_x: x1, max_y: y1, max_z: z1 });

describe("the ground", () => {
  test("the height between a chunk's vertices, bilinear", () => {
    // rising one yard a vertex row (x falling)
    const g = new Ground([chunk(500, 500, (r) => 10 + r)]);
    const c = g.chunk(mx, my)!;
    expect(g.height(c.x - 2.5 * UNIT, c.y - 1 * UNIT)).toBeCloseTo(12.5, 1);
    expect(g.height(ORIGIN - 400 * CHUNK, my)).toBeNull();
  });
  test("water and holes by cell (bit row * 8 + col)", () => {
    const cells = new Uint8Array(8);
    cells[0] = 0b10; // row 0, col 1
    const g = new Ground([chunk(500, 500, 50, { liquid_type: 5, liquid_min: 52, liquid_max: 52, liquid_cells: cells, holes: cells })]);
    const c = g.chunk(mx, my)!;
    expect(g.liquid(c.x - 0.5 * UNIT, c.y - 1.5 * UNIT)).toEqual({ type: 5, level: 52 });
    expect(g.liquid(c.x - 1.5 * UNIT, c.y - 0.5 * UNIT)).toBeNull();
    expect(g.hole(c.x - 0.5 * UNIT, c.y - 1.5 * UNIT)).toBe(true);
  });
});

describe("where a camera stands", () => {
  const flat = new Ground(field()), none = new Wmos([]);
  test("on open, dry, flat ground: the ground's height", () => {
    expect(stand(at(), flat, none)).toEqual({ base: 50 });
  });
  test("a spawn under the ground is in a cave, one in a building's box is indoors", () => {
    expect(stand(at({ z: 40 }), flat, none)).toEqual({ reason: "underground" });
    expect(stand(at(), flat, new Wmos([box(mx - 10, my - 10, 45, mx + 10, my + 10, 70)]))).toEqual({ reason: "indoors" });
  });
  test("on a city's floor (a big box): the spawn's own height", () => {
    const city = new Wmos([box(mx - 600, my - 600, 0, mx + 600, my + 600, 200)]);
    expect(stand(at({ z: 58 }), flat, city)).toEqual({ base: 58 });
  });
  test("in water over the ankles, or on a cliff: refused", () => {
    const wet = new Uint8Array(8).fill(0xff);
    const lake = new Ground(field((r, c) => (r === 500 && c === 500 ? chunk(r, c, 50, { liquid_type: 5, liquid_min: 53, liquid_max: 53, liquid_cells: wet }) : null)));
    expect(stand(at(), lake, none)).toEqual({ reason: "water" });
    const cliff = new Ground(field((r, c) => chunk(r, c, (vr) => 50 + (r * 8 + vr) * 8)));
    expect(stand(at({ z: null }), cliff, none)).toEqual({ reason: "steep" });
  });
});

describe("where a camera looks", () => {
  test("away from a wall of ground, toward the open", () => {
    // a ridge rising sharply to the north (+x): rows below 500 are 40 yards up
    const ridge = new Ground(field((r, c) => (r < 500 ? chunk(r, c, 90) : null)));
    for (let seed = 1; seed <= 20; seed++) {
      const a = aim(mx, my, 52.5, ridge, new Wmos([]), random(seed))!;
      expect(Math.cos(a.yaw)).toBeLessThan(0.5);
    }
  });
  test("boxed in on every side (a pit): none", () => {
    const pit = new Ground(field((r, c) => (r === 500 && c === 500 ? chunk(r, c, (vr, vk) => 50 + 30 * Math.max(Math.abs(vr - 4), Math.abs(vk - 4))) : chunk(r, c, 200))));
    expect(aim(mx, my, 52.5, pit, new Wmos([]), random(1))).toBeNull();
  });
  test("the look-at lies 30 yards along the yaw and the pitch", () => {
    const a = aim(mx, my, 52.5, new Ground(field()), new Wmos([]), random(3))!;
    const [x, y, z] = a.lookAt;
    expect(Math.hypot(x - mx, y - my, z - 52.5)).toBeCloseTo(30, 0);
    expect(Math.atan2(y - my, x - mx)).toBeCloseTo(a.yaw > Math.PI ? a.yaw - 2 * Math.PI : a.yaw, 2);
    expect(Math.abs(a.pitch)).toBeLessThanOrEqual(8 * Math.PI / 180 + 1e-9);
  });
});

describe("the doodads", () => {
  // a model with a collision box 1 yard either side and 6 high, placed at (x, y) at scale
  const rock = (x: number, y: number, scale = 1, z = 50): DoodadRow =>
    ({ x, y, z, yaw: 0, scale, col_min_x: -1, col_min_y: -1, col_min_z: 0, col_max_x: 1, col_max_y: 1, col_max_z: 6 });
  test("a solid is its collision box turned and scaled; grass (no box, or an empty one) is none", () => {
    const d = solid(rock(0, 0, 2))!;
    expect([d.cx, d.cy, d.hx, d.hy, d.bottom, d.top]).toEqual([0, 0, 2, 2, 50, 62]);
    expect(solid({ ...rock(0, 0), col_min_x: 0, col_max_x: 0, col_min_y: 0, col_max_y: 0, col_max_z: 0 })).toBeNull();
    expect(solid({ ...rock(0, 0), col_min_x: 1e7, col_max_x: -1e7 })).toBeNull();
  });
  test("a wall 20 yards long turned with its placement: along yaw + 180 degrees, its offset box moved with it", () => {
    // its box runs x 0 to 20 (from its foot forward), 1 yard thick; yaw 270: +x points to the game's facing 90 (west, +y)
    const wall = solid({ ...rock(0, 0), yaw: 270, col_min_x: 0, col_max_x: 20, col_min_y: -0.5, col_max_y: 0.5 })!;
    expect(wall.cx).toBeCloseTo(0, 6);
    expect(wall.cy).toBeCloseTo(10, 6);
    expect(apart(wall, 0, 15)).toBeCloseTo(0, 6);
    expect(apart(wall, 5, 15)).toBeCloseTo(4.5, 6);
    expect(apart(wall, 0, -5)).toBeCloseTo(5, 6);
  });
  test("a cliff piece 300 yards across is found from anywhere near its rectangle, not only near its foot", () => {
    const cliff = new Doodads([{ ...rock(0, 0), col_min_x: -150, col_max_x: 150, col_min_y: -150, col_max_y: 150 }]);
    expect(cliff.near(140, 140, 1).length).toBe(1);
    expect(cliff.near(160, 0, 5).length).toBe(0);
  });
  test("a camera inside a trunk, or a yard from one, is refused", () => {
    const flat = new Ground(field());
    expect(stand(at(), flat, new Wmos([]), new Doodads([rock(mx + 1.5, my)]))).toEqual({ reason: "doodad" });
    expect(stand(at(), flat, new Wmos([]), new Doodads([rock(mx + 4, my)]))).toEqual({ base: 50 });
  });
  test("never looking at a rock that would fill the middle of the frame", () => {
    // 2 yards wide, 4 yards north (+x): about 28 degrees wide (to its corners)
    const near = new Doodads([rock(mx + 5, my)]);
    for (let seed = 1; seed <= 30; seed++) {
      const a = aim(mx, my, 52.5, new Ground(field()), new Wmos([]), random(seed), near)!;
      const off = Math.abs(((a.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      expect(off).toBeGreaterThan(30 * Math.PI / 180);
    }
  });
  test("a small one far off changes nothing", () => {
    const far = new Doodads([rock(mx + 40, my)]), flat = new Ground(field());
    for (let seed = 1; seed <= 10; seed++)
      expect(aim(mx, my, 52.5, flat, new Wmos([]), random(seed), far)).toEqual(aim(mx, my, 52.5, flat, new Wmos([]), random(seed)));
  });
});

describe("the spread", () => {
  test("quotas sum to the count, by weight", () => {
    const q = quotas(new Map([["a", 1], ["b", 1], ["c", 2]]), 10);
    expect([...q.values()].reduce((s, n) => s + n, 0)).toBe(10);
    expect(q.get("c")).toBe(5);
  });
  test("the kinds take turns", () => {
    const c = (kind: Candidate["kind"], i: number): Candidate => ({ ...at(), kind, ref: `${kind}${i}` });
    const list = order([c("spawn", 1), c("spawn", 2), c("road", 1), c("subzone", 1)], random(1));
    expect(list.map((l) => l.kind)).toEqual(["subzone", "road", "spawn", "spawn"]);
  });
  // a zone of open flat ground (area 12), its candidates in a line 30 yards apart
  const world = () => new Map([[0, { ground: new Ground(field()), wmos: new Wmos([]) }]]);
  const line = (n: number) => Array.from({ length: n }, (_, i): Candidate => ({ ...at(), z: null, kind: "road", x: mx - 120 + i * 30, ref: `p${i}` }));
  test("no two cameras of a zone closer than the spacing, at most so many a subzone", () => {
    const s = spread(new Map([[1, 3]]), new Map([[1, line(9)]]), world(), random(1), 100, 5);
    expect(s.picked.length).toBe(3);
    for (const a of s.picked) for (const b of s.picked) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(100);
    const capped = spread(new Map([[1, 4]]), new Map([[1, line(9)]]), world(), random(1), 20, 2);
    expect(capped.picked.length).toBe(2);
  });
  test("a dry zone's share goes to one with candidates, closer together, those set aside tried again", () => {
    // 9 points 30 yards apart: 2 fit 150 yards apart, more once the spacing halves
    const alone = spread(new Map([[1, 9]]), new Map([[1, line(9)]]), world(), random(1), 150, 10);
    const shared = spread(new Map([[1, 2], [2, 7]]), new Map([[1, line(9)], [2, []]]), world(), random(1), 150, 10);
    expect(shared.picked.length).toBeGreaterThan(2);
    expect(shared.picked.every((p) => p.zone === 1)).toBe(true);
    expect(shared.short).toBe(9 - shared.picked.length);
    expect(alone.picked.length).toBe(shared.picked.length);
    for (const a of shared.picked) for (const b of shared.picked) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(37.5);
  });
  test("a point with no height of its own inside a WMO's box is refused (its floor unknown)", () => {
    const city = new Wmos([box(mx - 600, my - 600, 0, mx + 600, my + 600, 200)]);
    expect(stand(at({ z: null }), new Ground(field()), city)).toEqual({ reason: "indoors" });
  });
  test("the same seed, the same draw", () => {
    const a = random(7), b = random(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("the image check", () => {
  const image = (f: (x: number, y: number) => [number, number, number]) => {
    const rgb = new Uint8Array(160 * 90 * 3);
    for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) rgb.set(f(x, y), (y * 160 + x) * 3);
    return { width: 160, height: 90, rgb };
  };
  test("a wall of one colour is flat, a scene with sky and ground is not", () => {
    expect(check(image(() => [90, 70, 50])).why).toContain("flat");
    const scene = image((x, y) => (y < 40 ? [120 + (x % 7), 160, 220] : [40 + ((x * 7 + y * 13) % 90), 70 + ((x * 3) % 60), 30 + (y % 25)]));
    expect(check(scene).ok).toBe(true);
  });
  test("a wall right ahead with the sky around it", () => {
    const wall = image((x, y) => (x > 45 && x < 115 && y > 25 && y < 65 ? [100, 90, 80] : [(x * 5) % 255, (y * 9) % 255, ((x + y) * 3) % 255]));
    expect(check(wall).why).toEqual(["wall ahead"]);
  });
  test("a night or a cave is dark", () => {
    expect(check(image((x, y) => [(x + y) % 30, (x * 2) % 25, y % 20])).why).toContain("dark");
  });
  test("gray world brings an orange cast back to gray", () => {
    const orange = grayWorld(image(() => [200, 140, 80]));
    expect([...orange.rgb.slice(0, 3)]).toEqual([140, 140, 140]);
  });
});
