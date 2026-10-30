# geoguessr (working title)

A WoW Classic geoguessr: a web game that shows a picture of a spot in
Azeroth, the player clicks the continent map, a score falls with the
distance. The pictures are **rendered from the game files** (not captured
in game). Plan and evidence: `~/code/wow-addons/ideas/geoguessr.md`. A
one-repository project (bun, no addon, no kit sync, no TOC), under the
WoW addons folder but not an addon.

## Commands

- `bun run check`: the check (tsc, bun test). Run it through q: `bun harness/q.ts check -- bun run check`.
- `bun scripts/pick.ts`: `locations.json` from wow-data's classic.db and classic-terrain.db
  (`bun wow-data/bin/terrain.ts classic` first; `docs/picker.md`).
- `bun scripts/render.ts --renderer <binary> --workdir <dir> --casc <dir>`: a sample rendered,
  checked and laid on contact sheets in `.cache/renders/` (`--all`: every one).
- `bun harness/board.ts list`, `bun harness/hooks.ts status`.

## Docs

- `docs/render-spike.md`: the render proof (offlineRenderer on macOS, the
  patches, timings, what is open).
- `docs/picker.md`: the location picker (what it reads, how a camera is
  chosen, locations.json, the reject rates).

## Hard rules

- **Render and look before shipping**: every picture and every page is
  opened and looked at before it counts as done.
- **Ship only rendered pictures, never Blizzard's files**: no M2, WMO, BLP,
  ADT, CASC data or listfile in this repository, committed or not. The
  renderer and its build live in a scratch folder outside it.
- **No deploy, no GitHub repository, no domain, no push** without the user's
  go, asked in the session that wants it.
- Local git only for now. The client for renders is
  `/Applications/World of Warcraft` (read-only).
- Plain ASCII in the code, no semicolons in prose players read.

<!-- harness:start -->
## Harness

This project runs under a small harness (`harness.toml`, tools in `harness/`).
The rules below are checked by git hooks or by tools, so they are not advice.

- **One task, one session, one card.** A session's first write is its card:
  `bun harness/board.ts add <repo> "<title>" --repos <repo> --try "…" --committed "(none yet)" --left "…"`.
  It holds the repositories it names, and a commit by a Claude session is
  refused unless its running card names the repository (`board.ts held`
  says who got there first). Move the card at each stop (`board.ts set <id>
  --status waiting-test|waiting-review|ready-to-push|done`).
- **Checks go through q**: `bun harness/q.ts check -- <the check>`. One verdict
  line, the log in `.cache/logs/`, the tree stamped. A push is refused for a
  tree with no passing check.
- **Review before the commit**: `bun harness/packet.ts <repo>` on the uncommitted
  files, the `reviewer` helper reads the packet, fix what it finds, then
  `bun harness/review.ts <repo> "<verdict>"`, then one commit. A push is refused for a
  change no review stands behind (docs are waived).
- **Commits**: Conventional Commits, lowercase subjects, no AI co-author or
  "generated with" line (the commit-msg hook refuses them).
- Ask before any push, release or deploy.
- Rules this project keeps beyond these: `CLAUDE.md`.
<!-- harness:end -->
