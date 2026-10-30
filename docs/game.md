# The game page (step 5, 30 October 2026)

`bun run dev` (the family's `geoguessr-game` launch entry, port 4195):
`scripts/site.ts` builds `site/`, `scripts/serve.ts` serves it on this
computer. Local only: no deploy, no domain. `site/` is never committed: the
pictures are the renders', the maps drawn from wow-data, both rebuilt from
here.

## A game

Five rounds, each a picture from another zone (`pickRounds`). The player
picks Eastern Kingdoms or Kalimdor, zooms (wheel, pinch, the buttons) and
pans (drag), clicks the map (a press that hardly moved) and guesses. The
page then shows where the picture was, a line from the guess, the distance
in yards, the points and the place's name (the subzone's, then the zone's),
and frames both. A summary after the fifth: each picture, its place, the
distance, the points, out of 30,000. Hovering the map names the area under
the pointer, as the game's own map does.

## The score (`src/atlas.ts`, `judge`)

The plan's design (`ideas/geoguessr.md`, "How a guess is scored"): 5000
under 50 yards, falling straight to 0 at 4000 (about a fifth of a
continent), plus 500 for the right zone and 500 for the right subzone,
exact from the areas under the guess (6000 a round). The right subzone is
inside the round's, or the very area the map shows under the camera: 46
landmarks stand on a zone's own unnamed ground (their subzone is the zone)
and a city's districts stand over another zone's chunks, so without it about
58 rounds could never reach 6000 (the reviewer's catch). Every round scores
6000 guessed on the spot (checked over all 341). A guess on the other
continent scores nothing. The right zone is the round's, or the one the map
shows under the camera: a city built inside a WMO has no ground of its own
(Ironforge's chunks are Dun Morogh's, Undercity's Tirisfal's, the Valley of
Spirits Durotar's), and Thalanaar stands on Thousand Needles' side of the
Feralas border. Across a whole zone (Ashenvale, 3500 yards) the distance
gives about 600: a tuning point for the user's play.

## The maps (`src/mapdraw.ts`)

Not the game's world map art (a Blizzard file): our own picture of
wow-data's `terrain_chunk` (`classic-terrain.db`), 8 yards a pixel (Eastern
Kingdoms 1500x2900, Kalimdor 2034x3234, about 3 seconds each). Each zone in
one colour as a player knows it (snow, forest, desert, swamp: hand-picked in
`BIOME`, the terrain has no textures), shaded by its slope (light from the
north west), lighter over the land around it and darker under it, water by
its depth, lava (MH2O's liquid type 7, checked by eye: Blackrock Mountain),
each zone's border, and land no played zone claims (area 0, Hyjal,
Gillijim's Isle) grey. The frame is the played zones' chunks with 400 yards
around, so it is ours, not borrowed: a world point (x north, y west) is at
`px = (left - y) / 8`, `py = (top - x) / 8` (`toPixel`).

Each map's JSON carries its frame, the area of every chunk (rows of runs),
the areas' names, zones and parents, and each zone's label (its ground's
middle, or its pixel nearest it; a city in a WMO, Ironforge and Undercity,
at the middle of its cameras).

Left as they are: a few thin lines and blocks in the sea, chunks of
unfinished ground at an ADT's edge (east of Kalimdor, west of the Wetlands).

## The conversion, checked

- Every camera falls on its map, and the build counts those whose chunk's
  zone isn't theirs: 14 of 341, all explained above (12 city districts,
  Thunder Bluff on Mulgore's ground, Thalanaar). `bun scripts/site.ts
  --marks` draws every camera on its map (`.cache/site/marks-<map>.png`,
  yellow in its zone, red not): looked at, each on its place (Stormwind's,
  Orgrimmar's, Hammerfall in Arathi's north east, Shadowprey Village on
  Desolace's coast).
- Played in the browser pane: a guess placed 20 and 15 yards off Talrendis
  Point read 25 yards (the round trip exact), 6000 points with both bonuses.

## The pictures

`--pictures` (default `.cache/review3/webp`, the 1024x576 WebPs the user
passed by eye on 30 October 2026) copied to `site/pictures/<id>.webp`. A
camera with no picture refuses the build. Rendered pictures only, nothing of
the client's.

## The first five rounds (30 October 2026)

Hammerfall (978 yards, 3826), Shadowprey Village (guessed on the other
continent, 0), Talrendis Point (25 yards, 6000), Warsong Lumber Camp (3554
yards in the right zone, 1064), Freewind Post (1623 yards, right zone,
3509): 14,399 of 30,000. The phone layout (375 wide) stacks the picture over
the map, no sideways scroll, the zones' names crowded until zoomed.
