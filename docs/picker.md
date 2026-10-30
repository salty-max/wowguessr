# The location picker (step 3, 30 October 2026)

`bun scripts/pick.ts [--count 500] [--seed 1] [--out locations.json]` picks
cameras on Eastern Kingdoms (map 0) and Kalimdor (map 1) from wow-data's
`classic.db` and `classic-terrain.db` only (reached through the family
folder, `src/family.ts`), and writes `locations.json`. The same seed and
databases give the same file. A terrain database read at another pin or by
another parser is refused. It runs in about a second.

## What it reads

- `terrain_chunk`, `wmo_placement`, `doodad_placement` and `doodad_model`,
  added to wow-data for this step in
  a database of their own (`bun wow-data/bin/terrain.ts classic`, never
  released: `wow-data/src/terrain.ts`): the ground's height, holes, the liquid over
  each 4-yard cell and the area the client names there, from the map files'
  root ADTs; each WMO's bounding box from the `_obj0` ADTs; each doodad (an
  M2: a tree, a rock, a banner) and its model's collision box. The heights
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
   building's box (smaller than 160 yards), within a yard of a solid
   doodad anywhere from 1.5 to 3.5 yards up (`doodad`), water more than half a yard
   deep at the feet, ground steeper than 1.2 (rise over run).
2. **The eye**: 2 to 3 yards above that ground.
3. **Where it looks** (`aim`): 16 headings, each blocked by ground at eye
   height within 5 yards, ground rising more than 30 degrees within 20, a
   building's box within 12, the map's edge within 20, or a solid doodad
   near the middle of the frame: its collision box turned and scaled on the
   ground (a rectangle, the model's +x along the game's facing yaw + 180,
   checked by a render), any part of it within 30 degrees of the heading,
   looking wider than 20 degrees (from its corners) or within 3 yards.
   Grass and flowers have no collision box and never block. The rest scored by
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

`{ about, seed, wowData, terrainBuild, terrainParser, tried, rejects, perZone,
locations: [...] }`, each
location `{ id, map, x, y, z, yaw, pitch, lookAt: [x, y, z], ground, zone,
subzone, kind, ref }`. World yards (the renderer's `-camera` and `-lookat`
take them as they are), yaw the game's facing in radians (0 north, +x, a
quarter turn west, +y), pitch radians up, zone and subzone AreaTable ids,
ref the candidate it came from.

## The run (seed 1)

500 cameras in 44 zones (Ironforge and Undercity are interiors: none). 1186
candidates tried, 686 refused (57.8%): 205 indoors (a subzone's middle
inside a city's or a cave's box among them), 130 underground, 112 at a
doodad, 112 in water, 88 boxed in (every heading blocked, mostly by trees),
22 steep, 17 over a hole.

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
- **Second pass** (before the doodads): all 30 rendered. The image
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

- **Third pass** (the doodads' clearance, the current locations.json): no
  trunk or doodad fills a frame any more (4 did in the second). 2 never
  rendered (files the client hasn't downloaded), and by eye 10 more are
  ground, a hill or a cliff close up (rising 10 to 20 yards ahead, under
  the 30 degree limit), one of them a dark rock the image test passed.
  About 18 of 30 read as a place: **about 40% unusable**, all of it close
  terrain and timeouts. (A first try with each doodad as a circle around
  its foot read 30%, but those circles made walls and cliff pieces discs
  hundreds of yards wide: 30 pictures swing by a few either way.)

What would lift it next: a stricter ground rule in `aim` (ground above the
eye within 12 yards, or rising more than 12 degrees at 20 to 45 yards, in
the middle of the frame), and a detail test (edge energy) for bare ground.
