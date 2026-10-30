// The continent maps the game page is played on, shared by the build
// (scripts/site.ts) and the page (web/game.ts). A map is our own picture of
// wow-data's terrain (src/mapdraw.ts), never the game's map art, so its
// frame is ours too: world yards in, pixels out, no bounds borrowed from
// the world map. North up, west left: the game's x grows north and y west,
// so a pixel's column counts yards west of the left edge backwards.
import { CHUNK, ORIGIN } from "./ground";

export type Frame = { map: number; top: number; left: number; yards: number; width: number; height: number };

// a world point (yards) on the map's picture (pixels from its top left corner)
export const toPixel = (f: Frame, x: number, y: number) => ({ px: (f.left - y) / f.yards, py: (f.top - x) / f.yards });
// a point of the picture in world yards
export const toWorld = (f: Frame, px: number, py: number) => ({ x: f.top - py * f.yards, y: f.left - px * f.yards });

// The areas the client names on each map chunk (33.3 yards a side), for the
// zone and subzone under a guess: rows of runs, [area, count, area, count,
// ...], 0 where no ground is. row0 and col0 are the first chunk's indices in
// the terrain's grid (ground.ts: row = (ORIGIN - x) / CHUNK, col the same of y).
export type Areas = { row0: number; col0: number; runs: number[][] };

export function areaAt(a: Areas, x: number, y: number): number {
  const r = Math.floor((ORIGIN - x) / CHUNK) - a.row0, c = Math.floor((ORIGIN - y) / CHUNK) - a.col0;
  const runs = a.runs[r];
  if (!runs || c < 0) return 0;
  for (let i = 0, at = 0; i < runs.length; i += 2) {
    at += runs[i + 1];
    if (c < at) return runs[i];
  }
  return 0;
}

// One continent as the page loads it: the picture's frame, the areas, each
// area's name, zone and parent, and where to write each zone's name on the map.
export type Atlas = {
  frame: Frame;
  name: string;
  areas: Areas;
  names: Record<number, { name: string; zone: number; parent: number }>;
  labels: { zone: number; name: string; px: number; py: number }[];
};

// One picture to guess, as the page loads it (site.ts writes them from
// locations.json): no yaw, no landmark keys, nothing the page doesn't use.
// mapZone: the zone the map's areas name under the camera, which differs
// from zone in a city built inside a WMO (Ironforge's chunks are Dun
// Morogh's, Undercity's Tirisfal's) and on a border (Thalanaar). mapArea:
// the area the map names under the camera (a subzone, or the zone's own
// unnamed ground).
export type Round = { id: number; map: number; x: number; y: number; zone: number; mapZone: number; subzone: number; mapArea: number; name: string; zoneName: string };

// The score (ideas/geoguessr.md, "How a guess is scored"): a falloff of the
// distance, 5000 under 50 yards to 0 at 4000 (about a fifth of a continent),
// and a bonus each for the right zone (the round's, or the one the map shows
// under it) and the right subzone (inside the round's, or the very area the
// map shows under the camera: a landmark on a zone's own unnamed ground, or
// a city's district over another zone's chunks, has no subzone of its own),
// exact from the areas under the guess. A guess on the other continent
// scores nothing.
export const MAX_DISTANCE = 4000, NEAR = 50, FULL = 5000, ZONE_BONUS = 500, SUBZONE_BONUS = 500;
export const ROUND_MAX = FULL + ZONE_BONUS + SUBZONE_BONUS;

export function distancePoints(yards: number): number {
  if (yards <= NEAR) return FULL;
  if (yards >= MAX_DISTANCE) return 0;
  return Math.round(FULL * (1 - (yards - NEAR) / (MAX_DISTANCE - NEAR)));
}

// the zone of an area as the atlas names it (an area outside it: none)
const zoneOf = (atlas: Atlas, area: number) => atlas.names[area]?.zone ?? 0;
// true when an area is the subzone or lies inside it
function within(atlas: Atlas, area: number, subzone: number): boolean {
  for (let a = area, i = 0; a && i < 10; a = atlas.names[a]?.parent ?? 0, i++) if (a === subzone) return true;
  return false;
}

export type Result = { yards: number | null; distance: number; zone: boolean; subzone: boolean; points: number; guessArea: number };

// the guess (a map and a world point) against the round's truth; atlas is
// the guessed continent's
export function judge(atlas: Atlas, round: Round, guess: { map: number; x: number; y: number }): Result {
  if (guess.map !== round.map) return { yards: null, distance: 0, zone: false, subzone: false, points: 0, guessArea: 0 };
  const yards = Math.hypot(guess.x - round.x, guess.y - round.y);
  const area = areaAt(atlas.areas, guess.x, guess.y);
  const guessed = zoneOf(atlas, area), zone = guessed !== 0 && (guessed === round.zone || guessed === round.mapZone);
  const subzone = zone && ((round.subzone !== round.zone && within(atlas, area, round.subzone)) || area === round.mapArea);
  const distance = distancePoints(yards);
  return { yards, distance, zone, subzone, points: distance + (zone ? ZONE_BONUS : 0) + (subzone ? SUBZONE_BONUS : 0), guessArea: area };
}

// A game's rounds: n pictures, each from another zone, so five rounds walk
// five places (random: a function like Math.random, for the tests)
export function pickRounds(all: Round[], n: number, random: () => number = Math.random): Round[] {
  const pool = [...all];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: Round[] = [], zones = new Set<number>();
  for (const r of pool) if (out.length < n && !zones.has(r.zone)) out.push(r), zones.add(r.zone);
  return out;
}
