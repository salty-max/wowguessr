# wowguessr (working name)

A geography game for World of Warcraft Classic. You see a place pictured
from the ground, open the zone you think it is on the game's world map,
click where it was, and score by how close you got. Five rounds a game.

The pictures are rendered from the game's own files (a camera placed on
each of 341 landmarks), not captured in the game. Status: playable on this
computer, not hosted anywhere yet.

## What this repository holds, and what it doesn't

- **Here:** the landmark picker (`scripts/pick.ts`: a camera on each
  landmark, from the game data in the family's `wow-data`), the render
  driver (`scripts/render.ts`), the page (`web/`: Vite, React, TypeScript,
  Tailwind) and the game's rules (`src/atlas.ts`: the maps' frames, the
  score), with their tests.
- **Not here, on purpose:** no file of the game's. The renders are made
  locally from an installed client with a renderer kept outside the
  repository, and the world maps are composed locally from the game's
  textures. Both are built into gitignored folders (`web/public/`,
  `.cache/`) and never committed.

## Running it

It lives in a folder beside its siblings (`wow-data` for the game data,
`addon-kit` for the shared tools) and needs the renders already made:

```bash
bun install
bun run dev        # the data into web/public/, then the page at http://127.0.0.1:4195
bun run check      # tsc, ESLint, Prettier, the tests
```

## How it works

- `docs/render-spike.md`: rendering the game's files on macOS.
- `docs/picker.md`: what a landmark is and how its camera is chosen.
- `docs/game.md`: the page, the score, the maps and their frames.

## Not affiliated

A fan project. World of Warcraft and its art are Blizzard Entertainment's.
This project is not made or endorsed by Blizzard.
