# How it's checked

Every deduction the player makes in The Finder is the real one. This page lists each deduction, the
physics or history it rests on, the data it uses, the automated test that proves it, and the honest error
bars and caveats. It becomes a page on the site (`/checked/`).

_Status: skeleton written at planning (2026-10-15). Rows fill in as each milestone lands; the results
table is generated from the test output (`docs/checks/results.json`) so it cannot drift from the code._

## The deductions

| # | Chapter | Deduction | Real basis | Data | Test | Status |
|---|---|---|---|---|---|---|
| 1 | Arrival | The heat source is about 44,000 years old | Pu-238 (87.74 y) decays to U-234 (245,500 y), then Th-230 (75,380 y); the Th-230/U-234 ratio grows predictably (activity ratio 0.352 at 44,000 y) | LNHB and NNDC half-lives; MHW-RTG fuel load (`docs/research/clocks.md` 4b); Cassini isotopic mix for the other 20 at.% | `clocks.rtg.ratio`, `clocks.rtg.coverage`, `clocks.rtg.inventory`, `clocks.rtg.heat`, `clocks.bateman` | Checked (M1) |
| 2 | Arrival | Uranium-234 with almost no uranium-238 means the fuel was made, not mined | Natural uranium carries about 18,000 U-238 atoms per U-234; here U-238/U-234 is about 2e-4. The thorium ratios alone cannot tell the chains apart; the missing U-238 does (D-A14) | Same | `clocks.rtg.parent`, `clocks.rtg.wrongChain` | Checked (M1) |
| 3 | The Key | Two marks are binary digits; the unit is hydrogen's spin-flip | The cover's legend; the 1,420,405,751.768 Hz hyperfine line (0.704 ns, 21.1 cm) | `cover.md` 1a; maser value | `units.hydrogen`, `cover.record.rotation`, `cover.picture.lines` | Checked (M1) |
| 4 | The Key | The cover's numbers are times, not lengths | Read as lengths they are absurd (the record's turn would be a million kilometres); read as times they make sense | `cover.md` 1a, 1b | `cover.timeNotLength` | Checked (M1) |
| 5 | The Map | The 14 numbers are pulsar periods, identified among 4,503 catalogue pulsars | Period plus direction today; 44,000 years ahead, also latitude from the height ticks and how sharply each candidate predicts the map's number (D-A16) | ATNF v2.9.0; `cover.json` | `cover.map.periods`, `cover.map.angles`, `identify.today`, `identify.epoch` | In progress (M1) |
| 6 | The Map | The map's origin is a region about 15 pc across that contains the Sun (and about a thousand stars) | Bearings from the 14 identified pulsars; directions good to about 1 deg rms; 1970 distances poor | `cover.json`; ATNF positions, distances, proper motions | `triangulation.today`, `triangulation.epoch`, `triangulation.mirror`, `triangulation.wrongId` | Checked (M1) |
| 7 | The Map | The map is old: it dates itself to about 1971 today, and to about 44,100 years ago at the story's epoch once the periods are moved into the Sun's rest frame | Spin-down with braking indices, glitches, timing noise, observer-frame Doppler, light time, Shklovskii | ATNF; Jodrell Bank glitches and Crab ephemeris; Gaia DR3 for the observer | `dating.today`, `dating.epoch.noReframe`, `dating.epoch.reframe`, `dating.epoch.coverage`, `dating.epoch.outlier`, `dating.epoch.young`, `dating.epoch.velocityFit` | Checked (M1) |
| 8 | The Spot | The uranium spot is about 44,000 years old, and it started pure | Pure U-238 grows U-234 and Th-230 at known rates; two isotopes give both the age and the starting purity | NASA (0.00026 microcurie); LNHB | `clocks.uranium.ratios`, `clocks.uranium.coverage49`, `clocks.uranium.coverage44k`, `clocks.uranium.purity` | Checked (M1) |
| 9 | The Trail | The object came from the Sun; distance over speed is about 44,100 years | Only one star has the object moving radially away from it, even with measurement errors | Stars (HYG v4.2, Gaia DR3 for Gliese 445); Voyager 1 asymptote (Bailer-Jones and Farnocchia 2019) | `trail.unique`, `trail.uniqueWithErrors`, `trail.age` | Checked (M1) |
| 10 | The story frame | Found 44,100 years after launch at Gliese 445; the Sun is then its nearest neighbour (1.02 pc) and fifth-brightest star | Linear motion of the craft and the stars; Gaia DR3 | `scenario.json`, `stars.json`, `sky.json` | `epoch.discovery`, `epoch.craft`, `epoch.neighbours`, `epoch.neighbourDistance`, `epoch.sunBrightness` | Checked (M1) |
| 11 | The Player | One turn every 3.6 s, outside in, 53.8 minutes per side | The cover's binary (33 and 43 bits); the groove spiral sets the direction | `cover.md` 1b | `cover.record.rotation`, `cover.record.playTime`, `turntable.pitch` (M2) | Partly checked (M1; M2) |
| 12 | The Pictures | 8.34 ms lines, vertical, staggered interlace, 512 lines, aspect from the circle | The cover's picture diagrams; measured on the 1977 tape (8.32 ms, 0.23% fast) | `384kHzStereo.wav` (MD5 f543349e...) | `cover.picture.lineTime`, `decoder.circle`, `decoder.slant`, `decoder.frames` | Partly checked (M1; browser M2) |
| 13 | The Pictures | Triples are colour separations | 20 images stored as 3 consecutive frames (Ozma book, the tape) | Tape; image list | `decoder.colour` (M2) | Planned (M2) |
| 14 | The Pictures | Their numerals, units, solar system, height | The record's own definition pictures (frames 3 to 6 and others) | Decoded frames | Content review (science-auditor) | Planned (M5) |
| 15 | Our frame | Where the Voyagers are now; one light-day on 2026-11-18 | JPL Horizons; NASA | `ephemeris.json` | `epilogue.ephemeris`, `epilogue.today`, `epilogue.lightDay` | Checked (M1) |

