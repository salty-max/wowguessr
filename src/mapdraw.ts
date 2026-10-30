// A continent's map, drawn from wow-data's terrain (terrain_chunk: heights,
// water, the area named on each chunk), never from the game's map art: each
// zone's ground in its colour, shaded by its slope and lightened by its
// height over the land around, water by its depth, lava, each zone's border,
// and the land outside every zone a player has a map of (Hyjal, the
// unfinished corners) grey. Its frame is the zones'
// chunks with a margin, in yards (atlas.ts' Frame), so a world point lands
// on it exactly.
import type { Areas, Frame } from "./atlas";
import { CHUNK, ORIGIN, type Ground } from "./ground";

export const YARDS = 8; // a pixel's side, in yards (a chunk about 4 pixels)
const MARGIN = 400;

type Rgb = [number, number, number];
// Each zone's ground in one colour, its look as a player knows it (the
// terrain database has no textures): snow, forest, grass, desert, swamp,
// rock. Hand-picked for the map, nothing measured. A zone not named here,
// and land no zone a player has a map of claims (area 0, Hyjal), is drawn
// grey.
const SNOW: Rgb = [226, 230, 236], FOREST: Rgb = [84, 124, 66], DARKWOOD: Rgb = [70, 92, 70], GRASS: Rgb = [128, 152, 84],
  GOLD: Rgb = [176, 162, 92], JUNGLE: Rgb = [70, 138, 62], SWAMP: Rgb = [88, 104, 72], SAND: Rgb = [214, 186, 128],
  REDROCK: Rgb = [168, 100, 70], BARREN: Rgb = [150, 132, 100], ASH: Rgb = [92, 80, 74], BLIGHT: Rgb = [128, 120, 78],
  ROCK: Rgb = [138, 132, 124], SAVANNA: Rgb = [178, 156, 96], AUTUMN: Rgb = [170, 110, 66], VIOLET: Rgb = [92, 96, 118];
const BIOME: Record<number, Rgb> = {
  // Eastern Kingdoms
  1: SNOW, 1537: SNOW, 12: FOREST, 1519: FOREST, 40: GOLD, 44: [150, 138, 84], 10: DARKWOOD, 33: JUNGLE, 8: SWAMP, 4: REDROCK,
  41: ROCK, 46: ASH, 51: REDROCK, 3: BARREN, 38: GRASS, 11: SWAMP, 45: GOLD, 267: GRASS, 36: ROCK, 130: DARKWOOD,
  85: BLIGHT, 1497: BLIGHT, 28: BLIGHT, 139: [140, 112, 80], 47: JUNGLE,
  // Kalimdor
  141: FOREST, 1657: FOREST, 148: DARKWOOD, 331: VIOLET, 361: [86, 96, 64], 493: GRASS, 618: SNOW, 16: AUTUMN,
  14: [186, 112, 70], 1637: [186, 112, 70], 17: SAVANNA, 215: GRASS, 1638: GRASS, 406: ROCK, 405: [128, 124, 116],
  357: JUNGLE, 400: [200, 170, 120], 15: SWAMP, 440: SAND, 490: JUNGLE, 1377: [212, 168, 96], 3478: [212, 168, 96],
};
const UNPLAYED: Rgb = [128, 128, 124];
const SEA: Rgb = [38, 74, 104], WATER: Rgb = [70, 118, 150], LAVA: Rgb = [214, 84, 30], BORDER = 0.55;
// MH2O's liquid types as wow-data keeps them (the client's LiquidType ids):
// 2 ocean, 5 slow water (rivers, lakes), 7 slow magma; the magma one checked
// by eye (Blackrock Mountain's lava between the Searing Gorge and the
// Burning Steppes), the rest drawn as water
const MAGMA = new Set([3, 7]);
// the ground over its neighbourhood (yards, a box this wide) lightens it,
// under it darkens it: hills and valleys read in any zone's colour
const AROUND = 640, RELIEF = 300;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export type Drawn = { frame: Frame; rgb: Uint8Array; areas: Areas; labels: { zone: number; px: number; py: number }[] };

