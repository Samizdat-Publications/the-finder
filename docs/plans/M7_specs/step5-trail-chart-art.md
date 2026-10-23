# M7 step 5a: depth for the neighbourhood chart (The Trail)

**Why:** the blind critic called the Trail's star chart flat (`docs/reviews/2026-10-22-V1-player-critic.md`, item 5):
sparse dots on black, and nothing to tell near from far or above from below. This is an art pass only: no number
the player sees, no star position, no trail row and no pick behaviour may change.

**File you own:** `src/world/neighbourhood.ts` only (and, if you need a small shared helper, a new export at the end
of `src/world/chartControls.ts` that nothing else uses yet). Read the file's header comment, `chartControls.ts`
(`makePoints`, `makeSegments`, `makePolyline`, `makeLabel`, `declutterLabels`) and `neighbourhoodModel.ts` first.
The chart is drawn in Galactic coordinates centred on the craft at (0, 0, 0), in parsecs; `galToWorld` maps them.

**Add, all faint so the stars and the trail stay the brightest things:**
1. **A reference plane through the craft:** distance rings in the Galactic plane (z = 0) around the craft at 2, 4,
   6 and 8 pc (the chart already draws a ring at its edge, `NEIGHBOURHOOD_RADIUS_PC`; keep that one), plus eight
   faint spokes every 45 deg of Galactic longitude out to the edge ring. Colour in the alien palette (a dim
   blue-violet, opacity about 0.08 to 0.12 for rings and 0.06 for spokes). Each inner ring gets a small label with
   its radius written through `lenText` (so it follows the alien units and the human gloss like the other
   labels), priority 0 so `declutterLabels` drops them first, never `keep`.
2. **Drop lines ("stalks"):** for every star drawn, a thin line from the star straight to the plane (from (x, y, z)
   to (x, y, 0)), plus a tiny dot where it meets the plane. Colour each stalk with the star's own colour at low
   opacity (about 0.18), stars above the plane and below drawn alike. One `LineSegments` for all stalks and one
   points set for all feet (no per-star objects). This is the classic 3D star-map depth cue.
3. **The background:** keep `scene.background` dark, but give the chart a faint radial glow toward its centre so it
   is not flat black (a large back-facing sprite or a screen quad with a radial gradient texture, depthTest off,
   drawn first). Keep it subtle (centre at most about #0a0a22, edges #02030a).
Hollow rings for stars without a radial velocity stay as they are (their depth is uncertain: give their stalk a
dashed look or a lower opacity, about 0.08, so the uncertain depth reads as uncertain).

**Rules:** CLAUDE.md hard rules 1 (real data only: everything drawn comes from the model's positions; rings and
spokes are a frame of reference, not data), 4 (science code stays pure: touch nothing in `src/science/`), 7, 10
(stage and commit nothing), 13 (no em dashes, in comments too). Reduced motion changes nothing here (all static).
Dispose everything you add in the handle's `dispose()` (follow `disposeTree` and the `sets` pattern).

**Commands that must pass:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`;
`node tools/harness/browser-tests.mjs charts`; `node tools/harness/browser-tests.mjs trail`;
`node tools/harness/browser-tests.mjs perf-igpu` (report the neighbourhood numbers; its Map check currently fails
for an unrelated reason the lead is fixing: ignore that one). Then take screenshots: run
`node tools/harness/tour-look.mjs --stops 51,53 --sizes 1440x900,1366x768 --out review/archive/trail-art` and look at
them yourself; also save one before-and-after pair of the chart if you can (run the same command before you start
with `--out review/archive/trail-art-before`).

**Report:** files changed, the test results, the neighbourhood benchmark and live numbers before and after, the
screenshot paths, and anything you were unsure about.
