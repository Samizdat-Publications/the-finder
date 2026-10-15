# PROGRESS

_Last updated: 2026-10-15 by the planning session (Opus 5.5). Update after every meaningful chunk._

## Current milestone

**M1: Ground truth (not started).** Checklist: `docs/plans/M1.md`. Goal: prove the hard parts with real
data before any game code: the real image tape decoded (calibration circle and all 156 frames), every
number on the cover transcribed and verified, and the science core (pulsar dating and triangulation,
decay clocks, the trail, the epoch model) built and tested against the research numbers.

## Done

- 2026-10-15 (planning session):
  - Plan approved by Stewart (`PLAN.md`).
  - Four research reports with sources (`docs/research/`): the cover and pulsar map, the clocks, the
    pictures and audio sources, the spacecraft and hosting. Derived data and the research scripts in
    `docs/research/data/`.
  - Project rules (`CLAUDE.md`), handoff (`HANDOFF.md`), decisions log, How it's checked skeleton,
    credits, spend, feedback and needs files, helper agents and the critic guard (`.claude/`), settings,
    `.gitignore`, README stub.
  - Private repo `https://github.com/Samizdat-Publications/the-finder`, branch `main`.

## In flight

- Nothing. No agents, downloads or processes running.

## Known issues and open questions

- **Neighbour twist unconfirmed:** that the Sun is among Gliese 445's nearest stars at the story epoch
  (about 1.06 pc). M1 confirms with the star model; if it does not hold, the story changes (log it),
  the facts do not.
- **Side break of the record unconfirmed** (after music #9, #11 or #12). Decide in M2 and show it as an
  inference.
- **Uranium spot position** is not on the cover diagram: our documented choice.
- **Colour channel order** cannot be proven from the record: shown as "probable".
- **"Ultra-pure" uranium** is assumed isotopically pure (NASA's wording); How it's checked says so.
- No `package.json` yet: `npm run check` and `Run Checks.bat` arrive in M1 step 0.

## Next (exact)

1. `docs/plans/M1.md` step 0: minimal Node and TypeScript skeleton with Vitest and `npm run check`;
   `tools/sources.json` and a resumable, checksum-verifying fetch script; start the 1.46 GB image tape
   download in the background first.
2. M1 step 1: the Python reference decoder; look at the calibration circle and the 156-frame contact
   sheet yourself, then send both to Stewart.
3. M1 steps 2 to 5: `cover.json`, the data builders, the science core and its tests, How it's checked
   v1, the gate. Then write `docs/plans/M2.md` and continue.
