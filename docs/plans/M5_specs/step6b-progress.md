# M5 step 6b: where it paused (2026-10-16)

Paused at Stewart's request (quota). The spec is `docs/plans/M5_specs/step6b-pictures-audit-fixes.md`. The
code and test fixes are done (committed with this note if the full check passed: see PROGRESS); the
documentation items below are left.

## Done (code and tests)
- **`pictures.colour` (finding 5):** accepts on an absolute likeness of at least 0.412, the midpoint of the
  measured gap (non-pictures at most 0.236, R068, over 132 windows; colour pictures with a scene at least
  0.588, R073, over 19); the test recomputes both edges from the 96 kHz decodes (within 5e-4) and reports
  the Gaussian equal-error point (0.373) for comparison; all 152 windows classified as the frame list
  says. The solar spectrum (0.144) is accepted on the frame list, its message saying the frames are too
  faint to confirm it. The order message: "as most readers of the tape assemble them (one reads blue,
  green, red)". Caveat recorded: the threshold is fitted on the windows it is tested on.
- **The planets per cell (finding 6), decided by the lead:** each cell against its own written precision
  (half a unit in the last written figure; trailing zeros of a whole number not counted; a unit fraction
  half a unit of its denominator; Earth's own cells skipped; Uranus, Neptune and Pluto as 1977 estimates,
  not tested). 17 cells within precision; 8 beyond it, now a stated list of the senders' discrepancies
  (cause UNVERIFIED): Mercury's diameter, mass and day; Venus's diameter and (marginally) mass; Jupiter's
  diameter; Saturn's distance and day. The test passes only if the set beyond precision is exactly that
  list. The record cites the 2026-10-16 check against NASA's sheet (Mars 228.0 against 227.9).
- **The M3 checks on the cover's raster (finding 9):** `measure.ts` `coverRaster` and `decodeCover` (the
  first 512 lines); the values are the M1 values again (interlace comb 8.379 / 0.585; sync wobble 7.98;
  polarity 74 / 69 frames; aspect 1.0006; slant -4.98). The album still decodes 536 lines.
- **The identification under a wrong model (finding 10):** check `identify.misspecified`, 150 seeds per
  case: two-state timing noise, noise amplitude measured twice as badly as assumed, old braking index U[1,
  5]: 0 wrong of 2,100 lines in each (the second case's weakest right line fell to odds of 10^0.2).
  `identify.ageModel` states the half-life systematic (133 yr, tail 2.0e-6).
- **Records (finding 12):** `pictures.numerals` and `pictures.slip` each have a recorded check.
- **Wording:** `pictures.height` refusals show enough figures to tell readings apart; `pictures.down`
  speaks of people only for pictures with people (a hand-picked `PEOPLE_IMAGES` set: a judgement).

## Left for the next session
- `docs/HOW_ITS_CHECKED.md` rows 5 (the direction, Doppler and braking-index cuts are hard cuts; add
  `identify.misspecified`), 13 (the absolute threshold), 14 (per-cell precision and the 8 stated
  discrepancies instead of "within 5%"; the NASA check instead of "recalled, not fetched"; list
  `pictures.numerals` and `pictures.slip`).
- `src/chapters/pictures/checkersM5.ts` is 432 lines: split it.
- The general hint "turned so that people stand" in `src/game/nodesM5.ts` (`pictures.down`) to match the
  new wording.
- (Done by the lead at the pause: D-A30's and D-A19's amendments and the `checks.py` note, 2.6 standard
  errors.)
