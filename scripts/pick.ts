// The location picker (ideas/geoguessr.md, step 3, landmark-first since 30
// October 2026): from wow-data's databases only (classic.db and the ground's
// classic-terrain.db), the landmarks of Eastern Kingdoms and Kalimdor (WMOs
// standing in named places: src/landmarks.ts), the best viewpoint of each,
// then about --count of them spread over the zones that have a zone map, the
// best first, leaving out the landmarks drops.json names (pictures looked at
// and dropped) and filling their zone from the next best. Written to
// locations.json, the same for the same databases and drops; a landmark kept
// from the last run keeps its id.
//   bun scripts/pick.ts [--count 300] [--out locations.json] [--drops drops.json] [--fresh]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { familyPath } from "../src/family";
import { type ChunkRow, type DoodadRow, Doodads, Ground, type WmoRow, Wmos } from "../src/ground";
import { choose, type Landmark, type Limits, landmarks, STRICT, type Viewpoint, viewpoint, WIDE, type World } from "../src/landmarks";
import { quotas } from "../src/pick";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const COUNT = Number(arg("count", "300")), OUT = arg("out", "locations.json"), DROPS = arg("drops", "drops.json");
// a zone with places gets at least MIN of them, at most CAP
const MIN = 4, CAP = 12;
// a doodad's whole box hides what is behind it over this share of its width
const LEAF = Number(arg("leaf", "0.6"));
const MAPS = [0, 1];

const { openDb } = (await import(familyPath("wow-data", "src", "db.ts"))) as { openDb: (game: string) => Database };
const { openTerrain } = (await import(familyPath("wow-data", "src", "terrainDb.ts"))) as { openTerrain: (game: string) => Database };
const db = openDb("classic");
// the ground: its own database (bun wow-data/bin/terrain.ts classic), refused
// when read at another pin or by another parser, not just said
process.env.WOW_DATA_STRICT = "1";
const terrain = openTerrain("classic");

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

const grounds = new Map<number, Ground>(), boxes = new Map<number, Wmos>(), doodads = new Map<number, Doodads>(), leaves = new Map<number, Doodads>();
for (const map of MAPS) {
  grounds.set(map, new Ground(terrain.query("SELECT * FROM terrain_chunk WHERE map_id = ? ORDER BY row, col").all(map) as ChunkRow[]));
  boxes.set(map, new Wmos(terrain.query("SELECT * FROM wmo_placement WHERE map_id = ? ORDER BY unique_id").all(map) as WmoRow[]));
  doodads.set(
    map,
    new Doodads(
      terrain.query(`SELECT p.x, p.y, p.z, p.yaw, p.scale, m.col_min_x, m.col_min_y, m.col_min_z, m.col_max_x, m.col_max_y, m.col_max_z
        FROM doodad_placement p JOIN doodad_model m ON m.file_id = p.file_id WHERE p.map_id = ? ORDER BY p.unique_id`).all(map) as DoodadRow[],
    ),
  );
  // (their whole boxes, leaves and branches too, read as the same rows, LEAF
  // of their width: a tree's box is mostly air at its edges and under its crown)
  leaves.set(
    map,
    new Doodads(
      terrain.query(`SELECT p.x, p.y, p.z, p.yaw, p.scale,
        (m.min_x + m.max_x) / 2 - (m.max_x - m.min_x) / 2 * ${LEAF} AS col_min_x, (m.min_x + m.max_x) / 2 + (m.max_x - m.min_x) / 2 * ${LEAF} AS col_max_x,
        (m.min_y + m.max_y) / 2 - (m.max_y - m.min_y) / 2 * ${LEAF} AS col_min_y, (m.min_y + m.max_y) / 2 + (m.max_y - m.min_y) / 2 * ${LEAF} AS col_max_y,
        m.min_z AS col_min_z, m.max_z AS col_max_z
        FROM doodad_placement p JOIN doodad_model m ON m.file_id = p.file_id WHERE p.map_id = ? ORDER BY p.unique_id`).all(map) as DoodadRow[],
    ),
  );
}

const names = new Map((db.query("SELECT ID, AreaName_lang n FROM client_AreaTable ORDER BY ID").all() as { ID: number; n: string }[]).map((a) => [a.ID, a.n]));
// a subzone is a place unless it is mostly water (WATERY of its ground's
// cells under a liquid: a sea, a coast, a strand) and neither paints itself on
// the world map (WorldMapOverlay) nor gives experience for finding it
// (ExplorationLevel): Longshore, the Veiled Sea, Fray Island go; Feathermoon
// Stronghold (37% water), Lost Rigger Cove (on the map) stay
const WATERY = 0.6;
const onMap = new Set<number>();
for (const o of db.query("SELECT AreaID_0 a, AreaID_1 b, AreaID_2 c, AreaID_3 d FROM client_WorldMapOverlay ORDER BY ID").all() as Record<string, number>[])
  for (const v of Object.values(o)) if (v) onMap.add(v);
