// The game page: five rounds, each a rendered picture, a guess on the
// game's own world maps (a continent, then a zone's map opened by a click on
// it, as the game's map does), the distance and the score (src/atlas.ts),
// then a summary. Static: it reads site/'s rounds.json and maps/
// (scripts/site.ts) and keeps nothing.
import { areaAt, type Atlas, type Frame, judge, onFrame, pickRounds, type Result, ROUND_MAX, type Round, toPixel, toWorld, type ZoneMap, zoneUnder } from "../src/atlas";

const ROUNDS = 5;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const picture = $<HTMLImageElement>("picture"), mapImg = $<HTMLImageElement>("map"), viewport = $("viewport"), stage = $("stage");
const overlay = document.getElementById("overlay") as unknown as SVGSVGElement;
const marks = $("marks"), hover = $("hover"), continents = $("continents"), zonebar = $("zonebar");
const guessBtn = $<HTMLButtonElement>("guess"), nextBtn = $<HTMLButtonElement>("next"), hint = $("hint"), result = $("result");
const roundEl = $("round"), totalEl = $("total"), game = $("game"), summary = $("summary");

const fmt = (n: number) => n.toLocaleString("en-US");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const [all, ...maps] = await Promise.all([
  fetch("rounds.json").then((r) => r.json() as Promise<Round[]>),
  fetch("maps/0.json").then((r) => r.json() as Promise<Atlas>),
  fetch("maps/1.json").then((r) => r.json() as Promise<Atlas>),
]);
const atlas = new Map(maps.map((a) => [a.frame.map, a]));
const zoneMap = (map: number, ui: number) => atlas.get(map)!.zones.find((z) => z.ui === ui)!;

// --- the map: a continent or one of its zones, zoomed and panned by a transform ---
let shown = 0, zone: ZoneMap | null = null, scale = 1, tx = 0, ty = 0;
const view = { minScale: 0.1, maxScale: 4 };
const frame = (): Frame => zone?.frame ?? atlas.get(shown)!.frame;
function apply() {
  // the picture keeps the box covered (or stays in its middle, smaller than it)
  const f = frame(), w = viewport.clientWidth, h = viewport.clientHeight, W = f.width * scale, H = f.height * scale;
  tx = W <= w ? (w - W) / 2 : Math.min(0, Math.max(w - W, tx));
  ty = H <= h ? (h - H) / 2 : Math.min(0, Math.max(h - H, ty));
  stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  stage.style.setProperty("--s", String(scale));
}
function fit() {
  const f = frame(), w = viewport.clientWidth, h = viewport.clientHeight;
  scale = Math.min(w / f.width, h / f.height);
  view.minScale = scale * 0.9;
  view.maxScale = scale * 4;
  tx = (w - f.width * scale) / 2;
  ty = (h - f.height * scale) / 2;
  apply();
}
function zoomAt(k: number, cx: number, cy: number) {
  const next = Math.min(view.maxScale, Math.max(view.minScale, scale * k));
  tx = cx - ((cx - tx) * next) / scale;
  ty = cy - ((cy - ty) * next) / scale;
  scale = next;
  apply();
}
// show a continent (ui null) or one of its zones' maps
function show(map: number, ui: number | null = null) {
  // a pin on the other continent would be judged unseen: a switch before the reveal drops it
  if (map !== shown && !revealed && guess) {
    guess = null;
    guessBtn.disabled = true;
  }
  shown = map;
  zone = ui == null ? null : zoneMap(map, ui);
  const f = frame();
  mapImg.src = zone ? `maps/zones/${zone.ui}.webp` : `maps/${map}.webp`;
  mapImg.width = f.width;
  mapImg.height = f.height;
  overlay.setAttribute("viewBox", `0 0 ${f.width} ${f.height}`);
  overlay.setAttribute("width", String(f.width));
  overlay.setAttribute("height", String(f.height));
  stage.style.width = `${f.width}px`;
  stage.style.height = `${f.height}px`;
  for (const b of continents.querySelectorAll("button")) b.classList.toggle("on", Number(b.dataset.map) === map);
  bar();
  hover.textContent = "";
  fit();
  drawMarks();
}
// the line over the map: where it is, the way back, the cities inside
function bar() {
  const a = atlas.get(shown)!;
  if (!zone) {
    zonebar.innerHTML = `<span>${esc(a.name)}: click a zone to open its map</span>`;
    return;
  }
  const parent = a.zones.find((z) => z.inside.includes(zone!.ui));
  zonebar.innerHTML = [
    `<button data-ui="">&lsaquo; ${esc(a.name)}</button>`,
    parent ? `<button data-ui="${parent.ui}">&lsaquo; ${esc(parent.name)}</button>` : "",
    `<b>${esc(zone.name)}</b>`,
    ...zone.inside.map((ui) => `<button data-ui="${ui}">${esc(zoneMap(shown, ui).name)} &rsaquo;</button>`),
  ].join("");
}
continents.innerHTML = [...atlas.values()].map((a) => `<button data-map="${a.frame.map}">${esc(a.name)}</button>`).join("");
continents.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b) show(Number(b.dataset.map));
});
zonebar.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b) show(shown, b.dataset.ui ? Number(b.dataset.ui) : null);
});

