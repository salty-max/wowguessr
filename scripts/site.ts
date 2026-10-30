// The game page, built into site/ (never committed: the pictures are the
// renders', the maps drawn from wow-data, both rebuilt from here):
//
//   bun scripts/site.ts [--pictures <dir>] [--maps] [--marks]
//
// - site/maps/<map>.webp and .json: each continent's map (src/mapdraw.ts),
//   drawn from wow-data's classic-terrain.db, with its frame, the areas under
//   each chunk, their names and the zones' labels (src/atlas.ts' Atlas).
//   Drawn again with --maps, or when missing (about 3 seconds a continent).
// - site/rounds.json: the cameras of locations.json, as much as the page needs.
// - site/pictures/<id>.webp: each camera's render, from --pictures (default
//   .cache/review3/webp, the pictures the user passed by eye, 30 October
//   2026). Rendered pictures only: a camera with none refuses the build.
// - site/index.html, style.css, game.js: the page (web/), bundled.
// - --marks: .cache/site/marks-<map>.png, every camera on its map (a dot, its
//   zone's colour if the map's areas put it in the zone locations.json
//   says, red if not), to look at the conversion.
import type { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Atlas, areaAt, type Round, toPixel } from "../src/atlas";
import { familyPath } from "../src/family";
import { type ChunkRow, Ground } from "../src/ground";
import { draw } from "../src/mapdraw";

const ROOT = path.join(import.meta.dir, "..");
const SITE = path.join(ROOT, "site");
const { values: args } = parseArgs({
  options: {
    pictures: { type: "string", default: path.join(ROOT, ".cache", "review3", "webp") },
    maps: { type: "boolean", default: false },
    marks: { type: "boolean", default: false },
  },
});
const MAPS = [0, 1];

type Location = { id: number; map: number; x: number; y: number; zone: number; subzone: number; name: string };
const locations = (JSON.parse(readFileSync(path.join(ROOT, "locations.json"), "utf8")) as { locations: Location[] }).locations;

const { openDb } = (await import(familyPath("wow-data", "src", "db.ts"))) as { openDb: (game: string) => Database };
const db = openDb("classic");
const area = new Map(
  (db.query("SELECT ID, ParentAreaID, AreaName_lang FROM client_AreaTable ORDER BY ID").all() as { ID: number; ParentAreaID: number; AreaName_lang: string }[]).map((a) => [
    a.ID,
    { parent: a.ParentAreaID, name: a.AreaName_lang },
  ]),
);
// the zone of an area: up its parents to the top (as the picker has it)
const zoneOf = (id: number) => {
  for (let i = 0; i < 10 && area.get(id)?.parent; i++) id = area.get(id)!.parent;
  return id;
};
// the zones a player sees a map of (UiMap type 3) on the two continents (the picker's)
const played = new Set(
  (db.query(`SELECT DISTINCT m.AreaID a FROM client_UiMapAssignment m JOIN client_UiMap u ON u.ID = m.UiMapID
     JOIN client_AreaTable t ON t.ID = m.AreaID WHERE u.Type = 3 AND m.MapID IN (0, 1) AND t.ParentAreaID = 0 ORDER BY m.AreaID`).all() as { a: number }[]).map((r) => r.a),
);
// each continent's name, from its world map (UiMap type 2 under Azeroth)
const continent = new Map(
  (db.query(`SELECT DISTINCT m.MapID map, u.Name_lang name FROM client_UiMap u JOIN client_UiMapAssignment m ON m.UiMapID = u.ID
     WHERE u.Type = 2 AND u.System = 0 AND m.MapID IN (0, 1)`).all() as { map: number; name: string }[]).map((r) => [r.map, r.name]),
);

mkdirSync(path.join(SITE, "maps"), { recursive: true });
mkdirSync(path.join(SITE, "pictures"), { recursive: true });

