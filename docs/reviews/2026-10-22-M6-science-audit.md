# Science audit, M6 gate (79bf19d..fa90238, 2026-10-22)

By the `science-auditor` agent (read-only; saved by the lead). Scratch work in
`review/archive/science/m6audit/` (gitignored): a 200-seed audit of the clock combination, the light-day from
`data/ephemeris.json`, 15 targeted Vitest files (85 of 85 pass), `tools/voices/checks.py` (exit 0), and fetches of
NASA's instruments page, the 2026-08-04 Voyager blog, the "where are they now" page and Bailer-Jones and
Farnocchia 2019 (Table 1). Not run by the auditor: the browser tests and the full `npm run check`.

## Claims checked

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 17a | Inverse-variance combination, chi-square, p | PASS | `consilience.math` hand cases; the fixed point settles in 2 passes or fewer on 200 seeds |
| 17b | Sigma from asymmetric 95% intervals (the side facing the combined value) | PASS | rms pull 1.029; mean chi-square 2.786 on 3 dof; 0 seeds at p <= 0.001 |
| 17c | Independence; measured correlation about 0.005 | PASS | rho 0.0051; combined sigma 67.84 against 67.77; half-life systematics move sigma 0.07% |
| 17d | 99.9% acceptance band | PASS | 3.2905 sigma; the truth accepted in 200 of 200 seeds |
| 17e | Coverage 188 of 200 of "the true time since launch" | PASS, wrong truth | binomial band 184 to 196; pull against launch -0.175 (SE 0.071); the map clock's true start is 8.06 to 10.21 years before launch (mean 8.70) |
| 17f | "Map periods measured about six years before launch" (row 17, test notes) | FAIL | the pulsars that carry the map clock date to about 1969.0, 8.7 years before launch |
| 17g | Published passing result for row 17 | UNVERIFIED | no `portrait.*` in the published results (2026-10-16) |
| 8 | Chernoff boundary; 0.11% refused at 99.9%; 5.2% outside the drawn 95% | PASS (Node), UNVERIFIED (page) | 1,049 and 22 of 20,000; natural uranium accepted 0 of 2,000; pure start refused on 0 of 1,993 seeds |
| 8x | Row 8 "band 0.07 to 0.17%" | FAIL (label) | that is the Wilson interval of the measured rate; the test's band is 6.6 to 33.4 refusals (0.033 to 0.167%) |
| 16 | Machine tones refused, animals accepted | PASS (re-run), UNVERIFIED (page) | machine 3.86 to 13.77 cents, creatures 17.79 up; leave-one-out misses Ozma 03 at 234.77 s |
| 15a | Voyager 1 runs 2 of 10, Voyager 2 runs 3; dates and reasons | PASS | NASA instruments page (2026-04-17) matches every row; Voyager 2's CRS "slated to be shut down in 2026" |
| 15b | About 4 W a year; "Big Bang"; "at least an extra year" | PASS (NASA's words) | NASA blog 2026-08-04 |
| 15c | One light-day on 2026-11-18 | PASS, minor | computed 10:16:17.50 UTC; screen and research note say 10:16:18; NASA's 25.902e9 km equals c x 86,400 s |
| 15d | "Takes a full day (to within seconds)" | PASS | at the crossing up-leg +4.86 s, down-leg -4.86 s; never back below one light-day through 2039 |
| 15e | Past tense "takes more than a full day" | FAIL (16 h window) | down-leg light time stays under a day until 2026-11-19 02:18 UTC |
| 15f | Gliese 445 0.573 pc at 44,100 yr against the published 0.575 pc at 44.0 kyr | PASS | ours 0.5734 pc, 1.870 ly, 115.90 km/s, AD 46078; Table 1: 44.0 (44.0 to 44.1) kyr, 0.575 (0.574 to 0.576) pc, 116.0 km/s |
| 15g | NASA popular "1.6 to 1.7 ly in about 40,000 years", sourced to the where-now page | FAIL (provenance) | that page has no Gliese 445 content |
| 15h | Map epochs 1966.6 to 1971.8, mean 1969.7 | PASS | mean 1969.67, sd 1.32; Crab 1971.76, Vela 1971.75 |
| 15i | The diagram keeps distances true | PASS | within 0.002 pc |
| 15j | Browser checks (chapter.epilogue, chapter.portrait, bot.game, a11y) | UNVERIFIED | not run by the auditor |
| T1 | About 120,000 times the Earth-Sun distance | PASS | 1.870 ly = 118,300 AU |
| T2 | Plutonium all gone by the Finder's time | PASS | 503 half-lives |
| T3 | Earth 4.5 billion years by zircons, meteorites and Moon rocks | PASS (loose) | meteorites give 4.54; zircons and Moon rocks are consistent lower bounds |
| T4 | Ferris; the hand-etched line | PASS (research note) | |
| T5 | "About 17 km further every second" beside km from Earth | FAIL (loose) | 16.92 km/s from the Sun; the Earth range rate varies, +25.4 to -7.65 km/s |
| T6 | "A radio message takes almost a whole day" | FAIL after 2026-11-17 18:24 UTC | static text |
| T7 | "The map clock counts from 1971; the clocks differ by a few years" | FAIL | from about 1969.0; the clocks scatter by hundreds of years from noise |

## Findings, ranked

**High**
1. The published test results are stale (`docs/HOW_ITS_CHECKED.md` results section and `docs/checks/results.json`
   from 2026-10-16): none of the M6 check ids appear, and `clocks.uranium.purity05` still reads 2.7%. Rows 8, 15,
   16 and 17 are UNVERIFIED on the page until `npm run check` passes and the page is rebuilt.

**Medium**
2. Portrait is tested against the wrong truth (`portrait.test.ts:36`, launch time) and the map's head start is
   misstated as "about six years" (`:167`, `:210`, row 17). Fix: compare against the sum of weight times each
   clock's own truth (the map's as `trail.test.ts` computes it); report both pulls; "about 9 (8 to 10) years".