// the point under the pointer: on the viewport, on the picture, in the world
const local = (e: { clientX: number; clientY: number }) => {
  const r = viewport.getBoundingClientRect();
  const vx = e.clientX - r.left, vy = e.clientY - r.top, px = (vx - tx) / scale, py = (vy - ty) / scale;
  return { vx, vy, px, py, ...toWorld(frame(), px, py) };
};
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  const { vx, vy } = local(e);
  zoomAt(Math.exp(-e.deltaY * 0.0015), vx, vy);
}, { passive: false });
$("zoom-in").addEventListener("click", () => zoomAt(1.5, viewport.clientWidth / 2, viewport.clientHeight / 2));
$("zoom-out").addEventListener("click", () => zoomAt(1 / 1.5, viewport.clientWidth / 2, viewport.clientHeight / 2));

// a drag pans, a pinch zooms, a press that hardly moved opens a zone or places the guess
const pointers = new Map<number, { x: number; y: number }>();
let moved = 0, pinch = 0;
viewport.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest("#zoom") || (e.pointerType === "mouse" && e.button !== 0)) return;
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) moved = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
viewport.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    const at = local(e), a = atlas.get(shown)!;
    if (zone) {
      const area = areaAt(a.areas, at.x, at.y);
      hover.textContent = area && a.names[area] ? areaLine(a, area) : "";
    } else hover.textContent = zoneUnder(a, at.x, at.y)?.name ?? "";
    viewport.classList.toggle("opens", !zone && hover.textContent !== "");
    return;
  }
  if (pointers.size === 2) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    const { vx, vy } = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
    if (pinch) zoomAt(d / pinch, vx, vy);
    pinch = d;
    moved = Infinity;
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  moved += Math.abs(dx) + Math.abs(dy);
  tx += dx;
  ty += dy;
  p.x = e.clientX;
  p.y = e.clientY;
  apply();
});
const release = (e: PointerEvent) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = 0;
  if (pointers.size === 0 && moved < 6 && e.type === "pointerup") press(e);
};
viewport.addEventListener("pointerup", release);
viewport.addEventListener("pointercancel", release);
viewport.addEventListener("pointerleave", () => (hover.textContent = ""));

// the area (and its zone) under a point, as the hover line says it
function areaLine(a: Atlas, area: number) {
  const n = a.names[area], zone = a.names[n.zone]?.name ?? "";
  return n.zone === area || !zone ? n.name : `${n.name}, ${zone}`;
}

// --- a game ---
let rounds: Round[] = [], at = 0, total = 0;
let guess: { map: number; x: number; y: number; ui: number } | null = null;
const results: { round: Round; guess: { map: number; x: number; y: number; ui: number }; result: Result }[] = [];
let revealed = false;

function press(e: PointerEvent) {
  const p = local(e), f = frame();
  if (p.px < 0 || p.py < 0 || p.px > f.width || p.py > f.height) return;
  // the continent: open the zone under the click
  if (!zone) {
    const z = zoneUnder(atlas.get(shown)!, p.x, p.y);
    if (z) show(shown, z.ui);
    return;
  }
  if (revealed) return;
  guess = { map: shown, x: p.x, y: p.y, ui: zone.ui };
  guessBtn.disabled = false;
  drawMarks();
}

function pin(cls: string, x: number, y: number, title: string) {
  const { px, py } = toPixel(frame(), x, y);
  return `<i class="pin ${cls}" style="left:${px}px;top:${py}px" title="${esc(title)}"></i>`;
}
const here = (p: { map: number; x: number; y: number } | null): p is { map: number; x: number; y: number } => !!p && p.map === shown && onFrame(frame(), p.x, p.y);
function drawMarks() {
  const r = rounds[at];
  let html = here(guess) ? pin("guess", guess.x, guess.y, "Your guess") : "";
  overlay.innerHTML = "";
  if (revealed && r) {
    if (here(r)) html += pin("truth", r.x, r.y, r.name);
    if (guess && guess.map === r.map && r.map === shown) {
      const g = toPixel(frame(), guess.x, guess.y), t = toPixel(frame(), r.x, r.y);
      overlay.innerHTML = `<line x1="${g.px}" y1="${g.py}" x2="${t.px}" y2="${t.py}" />`;
    }
  }
  marks.innerHTML = html;
}

