# The science core (`src/science/`)

Plain TypeScript that does the real calculations behind every deduction. It never touches the screen,
three.js or Preact, and never uses `Math.random`: all chance comes from seeded streams, so the same
seed always gives the same result, in the browser and in the tests alike. The numbers it is checked
against come from `docs/research/` (mainly `clocks.md` and `cover.md`).

| File | What it does, in plain words |
|---|---|
| `units.ts` | The hydrogen "ruler" from the cover (one tick = 0.704 billionths of a second, or 21.1 cm), reading the cover's binary numbers, and the physical constants used everywhere (speed of light, year, parsec, Avogadro). |
| `random.ts` | Seeded random numbers: uniform, bell-curve (normal) and Poisson counts, plus `fork(label)` for an independent, repeatable sub-stream. |
| `stats.ts` | The statistics toolbox: the normal and chi-square distributions, confidence intervals for a proportion (Wilson, Clopper-Pearson), a guaranteed root finder, simple search for a maximum, averages. |
| `astro.ts` | Sky geometry: turning star positions into galactic coordinates, star velocities from catalogue motions, moving things in straight lines over thousands of years, and converting dates. |
| `nuclides.ts` | The nuclear data for the clocks (half-lives with their uncertainties, masses, how much heat each decay leaves) with a source for every number, and the decay-chain solver (Bateman equations) that says how much of each isotope exists after any time. |
| `clocks.ts` | The two radioactive clocks. The uranium spot on the cover: how its daughters grow, simulated alpha counting, the age with an honest 95% range, and the test of what it started as. The plutonium heat sources: what they turn into, how warm they still are, the age from the thorium ratio, and the check that rejects the wrong decay chain. |

`types.ts` holds shared data types and is maintained alongside the data builders.

## How the tests prove it

- Cover numbers decode exactly to the values in `cover.md` (3.6 s per turn, 53.8 minutes per side,
  8.34 ms per picture line, 512 lines), and read as lengths they are absurd.
- The decay-chain solver matches a brute-force step-by-step integration to better than one part in a
  billion, for ages from 49 years to a million.
- Every clock number in `clocks.md` (amounts, ratios, inventories, heat) is reproduced within the
  research's rounding.
- Error bars are computed, then checked: over 1,000 seeded repeats, each 95% age range contains the
  true age 93% to 97% of the time.
- Every test that proves a claim writes a record for How it's checked (`tests/support/record.ts`).

## Assumptions to know about

- The uranium spot began as isotopically pure uranium-238 (NASA says "ultra-pure"); the purity test
  shows the measurement itself can check this.
- Before counting, uranium and thorium are separated chemically, and the detector is equally efficient
  for every alpha line.
- The RTG plutonium was 80% plutonium-238 by atoms (LA-5202); the other 20% is split like the Cassini
  RTG fuel. Radon stays in the fuel. Gamma rays are counted as heat, so the heat is a slight upper bound.
