# M3 step 3b spec: the encounter scene (Voyager under the real sky of AD 46,078)

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 4, 6, 7, 9, 12), `PLAN.md` chapter 0 (Arrival) and "Look, feel and sound" (the spacecraft: tiny and cold, lit by the vessel's lamps, gold glints, the Sun a bright star far behind it, the real sky of that place and time), `docs/plans/M3.md`, `HANDOFF.md` gotchas (three.js: one animation loop, clamp dt, `vertexColors` without a colour attribute renders black; the Browser pane pauses rAF, use Playwright), `src/science/epoch.ts` (`discoveryState`, `starStateAt`, `apparentMagnitude`, `brightestStars`, `SUN_ABS_MAG_V`), `src/science/astro.ts`, `src/science/types.ts`, `data/README.md` (stars.json, sky.json), `public/media/models/voyager.json` and `voyager.glb`. Another helper is building the game shell (`src/game/`, `src/ui/`, `src/play/`, `vite.config.ts`); stay out of those; you build a self-contained module the Arrival chapter will mount.

This is M3 step 3b: the 3D scene the game opens on.

## Files you own
`src/world/` (`encounter.ts`: `mountEncounter(canvas, opts) => EncounterHandle`; `sky.ts`: the star field; `lights.ts`; `hotspots.ts`), `src/world/README.md`, the Milky Way texture pipeline (`tools/sky/`, `public/media/sky/`), `tests/browser/encounter.browser.mjs`, a dev page for looking at it (`play/scene/index.html` plus `src/play/scene/main.ts`; add only that one input to `vite.config.ts` and tell the lead in your report; if the shell helper has the file open, report instead of editing).

## The scene
- three.js 0.186 (already a dependency), WebGL2, one render loop, dt clamped; pixel ratio capped at 2; resizes with the canvas; `dispose()` frees everything.
- **Voyager:** `public/media/models/voyager.glb` with `MeshoptDecoder` (three.js examples). Its real size (dish 3.66 m; metres in the model). Materials as in the model; the `record_cover` node gets a warm gold material (the game swaps in the real cover later).
- **The vessel's lamps:** two or three spotlights from the camera side (cool white), soft shadows only if cheap; the rest of the craft falls into darkness (no ambient fill beyond a faint starlight term). Gold glints on the record and the antenna rods.
- **The sky, computed (rule 1):** the observer is the craft at the discovery epoch (`discoveryState(...).craft.posPc`). Every star in `stars.json` (near) and `sky.json` (sky, with distances) is moved to the epoch (`starStateAt`), seen from the craft (direction and new distance), its apparent V magnitude from its absolute magnitude (the Sun: `SUN_ABS_MAG_V`); colour from its B-V (`ci`) through a standard B-V to RGB mapping (cite it). Rendered as points on a sky sphere, size and brightness from magnitude (a documented, monotonic mapping; magnitude 6.5 faint but visible), the Sun a clear yellow point of magnitude about -0.8. Stars without a distance stay at their present directions (they are far; say so). The scene exposes the Sun's direction and magnitude in its handle (for the game and tests).
- **The Milky Way:** ESA's Gaia all-sky colour map (named in PLAN.md "Sources"; find the official ESA page, record the file in `tools/sources.json` with checksum, credit "ESA/Gaia/DPAC, CC BY-SA 3.0 IGO", acknowledgement as ESA asks), converted by a script to a WebP equirectangular texture under 8 MB, mapped on a background sphere in the correct orientation (the map is in galactic coordinates: rotate with the galactic-to-ICRS matrix from `astro.ts`; the Galactic centre and the bright stars must line up, test it). At 1 pc from the Sun the Milky Way looks the same as from Earth (it is kiloparsecs away): say so in a comment.
- **Hotspots** (`hotspots.ts`): 3D anchor points the Arrival workbenches will use, in model coordinates, measured from the model (and listed in `src/world/README.md`): the high-gain dish, the magnetometer boom, the science boom with its scan platform, the RTG boom with the three RTG cylinders (one point each), the record. `handle.project(id)` returns screen coordinates and visibility.
- **Camera:** slow, gentle drift; orbit by drag, zoom by wheel within limits; `handle.frame(id)` eases to a hotspot; reduced-motion option turns drift off.
- **Look:** tiny and cold: the craft small against the sky at first, the vessel's lamps sweeping it.

## Tests and looking
- `tests/browser/encounter.browser.mjs` (runner `tools/harness/browser-tests.mjs`): mount on the dev page; no console errors; the handle reports the Sun's magnitude within 0.05 of `apparentMagnitude(SUN_ABS_MAG_V, |craft position|)` and its direction equal to the craft-to-Sun direction within 0.01 deg; the star count; the Galactic centre direction on the background texture lines up with `galacticToIcrs(0, 0)` within 1 deg (sample the texture mapping at that direction); frame time at 1440x900 (record it). Id `scene.encounter`.
- Captures into `review/inbox/`: the opening view, a close view of the record face, the RTG boom, and a wide sky view with the Sun visible (mark nothing; it should read as a real sky). Look at every one yourself; fix anything wrong, ugly or black.

## Done when
`npm run check` passes (or fails only on another helper's in-flight files, named in your report), the captures look right to you. Report: files, the star counts (near, sky, shown), the Sun's magnitude and direction, the Milky Way source and size, the frame time, the hotspot table, the capture folder and what each shows.

## Rules
No em dash anywhere. Never read .env. Never run downloaded code. Do not commit, do not deploy. Files under about 400 lines.