// zoneOf: an area's zone; played: the zones with a map (the picker's)
export function draw(map: number, ground: Ground, zoneOf: (area: number) => number, played: Set<number>): Drawn {
  // the frame: every chunk of a played zone, a margin around
  let rMin = Infinity, rMax = -Infinity, cMin = Infinity, cMax = -Infinity;
  for (const c of ground.all)
    if (played.has(zoneOf(c.area_id))) {
      rMin = Math.min(rMin, c.row), rMax = Math.max(rMax, c.row), cMin = Math.min(cMin, c.col), cMax = Math.max(cMax, c.col);
    }
  const top = ORIGIN - rMin * CHUNK + MARGIN, left = ORIGIN - cMin * CHUNK + MARGIN;
  const width = Math.ceil(((cMax + 1 - cMin) * CHUNK + 2 * MARGIN) / YARDS), height = Math.ceil(((rMax + 1 - rMin) * CHUNK + 2 * MARGIN) / YARDS);
  const frame: Frame = { map, top, left, yards: YARDS, width, height };

  // each pixel's middle in the world: its height (NaN off the ground), liquid, zone
  const n = width * height, H = new Float32Array(n), zone = new Int32Array(n), wet = new Float32Array(n), lava = new Uint8Array(n);
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const i = py * width + px, x = top - (py + 0.5) * YARDS, y = left - (px + 0.5) * YARDS;
      const h = ground.height(x, y);
      H[i] = h ?? NaN;
      if (h == null) continue;
      zone[i] = zoneOf(ground.area(x, y) ?? 0);
      const l = ground.liquid(x, y);
      if (l && l.level > h) {
        wet[i] = l.level - h;
        lava[i] = MAGMA.has(l.type) ? 1 : 0;
      }
    }

  // the mean ground height around each pixel (a summed-area table, the sea not counted)
  const sumH = new Float64Array((width + 1) * (height + 1)), sumN = new Float64Array((width + 1) * (height + 1));
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const i = py * width + px, k = (py + 1) * (width + 1) + px + 1, dry = Number.isNaN(H[i]) ? 0 : 1;
      sumH[k] = (dry ? H[i] : 0) + sumH[k - 1] + sumH[k - width - 1] - sumH[k - width - 2];
      sumN[k] = dry + sumN[k - 1] + sumN[k - width - 1] - sumN[k - width - 2];
    }
  const R = Math.round(AROUND / YARDS / 2), mean = new Float32Array(n);
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const x0 = Math.max(0, px - R), x1 = Math.min(width, px + R + 1), y0 = Math.max(0, py - R), y1 = Math.min(height, py + R + 1);
      const box = (t: Float64Array) => t[y1 * (width + 1) + x1] - t[y0 * (width + 1) + x1] - t[y1 * (width + 1) + x0] + t[y0 * (width + 1) + x0];
      const k = box(sumN);
      mean[py * width + px] = k ? box(sumH) / k : 0;
    }

  // shade: light from the north west, 45 degrees up, the slope from the neighbours
  const lx = -0.5, ly = -0.5, lz = Math.SQRT1_2;
  const at = (px: number, py: number, h: number) => {
    const v = px >= 0 && py >= 0 && px < width && py < height ? H[py * width + px] : NaN;
    return Number.isNaN(v) ? h : v;
  };
  const rgb = new Uint8Array(n * 3);
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const i = py * width + px, h = H[i];
      let c: Rgb;
      if (Number.isNaN(h)) c = SEA;
      else {
        // pixels grow east (dx) and south (dy): the normal of the surface z(h)
        const dx = (at(px + 1, py, h) - at(px - 1, py, h)) / (2 * YARDS), dy = (at(px, py + 1, h) - at(px, py - 1, h)) / (2 * YARDS);
        const len = Math.hypot(dx, dy, 1), shade = Math.max(0, (-dx * lx - dy * ly + lz) / len);
        const s = 0.55 + 0.6 * shade, rel = Math.max(-1, Math.min(1, (h - mean[i]) / RELIEF));
        c = (played.has(zone[i]) && BIOME[zone[i]]) || UNPLAYED;
        c = rel > 0 ? mix(c, [255, 255, 255], 0.25 * rel) : mix(c, [0, 0, 0], -0.25 * rel);
        if (wet[i] > 0) c = lava[i] ? LAVA : mix(WATER, SEA, Math.min(1, wet[i] / 60));
        else c = [c[0] * s, c[1] * s, c[2] * s];
        // a zone's border: a neighbour (east or south) in another played zone, both dry
        const e = px + 1 < width ? i + 1 : i, so = py + 1 < height ? i + width : i;
        const edge = (j: number) => zone[j] !== zone[i] && played.has(zone[j]) && played.has(zone[i]) && !wet[i] && !wet[j];
        if (edge(e) || edge(so)) c = [c[0] * BORDER, c[1] * BORDER, c[2] * BORDER];
      }
      rgb[i * 3] = Math.max(0, Math.min(255, Math.round(c[0])));
      rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
      rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
    }

  // the areas, a chunk a cell, as runs
  const row0 = Math.floor((ORIGIN - top) / CHUNK), col0 = Math.floor((ORIGIN - left) / CHUNK);
  const rows = Math.ceil((height * YARDS) / CHUNK) + 1, cols = Math.ceil((width * YARDS) / CHUNK) + 1;
  const runs: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const out: number[] = [];
    for (let k = 0; k < cols; k++) {
      const x = ORIGIN - (row0 + r + 0.5) * CHUNK, y = ORIGIN - (col0 + k + 0.5) * CHUNK;
      const a = ground.area(x, y) ?? 0;
      if (out.length && out[out.length - 2] === a) out[out.length - 1]++;
      else out.push(a, 1);
    }
    runs.push(out);
  }

  // each played zone's label: its pixels' mean, or the pixel of it nearest the mean
  const sum = new Map<number, [number, number, number]>();
  for (let i = 0; i < n; i++)
    if (played.has(zone[i]) && !wet[i]) {
      const s = sum.get(zone[i]) ?? [0, 0, 0];
      s[0] += i % width, s[1] += Math.floor(i / width), s[2]++;
      sum.set(zone[i], s);
    }
  const labels: Drawn["labels"] = [];
  for (const [z, [sx, sy, k]] of sum) {
    let px = Math.round(sx / k), py = Math.round(sy / k);
    if (zone[py * width + px] !== z) {
      let best = Infinity;
      for (let i = 0; i < n; i++)
        if (zone[i] === z) {
          const d = (i % width - sx / k) ** 2 + (Math.floor(i / width) - sy / k) ** 2;
          if (d < best) (best = d), (px = i % width), (py = Math.floor(i / width));
        }
    }
    labels.push({ zone: z, px, py });
  }
  labels.sort((a, b) => a.zone - b.zone);
  return { frame, rgb, areas: { row0, col0, runs }, labels };
}
