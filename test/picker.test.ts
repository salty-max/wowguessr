// The picker's parts on a made-up patch of ground: no database, no game file.
import { describe, expect, test } from "bun:test";
import { apart, CHUNK, type ChunkRow, type DoodadRow, Doodads, Ground, ORIGIN, solid, UNIT, type WmoRow, Wmos } from "../src/ground";
import { boxShare, project, rayBox, rayGround, raySolid, shoot } from "../src/frame";
import { choose, clear, landmarks, viewpoint, WIDE, type World } from "../src/landmarks";
import { type Candidate, quotas, random, shuffle, stand } from "../src/pick";
import { check } from "../src/imagecheck";

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
const at = (more: Partial<Candidate> = {}): Candidate => ({ x: mx, y: my, z: 50, ...more });
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): WmoRow =>
  ({ unique_id: 1, file_id: 1, min_x: x0, min_y: y0, min_z: z0, max_x: x1, max_y: y1, max_z: z1 });

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
  test("no height of its own inside a big box: refused, unless inBig (the terrain then)", () => {
    const lake = new Wmos([box(mx - 300, my - 300, 0, mx + 300, my + 300, 90)]);
    expect(stand(at({ z: null }), flat, lake)).toEqual({ reason: "indoors" });
    expect(stand(at({ z: null }), flat, lake, undefined, true)).toEqual({ base: 50 });
    // a building's box still is indoors
    expect(stand(at({ z: null }), flat, new Wmos([box(mx - 10, my - 10, 45, mx + 10, my + 10, 70)]), undefined, true)).toEqual({ reason: "indoors" });
  });
  test("in water over the ankles, or on a cliff: refused", () => {
    const wet = new Uint8Array(8).fill(0xff);
    const lake = new Ground(field((r, c) => (r === 500 && c === 500 ? chunk(r, c, 50, { liquid_type: 5, liquid_min: 53, liquid_max: 53, liquid_cells: wet }) : null)));
    expect(stand(at(), lake, none)).toEqual({ reason: "water" });
    const cliff = new Ground(field((r, c) => chunk(r, c, (vr) => 50 + (r * 8 + vr) * 8)));
    expect(stand(at({ z: null }), cliff, none)).toEqual({ reason: "steep" });
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

});

