// The game page, built into site/ (never committed: the pictures are the
// renders', the maps the game's own art, both rebuilt from here):
//
//   bun scripts/site.ts [--pictures <dir>] [--maps] [--marks]
//
// - site/maps/<map>.webp, site/maps/zones/<ui>.webp: each continent's world
//   map and each played zone's (and city's), the game's own art (the user's
//   call, 30 October 2026; src/mapart.ts), and site/maps/<map>.json: the
//   frames, the areas under each chunk (src/areas.ts, from wow-data's
//   classic-terrain.db), their names (src/atlas.ts' Atlas). Composed again
//   with --maps, or when missing.
// - site/rounds.json: the cameras of locations.json, as much as the page needs.
// - site/pictures/<id>.webp: each camera's render, from --pictures (default
//   .cache/review3/webp, the pictures the user passed by eye, 30 October
//   2026). A camera with none refuses the build.
// - site/index.html, style.css, game.js: the page (web/), bundled.
// - --marks: .cache/site/marks/<ui>.png, every camera on its zone's map (a
//   red dot), and .cache/site/marks.jpg, all of them on one sheet, to look
//   at the conversion (the game's art too: .cache/ is never committed).
import type { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { areaRuns } from "../src/areas";
import { type Atlas, areaAt, type Frame, type Round, toPixel, type ZoneMap } from "../src/atlas";
import { familyPath } from "../src/family";
import { type ChunkRow, Ground } from "../src/ground";
import { compose, HEIGHT, layers, WIDTH } from "../src/mapart";

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
// the world maps of the two continents (UiMap type 2) and of the zones a
// player sees a map of (type 3), each a whole picture over a world rectangle
type MapRow = { ui: number; name: string; type: number; map: number; area: number; art: number; x0: number; y0: number; x1: number; y1: number; u0: number; v0: number; u1: number; v1: number };
const mapRows = db.query(`SELECT u.ID ui, u.Name_lang name, u.Type type, m.MapID map, m.AreaID area, x.UiMapArtID art,
    m.Region_0 x0, m.Region_1 y0, m.Region_3 x1, m.Region_4 y1, m.UiMin_0 u0, m.UiMin_1 v0, m.UiMax_0 u1, m.UiMax_1 v1
  FROM client_UiMap u JOIN client_UiMapAssignment m ON m.UiMapID = u.ID JOIN client_UiMapXMapArt x ON x.UiMapID = u.ID
  WHERE u.Type IN (2, 3) AND u.System = 0 AND m.MapID IN (0, 1) AND m.OrderIndex = 0 ORDER BY u.ID`).all() as MapRow[];
// a map's frame, refused unless its picture is the whole rectangle with square pixels
function frameOf(r: MapRow): Frame {
  const yards = (r.y1 - r.y0) / WIDTH;
  if (r.u0 !== 0 || r.v0 !== 0 || r.u1 !== 1 || r.v1 !== 1 || Math.abs((r.x1 - r.x0) / HEIGHT - yards) > 0.01 * yards)
    throw new Error(`map ${r.ui} (${r.name}) is not one picture over its rectangle: the page's frame can't hold it`);
  return { map: r.map, top: r.x1, left: r.y1, yards, width: WIDTH, height: HEIGHT };
}

mkdirSync(path.join(SITE, "maps", "zones"), { recursive: true });
mkdirSync(path.join(SITE, "pictures"), { recursive: true });

// the game's textures by file id: the interface manifest at the pin, the mirror's PNGs
const ui = (await import(familyPath("wow-data", "src", "ui.ts"))) as { picture: (texture: string) => Promise<{ file: string } | undefined> };
const { wagoFile } = (await import(familyPath("wow-data", "src", "wago.ts"))) as { wagoFile: (game: string, table: string) => Promise<string> };
let manifest: Map<number, string> | undefined;
async function png(file: number): Promise<string | undefined> {
  if (!manifest) {
    manifest = new Map();
    for (const row of readFileSync(await wagoFile("classic", "ManifestInterfaceData"), "utf8").split("\n").slice(1)) {
      const m = row.match(/^(\d+),(.*?),(.*)$/);
      if (m) manifest.set(Number(m[1]), m[2] + m[3]);
    }
  }
  const texture = manifest.get(file);
  return texture ? (await ui.picture(texture))?.file : undefined;
}

// the maps
const atlases = new Map<number, Atlas>();
for (const map of MAPS) {
  const json = path.join(SITE, "maps", `${map}.json`);
  // a map built before is kept when it is this build's kind and its pictures are all there
  if (!args.maps && existsSync(json)) {
    const was = JSON.parse(readFileSync(json, "utf8")) as Partial<Atlas>;
    const pictures = [path.join(SITE, "maps", `${map}.webp`), ...(was.zones ?? []).map((z) => path.join(SITE, "maps", "zones", `${z.ui}.webp`))];
    if (was.zones?.length && pictures.every((p) => existsSync(p))) {
      atlases.set(map, was as Atlas);
      continue;
    }
  }
  const t0 = performance.now();
  const whole = mapRows.find((r) => r.type === 2 && r.map === map);
  if (!whole) throw new Error(`no world map for map ${map}`);
  const frame = frameOf(whole);
  await compose(layers(db, whole.art), png, path.join(SITE, "maps", `${map}.webp`));
  const zones: ZoneMap[] = [];
  for (const r of mapRows.filter((r) => r.type === 3 && r.map === map && played.has(r.area))) {
    await compose(layers(db, r.art), png, path.join(SITE, "maps", "zones", `${r.ui}.webp`));
    zones.push({ ui: r.ui, zone: r.area, name: r.name, frame: frameOf(r), inside: [] });
  }
  // the ground, at the pin, by the parser wow-data names, not just said
  process.env.WOW_DATA_STRICT = "1";
  const { openTerrain } = (await import(familyPath("wow-data", "src", "terrainDb.ts"))) as { openTerrain: (game: string) => Database };
  const ground = new Ground(openTerrain("classic").query("SELECT * FROM terrain_chunk WHERE map_id = ? ORDER BY row, col").all(map) as ChunkRow[]);
  const areas = areaRuns(ground, frame);
  // a city's map (the six are under 1.5 yards a pixel, the smallest zone's
  // 2.2) opens from the zone around it: the one the ground names most along
  // the city map's edge (Ironforge's is Dun Morogh's, Thunder Bluff's Mulgore's)
  for (const c of zones.filter((z) => z.frame.yards < 1.5)) {
    const count = new Map<number, number>();
    for (let i = 0; i < 40; i++) {
      const t = i / 40, side = Math.floor(t * 4), u = (t * 4) % 1;
      const [px, py] = [[u, 0], [1, u], [1 - u, 1], [0, 1 - u]][side].map((v, k) => v * (k ? c.frame.height : c.frame.width));
      const z = zoneOf(areaAt(areas, c.frame.top - py * c.frame.yards, c.frame.left - px * c.frame.yards));
      if (z && z !== c.zone) count.set(z, (count.get(z) ?? 0) + 1);
    }
    const named = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
    const around = zones.find((z) => z !== c && z.zone === named);
    // a city no zone opens could never be reached on the page (Ironforge and Undercity have no ground of their own)
    if (!around) throw new Error(`no zone around ${c.name}'s map (its edge names ${named ?? "none"})`);
    around.inside.push(c.ui);
  }
  // the names of the areas on the map, and of their parents
  const names: Atlas["names"] = {};
  const name = (id: number) => {
    for (let a = id, i = 0; a && !names[a] && i < 10; a = area.get(a)?.parent ?? 0, i++)
      names[a] = { name: area.get(a)?.name ?? `area ${a}`, zone: zoneOf(a), parent: area.get(a)?.parent ?? 0 };
  };
  for (const row of areas.runs) for (let i = 0; i < row.length; i += 2) if (row[i]) name(row[i]);
  for (const z of zones) name(z.zone);
  const atlas: Atlas = { frame, name: whole.name, areas, names, zones };
  writeFileSync(json, JSON.stringify(atlas));
  atlases.set(map, atlas);
  console.log(`map ${map} (${atlas.name}): the continent and ${zones.length} zones' maps, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

// the rounds, each checked against its map: on it, and in its zone
const rounds: Round[] = [];
const astray: string[] = [];
for (const l of locations) {
  const atlas = atlases.get(l.map);
  if (!atlas) throw new Error(`camera ${l.id} on map ${l.map}, which has no map drawn`);
  const own = atlas.zones.find((z) => z.zone === l.zone);
  if (!own) throw new Error(`camera ${l.id} (${l.name}) in zone ${l.zone}, which has no map`);
  for (const f of [atlas.frame, own.frame]) {
    const { px, py } = toPixel(f, l.x, l.y);
    if (px < 0 || py < 0 || px >= f.width || py >= f.height) throw new Error(`camera ${l.id} (${l.name}) falls off ${f === own.frame ? own.name : atlas.name}'s map`);
  }
  const a = areaAt(atlas.areas, l.x, l.y);
  if (zoneOf(a) !== l.zone) astray.push(`${l.id} ${l.name}: ${area.get(a)?.name ?? a} (${area.get(zoneOf(a))?.name}), not ${area.get(l.zone)?.name}`);
  rounds.push({ id: l.id, map: l.map, x: l.x, y: l.y, zone: l.zone, mapZone: zoneOf(a), subzone: l.subzone, mapArea: a, name: l.name, zoneName: area.get(l.zone)?.name ?? "" });
}
writeFileSync(path.join(SITE, "rounds.json"), JSON.stringify(rounds));
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

// the marks, to look at: each zone's map with its cameras, then one sheet
if (args.marks) {
  const dir = path.join(ROOT, ".cache", "site", "marks");
  mkdirSync(dir, { recursive: true });
  const sheet: string[] = [];
  for (const atlas of atlases.values())
    for (const z of atlas.zones) {
      const draws: string[] = [];
      for (const l of locations.filter((l) => l.map === z.frame.map && l.zone === z.zone)) {
        const { px, py } = toPixel(z.frame, l.x, l.y);
        draws.push("-fill", "red", "-stroke", "white", "-strokewidth", "2", "-draw", `circle ${px.toFixed(1)},${py.toFixed(1)} ${(px + 6).toFixed(1)},${py.toFixed(1)}`);
      }
      const out = path.join(dir, `${z.ui}.png`);
      const r = Bun.spawnSync(["magick", path.join(SITE, "maps", "zones", `${z.ui}.webp`), ...draws, out]);
      if (r.exitCode !== 0) throw new Error(`magick: ${r.stderr.toString()}`);
      sheet.push(out);
    }
  const out = path.join(ROOT, ".cache", "site", "marks.jpg");
  const r = Bun.spawnSync(["magick", "montage", ...sheet, "-font", "/System/Library/Fonts/Supplemental/Arial.ttf", "-tile", "6x", "-geometry", "334x223+2+2", out]);
  if (r.exitCode !== 0) throw new Error(`magick: ${r.stderr.toString()}`);
  console.log(`marks: ${path.relative(ROOT, dir)}/, ${path.relative(ROOT, out)}`);
}