const explored = new Set((db.query("SELECT ID FROM client_AreaTable WHERE ExplorationLevel > 0 ORDER BY ID").all() as { ID: number }[]).map((a) => a.ID));
const wet = new Map<number, { cells: number; under: number }>();
for (const [, ground] of grounds)
  for (const c of ground.all) {
    const w = wet.get(c.area_id) ?? { cells: 0, under: 0 };
    w.cells += 64;
    if (c.liquid_type != null && c.liquid_cells) for (const byte of c.liquid_cells) for (let i = 0; i < 8; i++) w.under += (byte >> i) & 1;
    wet.set(c.area_id, w);
  }
const place = (area: number) => {
  const w = wet.get(area);
  return explored.has(area) || onMap.has(area) || !w || w.under / w.cells < WATERY;
};
const name = (id: number) => names.get(id) ?? `area ${id}`;

// the landmarks dropped by eye (drops.json: { drops: [{ map, wmo, why }] })
type Drop = { map: number; wmo: number; name: string; why: string; by: string };
const drops: Drop[] = existsSync(DROPS) ? JSON.parse(readFileSync(DROPS, "utf8")).drops : [];
const dropped = new Set(drops.map((d) => `${d.map}:${d.wmo}`));

// the landmarks and the best viewpoint of each
type Found = { landmark: Landmark; view: Viewpoint; zone: number; widened: boolean };
const worlds = new Map<number, World>(), rowsOf = new Map<number, WmoRow[]>();
for (const map of MAPS) {
  worlds.set(map, { ground: grounds.get(map)!, wmos: boxes.get(map)!, doodads: doodads.get(map)!, leaves: leaves.get(map)! });
  rowsOf.set(map, terrain.query("SELECT * FROM wmo_placement WHERE map_id = ? ORDER BY unique_id").all(map) as WmoRow[]);
}
// (each landmark counted once, though the looser pass tries again those the
// strict one saw from nowhere)
const triedKeys = new Set<string>(), unseenKeys = new Set<string>();
const seen = (limits: Limits, only?: Set<number>, skip = new Set<string>()) => {
  const out: Found[] = [];
  for (const map of MAPS) {
    const world = worlds.get(map)!;
    // a dropped WMO (or one already seen) is left out before a subzone's two
    // biggest are taken, so the next one gets its turn
    const left = (w: WmoRow) => dropped.has(`${map}:${w.unique_id}`) || skip.has(`${map}:${w.unique_id}`);
    for (const l of landmarks(map, world.ground, rowsOf.get(map)!, zoneOf, place, limits, left)) {
      const zone = zoneOf(l.area);
      if (!zones.has(zone) || (only && !only.has(zone))) continue;
      const key = `${map}:${l.box.unique_id}`;
      triedKeys.add(key);
      const v = viewpoint(l, world, limits);
      if (v) {
        out.push({ landmark: l, view: v, zone, widened: limits !== STRICT });
        unseenKeys.delete(key);
      } else unseenKeys.add(key);
    }
  }
  return out;
};
const found = seen(STRICT);

// each zone's share by the square root of its size in map chunks, between
// MIN (as many as it has) and CAP; a zone counts when it has a landmark
// seen or a dropped one, so a drop list that empties one shows as a 0
const size = new Map<number, number>();
for (const [, ground] of grounds) for (const c of ground.all) {
  const z = zoneOf(c.area_id);
  if (zones.has(z)) size.set(z, (size.get(z) ?? 0) + 1);
}
const have = new Set(found.map((f) => f.zone));
for (const d of drops) {
  const w = rowsOf.get(d.map)?.find((r) => r.unique_id === d.wmo);
  const area = w && grounds.get(d.map)!.area((w.min_x + w.max_x) / 2, (w.min_y + w.max_y) / 2);
  if (area && zones.has(zoneOf(area))) have.add(zoneOf(area));
}
const want = new Map(
  [...quotas(new Map([...zones].filter((z) => have.has(z)).map((z) => [z, Math.sqrt(size.get(z) ?? 1)])), COUNT)].map(([z, n]) => [z, Math.min(CAP, Math.max(MIN, n))]),
);
const first = choose(found, want, name);
// a zone left under its share, or with no strict landmark at all (MIN for
// it): the looser landmarks (WIDE) for it alone, the first pass's names and
// models kept out
const count = (list: Found[], z: number) => list.filter((f) => f.zone === z).length;
const shortWant = new Map([...zones].map((z) => [z, want.get(z) ?? MIN] as const).filter(([z, n]) => count(first, z) < n));
const strict = new Set(found.map((f) => `${f.landmark.map}:${f.landmark.box.unique_id}`));
const wide = seen(WIDE, new Set(shortWant.keys()), strict);
const chosen = [...first, ...choose(wide, shortWant, name, first)];
for (const f of chosen) if (!want.has(f.zone)) want.set(f.zone, MIN);
const tried = triedKeys.size, unseen = unseenKeys.size;

