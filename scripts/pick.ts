// The location picker (step 3 of ideas/geoguessr.md): cameras on Eastern
// Kingdoms and Kalimdor, from wow-data's database only, spread over the
// zones that have a zone map (by the square root of their size), written to
// locations.json. Deterministic for a seed.
//   bun scripts/pick.ts [--count 500] [--seed 1] [--out locations.json]
import { writeFileSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { familyPath } from "../src/family";
import { CHUNK, type ChunkRow, Ground, type WmoRow, Wmos } from "../src/ground";
import { type Candidate, order, quotas, random, spread } from "../src/pick";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const COUNT = Number(arg("count", "500")), SEED = Number(arg("seed", "1")), OUT = arg("out", "locations.json");
// no two cameras of a zone closer than this, nor more than this many in one subzone
const SPACING = 150, PER_SUBZONE = 3;
const MAPS = [0, 1];

const { openDb } = (await import(familyPath("wow-data", "src", "db.ts"))) as { openDb: (game: string) => Database };
const db = openDb("classic");
if (!db.query("SELECT 1 FROM sqlite_master WHERE name = 'terrain_chunk'").get())
  throw new Error("classic.db has no terrain_chunk: rebuild it (bun wow-data/bin/build.ts classic)");
const rand = random(SEED);

// the zone of an area: up its parents to the top
const parent = new Map((db.query("SELECT ID, ParentAreaID FROM client_AreaTable ORDER BY ID").all() as { ID: number; ParentAreaID: number }[]).map((a) => [a.ID, a.ParentAreaID]));
const zoneOf = (area: number) => {
  for (let i = 0; i < 10 && parent.get(area); i++) area = parent.get(area)!;
  return area;
};
// the zones a player sees a map of (UiMap type 3) on the two continents
const zones = new Set(
  (db.query(`SELECT DISTINCT m.AreaID a FROM client_UiMapAssignment m JOIN client_UiMap u ON u.ID = m.UiMapID
     JOIN client_AreaTable t ON t.ID = m.AreaID WHERE u.Type = 3 AND m.MapID IN (0, 1) AND t.ParentAreaID = 0 ORDER BY m.AreaID`).all() as { a: number }[]).map((r) => r.a),
);

const grounds = new Map<number, Ground>(), boxes = new Map<number, Wmos>();
for (const map of MAPS) {
  grounds.set(map, new Ground(db.query("SELECT * FROM terrain_chunk WHERE map_id = ? ORDER BY row, col").all(map) as ChunkRow[]));
  boxes.set(map, new Wmos(db.query("SELECT * FROM wmo_placement WHERE map_id = ? ORDER BY unique_id").all(map) as WmoRow[]));
}

// the candidates
const cands: Candidate[] = [];
for (const s of db.query("SELECT kind, entity_id, map_id, x, y, z FROM spawn WHERE source = 'classicdb' AND map_id IN (0, 1) AND x IS NOT NULL ORDER BY kind, spawn_id, entity_id, x, y").all() as Record<string, number & string>[])
  cands.push({ kind: "spawn", map: s.map_id, x: s.x, y: s.y, z: s.z, ref: `${s.kind} ${s.entity_id}` });
for (const p of db.query("SELECT owner, owner_id, point, map_id, x, y, z FROM path WHERE map_id IN (0, 1) AND x IS NOT NULL ORDER BY owner, owner_id, path_id, point, source").all() as Record<string, number & string>[])
  cands.push({ kind: "road", map: p.map_id, x: p.x, y: p.y, z: p.z, ref: `path ${p.owner} ${p.owner_id} ${p.point}` });
for (const t of db.query("SELECT ID, ContinentID, Pos_0, Pos_1, Pos_2 FROM client_TaxiNodes WHERE ContinentID IN (0, 1) ORDER BY ID").all() as Record<string, number>[])
  cands.push({ kind: "taxi", map: t.ContinentID, x: t.Pos_0, y: t.Pos_1, z: t.Pos_2, ref: `taxi ${t.ID}` });
// a subzone's middle: its chunk nearest the mean of its chunks
for (const [map, ground] of grounds) {
  const areas = new Map<number, ChunkRow[]>();
  for (const c of ground.all) if (c.area_id) (areas.get(c.area_id) ?? areas.set(c.area_id, []).get(c.area_id)!).push(c);
  for (const [area, list] of areas) {
    const mx = list.reduce((s, c) => s + c.x, 0) / list.length, my = list.reduce((s, c) => s + c.y, 0) / list.length;
    const mid = list.reduce((a, b) => (Math.hypot(a.x - mx, a.y - my) <= Math.hypot(b.x - mx, b.y - my) ? a : b));
    cands.push({ kind: "subzone", map, x: mid.x - CHUNK / 2, y: mid.y - CHUNK / 2, z: null, ref: `area ${area}` });
  }
}

// by zone, the zones' sizes in map chunks
const byZone = new Map<number, Candidate[]>();
const size = new Map<number, number>();
let outside = 0;
for (const c of cands) {
  const area = grounds.get(c.map)!.area(c.x, c.y);
  const zone = area == null ? null : zoneOf(area);
  if (zone == null || !zones.has(zone)) {
    outside++;
    continue;
  }
  (byZone.get(zone) ?? byZone.set(zone, []).get(zone)!).push(c);
}
for (const [, ground] of grounds) for (const c of ground.all) {
  const z = zoneOf(c.area_id);
  if (zones.has(z)) size.set(z, (size.get(z) ?? 0) + 1);
}
const want = quotas(new Map([...zones].filter((z) => byZone.has(z)).map((z) => [z, Math.sqrt(size.get(z) ?? 1)])), COUNT);

const queues = new Map([...byZone].map(([z, list]) => [z, order(list, rand)]));
const worlds = new Map(MAPS.map((m) => [m, { ground: grounds.get(m)!, wmos: boxes.get(m)! }]));
const { picked, rejects, tried, short } = spread(want, queues, worlds, rand, SPACING, PER_SUBZONE);

const name = (id: number) => (db.query("SELECT AreaName_lang n FROM client_AreaTable WHERE ID = ?").get(id) as { n: string } | null)?.n ?? `area ${id}`;
const perZone = Object.fromEntries([...want.keys()].map((z) => [name(z), picked.filter((p) => p.zone === z).length]));
const rejected = Object.values(rejects).reduce((a, b) => a + b, 0);
const tag = (db.query("SELECT value FROM meta WHERE key = 'tag'").get() as { value: string } | null)?.value ?? null;
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      about: "Cameras for geoguessr's renders, by scripts/pick.ts from wow-data's classic.db. x, y, z: world yards (the camera, eye height). yaw: the game's facing in radians (0 north, +x, a quarter turn west, +y). pitch: radians up. lookAt: world yards, 30 yards ahead. ground: the height the eye stands over. zone, subzone: AreaTable ids.",
      seed: SEED,
      wowData: tag,
      tried,
      rejects,
      perZone,
      locations: picked,
    },
    null,
    1,
  )}\n`,
);
console.log(`${picked.length} cameras in ${want.size} zones -> ${OUT}`);
console.log(`tried ${tried}, rejected ${rejected} (${((100 * rejected) / tried).toFixed(1)}%): ${JSON.stringify(rejects)}`);
console.log(`candidates ${cands.length}, ${outside} outside the zones with a map`);
if (short > 0) {
  console.error(`short of ${short}: every zone ran out of candidates`);
  process.exit(1);
}
