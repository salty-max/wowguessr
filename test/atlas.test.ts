// The game page's arithmetic (src/atlas.ts): a world point to the map's
// picture and back, the areas under a guess, the score, the rounds drawn.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type Atlas, areaAt, distancePoints, type Frame, judge, onFrame, pickRounds, rank, revealMap, type Round, ROUND_MAX, toPixel, toWorld, zoneUnder } from "../src/atlas";
import { areaRuns } from "../src/areas";
import { CHUNK, type ChunkRow, Ground, ORIGIN } from "../src/ground";

const frame: Frame = { map: 0, top: 4000, left: 2000, yards: 8, width: 500, height: 1000 };

describe("the map's frame", () => {
  test("north is up and west is left", () => {
    expect(toPixel(frame, 4000, 2000)).toEqual({ px: 0, py: 0 });
    // 80 yards south and 40 east: 10 pixels down, 5 right
    expect(toPixel(frame, 3920, 1960)).toEqual({ px: 5, py: 10 });
  });
  test("a point goes to the picture and back unchanged", () => {
    for (const [x, y] of [[-909.37, -3478.05], [2734.45, -3854.49], [0, 0]]) {
      const { px, py } = toPixel(frame, x, y), w = toWorld(frame, px, py);
      expect(w.x).toBeCloseTo(x, 6);
      expect(w.y).toBeCloseTo(y, 6);
    }
  });
});

// a continent of three chunks in a row: Elwynn's ground, Goldshire on it, then the sea
const row0 = 100, col0 = 200;
const atlas: Atlas = {
  frame,
  name: "Test",
  areas: { row0, col0, runs: [[12, 1, 87, 1, 0, 1]] },
  names: { 12: { name: "Elwynn Forest", zone: 12, parent: 0 }, 87: { name: "Goldshire", zone: 12, parent: 12 } },
  zones: [{ ui: 1429, zone: 12, name: "Elwynn Forest", frame, inside: [] }],
};
// the middle of chunk k of the row
const at = (k: number) => ({ x: ORIGIN - (row0 + 0.5) * CHUNK, y: ORIGIN - (col0 + k + 0.5) * CHUNK });

describe("the areas", () => {
  test("each chunk's area from its run", () => {
    expect([0, 1, 2, 3].map((k) => areaAt(atlas.areas, at(k).x, at(k).y))).toEqual([12, 87, 0, 0]);
    expect(areaAt(atlas.areas, at(0).x + CHUNK, at(0).y)).toBe(0); // the row above: none
  });
});

describe("the zones' maps", () => {
  test("a click on the continent opens the zone under it, none in the sea", () => {
    expect(zoneUnder(atlas, at(1).x, at(1).y)?.ui).toBe(1429); // Goldshire: Elwynn's map
    expect(zoneUnder(atlas, at(2).x, at(2).y)).toBeUndefined();
  });
  test("a point is on a frame's picture or not", () => {
    expect(onFrame(frame, 3920, 1960)).toBe(true);
    expect(onFrame(frame, 4100, 1960)).toBe(false); // north of its top
    expect(onFrame(frame, 3920, 2100)).toBe(false); // west of its left
  });
});

describe("the score", () => {
  test("full under 50 yards, nothing from 4000, falling between", () => {
    expect(distancePoints(0)).toBe(5000);
    expect(distancePoints(50)).toBe(5000);
    expect(distancePoints(4000)).toBe(0);
    expect(distancePoints(1000)).toBeLessThan(distancePoints(500));
    expect(distancePoints(2025)).toBe(2500);
  });
  const round: Round = { id: 1, map: 0, ...at(1), zone: 12, mapZone: 12, subzone: 87, mapArea: 87, name: "Goldshire", zoneName: "Elwynn Forest" };
  test("on the spot: the distance's full points and both bonuses", () => {
    const r = judge(atlas, round, { map: 0, x: round.x + 3, y: round.y + 4 });
    expect(r).toMatchObject({ yards: 5, distance: 5000, zone: true, subzone: true, points: ROUND_MAX });
  });
  test("the next chunk: the zone, not the subzone", () => {
    const r = judge(atlas, round, { map: 0, ...at(0) });
    expect(r.zone).toBe(true);
    expect(r.subzone).toBe(false);
    expect(r.points).toBe(r.distance + 500);
  });
  test("the sea: no bonus", () => {
    expect(judge(atlas, round, { map: 0, ...at(2) })).toMatchObject({ zone: false, subzone: false });
  });
  test("a city in a WMO: the zone and the area the map shows under it count", () => {
    const city = { ...round, zone: 1537, mapZone: 12, subzone: 1537, mapArea: 87 };
    expect(judge(atlas, city, { map: 0, ...at(1) })).toMatchObject({ zone: true, subzone: true, points: ROUND_MAX });
    expect(judge(atlas, city, { map: 0, ...at(0) })).toMatchObject({ zone: true, subzone: false });
  });
  test("a landmark on the zone's own ground: that ground is its subzone", () => {
    const open = { ...round, ...at(0), subzone: 12, mapArea: 12 };
    expect(judge(atlas, open, { map: 0, ...at(0) })).toMatchObject({ zone: true, subzone: true, points: ROUND_MAX });
    expect(judge(atlas, open, { map: 0, ...at(1) })).toMatchObject({ zone: true, subzone: false });
  });
  test("the other continent: nothing", () => {
    expect(judge(atlas, round, { map: 1, ...at(1) })).toMatchObject({ yards: null, points: 0 });
  });
});

