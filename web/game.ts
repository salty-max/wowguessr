// The game page: five rounds, each a rendered picture, a guess on one of
// the two continents' maps (src/mapdraw.ts' pictures of wow-data's terrain),
// the distance and the score (src/atlas.ts), then a summary. Static: it
// reads site/'s rounds.json and maps/ (scripts/site.ts) and keeps nothing.
import { type Atlas, judge, pickRounds, type Result, ROUND_MAX, type Round, toPixel, toWorld, areaAt } from "../src/atlas";

const ROUNDS = 5;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const picture = $<HTMLImageElement>("picture"), mapImg = $<HTMLImageElement>("map"), viewport = $("viewport"), stage = $("stage");
const overlay = document.getElementById("overlay") as unknown as SVGSVGElement;
const labels = $("labels"), marks = $("marks"), hover = $("hover"), continents = $("continents");
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

// --- the map: one continent at a time, zoomed and panned by a transform ---
let shown = 0, scale = 1, tx = 0, ty = 0;
const view = { minScale: 0.1, maxScale: 4 };
function apply() {
  stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  stage.style.setProperty("--s", String(scale));
  // the zones' names smaller when the whole continent shows, full size zoomed in
  stage.style.setProperty("--ls", String(Math.min(1, Math.max(0.62, scale / 0.4)) / scale));
}
function fit() {
  const f = atlas.get(shown)!.frame, w = viewport.clientWidth, h = viewport.clientHeight;
  scale = Math.min(w / f.width, h / f.height);
  view.minScale = scale * 0.9;
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
function show(map: number) {
  // a pin on the other continent would be judged unseen: a switch before the reveal drops it
  if (map !== shown && !revealed && guess) {
    guess = null;
    guessBtn.disabled = true;
  }
  shown = map;
  const a = atlas.get(map)!;
  mapImg.src = `maps/${map}.webp`;
  mapImg.width = a.frame.width;
  mapImg.height = a.frame.height;
  overlay.setAttribute("viewBox", `0 0 ${a.frame.width} ${a.frame.height}`);
  overlay.setAttribute("width", String(a.frame.width));
  overlay.setAttribute("height", String(a.frame.height));
  stage.style.width = `${a.frame.width}px`;
  stage.style.height = `${a.frame.height}px`;
  labels.innerHTML = a.labels.map((l) => `<span style="left:${l.px}px;top:${l.py}px">${esc(l.name)}</span>`).join("");
  for (const b of continents.querySelectorAll("button")) b.classList.toggle("on", Number(b.dataset.map) === map);
  fit();
  drawMarks();
}
continents.innerHTML = [...atlas.values()].map((a) => `<button data-map="${a.frame.map}">${esc(a.name)}</button>`).join("");
continents.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b) show(Number(b.dataset.map));
});

// the point under the pointer, in the map's pixels
const local = (e: { clientX: number; clientY: number }) => {
  const r = viewport.getBoundingClientRect();
  return { vx: e.clientX - r.left, vy: e.clientY - r.top, px: (e.clientX - r.left - tx) / scale, py: (e.clientY - r.top - ty) / scale };
};
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  const { vx, vy } = local(e);
  zoomAt(Math.exp(-e.deltaY * 0.0015), vx, vy);
}, { passive: false });
$("zoom-in").addEventListener("click", () => zoomAt(1.5, viewport.clientWidth / 2, viewport.clientHeight / 2));
$("zoom-out").addEventListener("click", () => zoomAt(1 / 1.5, viewport.clientWidth / 2, viewport.clientHeight / 2));

// a drag pans, a pinch zooms, a press that hardly moved places the guess
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
    const { px, py } = local(e), a = atlas.get(shown)!, w = toWorld(a.frame, px, py), area = areaAt(a.areas, w.x, w.y);
    hover.textContent = area && a.names[area] ? zoneLine(a, area) : "";
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
  if (pointers.size === 0 && moved < 6 && e.type === "pointerup") place(e);
};
viewport.addEventListener("pointerup", release);
viewport.addEventListener("pointercancel", release);
viewport.addEventListener("pointerleave", () => (hover.textContent = ""));

// the zone (and the subzone) under a point, as the hover line says it
function zoneLine(a: Atlas, area: number) {
  const n = a.names[area], zone = a.names[n.zone]?.name ?? "";
  return n.zone === area || !zone ? n.name : `${n.name}, ${zone}`;
}

// --- a game ---
let rounds: Round[] = [], at = 0, total = 0;
let guess: { map: number; x: number; y: number } | null = null;
const results: { round: Round; guess: { map: number; x: number; y: number }; result: Result }[] = [];
let revealed = false;

function place(e: PointerEvent) {
  if (revealed) return;
  const { px, py } = local(e), a = atlas.get(shown)!;
  if (px < 0 || py < 0 || px > a.frame.width || py > a.frame.height) return;
  guess = { map: shown, ...toWorld(a.frame, px, py) };
  guessBtn.disabled = false;
  drawMarks();
}

function pin(cls: string, map: number, x: number, y: number, title: string) {
  if (map !== shown) return "";
  const { px, py } = toPixel(atlas.get(map)!.frame, x, y);
  return `<i class="pin ${cls}" style="left:${px}px;top:${py}px" title="${esc(title)}"></i>`;
}
function drawMarks() {
  const r = rounds[at];
  let html = guess ? pin("guess", guess.map, guess.x, guess.y, "Your guess") : "";
  overlay.innerHTML = "";
  if (revealed && r) {
    html += pin("truth", r.map, r.x, r.y, r.name);
    if (guess && guess.map === r.map && r.map === shown) {
      const f = atlas.get(shown)!.frame, g = toPixel(f, guess.x, guess.y), t = toPixel(f, r.x, r.y);
      overlay.innerHTML = `<line x1="${g.px}" y1="${g.py}" x2="${t.px}" y2="${t.py}" />`;
    }
  }
  marks.innerHTML = html;
}

// frame the guess and the truth together after a reveal
function frameBoth(r: Round) {
  const f = atlas.get(r.map)!.frame, t = toPixel(f, r.x, r.y);
  const g = guess && guess.map === r.map ? toPixel(f, guess.x, guess.y) : t;
  const w = viewport.clientWidth, h = viewport.clientHeight, pad = 80;
  const spanX = Math.abs(g.px - t.px) + 1, spanY = Math.abs(g.py - t.py) + 1;
  scale = Math.max(view.minScale, Math.min(view.maxScale * 0.25, (w - 2 * pad) / spanX, (h - 2 * pad) / spanY));
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
  if (shown !== r.map) show(r.map);
  else drawMarks();
  frameBoth(r);
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
