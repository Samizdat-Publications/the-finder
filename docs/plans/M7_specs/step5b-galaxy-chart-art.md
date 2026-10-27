# M7 step 5b: depth and light for the galaxy chart (The Map)

**Why:** the blind critic and the Gemini video critic both found The Map's chart secondary and a little flat (dots on
black with gold lines; `docs/reviews/2026-10-22-V1-player-critic.md` item 5, `docs/reviews/2026-10-27-whole-tour-gemini-critic.md`
item 4). The Trail chart got its depth pass in step 5a (`docs/plans/M7_specs/step5-trail-chart-art.md`, done; read
`src/world/neighbourhood.ts` to see how it was done and match its style). This is an art pass only: no number the
player sees, no pulsar position, no match, no pick behaviour and no label text may change.

**File you own:** `src/world/galaxy.ts` only (and, if you need a small shared helper, a new export at the end of
`src/world/chartControls.ts` that nothing else uses yet; if `neighbourhood.ts` already has a helper you want, such as
the radial glow background, you may move it into `chartControls.ts` as a new export and import it from both files,
changing nothing else in `neighbourhood.ts`). Read the file's header comment, `chartControls.ts` (`makePoints`,
`makeSegments`, `makePolyline`, `makeLabel`, `declutterLabels`) and `galaxyModel.ts` first. Coordinates: Galactic,
centred as the file already does; parsecs.

**Add, all faint, so the pulsars, the map's rays and the player's matches stay the brightest things:**
1. **A reference grid in the Galactic plane, in the alien's style:** concentric distance rings around the alien's
   star (choose radii that suit the chart's scale, 4 or 5 rings, at round numbers of parsecs) and 12 faint spokes
   every 30 deg of Galactic longitude, with short tick marks along each ring every 10 deg (a dial, not a
   spreadsheet grid). Dim blue-violet, opacity about 0.06 to 0.12. Ring radius labels written through the
   chart's own `lengthLabel` option (so the alien units and the human gloss apply), priority 0 so
   `declutterLabels` drops them first, never `keep`.
2. **Glow on what matters:** the pulsars that are matched to a map line (the player's matches, and the 14 true
   map pulsars once the chart shows them) get a soft additive halo sprite behind their point (a radial-gradient
   CanvasTexture, one shared texture, additive blending, depthWrite off), sized in pixels like the points so it
   does not balloon when zoomed. Other pulsars stay as they are.
3. **The origin region drawn as light, not a line:** where the chart draws the fitted origin region outline, add a
   faint filled glow inside it (a soft radial-gradient sprite or a filled ellipse mesh at low opacity, additive),
   keeping the existing outline on top. The map's rays: give them a faint wider glow line under the existing
   line (a second line with the same points, lower opacity) only if it costs little; skip it if line widths are
   capped at 1 px on this platform (WebGL usually is), and say so.
4. **Background:** the same faint radial glow as the Trail chart (centre at most about #0a0a22, edges #02030a),
   behind everything, depthTest off.

**Rules:** CLAUDE.md hard rules 1 (real data only: rings, spokes and glows are a frame of reference and emphasis,
not data; everything placed comes from the model), 4 (touch nothing in `src/science/`), 7, 10 (stage and commit
nothing), 13 (no em dashes, in comments too). Reduced motion: everything static (no pulsing). Dispose everything you
add in the handle's `dispose()`. Keep the per-frame cost small: one draw call per kind (one LineSegments for all
rings, spokes and ticks; one Points or InstancedMesh for all halos).

**Commands that must pass:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`;
`node tools/harness/browser-tests.mjs charts`; `node tools/harness/browser-tests.mjs map`;
`node tools/harness/browser-tests.mjs perf-igpu` (report the galaxy numbers before and after; its enterMap check is
recorded, not asserted). Screenshots: before you start,
`node tools/harness/tour-look.mjs --stops 44,46,48,49 --sizes 1440x900 --wait 9000 --out review/archive/galaxy-art-before`,
and the same with `--out review/archive/galaxy-art` after; also `--open` versions of 45 and 49. Look at them yourself.
Note: tour-look does not switch The Map's step tabs per stop; to see the region, add `--click '[data-map-step=region]'`
or whatever selector the tab really has (read `src/chapters/map/StepPanel.tsx` or `MapInstrument.tsx`).

**Report:** files changed, the test results, the galaxy benchmark and live numbers before and after, the screenshot
paths, and anything you were unsure about.