describe("the picker's tools", () => {
  test("quotas sum to the count, by weight", () => {
    const q = quotas(new Map([["a", 1], ["b", 1], ["c", 2]]), 10);
    expect([...q.values()].reduce((s, n) => s + n, 0)).toBe(10);
    expect(q.get("c")).toBe(5);
  });
  test("the same seed, the same draw and the same shuffle", () => {
    const a = random(7), b = random(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(shuffle([1, 2, 3, 4, 5], random(3))).toEqual(shuffle([1, 2, 3, 4, 5], random(3)));
  });
});

describe("the lens", () => {
  // a camera 20 yards south of a point, at its height, looking north at it
  const view = { eye: [mx - 20, my, 60] as [number, number, number], at: [mx, my, 60] as [number, number, number] };
  test("the look-at is the middle of the picture, east to the right, up up", () => {
    expect(project(view, [mx, my, 60])).toMatchObject({ x: 0, y: 0, front: true });
    // (east is -y: the game's y runs west)
    expect(project(view, [mx, my - 5, 60]).x).toBeGreaterThan(0);
    expect(project(view, [mx, my, 65]).y).toBeGreaterThan(0);
    expect(project(view, [mx - 40, my, 60]).front).toBe(false);
  });
  test("a box's share of the picture, whole or cut by the frame", () => {
    const small = box(mx - 2, my - 2, 58, mx + 2, my + 2, 62);
    const s = boxShare(view, small, 0);
    expect(s.clipped).toBe(false);
    expect(s.share).toBeGreaterThan(0.01);
    expect(s.share).toBeLessThan(0.1);
    expect(boxShare(view, box(mx - 2, my - 80, 0, mx + 2, my + 80, 120), 0).clipped).toBe(true);
    // its part under the floor is left out
    expect(boxShare(view, small, 61).share).toBeLessThan(s.share);
  });
  test("rays meet boxes, turned boxes and the ground where they are", () => {
    const o: [number, number, number] = [0, 0, 10], north: [number, number, number] = [1, 0, 0];
    expect(rayBox(o, north, box(5, -1, 0, 6, 1, 20))).toBeCloseTo(5);
    expect(rayBox(o, north, box(5, 2, 0, 6, 3, 20))).toBeNull();
    // a rock 2 yards across turned a quarter: its box's x along the game's y
    const rock = { cx: 8, cy: 0, fx: 0, fy: 1, hx: 3, hy: 1, bottom: 0, top: 20, reach: 4 };
    expect(raySolid(o, north, rock)).toBeCloseTo(7);
    const down: [number, number, number] = [Math.SQRT1_2, 0, -Math.SQRT1_2];
    const flat = new Ground(field());
    const hit = rayGround([mx, my, 60], down, flat)!;
    expect(60 + down[2] * hit).toBeLessThanOrEqual(50.01);
    expect(rayGround([mx, my, 60], [1, 0, 0], flat, 100)).toBeNull();
  });
  test("a cast counts what the landmark fills, what hides it and the sky", () => {
    const flat = new Ground(field());
    const house = box(mx + 20, my - 5, 50, mx + 30, my + 5, 60);
    const v = { eye: [mx - 10, my, 53] as [number, number, number], at: [mx + 25, my, 55] as [number, number, number] };
    const open = shoot(v, house, 50, [], flat);
    expect(open.fill).toBeGreaterThan(0.02);
    expect(open.hidden).toBe(0);
    expect(open.sky).toBeGreaterThan(0.2);
    // a wall between them hides it
    const wall = box(mx, my - 20, 40, mx + 2, my + 20, 80);
    expect(shoot(v, house, 50, [wall], flat).hidden).toBeGreaterThan(0.9);
  });
});

describe("the landmarks", () => {
  const flat = () => new Ground(field());
  const zoneOf = (a: number) => (a === 99 ? 99 : 12);
  // the subzone's area id is 12 in the field (its zone: 99, so 12 is named)
  const named = (rows: ChunkRow[]) => rows.map((r) => ({ ...r, area_id: 12 }));
  const zone99 = (a: number) => (a === 12 ? 99 : a);
  const house = (x: number, y: number, size = 12, id = 1) => ({ ...box(x - size / 2, y - size / 2, 49, x + size / 2, y + size / 2, 62), unique_id: id });
  test("a WMO standing in a named place, not a cave, not tiny, not in water, the biggest first", () => {
    const g = new Ground(named(field()));
    const l = landmarks(0, g, [house(mx, my, 12, 1), house(mx + 100, my, 20, 2), house(mx, my + 100, 5, 3)], zone99);
    expect(l.map((x) => x.box.unique_id)).toEqual([2, 1]);
    // a cave: its box under the ground
    expect(landmarks(0, g, [{ ...house(mx, my), min_z: 20, max_z: 52 }], zone99)).toEqual([]);
    // at most 2 a subzone, 80 yards apart
    expect(landmarks(0, g, [house(mx, my, 12, 1), house(mx + 30, my, 12, 2), house(mx + 120, my, 12, 3), house(mx - 120, my, 12, 4)], zone99).length).toBe(2);
    // the zone itself is no named place, nor a subzone a player never discovers (a sea, a coast)
    expect(landmarks(0, flat(), [house(mx, my)], zoneOf)).toEqual([]);
    expect(landmarks(0, g, [house(mx, my)], zone99, () => false)).toEqual([]);
  });
  test("a viewpoint looks at the landmark, frames it, and sees it", () => {
    const g = new Ground(named(field()));
    const world: World = { ground: g, wmos: new Wmos([house(mx, my, 16)]), doodads: new Doodads([]), leaves: new Doodads([]) };
    const [l] = landmarks(0, g, [house(mx, my, 16)], zone99);
    const v = viewpoint(l, world)!;
    expect(v).not.toBeNull();
    expect(v.view.at).toEqual(l.at);
    expect(v.share).toBeGreaterThanOrEqual(0.12);
    expect(v.shot.hidden).toBeLessThanOrEqual(1 / 3);
    const d = Math.hypot(v.view.eye[0] - mx, v.view.eye[1] - my);
    expect(d).toBeGreaterThanOrEqual(25);
    expect(d).toBeLessThanOrEqual(100);
  });
  test("a camera looks down 12 degrees at most: a house in a pit 14 yards deep is seen from nowhere", () => {
    // the house's chunk sunk to z 36, the ring around it at 50: from 25 yards
    // with the eye 3 to 10 yards up, it is 30 to 45 degrees down
    const pit = new Ground(named(field((r, c) => (r === 500 && c === 500 ? chunk(r, c, 36) : null))));
    const sunk = { ...house(mx, my, 10), min_z: 35, max_z: 44 };
    const world: World = { ground: pit, wmos: new Wmos([sunk]), doodads: new Doodads([]), leaves: new Doodads([]) };
    const [l] = landmarks(0, pit, [sunk], zone99);
    expect(l).toBeDefined();
    expect(viewpoint(l, world)).toBeNull();
  });
  test("a heading with a rock in the face, or another house within 12 yards, isn't clear", () => {
    const g = new Ground(field());
    const rock: DoodadRow = { x: mx + 5, y: my, z: 50, yaw: 0, scale: 1, col_min_x: -2, col_min_y: -2, col_min_z: 0, col_max_x: 2, col_max_y: 2, col_max_z: 6 };
    const target = house(mx + 50, my, 12, 9);
    const w = (d: DoodadRow[], h: WmoRow[] = []): World => ({ ground: g, wmos: new Wmos(h), doodads: new Doodads(d), leaves: new Doodads([]) });
    expect(clear(mx, my, 53, 0, w([]), target)).toBe(true);
    expect(clear(mx, my, 53, 0, w([rock]), target)).toBe(false);
    expect(clear(mx, my, 53, 0, w([], [house(mx + 8, my, 6, 2)]), target)).toBe(false);
    // the landmark's own box never blocks
    expect(clear(mx, my, 53, 0, w([], [{ ...target, min_x: mx + 5 }]), { ...target, min_x: mx + 5 })).toBe(true);
  });
  test("chosen: the best of a zone first, its share, one a name, one a model, 80 yards apart", () => {
    const f = (zone: number, area: number, x: number, score: number, id: number, model = id) =>
      ({ zone, landmark: { area, at: [x, 0, 0], box: { unique_id: id, file_id: model } }, view: { score } }) as unknown as Parameters<typeof choose>[0][number];
    const found = [f(1, 10, 0, 0.5, 1), f(1, 10, 100, 0.9, 2), f(1, 11, 30, 0.8, 4), f(1, 12, 300, 0.7, 6, 2), f(1, 13, 500, 0.6, 7), f(2, 20, 0, 0.1, 5)];
    const ids = (list: ReturnType<typeof choose>) => list.map((g) => g.landmark.box.unique_id);
    // zone 1: 2 (best), not 4 (70 yards from 2), not 6 (2's model), 7, not 1 (2's name); zone 2: 5
    expect(ids(choose(found, new Map([[1, 3], [2, 1]])))).toEqual([2, 7, 5]);
    // two areas of one name are one place
    expect(ids(choose(found, new Map([[1, 3]]), (a) => (a === 13 ? "10" : String(a))))).toEqual([2]);
    // kept before: counted in the share, its name and model kept out
    expect(ids(choose(found, new Map([[1, 2]]), String, [found[4]]))).toEqual([2]);
  });
  test("one notch looser for a zone short of landmarks: a hut, a tower on the zone's own ground", () => {
    const g = new Ground(named(field()));
    const hut = { ...box(mx - 3, my - 3, 49, mx + 3, my + 3, 55), unique_id: 5 };
    expect(landmarks(0, g, [hut], zone99)).toEqual([]);
    expect(landmarks(0, g, [hut], zone99, () => true, WIDE).length).toBe(1);
    expect(landmarks(0, flat(), [house(mx, my)], zoneOf, () => true, WIDE).map((l) => l.area)).toEqual([12]);
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
});