// after a reveal: the first map holding the guess and the truth (the
// round's zone, the zone around it when it is a city, the map the guess was
// placed on), else the continent, framed on both together
function reveal(r: Round) {
  const a = atlas.get(r.map)!, own = a.zones.find((z) => z.zone === r.zone);
  const tries = [own, own && a.zones.find((z) => z.inside.includes(own.ui)), guess && a.zones.find((z) => z.ui === guess!.ui)];
  const both = guess && guess.map === r.map ? tries.find((z) => z && onFrame(z.frame, r.x, r.y) && onFrame(z.frame, guess!.x, guess!.y)) : undefined;
  show(r.map, both?.ui ?? (guess && guess.map === r.map ? null : own?.ui ?? null));
  frameBoth(r);
}
function frameBoth(r: Round) {
  const f = frame(), t = toPixel(f, r.x, r.y);
  const g = guess && guess.map === r.map ? toPixel(f, guess.x, guess.y) : t;
  const w = viewport.clientWidth, h = viewport.clientHeight, pad = 60;
  const spanX = Math.abs(g.px - t.px) + 1, spanY = Math.abs(g.py - t.py) + 1;
  scale = Math.max(view.minScale, Math.min(view.maxScale / 2, (w - 2 * pad) / spanX, (h - 2 * pad) / spanY));
  tx = w / 2 - ((g.px + t.px) / 2) * scale;
  ty = h / 2 - ((g.py + t.py) / 2) * scale;
  apply();
}

function start() {
  rounds = pickRounds(all, ROUNDS);
  at = 0;
  total = 0;
  results.length = 0;
  summary.hidden = true;
  game.hidden = false;
  begin();
}

function begin() {
  const r = rounds[at];
  guess = null;
  revealed = false;
  picture.src = `pictures/${r.id}.webp`;
  roundEl.textContent = `Round ${at + 1} of ${rounds.length}`;
  totalEl.textContent = `${fmt(total)} points`;
  guessBtn.hidden = false;
  guessBtn.disabled = true;
  nextBtn.hidden = true;
  hint.hidden = false;
  result.hidden = true;
  // preload the next picture
  if (rounds[at + 1]) new Image().src = `pictures/${rounds[at + 1].id}.webp`;
  show(shown);
}

guessBtn.addEventListener("click", () => {
  if (!guess || revealed) return;
  const r = rounds[at], res = judge(atlas.get(guess.map)!, r, guess);
  revealed = true;
  total += res.points;
  results.push({ round: r, guess, result: res });
  totalEl.textContent = `${fmt(total)} points`;
  hint.hidden = true;
  guessBtn.hidden = true;
  nextBtn.hidden = false;
  nextBtn.textContent = at + 1 < rounds.length ? "Next round" : "See the summary";
  const place = r.zoneName && r.zoneName !== r.name ? `${r.name}, ${r.zoneName}` : r.name;
  const where = res.yards == null ? `Wrong continent: this is in ${atlas.get(r.map)!.name}.` : `${fmt(Math.round(res.yards))} yards away.`;
  const bonus = [res.zone ? `right zone +500` : "", res.subzone ? `right subzone +500` : ""].filter(Boolean).join(", ");
  result.innerHTML = `<p class="place">${esc(place)}</p><p>${where}</p><p class="points">${fmt(res.points)} points${bonus ? ` <small>(${fmt(res.distance)} for the distance, ${bonus})</small>` : ""}</p>`;
  result.hidden = false;
  reveal(r);
});

nextBtn.addEventListener("click", () => {
  if (++at < rounds.length) begin();
  else end();
});

function end() {
  game.hidden = true;
  summary.hidden = false;
  roundEl.textContent = "Summary";
  const max = ROUND_MAX * rounds.length;
  summary.innerHTML = `<h2>${fmt(total)} <small>of ${fmt(max)} points</small></h2>
    <ol>${results
      .map(({ round: r, result: res }) => {
        const place = r.zoneName && r.zoneName !== r.name ? `${r.name}, ${r.zoneName}` : r.name;
        const far = res.yards == null ? "other continent" : `${fmt(Math.round(res.yards))} yards`;
        return `<li><img src="pictures/${r.id}.webp" alt="" /><div><p class="place">${esc(place)}</p><p>${far}${res.zone ? ", right zone" : ""}${res.subzone ? ", right subzone" : ""}</p></div><p class="points">${fmt(res.points)}</p></li>`;
      })
      .join("")}</ol>
    <button id="again">Play again</button>`;
  $("again").addEventListener("click", start);
}

// refit only when the map's box changed size (a phone's address bar hiding fires resize too)
let box = "";
window.addEventListener("resize", () => {
  const now = `${viewport.clientWidth}x${viewport.clientHeight}`;
  if (now === box) return;
  box = now;
  if (revealed && rounds[at]) frameBoth(rounds[at]);
  else fit();
});
start();
