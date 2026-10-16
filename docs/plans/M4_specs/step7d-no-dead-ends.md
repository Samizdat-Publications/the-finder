# M4 step 7d spec: no dead ends from measurement noise (D-A28)

Subagent: `builder-opus`, before step 7c (same run). Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 3, 5, 6, 7, 13), `docs/DECISIONS.md` D-A28 (this spec implements it), the step 7b report's numbers in `docs/HOW_ITS_CHECKED.md` rows 6 to 9, `src/science/kinematics.ts` (the measured trail fields and `trailConsistent`), `src/science/triangulation.ts` (`insideRegion`, `regionLevel`, `CHI2_2DOF_95`), `src/chapters/trail/checkers.ts`, `src/game/gameService.ts` (Start over: `game.seed.value = \`finder-${clock()}\``), `src/game/save.ts`, and every chapter's Node tests that compute a right answer for a seed (`src/chapters/*/*.test.ts`).

## 1. Acceptance at 99.9% for the two noise-gated checks
- `trail.origin`: accept the proposed star when its measured angle is at most the 99.9th percentile of its null distribution (the same construction as the 95% cut; estimate the 99.9% point with enough draws for that one star to be stable, for example 20,000, computed on demand for the proposed star only and cached). The instrument still draws the 95% cut as the error bar; the message states where the measured angle falls (for example "inside the 95% cut" or "between the 95% and 99.9% cuts: consistent, at the edge").
- `trail.where`: accept the origin star when it lies inside the region's 99.9% contour (chi-square 2 dof, -2 ln 0.001 = 13.82, computed in code, exported beside `CHI2_2DOF_95`); the drawn region stays 95%; the message states the star's contour level.
- Tests: over at least 2,000 seeded measurements, the rate at which the right star is refused at 99.9% for each check (record it; expected about 0.1%), and every other star within 10 pc still refused in every seed (`trail.othersRefused` at the new cut). Restate How it's checked rows 6 and 9 with the numbers.

## 2. Validated seeds for Start over
- `data/seeds.json` (new): a list of playthrough seeds, each one verified to let every chapter's right answers confirm (all 31 deductions, using the right answers the chapters' Node tests already compute from the model for a seed), with `meta` saying how it was built, how many candidates were tried and how many were excluded and why (by check). At least 200 seeds.
- A builder (a script or a test run in a "build" mode; your choice, documented in `data/README.md`) that tries candidate seeds `finder-2`, `finder-3`, ... in order and writes the file; a normal test that re-verifies a sample of the listed seeds (all of them if fast enough) and the default seed.
- Start over takes the next seed from the list (cycling), never a time-based seed; old saves keep their seed. Unit test for the choice.
- How it's checked: one line with the excluded share and the reason ("about N in 1,000 candidate seeds leave a check unpassable at its stated level, all of them by measurement noise in X").

## Tests and looking
All existing tests pass (say which assertions changed and why). The game bots still pass.

## Done when
`npm run check` passes. Report: the refusal rates at 99.9%, the excluded-seed counts by check, files, anything you could not do. Then go straight on to `docs/plans/M4_specs/step7c-messages-in-alien-units.md` in the same run and report on it separately.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies. Files under about 400 lines.
