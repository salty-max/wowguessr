# The location picker (landmark-first, 30 October 2026)

`bun scripts/pick.ts [--count 300] [--leaf 0.6] [--out locations.json] [--drops drops.json] [--fresh]`
picks cameras on Eastern Kingdoms (map 0) and Kalimdor (map 1), each looking
at a landmark, from wow-data's `classic.db` and `classic-terrain.db` only
(reached through the family folder, `src/family.ts`), and writes
`locations.json`, leaving out the landmarks `drops.json` names (below). The
same databases and drops give the same file, and a landmark kept from the
last run keeps its id (its renders stay its own while its camera doesn't
move). A terrain database
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

## The cities' districts (`src/cities.ts`, 30 October 2026)

A city is one big WMO (Stormwind's box is 1300 yards across, mostly air), so
it has no landmark of its own. The client names its parts: WMO groups, in
wow-data's `wmo_group` (each group's box turned and placed in the world,
`classic-terrain.db`) and `client_WMOAreaTable` (Stormwind's Trade District,
the Canals, Orgrimmar's Valley of Strength, Ironforge's Great Forge,
Undercity's Apothecarium, Darnassus' terraces). A district is a name of one
placement (Darnassus' "Tradesmen's terrace" and "Tradesmen's Terrace" are
one), its landmark its biggest group 15 to 250 yards across. Its floor is the
WMO's, not the terrain under it, and the boxes don't say where it is, so the
camera stands where the game puts a creature (`spawn`, `path`: a guard's
post, a patrol's waypoint, on the floor), 25 to 80 yards from the group's
middle (best near 40), of the same map, not inside any group of the
placement under 30 yards across (a shop, a room, named or not), its eye 2.5
yards up, looking at the group's middle, down 12 degrees
at most. No ray is cast (the groups' boxes overlap and are mostly air): the
render says what it saw. Scored by how many groups carry the name (the
Canals 52, the Trade District 37, the War Room 1): a big district first. A
city gets at least 6 (`CITY`). Named for the city itself ("Stormwind City",
"Orgrimmar") is no district. Its key in `drops.json` and locations.json's
`wmo` is negative: -(placement * 1000 + group index).

First renders (28, then 5, then 4): 21 of the first 28 read as their
district, inside the city on its floor (Stormwind's Canals and Keep, the
Ruins of Lordaeron, the Apothecarium, Darnassus' terraces, Grommash Hold,
the Military Ward). The rest look into a wall a few yards off or are too
dark (Ironforge's Tinker Town and Forlorn Cavern): 13 draft drops over the
three rounds, each refilled by the next district of its city. Undercity is
an interior city and stays so (its districts are its halls, the Ruins of
Lordaeron its one outdoors). Thunder Bluff is terrain with small WMOs
(each rise a WMO of its own, its groups unnamed but the Pools of Vision):
no district.

## Spots: camps, flight masters, graveyards (`src/spots.ts`, 30 October 2026)

A zone still under its share after the buildings (strict, then `WIDE`) gets
spots, landmarks that aren't WMOs: a camp (3 or more creature spawns of the
Classic database within 20 yards of the first, its seed: the densest first,
each spawn in one camp, `spawn`), a flight master (`client_TaxiNodes`), a
graveyard (`graveyard`). The game's creatures and objects aren't in the map
files, so the renderer draws none: a spot's subject is the doodads standing
within 14 yards of it (their middles), 1.5 yards high or more and 10 at most
across (tents, a roost, totems, tombstones, a dig site's carts: not a tree's
crown or a cliff piece that only touches the circle, which would become the
subject and see through itself), their boxes together 6 to 160 yards across
and 3 high. Named by the subzone under it, the buildings' rules otherwise
(not the zone's own ground, a place, not in water, two a subzone 80 yards
apart, the biggest first), the same camera search, its own doodads not in
its way (a tent in the box is the camp, not a wall). Strict first, then
`WIDE`, the buildings' names kept out. Its key (`drops.json`, `wmo`):
-((2 + kind) * 1e9 + its database id: a camp's seed spawn_id, a flight
master's TaxiNodes ID, a graveyard's id), the same while the data is. A
place with two pictures dropped by eye (not timeouts) gets no more spots: the
next ones were the same bare ground, round after round. A zone's own name
counts too, which shuts its unnamed ground to `WIDE`'s spots.

Not built: dungeon entrances (the server's teleport triggers aren't in
wow-data), inns (an NPC's flag inside a building already pictured), named
rocks, islands and waterfalls (nothing names a doodad or a terrain shape:
the user's list, `src/extra-landmarks.json`, is for those).

The rounds (30 October 2026): the target raised to 420 cameras, at least 6 a
zone. A first try took big doodads that only touched a spot's circle into
its box (a tree's crown, a cliff piece) and keyed spots by their rounded
place: its picks were redone from scratch once both were fixed. Then 132 new
cameras rendered and looked at (buildings deeper in each zone's list, camps,
graveyards): about 90 read as a place (Theramore, Brackenwall Village, the
dig sites, the Ashenvale and Darkshore camps, the satyrs' red ruins,
Freewind Post, Coldridge Pass, Thunder Bluff's Spirit Rise), the rest bare
snow, trees, a slope in the face, Winterspring's violet light, or timeouts.
Four rounds of refills after it, each mostly worse (a place's next spot).
**333 cameras in 46 zones**: 217 buildings, 82 camps, 25 districts, 9
graveyards, a flight master (the others stand in towns a building already
names). Short of the 350 to 450 asked, and some zones still thin: Un'Goro 0,
Thunder Bluff 1, Darnassus 2, the Swamp of Sorrows and Deadwind Pass 3.

## The user's own (`src/extra-landmarks.json`, `src/extras.ts`)

A list for the user to fill: `{ name, zone, kind?, hint? }`, the game's
English names. Each is found in wow-data by its card's resolver
(`wow-data/src/card.ts`' `resolve`: an area, a creature or an object by its
exact name, every one of that name tried, the zone telling them apart: 150
area names are used twice; `kind` picks one, else place, then npc, then
object) and placed where the game has it, in the zone named: an area where
its creatures gather most (3 within 20 yards: Marshal's Refuge is its camp),
else its own chunk nearest its middle (a crescent's average lies on someone
else's ground); a `peak` at its area's highest ground (a volcano, a
mountain); a creature or an object at its spawn nearest the middle of the
zone's ones. A landmark whose ground turns out to be another zone's is
refused.
Then a camera on it as on a camp (the doodads around it), or on the ground
itself (30 yards across, 20 high; a peak 80 across, from 40 under its top,
seen whole), strict then `WIDE`'s camera (`widened` when only `WIDE`'s
found one), scored a point over everything
else so its name wins. Its key: -(5e9 + a hash of its zone and name), so
the list can be reordered. locations.json's `extras` says for each entry
whether it was placed, and why not (`no zone named ...`, `no place, creature
or object named ...`, `... is nowhere in ...`, `it stands in ...`, `seen
from nowhere`, `dropped`). A dropped entry still counts its zone (a 0 the
empty-zone test sees). Never copied from
another site's list (where-in-wow is AGPL: a design reference only).

The three tried (30 October 2026): Fire Plume Ridge as a peak (the volcano,
its lava streak, in Un'Goro's white haze), Marshal's Refuge (placed at its
people's camp, but the render shows the rocks of the cave mouth, not the
camp in it), Itharius the green dragon (in his cave: seen from nowhere,
told in `extras`).

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
at least 4 (as many as it has) and at most 12, its landmarks best first, one
a name (a second Moonbrook is the same answer) and one a model (Duskwood's
farmhouses, the Witherbark yurts: the same picture twice), none within 80
yards of another. The best-scored of each kept, as the draft drops had it.

## A zone short of landmarks (`WIDE`)

A zone the strict rules leave under its share, or with no strict landmark at
all (its share then 4), gets a second pass for it alone, one notch looser (`src/landmarks.ts`, `WIDE`), the first pass's
names and models kept out:

- a WMO 5 yards across and 4 tall counts (a hut, a shrine), not 8 and 6;
- a WMO on the zone's own unnamed ground counts, named by the zone ("Searing
  Gorge");
- a camera may stand on the terrain inside a big WMO's box (`stand`'s
  `inBig`). The strict rule refuses it (the floor may be a city's), and so
  every spot around Stonard was refused, inside the Pool of Tears' 540-yard
  box of lake and cliff. The render shows whether it was a floor after all;
- a doodad in the middle of the frame refuses a heading within 20 yards,
  not 60. The Swamp of Sorrows' great trees have collision boxes 30 yards
  across (their roots), and every heading had one. The cast still says what
  they hide.

These locations carry `widened: true`. Not tried: named game objects (Un'Goro's
crystal pylons, camps' tents) and flight masters are server spawns, not in
the map files the renderer draws. Big doodads as landmarks would need the
models' names to tell a crystal or a tent from a tree, and wow-data has none
(the listfile isn't in its databases).

## drops.json

The landmarks whose pictures were looked at and dropped, by placement (`{
map, wmo, name, why, by }`, `by` draft or user), kept out of every later
run, their zone filled from the next best. Near-duplicates are not listed:
`choose` keeps one of each. `empty` names a zone left with no picture on
purpose, with why. `test/locations.test.ts` refuses a `locations.json` that
still holds a dropped landmark (the picker not run after the drop list) or
a zone at 0 that `empty` doesn't name: a drop list can't take a zone off the
map unnoticed.

## locations.json

`{ about, wowData, terrainBuild, terrainParser, landmarks, unseen, dropped,
perZone, share, nextId, locations: [...] }`, each location `{ id, map, x, y, z, yaw, pitch, lookAt:
[x, y, z], ground, zone, subzone, name, kind, wmo, widened?, fill, sky, score }`.
World yards (the renderer's `-camera` and `-lookat` take them as they are),
the eye at x, y, z, the landmark's lower middle at lookAt, yaw the game's
facing in radians (0 north, +x, a quarter turn west, +y) and pitch radians
up toward it, zone and subzone AreaTable ids, name the subzone's (the game
can show it after the guess), kind `building`, wmo the landmark's placement
id, widened (only when true: found by `WIDE`), fill and sky the cast's
shares, score the viewpoint's (fit + sky - hidden). Beside them `share`
(what each zone was due), `dropped` (the entries drops.json lists) and
`nextId` (the id the next new camera takes, after every id the last run and
the drops' notes used). Without the last `locations.json` the picker refuses
to run (the ids would start again and miss the renders), unless `--fresh`.

## The run (30 October 2026, after the refill)

685 landmarks tried (each once, though the looser pass tries again those the
strict one saw from nowhere), 262 with no good viewpoint (hidden by trees or
hills, no clear ground to stand on, or seen only from above), 51 entries in
`drops.json`, **205 cameras in 41 zones**, 35 of them widened (Teldrassil and
Thunder Bluff come in through it, with no strict landmark of their own).
Every zone but Un'Goro Crater keeps a picture (`drops.json` says why it has
none). Still under their share (`share` in locations.json): Swamp of Sorrows
1 of 8, Badlands 1 of 4, Thunder Bluff 1 of 4, Darkshore 2 of 12, Wetlands
3 of 12, Tanaris 6 of 12, Felwood 2 of 5, and others by one to six. These
zones have few WMOs standing in the open, and one picture a name and a model
leaves fewer than their size asks for. None in Stormwind, Orgrimmar,
Darnassus, Ironforge, Undercity or Hyjal. (Before the refill: 552 tried, 227
chosen. Before the water rule and the look-down cap: 571 tried, 239.)

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

## The refill (30 October 2026)

The batch's draft drops (17 empty, 58 near-duplicates, 10 timeouts) left the
Swamp of Sorrows and Un'Goro Crater with no picture and 5 zones with one. The
picker now keeps one picture a name and a model itself (`choose`), leaves
out what `drops.json` names before a subzone's two biggest are taken (so the
next one gets its turn), fills each zone from the next best, then `WIDE` for
the zones still short, or with no strict landmark at all. Each round's new
cameras were rendered and looked at on their contact sheet, the bad ones
added to `drops.json`, and the picker run again:

- **Round 1**: 58 new. 9 draft drops (a snow mound, bare rocks, a cart in
  the grass, Stonard behind its trees, Dreadmaul Rock a black outline, a
  wall in the face at the Caverns of Time), 3 timeouts. The image test
  caught none of the 9: textured frames pass it.
- **Round 2**: 4 new, 3 kept (Pool of Tears' sunken ruins, a Wetlands camp,
  a Loch Modan mine), 1 timeout.
- **Round 3** (after the review: drops left out before the subzone cap, WIDE
  for zones with no strict landmark): 15 new. Teldrassil (Starbreeze
  Village, Shadowglen) and Thunder Bluff (totems on a bluff) appear, and
  the Writhing Haunt, Morgan's Vigil, the Dead Field, Hillsbrad Fields, a
  second Frostmane Hold. 2 draft drops (Stonard again, a Wetlands field), 4
  timeouts.
- **Rounds 4 and 5**: 6, then 4 new, all but one in Hillsbrad and Arathi,
  all timeouts but a Wetlands camp. The installed client lacks those areas'
  files (Southshore, Thoradin's Wall, Northfold Manor, Durnholde Keep), and
  each round there only spends another candidate. So the last 4 (316 to
  319) stay in `locations.json` unrendered and the rounds stop there.

A timeout's entry in `drops.json` says `by: "render"`: it is the client's,
not a judgment of the picture, and goes once a launcher repair or a full
install brings the files. The duplicates rule keeps the best-scored of each,
as the draft did, but 3 came back where the draft's twin was dropped instead
(Zul'Mamwe's other ruin, Render's Valley, Darrowshire).

For the user's pass: `.cache/review2/review.html` (the `geoguessr-refill`
launch entry), only what changed since the first page: the 61 new (4 with
no render), the 11 draft drops in red, the 3 back in blue, the one swapped
out, and each zone's counts (the batch, after the draft, now, its share).
