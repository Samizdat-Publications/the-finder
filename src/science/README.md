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
| `nuclides.ts` | The nuclear data for the clocks (half-lives with their uncertainties, masses, how much heat each decay leaves) with a source for every number, the decay-chain solver (Bateman equations) that says how much of each isotope exists after any time, and the helper that carries half-life uncertainties into an age. |
| `clocks.ts` | The uranium spot on the cover: how its daughters grow, simulated alpha counting, the age with an honest 95% range, and the test of what it started as. It also re-exports everything in `rtg.ts`, so other code can import every clock from one place. |
| `rtg.ts` | The plutonium heat sources: what they turn into, how warm they still are (as a range), the age from the thorium ratio, and the check that rejects the wrong decay chain. |

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
- Half-life uncertainties are carried into each clock as a separate systematic, reported next to the
  statistical range (thorium clock in the heat source: about 137 years at 44,000 years; uranium spot:
  about 110 years).
- Every test that proves a claim writes a record for How it's checked (`tests/support/record.ts`).

## Assumptions to know about

- The uranium spot began as isotopically pure uranium-238 (NASA says "ultra-pure"); the purity test
  shows the measurement itself can check this.
- Before counting, uranium and thorium are separated chemically, and the detector is equally efficient
  for every alpha line.
- The RTG plutonium was 80% plutonium-238 by atoms (LA-5202); the other 20% is split like the Cassini
  RTG fuel; the plutonium-239, uranium-235 and uranium-236 amounts and the small uranium-238 readout
  rest on that split and on no uranium impurity in the fuel. The heat is given as a range: the top
  assumes radon stays in the fuel (its daughters add about 3.9 W at 44,000 years), the bottom that it
  escapes. Gamma rays are counted as heat, so the top is a slight upper bound.

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
and the fifth-brightest star in its sky, magnitude -0.14); the covariance check.

The older "about 1.06 pc" (pre-Gaia, Wikipedia) differs from the Gaia DR3 value, 1.024 +/- 0.002 pc;
the story now uses the DR3 value, and `epoch.neighbourDistance` checks it against Gliese 445's closest
approach to the Sun computed in closed form. The Sun's brightness uses absolute magnitude 4.81 (Willmer
2018) rather than HYG's 4.85. The motion is straight-line, as in the research's Gaia DR3 recheck; the
published Bailer-Jones and Farnocchia result used a Galactic potential and counts from the Gaia epoch.

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

## `pulsars.ts`: the map's periods, dating the map today, identification

Reads each map line's binary number as a period (N hydrogen periods), runs pulsar spin-down forward
and backward with a braking index, and works out the date each period belongs to from the modern
catalogue. The rule for which catalogue terms to trust: the first two always; the third only when it
implies a braking index a real pulsar can have (0.9 to 4), which only the Crab's does (the others'
third terms are timing noise). Glitches (sudden spin-ups) can be added back for the years between the
map and the catalogue epoch. A pulsar whose date is more than 10 standard deviations of the others from
their mean is set aside by rule (only B1240-64, whose period Sagan knew to 3 figures). Identification
searches all 4,503 pulsars: direction within 5 degrees of the map angle, then an elapsed time that fits
a stated window for some braking index, Doppler shift and map precision.

Tests (`coverMap.test.ts`, `pulsars.test.ts`): the 14 numbers decode to the 1972 table within 1 ns;
every map angle within 2.7 deg of the pulsar's longitude; the spin-down formula matches a step-by-step
integration to 1e-9; every implied date in `clocks.md` Table 3a within 0.05 yr (Crab 1971.76; Vela
1972.21 raw; mean of 13 1969.75, s.d. 1.41); the hydrogen constant changes no date by more than
0.02 yr. Glitch-corrected Vela is 1971.75 +/- 0.24 (systematic, from the pre- versus post-glitch slope),
in agreement with the Crab, which needs no correction. The correction adds back every glitch after the
solved date up to and including the catalogue epoch: Vela's catalogue values are the fit just after its
January 2000 glitch (Dodson, McCulloch and Lewis 2002), so that glitch counts. (The research's 1971.77
left it out and added one from before the solved date.)

## `pulsarEpoch.ts`: the pulsar sky 44,000 years from now (a projection)