describe("a game's rounds", () => {
  const all = (JSON.parse(readFileSync(new URL("../locations.json", import.meta.url), "utf8")).locations as Round[]);
  test("five, each from another zone", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 50; i++) {
      const rounds = pickRounds(all, 5, random);
      expect(rounds.length).toBe(5);
      expect(new Set(rounds.map((r) => r.zone)).size).toBe(5);
    }
  });
});

describe("the areas under a map (src/areas.ts)", () => {
  // two chunks of ground in a sea: Elwynn at (row 101, col 201), Goldshire east of it
  const chunk = (row: number, col: number, area_id: number) => ({ row, col, area_id }) as unknown as ChunkRow;
  const ground = new Ground([chunk(101, 201, 12), chunk(101, 202, 87)]);
  // a frame of 4 by 4 chunks from (row 100, col 200)
  const f: Frame = { map: 0, top: ORIGIN - 100 * CHUNK, left: ORIGIN - 200 * CHUNK, yards: CHUNK, width: 4, height: 4 };
  const a = areaRuns(ground, f);
  test("the sea's rows at either end are left out, the row kept where it is", () => {
    expect(a.row0).toBe(101);
    expect(a.runs.length).toBe(1);
  });
  test("each chunk's area read back where the ground has it", () => {
    const mid = (row: number, col: number) => [ORIGIN - (row + 0.5) * CHUNK, ORIGIN - (col + 0.5) * CHUNK] as const;
    expect(areaAt(a, ...mid(101, 201))).toBe(12);
    expect(areaAt(a, ...mid(101, 202))).toBe(87);
    expect(areaAt(a, ...mid(101, 203))).toBe(0);
    expect(areaAt(a, ...mid(100, 201))).toBe(0);
    expect(areaAt(a, ...mid(102, 201))).toBe(0);
  });
});

describe("the map a reveal shows", () => {
  // a zone of 40 by 40 yards, a city of 8 by 8 inside it, and the continent around both
  const zoneFrame: Frame = { map: 0, top: 4000, left: 2000, yards: 1, width: 40, height: 40 };
  const cityFrame: Frame = { map: 0, top: 3990, left: 1990, yards: 1, width: 8, height: 8 };
  const world: Atlas = {
    ...atlas,
    zones: [
      { ui: 1, zone: 12, name: "Zone", frame: zoneFrame, inside: [2] },
      { ui: 2, zone: 1537, name: "City", frame: cityFrame, inside: [] },
    ],
  };
  const round = (zone: number, x: number, y: number): Round => ({ id: 1, map: 0, x, y, zone, mapZone: zone, subzone: zone, mapArea: zone, name: "", zoneName: "" });
  test("the round's zone map when it holds both", () => {
    expect(revealMap(world, round(12, 3980, 1980), { map: 0, x: 3970, y: 1970, ui: 1 })).toBe(1);
  });
  test("a city's round with the guess outside the city: the zone around it", () => {
    expect(revealMap(world, round(1537, 3987, 1987), { map: 0, x: 3970, y: 1970, ui: 1 })).toBe(1);
  });
  test("nothing holds both: the continent", () => {
    expect(revealMap(world, round(12, 3980, 1980), { map: 0, x: 1000, y: 1000, ui: 1 })).toBeNull();
  });
  test("the other continent: the round's zone, the truth alone", () => {
    expect(revealMap(world, round(12, 3980, 1980), { map: 1, x: 0, y: 0, ui: 9 })).toBe(1);
    expect(revealMap(world, round(12, 3980, 1980), null)).toBe(1);
  });
});

describe("a game's title", () => {
  test("by its share of the most a game can score", () => {
    expect(rank(30000, 5)).toBe("Loremaster");
    expect(rank(14399, 5)).toBe("Wayfarer");
    expect(rank(0, 5)).toBe("Lost in the Barrens");
  });
});
