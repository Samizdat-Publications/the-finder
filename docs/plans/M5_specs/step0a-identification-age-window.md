# M5 step 0a spec: the identification's age window (an M4 science issue)

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 3, 4, 6, 7, 13), `docs/DECISIONS.md` D-A16 (likelihood identification) and D-A28 (validated seeds, amended), `PROGRESS.md` "Known issues" (the first item), `src/science/pulsarIdentify.ts` (`rtgInterval`, the window `U[t_lo, 2 t_hi]` at about lines 23, 85 to 102 and 134 to 146), `src/science/pulsarEpoch.test.ts` (`identify.epoch`), `src/science/clocks.ts` (`ageFromTh230U234`: what the RTG interval is), `src/chapters/shared/epochModel.ts` (where the Arrival interval is passed in), `tools/seeds/build-seeds.mjs`, `data/seeds.json` and `src/chapters/seedCheck.test.ts`. Two other helpers work at the same time (the decoder's picture edge; the interface polish batch): stay in your files and never run `npm run check` while they might (targeted tests until the end; the lead runs the full check).

## The problem
The identification draws the map's age from `U[t_lo, 2 t_hi]`, where `[t_lo, t_hi]` is the Arrival RTG clock's 95% interval, and pre-selects candidates whose age range overlaps that window. When a measurement puts `t_lo` above the true age (about 2.5% of RTG draws), a documented pulsar (B1727-47, B1933+16 or B0525+21 in the seed builder's 19 exclusions out of 2,000) falls out of the pre-selection and another wins. A hard window built from a 95% interval throws away the tails it should keep.

## What to do
- Replace the hard window with the clock's own uncertainty: draw the age from the RTG clock's sampling distribution (or a window with computed tails wide enough that the true age falls outside it with a stated, negligible probability, for example the 1e-4 quantiles, derived from the clock's own error model, not chosen), and keep the upper allowance the current `2 t_hi` encodes only if you can state why (the map may be older than the fuel: say how much older is possible and where that comes from, or remove it).
- Keep the rest of D-A16 as it is (period factor, direction, tick latitude, pass 2 from the anchors). The pass-1 anchor rule that `map.periods` uses must still hold for the default seed (the anchors may change; say how).
- Tests: `identify.epoch` over at least 500 seeds (it now runs 20 and a nominal): the right pulsar on every line in every seed, or an honest recorded failure rate with each failure explained. Record it as a check. The existing coverage and identification checks keep passing.
- Rebuild `data/seeds.json` (`node tools/seeds/build-seeds.mjs`, about 8 minutes) and report how many candidates are now excluded and by which check (expected: the 19 `map.identify` exclusions gone).
- Update `docs/HOW_ITS_CHECKED.md` row 5 (the identification's numbers and the window's basis), D-A16 (an amendment line at the end of its row) and `PROGRESS.md`'s known-issue item (mark it fixed with the numbers).

## Done when
Targeted tests pass (`npx vitest run src/science src/chapters`); `node tools/harness/browser-tests.mjs map` and `game` pass. Report: the new window or distribution and its basis, the 500-seed result, the seed list before and after, files, anything you could not do.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies. Files under about 400 lines (`pulsarIdentify.ts` may need a split; if so, say how).
