# The location picker (landmark-first, 30 October 2026)

`bun scripts/pick.ts [--count 300] [--leaf 0.6] [--out locations.json]`
picks cameras on Eastern Kingdoms (map 0) and Kalimdor (map 1), each looking
at a landmark, from wow-data's `classic.db` and `classic-terrain.db` only
(reached through the family folder, `src/family.ts`), and writes
`locations.json`. The same databases give the same file. A terrain database
read at another pin or by another parser is refused. It runs in about 9
seconds.

Why landmark-first: the first picker (below, "Before landmarks") chose where
a camera could stand and pointed it at the most open view. Its pictures were
mostly snow fields, bare hills and grass: nothing to guess from. A player
guesses from a place they know, so every picture is now of something the
data names (the user's call, 30 October 2026, after comparing with
where-in-wow's hand-picked landmarks, a design reference only: no list or
code taken from it).

## What it reads

- `terrain_chunk`, `wmo_placement`, `doodad_placement` and `doodad_model`
  from wow-data's own terrain database (`bun wow-data/bin/terrain.ts
  classic`, never released: `wow-data/src/terrain.ts`): the ground's height,
  holes, water and the area the client names on each 4-yard cell, each WMO's
  bounding box, each doodad (an M2: a tree, a rock, a banner) with its
  model's collision box and whole box.
- `client_AreaTable` (names, parents), `client_UiMap` and
  `client_UiMapAssignment` (the 46 zones with a zone map) from `classic.db`.

## The landmarks (`src/landmarks.ts`, `landmarks`)

A landmark is a WMO standing on the ground in a named place: its box rising 6
yards over the ground at its middle (a cave's box barely clears the hill it
is dug into), its foot no more than 6 over it (nothing in the sky; a crypt
under a church goes deep and is fine: the Sepulcher, Agamand Mills), not in water (a wreck, a dock), 8 to 160 yards
across, in a subzone that is a place: the zone alone names none, nor does a
subzone 60% or more under water that neither paints itself on the world map
(`WorldMapOverlay`) nor gives experience for finding it (`ExplorationLevel`):
a sea, a coast, a strand (Longshore, the Veiled Sea, Fray Island, the North
Coast; Yojamba Isle, 73% water, goes with them). Neither signal alone would
do: starting areas and many towns give no experience (Deathknell, Thorium
Point), and the overlays miss some (Feathermoon Stronghold, 37% water, stays
by its dry ground). Lakes on the map stay (Lake Everstill names
Lakeshire's view across it: a name a player may not tie to the town). A
subzone keeps its
biggest and a second 80 yards away. Its name is the subzone's (the inn of
Goldshire is "Goldshire"). A camera looks at its lower middle (a tall
tower's top is sky, its door is the place).

Not landmarks: a WMO 160 yards or more across (a city, a fortress,
Gadgetzan's walls). Its box is mostly air, so what a camera sees of it can't
be told from the box (a first try showed "Tanaris" as empty sand). The
cities (Stormwind, Orgrimmar, Thunder Bluff, Darnassus) have no landmark yet.

## The viewpoint (`viewpoint`)

16 bearings, 4 distances (12, 30, 55 and 80 yards beyond the box's corners,
at least 25 from its middle), eyes 3, 6 and 10 yards over the ground (a hill
or a bridge beats eye level), looking down 12 degrees at most (the lens is 27
degrees each way: the horizon stays in the picture, a place, not a map):

1. **It can stand there** (`stand`, `src/pick.ts`): off the map, a hole,
   inside a building's box, within a yard of a solid doodad, water over the
   ankles, a cliff: refused.
2. **The heading to the landmark is clear** (`clear`): no ground at the eye
   within 5 yards, no other building's box within 12, no solid doodad near
   the middle of the frame (any part within 30 degrees, looking wider than
   20 degrees or within 3 yards).
3. **It frames the landmark** (`boxShare`, `src/frame.ts`): its box (above
   the ground) projected through the renderer's lens (53.97 degrees high,
   16:9) covers 12 to 75% of the picture, whole.
4. **It sees it** (`shoot`): the 12 framed nearest a third of the picture are
   cast through on a 16x9 grid of rays against the ground, the other WMOs'
   boxes and the doodads' whole boxes (leaves too, 0.6 of their width:
   `--leaf`). Kept when at most a third of the landmark's box is hidden, the
   middle of the picture isn't a wall within 8 yards, and the landmark fills
   8% of it. Scored by fill (best near a third), sky (best 10 to 35%), less
   for what is hidden. The best is the landmark's camera.

## The spread (`choose`)

Each zone's share of `--count` by the square root of its size in map chunks,
at least 3 (as many as it has) and at most 12, its landmarks best first, 2 a
subzone, none within 80 yards of another.

## locations.json

`{ about, wowData, terrainBuild, terrainParser, landmarks, unseen, perZone,
locations: [...] }`, each location `{ id, map, x, y, z, yaw, pitch, lookAt:
[x, y, z], ground, zone, subzone, name, kind, wmo, fill, sky, score }`.
World yards (the renderer's `-camera` and `-lookat` take them as they are),
the eye at x, y, z, the landmark's lower middle at lookAt, yaw the game's
facing in radians (0 north, +x, a quarter turn west, +y) and pitch radians
up toward it, zone and subzone AreaTable ids, name the subzone's (the game
can show it after the guess), kind `building`, wmo the landmark's placement
id, fill and sky the cast's shares, score the viewpoint's (fit + sky -
hidden).

## The run (30 October 2026)

552 landmarks tried, 252 with no good viewpoint (hidden by trees or
hills, no clear ground to stand on, or seen only from above), 227 cameras
chosen in 39 zones. Under 3: Deadwind Pass (1), Searing Gorge (1), Felwood (1), Badlands (2), Dustwallow Marsh (2), Darkshore (2), Un'Goro Crater (2). None in the
4 cities, Ironforge and Undercity (interiors), Teldrassil and Hyjal. (Before
the water rule and the look-down cap: 571 tried, 239 chosen in 39 zones.)

## The first sample (30 of the 239, before the discovery rule, by eye)

**27 of 30 recognisable as the place named** (the target was 24): the
Crossroads, Camp Taurajo, Sentinel Hill, Light's Hope Chapel, Strahnbrad,
Northdale, Thorium Point, Kolkar Village, the Ivar Patch, Grol'dom Farm and
so on, each a building or a camp in its place. The 3 others: 1 never
rendered (a file the installed client hasn't downloaded: the render times
out), a wreck on the Longshore beach (on sand, not in water, so kept), and
Northpass Tower small in the Plaguelands' brown haze (the image test flagged
it). Two passes before this one, on the way: 22 of 30 (trees hiding the
landmark, a big WMO's empty box, a dock), then 24 of 30 (wrecks and docks in
the sea).

## Rendering

`bun scripts/render.ts --renderer <binary> --workdir <dir> --casc <dir>
[--sample 30 | --all | --ids 3,17]` renders with the scratch offlineRenderer
(`docs/render-spike.md`; run from its build folder, where its `spirv/`
shaders and `export.db3` are; its light is fixed at the source, no colour
balance after), runs the image check (`src/imagecheck.ts`: a frame or its
middle third of one colour, or too dark) and writes `.cache/renders/` (or
`--out`: the pictures, a 1024-wide WebP of each in `webp/`, `report.json`,
contact sheets of 30 `sheet-NN.jpg` labelled with the landmark's name).
Never committed.

## Before landmarks (the first picker, 30 October 2026)

Candidates were spawns, patrol paths, flight masters and subzone middles,
each camera at eye height turned to its most open heading, then rules
added one by one against what the contact sheets showed: doodads in the
lens (as turned rectangles from their collision boxes), close slopes, a
stand window. Its samples:

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
  Sorrows, the Burning Steppes): gray world turned it into a green-orange
  band there. (Gray world is gone since, the light fixed in the renderer:
  `docs/render-spike.md`, "The light".)

- **Third pass** (the doodads' clearance): no
  trunk or doodad fills a frame any more (4 did in the second). 2 never
  rendered (files the client hasn't downloaded), and by eye 10 more are
  ground, a hill or a cliff close up (rising 10 to 20 yards ahead, under
  the 30 degree limit), one of them a dark rock the image test passed.
  About 18 of 30 read as a place: **about 40% unusable**, all of it close
  terrain and timeouts. (A first try with each doodad as a circle around
  its foot read 30%, but those circles made walls and cliff pieces discs
  hundreds of yards wide: 30 pictures swing by a few either way.)

- **Fourth pass** (the close-slope rule): the
  close slopes are gone (the Searing Gorge shots are canyon views now, not
  cliff faces). 1 never rendered, and by eye 7 more are poor: a big doodad
  or WMO piece in the face that no box catches (Silithus' bones, a banner
  pole, a Darnassus structure), a rock wall, a dull ravine, a dark slope.
  About 22 of 30 read as a place: **8 of 30 unusable (27%)**. Starting the
  far slope check at 15 yards rather than 20 changed none of the 500.

What would lift it next: the timeouts are the client's (files it hasn't
downloaded: a launcher repair or a full install would end them, or the
renderer could skip a file it can't read), a detail test (edge energy) for
the dull and dark shots the image check passes, and a last eye pass on the
batch's contact sheets for the rest.

## The batch (30 October 2026, the 227 with the second light pass)

227 rendered in about 8 minutes: 217 pictures, 10 timeouts (files the
installed client hasn't downloaded, all in Hillsbrad, the Hinterlands and
Ashenvale's north), 1 flagged by the image test (Northpass Tower). Looked at
whole, 8 contact sheets: the draft drop list is 17 more, frames with no
landmark worth guessing from (a snow mound, a bare hill, rocks, a shell on
Misty Reed Strand, a branch in the face at Crown Guard Tower, Fire Plume
Ridge's dark rocks), and 58 near-duplicates: in a zone, the same WMO model
pictured twice (Duskwood's farmsteads, Stranglethorn's troll ruins, the
Witherbark yurts), then the same place twice (Moonbrook, Stonewatch Tower,
Garren's Haunt), the best-scored one kept each time (the model first, so a
place whose only other picture is a unique building keeps it). That leaves
142 for the user's eye pass (`.cache/batch3/review.html`, served by the
`geoguessr-review` launch entry: red is nothing to guess from, orange a
near-duplicate, a click drops or keeps, the list to copy at the top). The
model rule takes some distinct places that only share a building, a choice
for the user's pass.

Colour, by eye: the snow, Elwynn, Westfall, Stranglethorn, Ashenvale,
Mulgore and Desolace read right. Still strong: Durotar's orange sky and
ground, the Badlands' and the Searing Gorge's red rock, the Eastern
Plaguelands' rust, Silithus' orange sky, Winterspring's violet. These are
the zones' own lights and textures, probably the game's look, not verified
against it.
