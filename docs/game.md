# The game page (step 5, 30 October 2026)

`bun run dev` (the family's `geoguessr-game` launch entry, port 4195):
`scripts/site.ts` writes the data into `web/public/`, then Vite serves the
app on this computer. Local only: no deploy, no domain. The data is never
committed: the pictures are the renders', the maps the game's own art, both
rebuilt from here.

## The app (`web/`, 30 October 2026)

Vite 8, React 19, TypeScript, Tailwind 4, the fonts self-hosted through
fontsource (Cinzel, Inter: hearthtale.app's), lucide's icons, at
hearthtale's versions. ESLint (typescript-eslint, React's hooks and compiler
rules) and Prettier (with Tailwind's class order) on `web/`, the shared
`src/atlas.ts` and the configs. The scripts keep their own style.
`bun run check` runs both tsc projects (`tsconfig.json` for the scripts and
tests, `web/tsconfig.json` for the app), ESLint without a warning, Prettier's
check and the tests. `bun run build` writes `dist/` (gitignored).

- `web/src/App.tsx`: the phases (intro, play, summary), the keys (Enter or
  Space guesses, then moves on, F shows the picture whole, Esc closes it,
  nothing else while it is open). The map is remounted each round, so a
  round opens fitted whatever the last reveal showed.
- `web/src/game.ts`: a game's state as a reducer (the rounds, the one at
  hand, the map on show, the guess, the results). The rules stay in
  `src/atlas.ts` (judge, revealMap, rank), tested there.
- `web/src/hooks/usePanZoom.ts`: a picture in a box, fitted when its map
  changes, scaled with the box when it resizes (the dock growing keeps the
  zoom), zoomed about a point, panned, never pulled off the box.
- `web/src/components/`: the header (the title, a pip a round, filled by its
  score, the score counting up), the picture (the whole scene behind the map
  on a wide screen, framed above it on a narrow one, whole on F), the map
  (tabs, the zone bar, the game's tooltip naming the zone or area under the
  pointer, the pins, the line), the result (the place, the distance, a bar
  and a chip for each part of the points), the intro and the summary on
  parchment over a blurred render (the summary's title by the share of the
  points: Loremaster, Seasoned Explorer, Wayfarer, Greenhorn, Lost in the
  Barrens).

The look is Classic's own interface drawn in CSS (`web/src/styles.css`):
dark leather, gold trim with a gem at each corner, the red panel button, the
tooltip's ink, parchment. No interface texture of the game's: only its maps.

The picture is shown whole (never cut to fill) and never past its own
1280x720: a render scaled up is a blur. A blurred, darkened copy of it fills
the page behind. On a wide screen the map has its own column on the right
(420 pixels, 520 from 1536 wide), growing over the picture on a hover (760)
and for the reveal (1000), each kept inside the window's height. On a narrow
one (a phone) the picture sits above the map, the reveal's card above its
button. The header shows only during a game: the intro and the summary have
their own titles. The intro and the summary scroll when the window is too
short for them (the summary fits a 1430x660 window whole).

The first layout (30 October 2026) cut the picture to fill the page and
scaled the 1024-wide renders up to 2000 pixels: the user's window showed a
blurred slice of each. Its play screen also kept the summary from scrolling.
Looked at only at 1440x900 then, never at the user's window: the sizes are
now checked by a headless Chrome game (a scratch script, not in the
repository) at 1430x660 (the user's), 1440x900, 1920x1080 and a phone
(390x844), five rounds and the summary each, no console error.

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
each picture, its place, the distance, the points, out of 30,000, and a
title.

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

They are Blizzard's art: only in `web/public/maps/`, `dist/` and `--marks`' `.cache/site/` (all gitignored), never committed.
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

Each camera's render at its full 1280x720, quality 88, in
`web/public/pictures/<id>.webp`, from its original PNG in `.cache/`: the one
that, scaled to 1024, matches the WebP the user passed by eye (`--pictures`,
default `.cache/review3/webp`, 1024 wide, quality 80; an RMSE under 0.03, as
the light changed between batches). All 341 found their original.
`.cache/site/pictures.json` stamps which passed picture each was written
from (its path, size, time): a run writes only what changed (about a minute
for all 341, nothing when none did). The larger view (F) is capped at the
same 1280x720. A camera
with no picture refuses the build. Rendered pictures only, nothing of the
client's. Sharper still would take re-rendering at 1920x1080 (the renderer
is a scratch build, gone since: `docs/render-spike.md` rebuilds it).

## Five rounds on the game's maps (30 October 2026)

Windshear Crag (258 yards, both bonuses, 5737), Misty Reed Post (guessed in
Dustwallow, the other continent, 0), the Dawning Isles (276 yards, guessed
on Alterac's map, 5214), Tyr's Hand (1769 yards, right zone, 3324), the
Dagger Hills (15 yards, 6000): 20,275 of 30,000. The phone layout (375
wide) stacks the picture over a 3:2 map box, no sideways scroll.

The first five, on the maps drawn from the terrain: Hammerfall, Shadowprey
Village, Talrendis Point, Warsong Lumber Camp, Freewind Post, 14,399.

## Five rounds in the React app (30 October 2026)

Mannoroc Coven (148 yards, both bonuses, 5875), Agamand Mills (599 yards,
right zone, 4805), the Dawning Isles (guessed in Ashenvale, the other
continent, 0), the Swamp of Sorrows (9 yards, 6000), Camp Taurajo (1136
yards, the pin on Mulgore's side of the hills, 3626): 20,306, Wayfarer.
Each truth on its own label of the zone's map. The phone (375 wide): the
picture over the map, the header on one line, no sideways scroll.
