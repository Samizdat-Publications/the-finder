# PROGRESS

_Last updated: 2026-10-15 by build session 1 (Opus 5.5), stopped early at Stewart's request for a session
switch. Update after every meaningful chunk._

## Current milestone

**M1: Ground truth (step 0 done; steps 1 to 4 specified, not built).** Checklist: `docs/plans/M1.md`.
Goal: prove the hard parts with real data before any game code: the real image tape decoded
(calibration circle and all 156 frames), every number on the cover transcribed and verified, and the
science core (pulsar dating and triangulation, decay clocks, the trail, the epoch model) built and
tested against the research numbers.

## Done

- 2026-10-15 (planning session): plan approved; research, rules, handoff, agents, repo.
- 2026-10-15 (build session 1):
  - **M1 step 0 complete** (commit f66c87f): `package.json` (TypeScript 7.0.2, Vitest 5.0.5, @types/node
    26.6.5, pinned exactly), strict `tsconfig.json`, `vitest.config.ts`, `tests/hygiene.test.ts` (no em
    dashes, no file over 20 MB, no tracked .env, `src/science` and `src/dsp` free of three/preact/DOM and
    `Math.random`), `tools/check.mjs` (`npm run check`, writes `harness/LAST_RUN.md`), `Run Checks.bat`.
    `npm run check` passes (typecheck, tests; the two Python steps SKIP until their scripts exist).
  - **All M1 sources fetched and verified** into `sources/` (gitignored) by `tools/fetch-sources.mjs`
    (resumable, MD5 and SHA-256; values recorded in `tools/sources.json`): the image tape
    `384kHzStereo.wav` (1,455,685,720 bytes, **MD5 f543349efdcc258e56c9af3baa9d33c8 matches**), ATNF
    v2.9.0 tarball, Jodrell Bank glitch table and Crab ephemeris, cover photo GPN-2000-001978, NASA cover
    diagram, Pioneer plaque SVG (the real URL is `.../commons/0/02/Pioneer_plaque.svg`), HYG v4.2, Barry's
    `voyager.cpp`. Credits lines added.
  - `tests/support/record.ts`: the helper every science test uses to record its result for How it's
    checked (`harness/out/checks/<id>.json`; `tools/how-checked.mjs`, still to write, merges them).
  - **Specs written for M1 steps 1 to 4** and saved verbatim in `docs/plans/M1_specs/` (three ready to
    relaunch, plus design notes for the last two science specs).

## In flight

- Nothing is running. Three helpers (reference decoder, data builders, clocks) were stopped before
  finishing; their specs are saved in `docs/plans/M1_specs/`.
- `tools/ref-decoder/tape.py`, `sync.py`, `decode.py`: **UNVERIFIED drafts** from the stopped decoder
  helper (they compile; never run end to end). Committed so they are not lost; the relaunched helper
  decides whether to keep them.

## Known issues and open questions

- **"No plutonium" in PLAN.md chapter 0 is wrong as written:** only Pu-238 is gone at 44,000 years; the
  other 20 at.% of the fuel (mostly Pu-239, Pu-242) partly remains. Fix the chapter text from the clocks
  module's computed inventory (see `docs/plans/M1_specs/step4b-design-notes.md`).
- **Neighbour twist unconfirmed** (the Sun among Gliese 445's nearest stars, about 1.06 pc). M1 confirms
  with the star model; if it fails, the story changes (log it), the facts do not.
- **Side break of the record unconfirmed** (after music #9, #11 or #12). Decide in M2, show as inference.
- **Uranium spot position** is not on the cover diagram: our documented choice.
- **Colour channel order** cannot be proven from the record: shown as "probable".
- **"Ultra-pure" uranium** is assumed isotopically pure (NASA's wording); How it's checked says so.
- Python packages live in the user site-packages, so run Python as `python -P` (not `-I`, which hides
  them).

## Next (exact)

0. **Commit and push session 1's handoff first** (a command guard held and refused it): the exact paths
   are listed in HANDOFF.md "Where things stand". Commit f66c87f (step 0) is local only and goes up
   with that push.
1. Relaunch three `builder-opus` helpers in the background, in parallel, each with its saved spec as the
   prompt: `docs/plans/M1_specs/step1-reference-decoder.md`, `steps2-3-data-builders.md`,
   `step4a-science-units-clocks.md` (paste everything below the `---` line; the decoder spec's handoff
   note says the tape is already downloaded).
2. While they run: turn `docs/plans/M1_specs/step4b-design-notes.md` into two specs (S2a epoch and
   kinematics; S2b pulsars and triangulation) and launch them once `data/*.json` and
   `src/science/astro.ts` exist.
3. Look at the decoded circle and the 156-frame contact sheet yourself; send both to Stewart.
4. M1 step 5 (How it's checked v1, `tools/how-checked.mjs`, science-auditor) and step 6 (gate). Then
   write `docs/plans/M2.md` and continue.
