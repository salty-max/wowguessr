// A cheap test of a render: is it a wall of one colour (the camera in a
// rock, a tree's trunk, a building's side) or too dark to read? Read on a
// small copy (160x90): the spread of its brightness, the share of its most
// common colour, the same two for its middle third (a wall right ahead
// with sky above it), and its mean brightness.
export type Pixels = { width: number; height: number; rgb: Uint8Array };
export type Check = { ok: boolean; why: string[]; spread: number; common: number; middleSpread: number; middleCommon: number; mean: number };

// thresholds, set on the spike's and this step's renders
const FLAT_SPREAD = 12, FLAT_COMMON = 0.55, WALL_SPREAD = 8, WALL_COMMON = 0.7, DARK = 25;

function stats(p: Pixels, x0: number, y0: number, x1: number, y1: number) {
  const bins = new Map<number, number>();
  let n = 0, sum = 0, sq = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * p.width + x) * 3, r = p.rgb[i], g = p.rgb[i + 1], b = p.rgb[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      n++;
      sum += luma;
      sq += luma * luma;
      // the colour, 4 bits a channel
      const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }
  const mean = sum / n;
  return { mean, spread: Math.sqrt(Math.max(0, sq / n - mean * mean)), common: Math.max(...bins.values()) / n };
}

export function check(p: Pixels): Check {
  const all = stats(p, 0, 0, p.width, p.height);
  const mid = stats(p, Math.floor(p.width / 3), Math.floor(p.height / 3), Math.ceil((2 * p.width) / 3), Math.ceil((2 * p.height) / 3));
  const why: string[] = [];
  if (all.spread < FLAT_SPREAD || all.common > FLAT_COMMON) why.push("flat");
  if (mid.spread < WALL_SPREAD && mid.common > WALL_COMMON) why.push("wall ahead");
  if (all.mean < DARK) why.push("dark");
  const r = (v: number) => Math.round(v * 100) / 100;
  return { ok: !why.length, why, spread: r(all.spread), common: r(all.common), middleSpread: r(mid.spread), middleCommon: r(mid.common), mean: r(all.mean) };
}

// Gray-world white balance: each channel scaled so their means meet (the
// renderer's daylight comes out orange), a channel's gain kept within 0.5-2.
export function grayWorld(p: Pixels): Pixels {
  const mean = [0, 0, 0];
  for (let i = 0; i < p.rgb.length; i += 3) for (let c = 0; c < 3; c++) mean[c] += p.rgb[i + c];
  const gray = (mean[0] + mean[1] + mean[2]) / 3;
  const gain = mean.map((m) => (m ? Math.min(2, Math.max(0.5, gray / m)) : 1));
  const out = new Uint8Array(p.rgb.length);
  for (let i = 0; i < p.rgb.length; i++) out[i] = Math.min(255, Math.round(p.rgb[i] * gain[i % 3]));
  return { ...p, rgb: out };
}
