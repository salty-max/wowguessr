// The game page on this computer: site/ built (scripts/site.ts), then
// served at http://127.0.0.1:4195 (PORT overrides). Local only.
import path from "node:path";

const ROOT = path.join(import.meta.dir, "..");
const SITE = path.join(ROOT, "site");
const built = Bun.spawnSync(["bun", path.join(ROOT, "scripts", "site.ts"), ...process.argv.slice(2)], { stdout: "inherit", stderr: "inherit" });
if (built.exitCode !== 0) process.exit(built.exitCode ?? 1);

const port = Number(process.env.PORT ?? 4195);
Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.join(SITE, path.normalize(rel));
    if (!file.startsWith(SITE + path.sep)) return new Response("not found", { status: 404 });
    const f = Bun.file(file);
    return (await f.exists()) ? new Response(f) : new Response("not found", { status: 404 });
  },
});
console.log(`the game: http://127.0.0.1:${port}/`);
