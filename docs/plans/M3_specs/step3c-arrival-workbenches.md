# M3 step 3c spec: the Arrival workbenches (scans and the decay clock)

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16). Launch after step 3b
(the encounter scene) and step 1's no-spoilers fix have landed.

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 3, 5, 6, 7), `PLAN.md` chapter 0 (Arrival) and "Principles from the kickoff", `docs/DECISIONS.md` D-A07 (alien units), D-A13 and D-A14 (the inventory and the wrong-chain lesson), `docs/HOW_ITS_CHECKED.md` rows 1 and 2, `src/science/rtg.ts`, `clocks.ts`, `nuclides.ts`, `units.ts`, `epoch.ts`, `random.ts`, `src/world/README.md` and `encounter.ts` (the scene handle: hotspots, `project`, `frame`), `src/game/graph.ts`, `deductions.ts` (checker registry, readings with `dim`), `gameService.ts`, `src/ui/` (shell, units, glyphs), and the step 1 and 3b specs in `docs/plans/M3_specs/`.

This is M3 step 3c: the first chapter the player actually plays. The encounter scene fills the workbench; alien instrument panels sit over it. Four deductions (`arrival.purpose`, `arrival.heat`, `arrival.madeNotMined`, `arrival.fuelAge`), each confirmed by a checker that computes its answer from the science (rule 1), and each wrong answer showing a meaningful wrong result (PLAN.md principles).

## Files you own
`src/chapters/arrival/` (the chapter view, panels, checkers, a small module of chapter-specific physics if needed, kept pure and tested), tests (`src/chapters/arrival/*.test.ts`, `tests/browser/arrival.browser.mjs`), and the Arrival entries in `src/game/graph.ts` only if a node needs a field it lacks (tell the lead). Mount the chapter where the shell's placeholder workbench is (read how the shell routes chapters; keep the placeholder for chapters not yet built).

## The measurements (seeded, rule 6)
Each playthrough has a seed stored in the save (add it if the save lacks one; tell the lead). From it, through `src/science/random.ts` forks: the isotope measurement (`simulateRtgMeasurement` at the discovery epoch's elapsed time, from `discoveryState`, with a stated relative precision), and any instrument noise. The truth is never shown, only measurements.

## The four deductions
1. **`arrival.purpose`** (question from the graph). The structure scan outlines the craft's parts at the hotspots (dish, booms, scan platform, the three cylinders, the record). The player picks what the great dish is for from four physically distinct readings: gathering light like an eye; sending and receiving radio across distance; a sail pushed by light; a radiator shedding heat. The scan gives the evidence: a paraboloid with something at its focus, metal, a surface smooth to millimetres but not to the wavelength of light, pointed back along the path the craft came from (the direction of the Sun: use the scene's Sun direction and the craft's velocity from `epoch.ts`). Only "radio" fits all of it; each wrong reading names the evidence it contradicts. (A judgement deduction, not a numbers one; say so in the codex entry; How it's checked row 1's chapter.)
2. **`arrival.heat`**. The heat scan shows three warm cylinders on one boom. The readout gives their total heat output from `rtgState(t).heatRangeW` (a range, with both assumptions shown on hover: radon retained, the plutonium mix), split evenly. The player picks the source: sunlight; heat left over from when it was made; a chemical reaction; radioactive decay inside. The checker computes each: sunlight delivers the Sun's luminosity over 4 pi d^2 at the craft's distance from the Sun (from `epoch.ts`) times the cylinders' cross-section (state the dimensions you use and their source; NASA MHW-RTG dimensions from `docs/research/voyager.md` section 2 or the research's RTG description) and comes out many orders of magnitude short; leftover heat would have radiated away within days (state the estimate: heat capacity over radiated power, from the cylinders' mass and the measured surface temperature implied by the power); chemistry cannot run for thousands of years at this rate without an absurd fuel mass (state the estimate); decay fits. Show the computed numbers for whichever wrong answer was picked.
3. **`arrival.madeNotMined`**. The isotope scan (a mass spectrum of the cylinders' material, atom fractions by mass number, from the seeded measurement) shows uranium-234 abundant and uranium-238 nearly absent. The player picks: mined (natural uranium ore) or made (born from a heavier element someone made). The checker uses `ageSolutions` for the natural hypothesis (rejected by the missing U-238, D-A14) and shows the ratio measured against natural uranium's, in orders of magnitude.
4. **`arrival.fuelAge`**. The decay clock: choose the chain (plutonium-238 to uranium-234 to thorium-230; uranium-238's natural series; "the uranium-234 was there from the start"; and one more plausible wrong one), see the predicted thorium-230 to uranium-234 ratio as a curve against age with the measurement and its error bar on it. The right chain gives the age with its 95% interval from `ageFromTh230U234` (statistical and half-life systematic both shown, as in `clocks.rtg.coverage`); a wrong chain's curve never passes through the measurement, or passes only at an age that contradicts the second ratio, and the panel says which. Show the age in the alien's time unit (`src/ui/units.ts`), with years under the human gloss.

## Presentation
- The alien look from the shell; panels over the scene, not instead of it; the scene stays alive (drift, lamps). Gold only on the craft's record and on what the alien has understood about the senders.
- Each confirmed deduction writes a codex entry whose notation lists the key readings (`{key, value, dim}`), and links How it's checked.
- Answer choices come from data (a list per node), and every number shown comes from the science (rule 1). Hints are the graph's.
- Reduced motion respected; keyboard reachable.

## Tests
- Node: each checker returns ok for the right answer and a specific, computed wrong result for each wrong one; the sunlight, leftover-heat and chemistry estimates match independent hand calculations in the test (with the inputs and formulas in comments); the decay-clock age contains the true elapsed time for the default seed. Ids `arrival.purpose`, `arrival.heat`, `arrival.madeNotMined`, `arrival.fuelAge`.
- Browser (`tests/browser/arrival.browser.mjs`): through `window.__finder` only, play Arrival start to finish with the right answers (all four confirm, the key chapter opens), and with each wrong answer once (each is rejected and its wrong result shown); no console errors. Id `chapter.arrival`.
- Captures of each scan and the decay clock (right and wrong chain) at 1440x900; look at every one and fix what is wrong or ugly.

## Done when
`npm run check` passes; the captures look right to you. Report: files, the numbers each wrong answer shows, the age and interval for the default seed, the capture folder, any graph or save change you needed.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Files under about 400 lines.
