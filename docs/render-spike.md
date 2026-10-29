# The render spike (29 October 2026)

Step 1 of `~/code/wow-addons/ideas/geoguessr.md`: build Deamon87's
`offlineRenderer` (WebWowViewerCpp at `1a8cccb`, 14 Sep 2026) on this Mac,
render three known spots from the installed Classic Era client, look, time.
Everything was built in a scratch folder outside this repository; nothing
from the game or from the renderer is committed here.

## Verdict: it works

| Risk (from the spike) | Answer |
|---|---|
| 1. Builds and runs on macOS, opens Classic 1.15.9 | **Yes**, with 10 small patches (below). MoltenVK 1.4 via Homebrew's Vulkan loader, Apple M2. CASC opens 1.15.9.70576 in milliseconds. |
| 2. How a Classic render looks | **Recognisable at a glance**: Goldshire, the Crossroads and the Stormwind gate are each obvious, terrain, WMOs, doodads, sky, lamps all there. One flaw: daylight is tinted orange and oversaturated at every hour (night looks right). A gray-world auto-level on the PNG brings it most of the way back; the real fix is in the renderer's light colours. No creatures or players are drawn (fine for the game). |
| 3. Cost per render | **About 1 to 2 s per 1280x720 image**, process start included, cold or warm (one process per image, no batch mode needed). Output is deterministic (same camera, same bytes). 10,000 images is roughly 3 to 5 hours on this machine. |

Coordinates: the renderer takes the game's world coordinates (x, y, z in
yards, the same as wow-data's `spawn.x/y/z`) for the camera and the look-at
point, so spike step 2 (prove the coordinates) is answered too: each spot was
placed from a spawn in wow-data and shows what the card says is there.

| Spot | Map, WDT | Camera | Look-at | Time |
|---|---|---|---|---|
| Goldshire (Innkeeper Farley, npc 295) | 0, 775971 | -9470 75 59.5 | -9460 25 61 | 1.8 s |
| The Crossroads (Innkeeper Boorand, npc 3934) | 1, 782779 | -451 -2684 98.3 | -410 -2620 98.5 | 1.3 s |
| Stormwind gate (city guards, npc 68) | 0, 775971 | -9090 405 95 | -8950 520 100 | 0.8 s |

`-time` is the time of day in half-minutes (0 to 2880, noon 1440).

## What it took (the scratch build)

Homebrew: `molten-vk vulkan-loader vulkan-headers vulkan-tools glslang
spirv-tools`; Slang's prebuilt `slangc` 2026.20 (not in Homebrew, from
shader-slang/slang's releases). Upstream builds neither macOS nor this target
in CI, so it needed:

1. `[mutating]` on three free functions in `crndSeed.slang` (refused by slang 2026, a no-op)
2. `-msse3 -mavx2` dropped on arm64 (`wowViewerLib/CMakeLists.txt`)
3. the SSE alpha-texture loaders in `adtObject.cpp` guarded (the scalar path exists)
4. `_putenv` and `__debugbreak` guarded to Windows (`GDeviceVulkan.cpp`)
5. MoltenVK's portability extensions on the instance and the device
6. a no-op macOS clipboard for the GUI library it links (`clipboardxx.hpp`)
7. a stale include path in `MapSelectDialog.h`
8. a stale `SceneWindow` constructor call and an output path clashing with a folder (offlineRenderer)
9. an empty `file(GLOB)` in the Darwin install branch
10. in `offlineRenderer/main.cpp`: the CASC product from `WOW_PRODUCT`
    (`wow_classic_era`; it defaults to retail), and `-exportdb <dbd dir>`,
    the GUI's database workflow headless: it writes `export.db3` (Light,
    LightParams, AreaTable, Map, ...) from the client's own DB2s, with
    current WoWDBDefs definitions (the submodule's are too old for 1.15.9)

Run with `DYLD_LIBRARY_PATH=/opt/homebrew/lib` (volk's dlopen), and a CASC
root mirroring the client's `Data/` with a `.build.info` naming a CDN config
that is on disk (the launcher's 29 Oct update pointed at one that is not).

The patch and the pictures: the shared notes folder of the session that
started this one (`geoguessr-offlineRenderer-macos.patch`,
`geoguessr-render-spike-sheet.png`). The scratch build itself lives in a
temporary folder and will not survive a reboot: rebuild from the patch.

## Open

- WebWowViewerCpp has **no licence file** (default copyright). Running it
  locally to make pictures is one thing; shipping it or a fork is not ours to
  do. Ask Deamon87, or keep it a local tool.
- The orange daylight: fix in the renderer (the day light colours) or
  colour-correct the PNGs.
- Cameras need rejection: the Crossroads shot has a post filling a fifth of
  the frame (the picker's job, spike step 3).
