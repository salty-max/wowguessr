// Render cameras from locations.json with the scratch offlineRenderer
// (docs/render-spike.md: built outside this repository, run from its build
// folder, where its spirv/ shaders and export.db3 are), white-balance them, run the image check
// on each, and make a contact sheet. Pictures and sheet go to .cache/renders/
// (never committed).
//   bun scripts/render.ts --renderer <the offlineRenderer binary> --workdir <its build folder> --casc <CASC root>
//     [--locations locations.json] [--sample 30] [--seed 1] [--ids 3,17] [--time 1440] [--size 1280x720]
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { check, grayWorld, type Pixels } from "../src/imagecheck";
import { random, shuffle } from "../src/pick";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (v === undefined) throw new Error(`--${name} is needed (bun scripts/render.ts --renderer <binary> --workdir <dir> --casc <dir>)`);
  return v;
};
const RENDERER = path.resolve(arg("renderer", process.env.OFFLINE_RENDERER));
const WORKDIR = path.resolve(arg("workdir", process.env.OFFLINE_RENDERER_WORKDIR));
const CASC = path.resolve(arg("casc", process.env.CASC_PATH));
const [W, H] = arg("size", "1280x720").split("x").map(Number);
const TIME = arg("time", "1440"); // half-minutes, noon
const OUT = path.resolve(".cache/renders");
// the continents' WDTs (world/maps/<dir>/<dir>.wdt, wago.tools' file list)
const WDT: Record<number, number> = { 0: 775971, 1: 782779 };

type Location = { id: number; map: number; x: number; y: number; z: number; lookAt: [number, number, number]; zone: number; kind: string };
const all = ((await Bun.file(arg("locations", "locations.json")).json()) as { locations: Location[] }).locations;
const ids = process.argv.includes("--ids") ? new Set(arg("ids").split(",").map(Number)) : null;
const sample = ids
  ? all.filter((l) => ids.has(l.id))
  : shuffle([...all], random(Number(arg("seed", "1")))).slice(0, Number(arg("sample", "30"))).sort((a, b) => a.id - b.id);
mkdirSync(OUT, { recursive: true });

const run = (cmd: string[], opts: { cwd?: string; env?: Record<string, string>; stdin?: Uint8Array } = {}) => {
  const p = Bun.spawnSync(cmd, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdin: opts.stdin, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${cmd[0]} failed (${p.exitCode}): ${p.stderr.toString().slice(-400)}`);
  return p.stdout;
};
const read = (file: string, w: number, h: number): Pixels => ({
  width: w,
  height: h,
  rgb: new Uint8Array(run(["magick", file, "-resize", `${w}x${h}!`, "-depth", "8", "rgb:-"])),
});

const report: Record<string, unknown>[] = [];
for (const l of sample) {
  const raw = path.join(OUT, `${l.id}.raw.png`), file = path.join(OUT, `${l.id}.png`);
  rmSync(raw, { force: true });
  const t0 = performance.now();
  // the renderer waits for every file a frame needs: one the local client
  // never loads would hold it for ever, so it gets 30 seconds (a frame takes 1 or 2), its log kept
  const r = Bun.spawnSync(
    [RENDERER, "-casc", CASC, "-map", String(l.map), String(WDT[l.map]),
      "-camera", String(l.x), String(l.y), String(l.z), "-lookat", ...l.lookAt.map(String),
      "-size", String(W), String(H), "-time", TIME, "-output", raw],
    { cwd: WORKDIR, env: { ...process.env, DYLD_LIBRARY_PATH: "/opt/homebrew/lib", WOW_PRODUCT: "wow_classic_era" }, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  writeFileSync(path.join(OUT, `${l.id}.log`), r.stdout.toString() + r.stderr.toString());
  if (r.exitCode !== 0 || !existsSync(raw)) {
    const why = r.exitedDueToTimeout ? "no render (timed out)" : `no render (${r.signalCode ?? `exit ${r.exitCode}`})`;
    report.push({ id: l.id, zone: l.zone, kind: l.kind, ok: false, why: [why] });
    console.log(`${l.id}: ${why}`);
    continue;
  }
  const seconds = (performance.now() - t0) / 1000;
  const balanced = grayWorld(read(raw, W, H));
  run(["magick", "-size", `${W}x${H}`, "-depth", "8", "rgb:-", file], { stdin: balanced.rgb });
  const verdict = check(read(file, 160, 90));
  report.push({ id: l.id, zone: l.zone, kind: l.kind, seconds: Math.round(seconds * 10) / 10, ...verdict });
  console.log(`${l.id}: ${verdict.ok ? "ok" : verdict.why.join(", ")} (${seconds.toFixed(1)} s)`);
}
writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 1)}\n`);

// the contact sheet: each picture labelled with its id, zone and verdict
const labels = report.filter((r) => r.mean !== undefined).flatMap((r) => ["-label", `#${r.id} zone ${r.zone} ${r.ok ? "ok" : (r.why as string[]).join("+")}`, path.join(OUT, `${r.id}.png`)]);
if (labels.length) run(["montage", ...labels, "-tile", "5x", "-geometry", "384x216+4+4", "-font", "/System/Library/Fonts/Supplemental/Arial.ttf", "-pointsize", "14", path.join(OUT, "sheet.jpg")]);
const bad = report.filter((r) => !r.ok).length;
console.log(`${report.length} tried, ${bad} flagged (${((100 * bad) / report.length).toFixed(0)}%) -> ${path.join(OUT, "sheet.jpg")}`);
