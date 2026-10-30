# The location picker (step 3, 30 October 2026)

`bun scripts/pick.ts [--count 500] [--seed 1] [--out locations.json]` picks
cameras on Eastern Kingdoms (map 0) and Kalimdor (map 1) from wow-data's
`classic.db` only (reached through the family folder, `src/family.ts`), and
writes `locations.json`. The same seed and database give the same file.
It runs in about a second.

## What it reads

- `terrain_chunk` and `wmo_placement`, added to wow-data for this step
  (`wow-data/src/terrain.ts`): the ground's height, holes, the liquid over
  each 4-yard cell and the area the client names there, from the map files'
  root ADTs; each WMO's bounding box from the `_obj0` ADTs. The heights
  were checked against the Classic database's spawns (median 0.08 yards off
  around Goldshire).
- Candidates: the Classic database's creature and object spawns, the
  patrols' paths (`path`, mostly roads), the flight masters
  (`client_TaxiNodes`), and the middle of each area (its map chunk nearest
  the mean of its chunks).
- Zones: the top-level areas with a zone map (`client_UiMap` type 3) on the
  two continents, 46 in all. A point's zone is its chunk's area walked up
  `ParentAreaID`; its subzone is the chunk's own area.

## How a camera is chosen (`src/pick.ts`)

1. **Where it stands** (`stand`): on the terrain, or on a city's floor when
   a spawn stands above the terrain inside a big WMO (a box 160 yards or
   more across: Stormwind's is 1300). Refused: off the map, over a hole, a
   spawn more than 2 yards under the terrain (a cave, a cellar), inside a
   building's box (smaller than 160 yards), water more than half a yard
   deep at the feet, ground steeper than 1.2 (rise over run).
2. **The eye**: 2 to 3 yards above that ground.
3. **Where it looks** (`aim`): 16 headings, each blocked by ground at eye
   height within 5 yards, ground rising more than 30 degrees within 20, a
   building's box within 12, or the map's edge within 20. The rest scored by
   how much of 30 to 160 yards ahead lies under the eye line, less for the
   map's edge or a mountain's wall, more for a building 25 to 200 yards
   ahead. One drawn by score. Pitch: 0.4 of the slope to the ground 40
   yards ahead, plus 2 degrees down to 3 up, within 6 down and 8 up. The
   look-at is 30 yards along it.
4. **The spread**: each zone's share of the count by the square root of its
   size in map chunks (largest remainders), its candidates tried in turns of
   kind (a subzone's middle, a road, a flight master, a spawn), no two
   cameras of a zone within 150 yards, at most 3 a subzone. A zone that runs
   dry gives its share to the others, closer together.

## locations.json

`{ about, seed, wowData, tried, rejects, perZone, locations: [...] }`, each
location `{ id, map, x, y, z, yaw, pitch, lookAt: [x, y, z], ground, zone,
subzone, kind, ref }`. World yards (the renderer's `-camera` and `-lookat`
take them as they are), yaw the game's facing in radians (0 north, +x, a
quarter turn west, +y), pitch radians up, zone and subzone AreaTable ids,
ref the candidate it came from.

## The first run (seed 1)

500 cameras in 44 zones (Ironforge and Undercity are interiors: none). 832
candidates tried, 332 refused (39.9%): 145 indoors (a subzone's middle
inside a city's or a cave's box among them), 85 underground, 62 in water,
24 steep, 15 over a hole, 1 boxed in. By kind: 158 spawns, 150 subzone
middles, 149 roads, 43 flight masters.

## Rendering a sample

`bun scripts/render.ts --renderer <binary> --workdir <dir> --casc <dir>
[--sample 30]` renders a sample with the scratch offlineRenderer
(`docs/render-spike.md`; run from its build folder, where its `spirv/`
shaders and `export.db3` are), balances each picture's colours
(gray world: the renderer's daylight is orange), runs the image check
(`src/imagecheck.ts`: a frame or its middle third of one colour, or too dark)
and writes `.cache/renders/` (the pictures, `report.json`, `sheet.jpg`).
Never committed.

## The samples (30 cameras, seed 1, 30 October 2026)

Looked at on the contact sheet, not only tested.

- **First pass** (before the review's fixes): 2 never rendered (the
  installed client streams some files and the renderer waits for ever for
  one it can't read locally, "unavailable locally (online downloads
  disabled)"; the script now gives each render 30 seconds and counts those
  as rejects), and by eye 11 of the other 28 were bad. About 43% unusable.
- **Second pass** (the current locations.json): all 30 rendered. The image
  test flagged 1 (a lava cave in the Searing Gorge). By eye **9 of 30 are
  bad (30%)**: a tree's trunk filling the frame (3, the M2 doodads, which
  neither the picker nor wow-data knows), bare ground or a slope close up
  (4), stairs in the face (1), and the one the test caught. About 21 read as
  a place (Stranglethorn's ruins and road, Thunder Bluff, Winterspring, the
  Badlands' orc camp, Duskwood's graveyard). The test catches 1 of the 9:
  textured walls (bark, rock, sand) pass it.
- The sky is orange in the raw render itself in some zones (the Swamp of
  Sorrows, the Burning Steppes): gray world turns it into a green-orange
  band there. The fix belongs in the renderer's light colours.

What would lift it before the batch (step 4): the doodads' placements
(MDDF in the `_obj0` ADTs, read already by wow-data's terrain build) as a
table and a clearance check in `aim`, and a detail test (edge energy) for
the bare-ground shots.
