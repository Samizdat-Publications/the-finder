# PROGRESS

_Last updated: 2026-10-15 by build session 2 (Opus 5.5), mid-M1. Update after every meaningful chunk._

## Current milestone

**M1: Ground truth (steps 0, 2, 3 and 4a done; 1, 4b in flight; 5 tooling ready).** Checklist:
`docs/plans/M1.md`. Goal: prove the hard parts with real data before any game code: the real image
tape decoded (calibration circle and all 156 frames), every number on the cover transcribed and
verified, and the science core (pulsar dating and triangulation, decay clocks, the trail, the epoch
model) built and tested against the research numbers.

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
  - Specs S2a and S2b written (`docs/plans/M1_specs/step4c-...`, `step4d-...`); M2 plan drafted
    (`docs/plans/M2.md`, with the scout's version and browser-audio facts).

## In flight (background helpers; their specs are saved, so a session switch loses nothing)

- Step 1, reference decoder (`docs/plans/M1_specs/step1-reference-decoder.md`): `tools/ref-decoder/`.
- S2a epoch, trail, ephemeris (`step4c-epoch-kinematics-ephemeris.md`): `src/science/epoch.ts`,
  `kinematics.ts`, `ephemeris.ts`.
- S2b pulsars and triangulation (`step4d-pulsars-triangulation.md`): `src/science/pulsars.ts`,
  `pulsarEpoch.ts`, `triangulation.ts`.

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

1. When the decoder reports: look at `build/ref/circle_fit.png` and `build/ref/contact_native.png`
   yourself, copy the best into `docs/progress/`, send both to Stewart, commit the decoder.
2. When S2a and S2b report: review, run `npm run check`, commit; send Stewart one sentence each on the
   dating and the clocks.
3. Step 5: align the deduction table ids in `docs/HOW_ITS_CHECKED.md` with the recorded check ids;
   add decoder and data records (`tools/checkrecord.py`); run `science-auditor`.
4. Step 6 gate (`qa-auditor`, push), finalize `docs/plans/M2.md`, continue into M2.
