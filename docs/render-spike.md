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
| 2. How a Classic render looks | **Recognisable at a glance**: Goldshire, the Crossroads and the Stormwind gate are each obvious, terrain, WMOs, doodads, sky, lamps all there. One flaw: daylight was tinted orange where the global default light applies (fixed at the source, 30 Oct: "The light" below). No creatures or players are drawn (fine for the game). |
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
- The orange daylight: fixed at the source ("The light" below).
- Cameras need rejection: the Crossroads shot has a post filling a fifth of
  the frame (the picker's job, spike step 3).

## Rebuilding it (30 October 2026, step 3)

The scratch build was gone a day later and came back from the patch in
about 20 minutes: `git apply --exclude=3rdparty/zlib` on 1a8cccb with its
submodules, slang 2026.20's macOS arm64 release (clear its quarantine
flag), `cmake -G Ninja -DCMAKE_BUILD_TYPE=Release
-DSLANG_COMPILER=<slangc> -DSPIRV_OPT_APP=/opt/homebrew/bin/spirv-opt`,
`LIBRARY_PATH=/opt/homebrew/lib ninja offlineRenderer`. Three traps:

- cmake's AddressSanitizer probe (`ADDRESS_SANITIZER_AVAILABLE`) runs a
  test program that spins for ever on this Mac: kill it, the configure goes
  on with the check failed.
- the link wants libidn2: `LIBRARY_PATH=/opt/homebrew/lib`.
- the binary lands in `build/bin/` but its shaders are `build/spirv/`: run
  it from `build/` (with `export.db3` there), or it fails with "failed to
  open file!".

The client's own `.build.info` now names configs that are on disk, so the
CASC root is a folder with a copy of it and links to the client's
`Data/config`, `data`, `indices` and `ecache`. A camera whose frame needs a
file the installed client hasn't downloaded hangs the renderer for ever
(2 of the first 30): `scripts/render.ts` gives each 30 seconds.

## The light (30 October 2026)

**Why it was orange.** Classic 1.15 has no ZoneLight table (wago.tools: "Table
not found"), so a zone with no point light of its own (Elwynn, Westfall and
others) falls back to the global default light, Light 1, param 12, whose
noon sun is `0xff8800`: (255, 136, 0), a pure orange. The export is right
(its LightData matches wago.tools' at the pin, row for row), and the
renderer reads the colours the right way round (the sky, through the same
code, comes out blue). Its retail-tuned shader simply weights the direct
light heavily, so a saturated sun paints everything it touches. Shown by
renders of Goldshire with each colour set to neutral grey on a scratch copy
of `export.db3`: grey ambient left it orange, a grey sun made it right.

**The fix**, in the renderer, not on the picture: keep 0.35 of the direct
light's saturation, the rest pulled to its luminance (`GEO_DIRECT_SAT`
overrides it, 1 = the data as it is; `GEO_DIRECT_GAIN` scales it). Noon is
fixed by `-time 1440` (render.ts' default). The hunk, on top of the macOS
patch (the whole patch: `geoguessr-offlineRenderer-macos-light.patch` in the
group's shared notes folder):

```diff
diff --git a/wowViewerLib/src/engine/objects/scenes/dayNightDataHolder/DayNightLightHolder.cpp b/wowViewerLib/src/engine/objects/scenes/dayNightDataHolder/DayNightLightHolder.cpp
index c15fc7e6..dfd773d8 100644
--- a/wowViewerLib/src/engine/objects/scenes/dayNightDataHolder/DayNightLightHolder.cpp
+++ b/wowViewerLib/src/engine/objects/scenes/dayNightDataHolder/DayNightLightHolder.cpp
@@ -1,3 +1,4 @@
+#include <cstdlib>
 //
 // Created by Deamon on 7/5/2024.
 //
@@ -924,6 +925,20 @@ void DayNightLightHolder::calcLightParamResult(int lightParamId, const Config *c
             exteriorColors.exteriorHorizontAmbientColor = exteriorColors.exteriorAmbientColor;
 
         exteriorColors.exteriorDirectColor   = mixMembers<3>(lightParamData, &LightTimedData::directColor, blendTimeCoeff);
+        // geoguessr scratch: Classic's default light has a saturated orange
+        // sun (0xff8800 at noon) that this retail-tuned shader overweights.
+        // Keep 0.35 of the direct colour's saturation (GEO_DIRECT_SAT overrides,
+        // 1 = as the data has it), the rest pulled to its luminance;
+        // GEO_DIRECT_GAIN scales it.
+        {
+            const char *sat = std::getenv("GEO_DIRECT_SAT");
+            float k = sat ? std::atof(sat) : 0.35f;
+            auto &d = exteriorColors.exteriorDirectColor;
+            float lum = 0.299f * d.x + 0.587f * d.y + 0.114f * d.z;
+            d = mathfu::vec3(lum, lum, lum) + (d - mathfu::vec3(lum, lum, lum)) * k;
+        }
+        if (const char *gain = std::getenv("GEO_DIRECT_GAIN"))
+            exteriorColors.exteriorDirectColor = exteriorColors.exteriorDirectColor * (float) std::atof(gain);
         exteriorColors.exteriorSpecularColor = mixMembers<3>(lightParamData, &LightTimedData::SunColor, blendTimeCoeff);
 
         //Liquid colors
```

**Gray world is gone** from `scripts/render.ts`: it did more harm than good
(Duskwood's grass turned red, Dun Morogh's snow pink, the Barrens' sky
teal). The pictures are the renderer's colours as they come.

**Before and after**, 13 cameras in Dun Morogh, the Barrens, the Swamp of
Sorrows, Stormwind, Duskwood, Elwynn and Westfall (old pipeline, raw data
light, after), looked at side by side (`.cache/light/before-after.jpg`, not
committed): Elwynn's cobbles and trunks go from orange to grey and brown,
Westfall from orange to gold, the rest barely move (their own lights are
not the default). Dun Morogh, Stormwind and Duskwood read right.

**Not verified**: the Barrens and the Swamp of Sorrows stay warm because
their own lights are (the Barrens' sun `0xff9c56`, ambient `0x6a5742`; the
swamp's sky is orange in the data). That is probably the game's own look,
but no in-game picture of the same spot at noon was at hand to compare. One
screenshot at the Crossroads at noon would settle it.
