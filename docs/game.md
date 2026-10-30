# The game page (step 5, 30 October 2026)

`bun run dev` (the family's `geoguessr-game` launch entry, port 4195):
`scripts/site.ts` builds `site/`, `scripts/serve.ts` serves it on this
computer. Local only: no deploy, no domain. `site/` is never committed: the
pictures are the renders', the maps the game's own art, both rebuilt from
here.

## A game

Five rounds, each a picture from another zone (`pickRounds`). The player
picks Eastern Kingdoms or Kalimdor, then a zone on the continent's map (a
click opens the zone's map, as the game's world map does: hovering names
the zone), and on the zone's map clicks where the picture was (a press that
hardly moved; a drag pans, the wheel, a pinch or the buttons zoom, up to 4
times). A city's map opens from its zone's (Ironforge from Dun Morogh), the
way back is the line over the map. Then Guess: the page shows where the
picture was, a line from the guess, the distance in yards, the points and
the place's name (the subzone's, then the zone's), on the round's zone map
or another map holding both (a city's zone, the map the guess was placed
on), else on the continent. A summary after the fifth:
each picture, its place, the distance, the points, out of 30,000.

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

## The maps (`src/mapart.ts`)

The game's own world maps (the user's call, 30 October 2026: they replace
the maps first drawn from the terrain). Each is a UiMapArt: 12 tiles of 256 pixels (client_UiMapArtTile)
and over them every overlay (client_WorldMapOverlay, the parts a player
explores), cut to 1002x668, as a zone looks once all of it is explored. The
tiles are the game's textures as PNGs from wow-data's mirror (`ui.ts`'
`picture`: Gethe's wow-ui-textures, classic branch, the art of 1.13.5, the
original parchment maps), found by file id through the client's interface
manifest at the pin (ManifestInterfaceData). Both continents and the 46
zones and cities with a map, every tile and overlay found (none missing),
each overlay tile cut to the overlay's TextureWidth and Height as the client
cuts it (MapExplorationDataProvider's SetTexCoord: most overlays aren't
whole tiles, and the tiles' padding holds faint smudges), about 4 seconds a
continent.

They are Blizzard's art: only in `site/` and `--marks`' `.cache/site/` (both gitignored), never committed.
Shipping them on a public page is a separate question for the user (the
hard rule in CLAUDE.md says so).

The frame comes from the game too: each map's client_UiMapAssignment
Region is the world rectangle its whole picture covers (UI rectangle 0 to
1, square pixels: checked for every one, a map that isn't refuses the
build), so a world point (x north, y west) is at `px = (left - y) / yards`,
`py = (top - x) / yards` (`toPixel`), left the Region's largest y, top its
largest x. Eastern Kingdoms is 35 yards a pixel, Kalimdor 37, a zone 2 to 10 (the Barrens),
a city about 1: a guess is placed on a zone's map, never the continent's.

Each continent's JSON carries its frame, its zones' maps (UiMap id, zone,
name, frame, the cities inside), the area of every chunk under it (rows of
runs, `src/areas.ts`, from wow-data's `classic-terrain.db`: the zone a
click on the continent opens, the zone and subzone of a guess) and the
areas' names, zones and parents. A city opens from the zone the ground names
most along its map's edge (Undercity from Tirisfal, Ironforge from Dun
Morogh, Thunder Bluff from Mulgore: the frame alone put them under
Silverpine, the Wetlands and Desolace).

## The conversion, checked

- Every camera falls on its continent's map and its zone's, and the build
  counts those whose chunk's zone isn't theirs: 14 of 341, all explained
  above (12 city districts, Thunder Bluff on Mulgore's ground, Thalanaar).
- `bun scripts/site.ts --marks` draws every camera on its zone's map
  (`.cache/site/marks/<ui>.png`, one sheet `.cache/site/marks.jpg`): looked
  at, every dot on land, and in Arathi each on its drawing (Hammerfall,
  Refuge Pointe, Stromgarde Keep, Witherbark Village, Northfold Manor,
  Thoradin's Wall), in Elwynn Eastvale Logging Camp and Crystal Lake.
- Played in the browser pane: a click on Un'Goro's crater on Kalimdor's art
  opened Un'Goro (the continent's frame agrees with its picture), a guess
  placed 12 and 9 yards off the Dagger Hills read 15 yards (6000 points), a
  guess placed on Alterac's map among Lordamere Lake's isles showed on
  Silverpine's map at the same isles (two frames agree).

## The pictures

`--pictures` (default `.cache/review3/webp`, the 1024x576 WebPs the user
passed by eye on 30 October 2026) copied to `site/pictures/<id>.webp`. A
camera with no picture refuses the build. Rendered pictures only, nothing of
the client's.

## Five rounds on the game's maps (30 October 2026)

Windshear Crag (258 yards, both bonuses, 5737), Misty Reed Post (guessed in
Dustwallow, the other continent, 0), the Dawning Isles (276 yards, guessed
on Alterac's map, 5214), Tyr's Hand (1769 yards, right zone, 3324), the
Dagger Hills (15 yards, 6000): 20,275 of 30,000. The phone layout (375
wide) stacks the picture over a 3:2 map box, no sideways scroll.

The first five, on the maps drawn from the terrain: Hammerfall, Shadowprey
Village, Talrendis Point, Warsong Lumber Camp, Freewind Post, 14,399.
