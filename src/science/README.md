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

## `epoch.ts`: where everything is at the story's epoch

Everything is placed in one frame: the solar system's centre of mass, with the Sun at the origin and at
rest (its true wobble, about 0.01 AU, is far too small to matter). Distances are in parsecs, speeds in
km/s, times in years.

- **Stars** move in straight lines from the date their position was measured (2000 for the HYG
  catalogue, 2016 for Gaia's measurement of Gliese 445). Stars with no measured radial velocity are
  moved as if it were zero and flagged.
- **The craft** starts from JPL's position for 15 October 2026 and coasts along its escape direction at
  16.6048 km/s (Bailer-Jones and Farnocchia 2019). The Sun's remaining pull shifts it by about 20 AU
  out of 150,000 AU of travel. Its 2026 position lies 3.8 deg off that direction, because the planet
  flybys bent its early path.
- **The discovery** is the moment the craft passes closest to Gliese 445: 44,100 years after launch,
  0.573 pc away, at 115.9 km/s (the published Gaia DR3 recheck is 44.1 kyr, 0.573 pc, 115.9 km/s).
- **The observer** is Gliese 445 at that moment, with the uncertainty of its position and velocity
  worked out from Gaia's own error bars (by calculus, checked against 20,000 random trials).
- Also: the nearest stars to any point at any time, apparent magnitudes, and the brightest stars in a
  sky.

Tests (`epoch.test.ts`): the discovery numbers; the craft's 172.06 AU today and 2.4 light-years from
the Sun at the epoch; the neighbour twist (the Sun is Gliese 445's nearest catalogued star at 1.024 pc
and the fifth-brightest star in its sky, magnitude -0.1); the covariance check.

Known limit: the story's "about 1.06 pc" does not match the Gaia DR3 value, 1.024 +/- 0.002 pc; that
test (`epoch.neighbourDistance`) is left failing on purpose for the lead to change the story text.

## `kinematics.ts`: The Trail

For every star within 10 pc of the craft that has a full measured velocity: the angle between the
craft's motion relative to that star and the line from that star to the craft (zero means "flying
straight away from it"), and distance divided by speed (for the right star, the time since launch).

The error bars come from a **measurement model** (a model, labelled as one): the alien measures every
star as precisely as Gaia measured Gliese 445 from the Sun (0.15 km/s in radial velocity; a distance
error that grows with the square of the distance, as parallax errors do), aimed along its own line of
sight to that star; the craft itself is in the alien's hands, so its state is exact. Each star gets
its own seeded stream of simulated measurements, so the results never depend on catalogue order.

Tests (`kinematics.test.ts`): exactly one star, the Sun, is under 0.1 deg (0.004 deg; the next is
Ran, epsilon Eridani, at 8.6 deg); with errors the Sun is 0.02 sigma from zero and every other star is
at least 61 sigma away; distance over speed for the Sun is 44,100.3 years against 44,100.4 years since
launch, inside its measured 95% range (43,436 to 44,778 years); Gliese 445 itself sits at exactly 90
deg (closest approach).

## `ephemeris.ts`: where the Voyagers are now (epilogue)

Smooth interpolation (cubic Hermite, using both position and velocity at each table row) of the JPL
Horizons tables in `data/ephemeris.json`, the distance between two bodies, light time, and the moment
Voyager 1 reaches a given light time from Earth (scanned day by day, then halved down to a fraction of
a second, because Earth's own orbit makes the distance wobble over a year).

Tests (`ephemeris.test.ts`): every off-table Horizons spot check within 100 km (worst 1.75 km); on 15
October 2026 Voyager 1 is 172.05 AU from the Sun and 23.91 light-hours from Earth, Voyager 2 144.21 AU
and 19.99 light-hours; one light-day is reached on 2026-11-18 at 10:16:18 UTC, 11 seconds after NASA's
10:16:07 (our distance is geometric, from Earth's centre); times outside the tables are refused.
