# How it's checked

Every deduction the player makes in The Finder is the real one. This page lists each deduction, the
physics or history it rests on, the data it uses, the automated test that proves it, and the honest error
bars and caveats. It becomes a page on the site (`/checked/`).

_Status: skeleton written at planning (2026-10-15). Rows fill in as each milestone lands; the results
table is generated from the test output (`docs/checks/results.json`) so it cannot drift from the code._

## The deductions

| # | Chapter | Deduction | Real basis | Data | Test | Status |
|---|---|---|---|---|---|---|
| 1 | Arrival | The heat source is about 44,000 years old | Pu-238 (87.74 y) decays to U-234 (245,500 y), then Th-230 (75,380 y); the Th-230/U-234 activity ratio grows predictably (about 0.35 at 44,000 y) | LNHB half-lives; MHW-RTG fuel load (`docs/research/clocks.md` 4b) | `clocks.rtg` calibration | Planned (M1) |
| 2 | Arrival | Uranium-234 with no uranium-238 means the fuel was made, not mined | U-234 in nature always comes with U-238; alone, it is the daughter of Pu-238 | Same | `clocks.rtg.parent` | Planned (M1) |
| 3 | The Key | Two marks are binary digits; the unit is hydrogen's spin-flip | The cover's legend; the 1,420,405,751.768 Hz hyperfine line (0.704 ns, 21.1 cm) | `cover.md` 1a; maser value | `cover.binary`, `units.hydrogen` | Planned (M1) |
| 4 | The Key | The cover's numbers are times, not lengths | Read as lengths they are absurd; NASA: the transition is "the fundamental time scale" | `cover.md` 1a, 1b | `cover.timeNotLength` | Planned (M1) |
| 5 | The Map | The 14 numbers are pulsar periods, identified uniquely | Period plus direction against the 4,503-pulsar ATNF catalogue | ATNF v2.9.0; `cover.json` | `pulsars.identify` (today and story epoch) | Planned (M1) |
| 6 | The Map | The map's origin is a region about 20 pc across near the Sun | Bearings from 14 known pulsars; directions good to about 3 deg; 1970 distances poor | `cover.json`; ATNF distances | `triangulation.region` | Planned (M1) |
| 7 | The Map | The map is old (dated by spin-down) | Pulsars slow at measured rates; braking indices; glitches; observer-frame Doppler | ATNF; Jodrell Bank glitches and Crab ephemeris | `pulsars.dating.today` (about 1971), `pulsars.dating.epoch` | Planned (M1) |
| 8 | The Spot | The uranium spot is about 44,000 years old | Pure U-238 grows U-234 and Th-230 at known rates; two isotopes give both the age and the starting purity | NASA (0.00026 microcurie); LNHB | `clocks.uranium` calibration | Planned (M1) |
| 9 | The Trail | The object came from the Sun; distance over speed is about 44,000 years | Only one star has the object moving radially away from it | Stars (HYG / Gaia DR3); Voyager 1 asymptote (Bailer-Jones and Farnocchia 2019) | `kinematics.unique`, `kinematics.age` | Planned (M1) |
| 10 | The Player | One turn every 3.6 s, outside in, 53.8 minutes per side | The cover's binary (33 and 43 bits); the groove spiral sets the direction | `cover.md` 1b | `cover.record`, `turntable.pitch` | Planned (M1, M2) |
| 11 | The Pictures | 8.34 ms lines, vertical, staggered interlace, 512 lines, aspect from the circle | The cover's picture diagrams; measured on the 1977 tape (8.326 ms) | `384kHzStereo.wav` (MD5 f543349e...) | `decoder.circle`, `decoder.slant`, `decoder.frames` | Planned (M1, M2) |
| 12 | The Pictures | Triples are colour separations | 20 images stored as 3 consecutive frames (Ozma book, the tape) | Tape; image list | `decoder.colour` | Planned (M2) |
| 13 | The Pictures | Their numerals, units, solar system, height | The record's own definition pictures (frames 3 to 6 and others) | Decoded frames | Content review (science-auditor) | Planned (M5) |
| 14 | Our frame | Where the Voyagers are now; one light-day on 2026-11-18 | JPL Horizons; NASA | `ephemeris.json` | `ephemeris.spotcheck` | Planned (M1, M6) |

## Assumptions and honest caveats

- **The story's epoch is a projection.** The alien's catalogue is the real ATNF catalogue and real star
  data, projected about 44,000 years forward with documented models (spin-down with braking indices,
  seeded timing noise and glitches, linear stellar motion, Voyager 1's asymptote). Today's values are
  measurements; the future ones are physics applied to them.
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
(Generated from `docs/checks/results.json` once M1 tests exist.)
<!-- generated:results:end -->