3. "The clocks differ by a few years" (`src/tour/script.ts:597`, `src/chapters/epilogue/MapOlder.tsx:136`) is
   wrong: they scatter by hundreds of years from noise; the head start is invisible at a combined sigma of 68 yr.
4. The "bright band" can point at nothing: no four-bar overlap in 10 of 200 seeds; three-bar segments reach
   outside the 99.9% acceptance in 194 of 200. The map's own 95% bar is accepted in 200 of 200: point the player
   into that bar, and test it.
5. "4 W a year as the plutonium decays" (`Listening.tsx:92`, `script.ts:583`) gives the whole loss to decay;
   decay is about 1.7 W a year (estimate at about 220 W electrical, UNVERIFIED), the rest is ageing thermocouples.
6. The NASA "popular wording" Gliese 445 row is sourced to a page with no Gliese 445 content
   (`tools/data/build-epilogue.mjs:161`).

**Low**
7. The past-tense light-day sentence is wrong for 16 hours (`src/chapters/epilogue/format.ts:58`).
8. "Almost a whole day" in the tour becomes false from 2026-11-17 18:24 UTC; "17 km further every second" is from
   the Sun, not Earth.
9. Row 15 says 10:16:17, the screen 10:16:18 (computed 10:16:17.50); `docs/research/epilogue.md:53` and
   `src/science/ephemeris.test.ts:83` call 10:15:51 UTC "from the Sun": it is voyager.md's Earth crossing; the
   Sun-centred crossing is 2027-02-03 21:39 UTC.
10. Bailer-Jones and Farnocchia's time is from about 2019, beside "years after launch" (42 years apart): label it;
    ours (0.5734 pc) lies just outside their 5 to 95% range; the 0.01 pc test tolerance is chosen, not computed.
11. "Measured in 1970 and 1971" contradicts the strip on the same screen (epochs from 1966.6).
12. A Portrait check is a tautology (`portrait.test.ts:107`, `:166`: `own.ok === inBand`).
13. `src/chapters/seedCheck.ts:14` says the seed list never selects on the truth: no longer accurate.
14. The machine-tone gap rests on one whale call (verdicts unaffected); "held one pitch exactly" overstates 13.8
    cents; the 3.7 kHz line is tracked at 1851 Hz, an octave down.
15. "Clocks that share nothing" overstates (fuel and spot share U-234's half-life; map and journey share the
    Finder's motion); the zircon and Moon-rock ages "agree with" 4.5 billion years.

**Argon's first review:** item 1.2 (pulsar back-projection 1/d) is about 0.02 deg against map bearings good to about
1 deg: does not matter. Item 1.4 (planets' 1970s values) changes no deduction: carry to M7.

## The lead's response

Every finding above is fixed in the commit that follows this file (see its message), except: 1 (closed by the full
check and the regenerated page in the V1.0 commit), 5's 220 W figure (the wording now names both causes without a
number), and 1.4 (carried).
