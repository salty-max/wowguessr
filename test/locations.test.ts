// locations.json against drops.json: no dropped landmark left in, and no zone
// emptied by a drop list unless drops.json names it on purpose (its empty
// list, with why), so a later drop list can't silently take a zone off the map
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
const locations = read("locations.json") as { perZone: Record<string, number>; locations: { map: number; wmo: number; zone: number }[] };
const drops = read("drops.json") as { drops: { map: number; wmo: number }[]; empty: { zone: string; why: string }[] };

describe("locations.json and drops.json", () => {
  test("no dropped landmark is left in (pick.ts ran after the last drop)", () => {
    const dropped = new Set(drops.drops.map((d) => `${d.map}:${d.wmo}`));
    expect(locations.locations.filter((l) => dropped.has(`${l.map}:${l.wmo}`))).toEqual([]);
  });
  test("every zone with landmarks keeps a picture, or drops.json says why not", () => {
    const meant = new Set(drops.empty.filter((e) => e.why).map((e) => e.zone));
    const emptied = Object.entries(locations.perZone).filter(([, n]) => n === 0).map(([z]) => z);
    expect(emptied.filter((z) => !meant.has(z))).toEqual([]);
    // and none named empty that has pictures (a stale entry)
    expect([...meant].filter((z) => (locations.perZone[z] ?? 0) > 0)).toEqual([]);
  });
});