// the ids of the last run's landmarks kept, the new ones after its last id
// (and after every id drops.json names): without the last file the ids would
// start again and miss the renders and the drops' notes, so it is refused
// unless --fresh
const last = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (!last && !process.argv.includes("--fresh")) throw new Error(`${OUT} missing: the ids would start again (--fresh to start them on purpose)`);
const ids = new Map<string, number>((last?.locations ?? []).map((l: { map: number; wmo: number; id: number }) => [`${l.map}:${l.wmo}`, l.id]));
const noted = drops.map((d) => Number(d.why.match(/#(\d+)/)?.[1] ?? 0));
let nextId = Math.max(last?.nextId ?? 1, ...[...ids.values()].map((i) => i + 1), ...noted.map((i) => i + 1));
const order = (f: Found) => ids.get(`${f.landmark.map}:${f.landmark.box.unique_id}`) ?? Infinity;
chosen.sort((a, b) => order(a) - order(b) || a.zone - b.zone || b.view.score - a.view.score);

const r2 = (v: number) => Math.round(v * 100) / 100;
const picked = chosen.map((f) => {
  const [x, y, z] = f.view.view.eye, at = f.view.view.at;
  const yaw = (Math.atan2(at[1] - y, at[0] - x) + 2 * Math.PI) % (2 * Math.PI);
  const pitch = Math.atan2(at[2] - z, Math.hypot(at[0] - x, at[1] - y));
  return {
    id: ids.get(`${f.landmark.map}:${f.landmark.box.unique_id}`) ?? nextId++, map: f.landmark.map, x: r2(x), y: r2(y), z: r2(z),
    yaw: Math.round(yaw * 1000) / 1000, pitch: Math.round(pitch * 1000) / 1000, lookAt: at.map(r2),
    ground: r2(z - f.view.height), zone: f.zone, subzone: f.landmark.area,
    name: name(f.landmark.area), kind: "building", wmo: f.landmark.box.unique_id, ...(f.widened ? { widened: true } : {}),
    fill: r2(f.view.shot.fill), sky: r2(f.view.shot.sky), score: r2(f.view.score),
  };
});

const perZone = Object.fromEntries([...want.keys()].map((z) => [name(z), picked.filter((p) => p.zone === z).length]));
const tag = (db.query("SELECT value FROM meta WHERE key = 'tag'").get() as { value: string } | null)?.value ?? null;
const terrainMeta = (key: string) => (terrain.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null)?.value ?? null;
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      about: "Cameras for geoguessr's renders, each looking at a landmark (a WMO in a named place), by scripts/pick.ts from wow-data's classic.db and classic-terrain.db. x, y, z: world yards (the camera's eye). lookAt: the landmark's lower middle, world yards. yaw: the game's facing in radians (0 north, +x, a quarter turn west, +y), pitch: radians up, both toward lookAt. ground: the height the eye stands over. zone, subzone: AreaTable ids, name: the subzone's name, kind: building (the landmark's kind), wmo: the landmark's placement id, widened: found by the looser rules of a zone short of landmarks (src/landmarks.ts WIDE). fill, sky: the share of the picture the landmark and the sky take (a coarse cast), score: the viewpoint's. dropped: the entries drops.json lists. perZone: the cameras of each zone, share: what it was due (a zone under it ran short of landmarks). nextId: the id the next new camera takes (ids stay with their landmark from run to run).",
      wowData: tag,
      terrainBuild: terrainMeta("build"),
      terrainParser: terrainMeta("parser"),
      landmarks: tried,
      unseen,
      dropped: drops.length,
      perZone,
      share: Object.fromEntries([...want].map(([z, n]) => [name(z), n])),
      nextId,
      locations: picked,
    },
    null,
    1,
  )}\n`,
);
console.log(
  `${picked.length} cameras of ${found.length + wide.length} landmarks seen (${tried} tried, ${unseen} with no good viewpoint, ${drops.length} dropped, ${chosen.length - first.length} widened) in ${want.size} zones -> ${OUT}`,
);
const thin = [...want].filter(([z, n]) => count(chosen, z) < n).map(([z, n]) => `${name(z)} ${count(chosen, z)}/${n}`);
if (thin.length) console.log(`under their share: ${thin.join(", ")}`);