Every catalogued pulsar as the observatory at Gliese 445 would measure it at the discovery epoch: spun
forward with a braking index (Crab 2.342 and Vela 1.7 as measured; others drawn from a stated range,
or 3 in the "nominal" version); the signal's light-travel offset; the Doppler shift from Gliese 445's
114 km/s; the small change from seeing the pulsar from a slightly different place (parallax) and its
sideways motion (Shklovskii); timing noise on the slow-down rate (an assumption: half the measured
peak-to-peak switching, 1.27% for B1642-03 and 0.42% for B0950+08 from Lyne et al. 2010, and 0.85%, the
median of Lyne's 17 pulsars, for the rest); positions moved by proper
motion and seen from Gliese 445. Each pulsar draws its own seeded randomness by name, so the order of
the catalogue never matters. The true values are kept in a separate block that only tests read.

## `pulsarAge.ts`: dating the map from the alien's measurements

For each pulsar, the time since the map was made, with a 95% range from 2,000 simulated "what ifs":
the unknown braking index, timing noise, the map's last binary digit, and (after The Trail has found
the Sun) the uncertainty of the home star's own position and velocity and of each pulsar's distance.
The old pulsars are combined by a robust rule (drop the most inconsistent pulsar while it is more than
4 sigma from the rest), the young ones serve as checks. The alternative, `fitAgeAndVelocity`, needs no
star catalogue: it fits one age and the home star's velocity to the old pulsars together.

Tests (`pulsarEpoch.test.ts`, `pulsarAge.test.ts`): the Doppler sign and size; the light-time bound;
glitches of the old pulsars below their timing noise; determinism; without the reframe each old
pulsar is off by exactly the predicted -2 tau_c (V . n) / c (within 1.5%), thousands of years; with
it, under the stated model, the combined 95% range contains the truth in 95.0% of 300 realizations
(median half-width about 210 yr, median error 3 yr); B1240-64 is dropped in every realization; the
young pulsars' ranges hold their truth in 93% to 100% (their braking-index range, 0.9 to 3.2, is a
judgment call); the velocity fit's 95% region holds the true velocity in 93.5% of 200 realizations
(vertical component weakest, about 4 km/s rms). When the truth breaks the model (old braking indices
really 1 to 5, two-state switching noise, the old pulsars' glitches left in) the range still holds the
truth in 91% to 97% of 100 realizations each (gate 80%). Glitch bias is one-sided and does not average
down, but it is a few years against a combined sigma of about 110 yr.

## `triangulation.ts`: where the map was made

Fits the map's origin and a common rotation to the 14 bearings in the galactic plane, with a robust
(Huber) loss and the angle scatter estimated from the fit itself (Huber's Proposal 2, consistent for
Gaussian errors); the line lengths are weak,
heavy-tailed hints with a free scale. The 95% region comes from 2,000 refits with simulated angle
noise and redrawn pulsar distances.

Tests (`triangulation.test.ts`): today and 44,000 years on the region contains the Sun (95% semi-axes
about 15.7 by 7.1 pc, so about 31 by 14 pc across, roughly 1,000 catalogued stars, against Sagan's
"about 20 pc, 1 in 10^3 stars"); in 200 simulated maps the region contains the true origin 93% of the
time; the mirrored reading and a swapped identification fit far worse.

## `pulsarIdentify.ts`: which pulsar is which, 44,000 years on (match quality)

After the same direction and age pre-selection, every surviving candidate gets a likelihood from three
computed factors: how sharply it predicts the map's own number (spinning its measured state back over
ages drawn from the RTG clock's range, with an unknown braking index and Doppler shift: an old pulsar
predicts the number sharply, a young one smears it), its direction (moved back by its own proper
motion), and its latitude where the map's tick shows one. Map distances are not used (scale unknown,
off by up to 6 times). The angle scatters are the alien's own estimates from its best matches. Each
line's answer is its most likely candidate; the margin is the likelihood ratio to the runner-up, and
the odds compare it with all the other candidates combined.

Identification today trusts each 1970/71 period to max(its stated digits, 0.4 ppm), the accuracy
Johnston measured against the 1975 catalogue; with that every line has exactly one candidate.
B2016+28's implied date, 1966.6, precedes its 1968 discovery: its period was good to about 8 figures.

Pass 2 (the alien's real order of work): the lines matched with a margin of at least 20 become
anchors; they give the shared age (the pulsar-only fit, which drops B1240-64) and the map's origin
(leaving a line out when scoring that line). Every line is re-scored with its direction seen from that
origin and a weak, heavy-tailed distance factor from the map's lengths (scale and spread measured on
the anchors: about 10.4 kpc per centre-line length, which is the old 10 kpc galactic-centre distance,
and a spread of a factor e). This settles B1929+10, the one line pass 1 left ambiguous (J1916+1225 has
almost the same period 1.2 deg away; from Gliese 445's own position B1929+10, 310 pc away, looks 1 deg
off by parallax): margin 10^2.1 nominal, at least 10^1.8 over 20 seeded realizations.