// the maps
const atlases = new Map<number, Atlas>();
for (const map of MAPS) {
  const json = path.join(SITE, "maps", `${map}.json`), webp = path.join(SITE, "maps", `${map}.webp`);
  if (!args.maps && existsSync(json) && existsSync(webp)) {
    atlases.set(map, JSON.parse(readFileSync(json, "utf8")));
    continue;
  }
  process.env.WOW_DATA_STRICT = "1"; // the ground at the pin, by the parser wow-data names, not just said
  const { openTerrain } = (await import(familyPath("wow-data", "src", "terrainDb.ts"))) as { openTerrain: (game: string) => Database };
  const ground = new Ground(openTerrain("classic").query("SELECT * FROM terrain_chunk WHERE map_id = ? ORDER BY row, col").all(map) as ChunkRow[]);
  const t0 = performance.now();
  const d = draw(map, ground, zoneOf, played);
  const raw = Bun.spawnSync(["magick", "-size", `${d.frame.width}x${d.frame.height}`, "-depth", "8", "rgb:-", "-quality", "88", webp], { stdin: d.rgb });
  if (raw.exitCode !== 0) throw new Error(`magick: ${raw.stderr.toString()}`);
  // the names of the areas on the map, and of their parents
  const names: Atlas["names"] = {};
  const name = (id: number) => {
    for (let a = id, i = 0; a && !names[a] && i < 10; a = area.get(a)?.parent ?? 0, i++)
      names[a] = { name: area.get(a)?.name ?? `area ${a}`, zone: zoneOf(a), parent: area.get(a)?.parent ?? 0 };
  };
  for (const row of d.areas.runs) for (let i = 0; i < row.length; i += 2) if (row[i]) name(row[i]);
  const atlas: Atlas = {
    frame: d.frame,
    name: continent.get(map) ?? `map ${map}`,
    areas: d.areas,
    names,
    labels: d.labels.map((l) => ({ ...l, name: area.get(l.zone)?.name ?? `zone ${l.zone}` })),
  };
  writeFileSync(json, JSON.stringify(atlas));
  atlases.set(map, atlas);
  console.log(`map ${map} (${atlas.name}): ${d.frame.width}x${d.frame.height}, ${atlas.labels.length} zones, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

// the rounds, each checked against its map: on it, and in its zone
const rounds: Round[] = [];
const astray: string[] = [];
for (const l of locations) {
  const atlas = atlases.get(l.map);
  if (!atlas) throw new Error(`camera ${l.id} on map ${l.map}, which has no map drawn`);
  const { px, py } = toPixel(atlas.frame, l.x, l.y);
  if (px < 0 || py < 0 || px >= atlas.frame.width || py >= atlas.frame.height) throw new Error(`camera ${l.id} (${l.name}) falls off its map`);
  const a = areaAt(atlas.areas, l.x, l.y);
  if (zoneOf(a) !== l.zone) astray.push(`${l.id} ${l.name}: ${area.get(a)?.name ?? a} (${area.get(zoneOf(a))?.name}), not ${area.get(l.zone)?.name}`);
  rounds.push({ id: l.id, map: l.map, x: l.x, y: l.y, zone: l.zone, mapZone: zoneOf(a), subzone: l.subzone, mapArea: a, name: l.name, zoneName: area.get(l.zone)?.name ?? "" });
}
writeFileSync(path.join(SITE, "rounds.json"), JSON.stringify(rounds));
// a city inside a WMO (Ironforge, Undercity) has no chunk of its own, so no
// label from the ground: written at the middle of its cameras (its districts)
for (const [map, atlas] of atlases) {
  const json = path.join(SITE, "maps", `${map}.json`);
  const labelled = new Set(atlas.labels.map((l) => l.zone));
  const missingZones = new Set(locations.filter((l) => l.map === map && !labelled.has(l.zone)).map((l) => l.zone));
  if (!missingZones.size) continue;
  for (const z of missingZones) {
    const own = locations.filter((l) => l.map === map && l.zone === z).map((l) => toPixel(atlas.frame, l.x, l.y));
    const px = Math.round(own.reduce((s, p) => s + p.px, 0) / own.length), py = Math.round(own.reduce((s, p) => s + p.py, 0) / own.length);
    atlas.labels.push({ zone: z, name: area.get(z)?.name ?? `zone ${z}`, px, py });
  }
  writeFileSync(json, JSON.stringify(atlas));
}
if (astray.length) console.log(`${astray.length} cameras stand outside their zone on the map's areas:\n  ${astray.join("\n  ")}`);

// the pictures: rendered ones only, each camera's
const missing = locations.filter((l) => !existsSync(path.join(args.pictures!, `${l.id}.webp`))).map((l) => l.id);
if (missing.length) throw new Error(`no picture in ${args.pictures} for ${missing.length} cameras: ${missing.join(", ")}`);
let copied = 0;
for (const l of locations) {
  const from = path.join(args.pictures!, `${l.id}.webp`), to = path.join(SITE, "pictures", `${l.id}.webp`);
  if (existsSync(to) && statSync(to).size === statSync(from).size && statSync(to).mtimeMs >= statSync(from).mtimeMs) continue;
  copyFileSync(from, to);
  copied++;
}

// the page
const built = await Bun.build({ entrypoints: [path.join(ROOT, "web", "game.ts")], outdir: SITE, target: "browser", minify: true });
if (!built.success) throw new Error(built.logs.map(String).join("\n"));
for (const f of ["index.html", "style.css"]) copyFileSync(path.join(ROOT, "web", f), path.join(SITE, f));
console.log(`site/: ${rounds.length} rounds, ${copied} pictures copied, page bundled`);

// the marks, to look at
if (args.marks) {
  mkdirSync(path.join(ROOT, ".cache", "site"), { recursive: true });
  for (const [map, atlas] of atlases) {
    const draws: string[] = [];
    for (const l of locations.filter((l) => l.map === map)) {
      const { px, py } = toPixel(atlas.frame, l.x, l.y);
      const right = zoneOf(areaAt(atlas.areas, l.x, l.y)) === l.zone;
      draws.push("-fill", right ? "yellow" : "red", "-stroke", "black", "-draw", `circle ${px.toFixed(1)},${py.toFixed(1)} ${(px + 6).toFixed(1)},${py.toFixed(1)}`);
    }
    const labels = atlas.labels.flatMap((z) => ["-fill", "white", "-stroke", "none", "-font", "/System/Library/Fonts/Supplemental/Arial.ttf", "-pointsize", "22", "-annotate", `+${z.px - 40}+${z.py}`, z.name]);
    const out = path.join(ROOT, ".cache", "site", `marks-${map}.png`);
    const r = Bun.spawnSync(["magick", path.join(SITE, "maps", `${map}.webp`), ...draws, ...labels, out]);
    if (r.exitCode !== 0) throw new Error(`magick: ${r.stderr.toString()}`);
    console.log(`marks: ${path.relative(ROOT, out)}`);
  }
}