## Assumptions and honest caveats

- **The story's epoch is a projection.** The alien's catalogue is the real ATNF catalogue and real star
  data, projected 44,100 years forward with documented models: spin-down with braking indices (Crab
  2.342 and Vela 1.7 measured long-term; unmeasured ones drawn from stated ranges), seeded timing noise
  (1% on the measured spin-down rate), observer-frame Doppler, light time and the Shklovskii change for
  an observer at Gliese 445, linear stellar motion, and Voyager 1's asymptote. Old pulsars' tiny glitches
  are neglected (at most 138 years for B1642-03, against 441 from timing noise). Today's values are
  measurements; the future ones are physics applied to them.
- **The neighbour twist uses Gaia DR3:** the Sun is 1.024 pc from Gliese 445 at the epoch. Older
  pre-Gaia figures (about 1.06 pc) differ by 22 sigma. About half the stars within 30 pc lack radial
  velocities; 19 of them could come closer than the Sun only with radial speeds of at least 64 km/s.
- **The map alone cannot tell the Sun from Gliese 445:** in 1971 Gliese 445 was 5 pc from the Sun and
  lies inside the map's 95% region too. The Trail decides it.
- **NASA's flyby figures are inconsistent** (1.6 or 1.7 light-years, "40,000 years", "year 40,272"). We
  use Bailer-Jones and Farnocchia (2019, Gaia DR2), rechecked with Gaia DR3.
- **"Ultra-pure" uranium** is assumed isotopically pure U-238, as NASA's wording implies; the two-isotope
  measurement would reveal otherwise.
- **The uranium spot's position** is not on the cover diagram; ours is a documented choice.
- **The colour order** of the 20 triples cannot be proven from the record alone; shown as "probable".
- **The side break** of the record is unconfirmed; shown as an inference.
- **The pulsar map's own limits:** B1240-64's period was known to 3 figures; the 1970 distances are off by
  up to about 6 times; the height ticks lack a sign.
- **The map's periods date from about 1971**, six years before launch.
- **The decoded pictures** are as the 1977 tape gives them: noisy, with wow and flutter and droop.
- **Five text pages** (President Carter's statement and members of Congress) were added to the record at
  the last minute and are not on the master tape we decode.

## Test results

<!-- generated:results:start -->
_Generated 2026-10-15 from `docs/checks/results.json` by `tools/how-checked.mjs`: 0 of 0 checks pass._

| Test | Claim | Measured | Compared with | Tolerance | Result |
|---|---|---|---|---|---|
<!-- generated:results:end -->
