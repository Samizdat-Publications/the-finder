# PROGRESS

_Last updated: 2026-10-15 by build session 2 (Opus 5.5), M1 audit fixes and M2 in flight. Update after every meaningful chunk._

## Current milestone

**M1: Ground truth: all steps built and green; the science audit's fixes are in flight (step 5);
gate (step 6) next. M2 (engines and scaffold) is running in parallel: steps 0 to 2 done, 3 and 4 in
flight.** Checklists: `docs/plans/M1.md`, `docs/plans/M2.md`.

## Done

- 2026-10-15 (planning session): plan approved; research, rules, handoff, agents, repo.
- 2026-10-15 (build session 1): M1 step 0 (skeleton, `npm run check`, source manifest and resumable
  fetch; every M1 source downloaded and checksum-verified, including the 1.46 GB image tape).
- 2026-10-15 (build session 2):
  - Session 1 handoff committed and pushed (b7c449f).
  - **Step 4a, science foundation and decay clocks** (08345c6): `src/science/` units, seeded randomness
    (sfc32), statistics, coordinates (Hipparcos galactic matrix), nuclides, clocks. 45 tests green.
    Uranium spot: A234/A238 0.1168 at 44,000 y; RTG at 44,000 y: 11 kg U-234, 1.1 kg Th-230,
    Th/U activity 0.352, 8.7 W; 95% intervals cover the truth 94.8%, 96.2%, 95.6% of 1,000 trials.
  - **Steps 2 and 3, data** (9898656): `data/` cover, pulsars (4,503 with errors), glitches, Crab,
    stars (3,934 within 30 pc, Gaia DR3 for Gliese 445), sky (8,338), ephemeris (Hermite max error
    1.75 km), scenario; 130 data checks pass; byte-identical rebuilds. Map re-extracted from the raw SVG
    with our own origin; angles from the drawn centre line (max 2.77 deg from catalogue l).
  - Story corrections from the computed inventory: D-A13 (no "no plutonium": 0.77 kg Pu-239 remains),
    D-A14 (the wrong-chain lesson rests on the missing U-238).
  - `tools/how-checked.mjs` (results table generated into `docs/HOW_ITS_CHECKED.md`),
    `tools/checkrecord.py`, `npm run check` now 5 steps; `src/science/types.ts` and
    `tests/support/data.ts` (data types and loaders); fetch script exits cleanly on Windows.
  - **Step 4 S2a** (29ce252): epoch, trail, ephemeris. Discovery 44,100 yr after launch; the Sun is
    Gliese 445's nearest star (1.024 pc) and fifth-brightest (D-A15); light-day 2026-11-18 10:16 UTC.
  - **Step 4 S2b** (64aebc7): pulsar dating today (1969.75 mean), at the epoch (reframed coverage
    95.3%, B1240-64 outlier), likelihood identification on all 14 lines (D-A16), triangulation.
  - **Step 1, reference decoder** (45f914a, 3086e20): all 156 frames from the real tape; droop
    measured from content; pictures sent to Stewart (`docs/progress/2026-10-15-*`).
  - `npm run check` (7 steps) green; How it's checked table generated from the records.
  - **M2 steps 0 to 2**: decisions D-A17 (side break after music #11) and D-A18 (FLAC slices, Opus
    music); site scaffold (`/`, `/play/`, `/checked/`), Play The Finder.bat, Playwright harness and
    browser-test runner, audio probe (sample-exact 96 kHz FLAC in Chrome); media pipeline (31 Opus
    tracks plus the picture side, 156 FLAC slices, `data/record.json`, `data/frames.json`); the 31
    Ozma tracks downloaded and MD5-verified.
  - Specs S2a and S2b written (`docs/plans/M1_specs/step4c-...`, `step4d-...`); M2 plan drafted
    (`docs/plans/M2.md`, with the scout's version and browser-audio facts).

## In flight (background helpers; every spec is saved in `docs/plans/M*_specs/`)

- Science-audit fixes (M1 step 5), four helpers by module: pulsars (Vela 1971.75 +/- 0.15 with the
  PEPOCH glitch added back; misspecification coverage runs; per-pulsar timing noise from Lyne 2010;
  triangulation coverage), clocks (half-life systematic about 137 yr; heat range 4.9 to 8.7 W;
  Pu-242), epoch and trail (wording; radial-velocity-less stars proven harmless; solar M_V 4.81), the
  reference decoder (circle and slant relabelled as self-tests; independent geometry check against
  clean published images; decoder records).
- M2 step 3, the browser decoder (`docs/plans/M2_specs/step3-browser-decoder.md`).
- M2 step 4, the turntable engine (`docs/plans/M2_specs/step4-turntable.md`).

## Known issues and open questions

- **Neighbour twist unconfirmed** until S2a reports (the Sun among Gliese 445's nearest stars, about
  1.06 pc). If it fails, the story changes (log it), the facts do not.
- **Side break of the record unconfirmed** (after music #9, #11 or #12). Decide in M2, show as inference.
- **Uranium spot position** is not on the cover diagram: our documented choice.
- **Colour channel order** cannot be proven from the record: shown as "probable".
- **Atomic masses** in `nuclides.ts` were entered from memory (AME2020, 1e-6 u): science-auditor spot
  check at the gate.
- **Voyager 1 launch time** 12:56 UTC is NASA's published time but not yet cited in `docs/research/`.
- Python packages live in the user site-packages, so run Python as `python -P` (not `-I`).

## Next (exact)

1. As each audit fix reports: review, run `npm run check`, commit. Then rerun `science-auditor` on the
   changed claims only, and `qa-auditor` on PROGRESS and HANDOFF (M1 gate), push.
2. If the reference decoder gains a shear parameter, tell the browser-decoder helper to port it.
3. When M2 steps 3 and 4 land: M2 step 5 (the bare instrument on `/play/`), captures, deploy
   (`npm run deploy`), send Stewart the link; M2 gate; write `docs/plans/M3.md`.
