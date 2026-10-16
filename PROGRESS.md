# PROGRESS

_Last updated: 2026-10-16 by build session 2 (Opus 5.5): PAUSED at Stewart's request (quota) until next
Thursday, at a clean checkpoint inside the M5 gate. Update after every meaningful chunk._

## Current milestone

**M5: The pictures complete, and The Voices (paused inside its gate).** Plan: `docs/plans/M5.md`; specs in
`docs/plans/M5_specs/`. Live and deployed: The Pictures complete (eight deductions) and The Voices (four);
43 deductions, bot.game plays them all from a fresh save; Edge passes every browser test. The M5 science
audit (`docs/reviews/2026-10-16-M5-science-audit.md`) found five checkers to fix. At the pause:
- **6b (The Pictures and the identification): code done**, committed with this update if the full check
  passed (see the commit log); its documentation items are left: `docs/plans/M5_specs/step6b-progress.md`.
- **6a (The Voices): partly done, not wired in**: item 1 half done (`tools/voices/others.py`, not imported),
  the octave design found, items 3 to 5 not started: `docs/plans/M5_specs/step6a-progress.md`. Until it
  lands, the live Voices chapter still has the audited faults (the whale check on other tracks, the octave
  test, the "cannot give 55" claim, the hearing wording).

**M4 closed (2026-10-16):** The Map, The Spot and The Trail playable after The Key; 31 deductions from a
fresh save (bot.game); a science audit, a QA audit and two blind critic passes, every finding fixed or
carried with a decision; `npm run check` green (328 unit tests, 19 browser tests, 147 checks); deployed
and live-checked.

**Preview (the slice and M4):** https://the-finder.stewartgregerson.workers.dev/play/

## Done

- 2026-10-15 (planning session): plan approved; research, rules, handoff, agents, repo.
- 2026-10-15 (build session 1): M1 step 0 (skeleton, check runner, source manifest and fetch; every
  M1 source downloaded and verified, including the 1.46 GB image tape, MD5 matching).
- 2026-10-15/16 (build session 2):
  - **M1, ground truth (all steps).**
    - The reference decoder (`tools/ref-decoder/`): all 156 frames found from the signal alone and
      decoded from the 1977 tape; droop measured from picture content (L 448, R 246 samples); the
      circle's geometry is a procedure self-test, the independent checks are the line period against
      the research (3197.42 samples at the start of the reel), the frame starts against Barry (155 of
      156), and registration against nine clean NASA images (aspect -0.92 +/- 0.33%, shear -1.40 +/-
      0.08%: detected, invisible, left uncorrected, D-A19). Pictures sent to Stewart
      (`docs/progress/2026-10-15-*`).
    - The data (`data/`, `tools/data/`, 133 data checks then; 135 now): cover, 4,503 pulsars, glitches, Crab, 3,934
      stars within 30 pc (Gaia DR3 for Gliese 445), 8,338 naked-eye stars, Voyager ephemeris (Hermite
      max error 1.75 km), scenario; byte-identical rebuilds.
    - The science core (`src/science/`): units, seeded randomness, statistics, coordinates, nuclides,
      clocks and RTG (uranium spot and fuel: 95% coverage 96.2% and 95.6% of 1,000 trials, half-life
      systematics propagated, heat 4.9 to 8.7 W), epoch (discovery 44,100 yr after launch at 0.573 pc;
      the Sun is Gliese 445's nearest star at 1.024 pc and fifth-brightest at -0.14, D-A15), the trail
      (only the Sun, by 8.6 deg; stars without radial velocities proven harmless), the ephemeris
      (one light-day on 2026-11-18 10:16:18 UTC), pulsars (map dated today: Crab 1971.76, Vela 1971.75
      with the PEPOCH glitch, 1971.51 with the pre-glitch slope; at the epoch: reframed coverage 93.7%,
      median half-width 153 yr, misspecification runs 90 to 97%; per-pulsar timing noise, D-A20;
      B1240-64's wrong period about 3,500 yr early as predicted; likelihood identification right on all
      14 lines, D-A16), triangulation (95% region about 31 by 14 pc holding the Sun and about 1,070 (now 30 by 14 pc and 1,012 after
      the companion radial velocities and the Birge scaling; The Map's own region holds 1,007)
      stars; coverage 93%).
    - How it's checked: generated from the tests; 65 checks, all passing. Two science audits (the
      second scoped to the fixes) with every finding fixed or recorded.
    - Story corrections from the computed science: D-A13 (no "no plutonium"), D-A14 (the wrong-chain
      lesson rests on the missing U-238), D-A15 (the neighbour twist, strengthened).
  - **M2, engines and scaffold (all steps).** Vite site (`/`, `/play/`, `/checked/`), Cloudflare config
    and first deploy; `Play The Finder.bat`; Playwright harness (captures, audio probe, browser-test
    runner, live smoke test); media pipeline (31 Opus tracks, the picture side, 156 FLAC slices,
    `data/record.json` with the side break as an inference, D-A17, D-A18); the browser decoder
    (`src/dsp/`: all 156 frames pixel-identical to the reference; about 40 to 80 ms per frame in the Worker, load-dependent);
    the turntable (`src/record/`: pitch exact to 3e-8, reverse, run-out, the real record); the
    instrument bench on `/play/` with the command bus and the harness API.

- **M3 steps 1 to 7 (2026-10-16):** the game shell (hub ring, workbenches, codex, settings, hints, saves,
  no-spoilers questions); the cover as exact SVG (533 binary digits verified, 0.26 mm against NASA's (measured once in M3 step 2 from a gitignored landmark file; not a recorded check)
  photo); NASA's Voyager model at 465 KB; the encounter scene under the sky computed for AD 46,078 (the
  Sun at -0.82 in Orion; Milky Way from Gaia; D-A21 physical star colours); Arrival (four computed
  deductions), The Key (strokes, the hydrogen atlas, times not lengths; D-A22 alien units), The Player
  (turntable to the cover's drawing, the groove microscope, the first sound), The Pictures (free-running
  decoder to the round circle and the first frames); sound v1 (synthesized cues and beds, captions);
  `docs/research/key-physics.md`. Browser tests report a pass on retry as FLAKY.

- **M3 step 8 (2026-10-16):** the slice bots (18 deductions from a fresh save; 43 wrong answers, each
  rejected with its computed result), one shared AudioContext, the filmed run with sound; the Gemini
  video critic is blocked by the Gemini project's spend cap (nothing charged; `docs/NEEDS_STEWART.md`).
  Deployed; live game check; Stewart sent the playtest link with three questions (answers pending).
  Blind player-critic review: `docs/reviews/2026-10-16-M3-player-critic.md` (pictures 8/10, layout 4/10;
  decisions recorded).
- **M4 so far (2026-10-16):** plan with the deduce-on-the-instrument rule; D-A23; the galaxy chart (the
  alien's pulsar catalogue at the epoch, the map overlay, the origin region) and the neighbourhood chart
  (the trail, star by star); the 13 deductions of The Map, The Spot and The Trail; the shared epoch model
  (identification, ages in both frames, motion fit, region, trail; default seed: 14 of 14 lines right,
  combined map age 44,068 yr, 95% 43,930 to 44,210; the motion fit alone 44,050 +/- 92 yr then, +/- 141 yr after the Birge scaling in step 7b);
  `mapPointsAtEpoch` moved into the science core (same numbers).

- **M3 step 8b (2026-10-16):** the layout pass: one screen per instrument at 1440x900 and 1366x768, clue
  text 13/15 px at 4.5:1 or better (contrast test over the theme tokens), one unit system with powers of
  ten, a ring legend and a glow on finished chapters, the encounter scene filling Arrival (D-A25).
  Deployed; live game check passes. Research note on the galaxy chart's constants. Star data: 187 near
  companions take their primary's radial velocity (85 stars within 10 pc of the craft still lack one,
  down from 105; the trail still picks out only the Sun).

- **M4 steps 3 to 6 (2026-10-16):** The Map (align the map to the Galactic centre, match each line to its
  pulsar with computed match quality, the spin-down clock, ages across the sky and the motion axis, the
  origin region: 14 of 14 lines, region 30 by 14 pc with 1,007 stars, the alien's own star inside), The
  Spot (detector sweep to the hidden spot, alpha counting with error bars that narrow, the two-clock purity
  test: about a day of counting gives 44,124 yr, 95% 42,786 to 45,506; natural uranium rejected at
  p < 1e-12; detector D-A24), The Trail (only the warm-white star fits: its catalogue angle is 0.0043 deg; the player sees a measured
  angle, 0.511 deg against a 0.574 deg cut for the default seed, and the next star 8.55 deg against 0.063;
  distance over speed 44,100 yr; the neighbour twist; the region view; the reframe: 44,068 yr, 95% 43,930
  to 44,210, the motion agreeing within about 1 sigma). Measured quantities from a million up read as
  powers of ten; captions in the top bar. D-A26, D-A27.

- **M4 step 7 and the audit (2026-10-16):** sound for the new moments and a key and bed per chapter;
  bot.game (31 of 31 from a fresh save, 95 s) and bot.m4Wrong (27 wrong answers); the science audit
  (`docs/reviews/2026-10-16-M4-science-audit.md`) and its fixes: `map.periods` judged on pass-1 anchors;
  the Trail shows measured values against a computed 95% cut (coverage 94.1% and 94.3%); the Map's axis
  cost shown live; the motion fit Birge-scaled (axis coverage 96.0%, velocity 94.5%, from 93.7% and
  90.5%); purity calibrated at 5% with the accepted starts shown; tracer and shielded-laboratory
  caveats. D-A28. Research for M5: the teaching frames (heights printed 155 and 160 cm; the planets
  table; the last column cut at our decode's edge) and The Voices (silence cannot count the 55
  greetings; no cutoff in the recorded band).

- **M4 steps 7d and 7c (2026-10-16):** `trail.origin` and `trail.where` accept the right star at 99.9%
  (refusal 0.15% and 0 of 2,000), drawn bars stay 95%; Start over cycles through 1,974 validated seeds
  (`data/seeds.json`, 26 of 2,000 candidates excluded, failing 28 checks between them: 19 by `map.identify`, 5 by `map.motion`, 4 by
  `trail.origin`); every checker message writes quantities as tokens rendered in the alien's units (0
  unit words in 121 rendered messages with the gloss off); past rejections marked "your last proposal".

- **M4 step 7e and the gate (2026-10-16):** five staged moments for the big discoveries, results led by a
  headline with the working folded, the epoch model's heavy parts in a Worker (entering The Trail: the
  longest task fell from 996 ms to under 65 ms), scroll cues, quiet tallies, the Spot's low lamp, chart
  label declutter, old saves moved to validated seeds (D-A29); the browser-test runner retries a dropped
  page load. Second blind critic pass: satisfaction 8, layout 6 (from 4), would keep playing 8.

- **M5 step 0 (2026-10-16):** the identification draws the map's age from the Arrival clock's own error
  model and models each pulsar's timing noise (14 of 14 lines in 500 of 500 seeds; validated seeds 1,993
  of 2,000); the decoders take the tape's whole raster, 536 lines per picture (D-A30: the cover's 512 cut
  the planets table's last column; Pluto's column now whole and, read in full, breaking the table's own
  order); the M4 polish batch (D-A31). Deployed and live-checked; 342 unit tests, 149 checks.

- **M5 steps 3 and 4 (2026-10-16):** The Pictures complete: the album of all 156 frames, colour from the
  20 triples (Earth in colour from three passes of the tape), the 66 sideways pictures turned upright, the
  senders' numerals matched to the Finder's own glyph numerals (the alien script given a job) and their
  sums read back, their units from hydrogen (their second 1.148 beats, within 0.03% of the SI second), home
  as the column of ones, the slip in Pluto's distance, their heights (1.17 and 1.13 reaches); planets'
  test values checked against NASA's fact sheets. The Voices: the rest of the record on the turntable
  with its spectrogram; 63 to 226 voices by silence (above NASA's 55: some greetings pause inside), their
  hearing at least 17.1 kHz, an octave of 1199.3 cents cut into 12 equal steps, the whale song (D-A32);
  DSP in TypeScript matched to a Python reference and to the browser Worker.

- **Edge (2026-10-16):** every browser test passes in the installed Edge, 21 of 21, audio included
  (`FINDER_BROWSER=msedge node tools/harness/browser-tests.mjs`); the whole-game bot needed one retry (a
  click timed out at 120 s). M6 is planned (`docs/plans/M6.md`).

## In flight

- **The guided tour (2026-10-16 evening, Stewart's note in docs/STEWART_FEEDBACK.md, D-A33):** the script
  (`src/tour/script.ts`, every deduction in one order) and the live Voyager-now panel are in; the guide
  panel and story cards (spec `docs/plans/tour_specs/T1-core.md`) and the "Do it for me" actions with the
  tour bot (`T2-actions.md`) are being built by two helpers. M5's audit fixes (below) wait until after.

## Known issues and open questions

- **QA audit (M3 and M4 gate, 2026-10-16):** all its code items are fixed (7e: no long freeze entering a
  chapter, old saves' seeds, contour text, Trail chart labels; the doc items earlier). Still open from it:
  M4 screens can need an inner scroll at 1440x900 once results accumulate (scroll cues now mark it), and
  the Map's tool panel can cover up to half the chart until folded (both in the M5 polish batch).
- **A stray folder from the QA script** (`C:\Users\stewa\Documents\Claude\Golden%20Record\`, five PNGs,
  outside the repo): left for Stewart to delete or keep (`docs/NEEDS_STEWART.md`).

- **Fixed (M5 step 0a): identification at the epoch failed for about 1% of seeds** (19 of 2,000 candidate
  seeds, from the hard age window `U[t_lo, 2 t_hi]`). The map's age now comes from the Arrival clock's own
  error model and each candidate's spin-down from its timing noise, cut only beyond 1e-6 tails
  (`src/science/identifyPrior.ts`, D-A16 amended). `identify.epoch` over 500 seeds: 7,014 of 7,014 lines
  right (17 seeds had the clock's 95% interval above the true age); `identify.ageModel` checks the tails.
  `data/seeds.json` rebuilt: 1,993 of 2,000 listed, 7 excluded (map.motion 3, trail.origin 4; map.identify
  0). Side effect: on old lines every competitor the pre-selection keeps is now young, so map.periods'
  "less well than another pulsar" refusal is not reached on the test seeds (the young refusal comes first).
- **The Trail's chart** draws its velocity arrows and the tint-by-angle overlay from catalogue
  directions; only the labels are measured values.
- **Readings (not messages)** still hold a few human units: one Trail reading key says "radial velocity
  up to 100 km/s"; The Key's glyph readouts show "(1080000 km)" with the gloss on.
- **`data/seeds.json` must be rebuilt** (`node tools/seeds/build-seeds.mjs`, about 8 minutes) after any
  change to a checker, the epoch model or its data.

- **Side break of the record** after music #11 is an inference (D-A17); alternatives logged.
- **Uranium spot position** is not on the cover diagram: our documented choice (M4).
- **Colour channel order** cannot be proven from the record: shown as "probable".
- **The decoded pictures' small geometry error** (D-A19) is detected but its origin is unresolved.
- **Nearby stars without radial velocities:** companions now take their primary's (Sirius B, Procyon B
  and 185 others); GJ 1245 A and B have none in HYG and stay hollow on the neighbourhood chart, handled
  by the no-RV bound.
- **Layout leftovers (8b):** Arrival and Key result messages still print SI units in their text; The
  Pictures at 1440x900 with the notebook open needs an inner scroll to reach Propose; ring labels are
  9 to 12 px on phones; the `sound` browser test was flaky once.
- **Firefox and Safari are untested** (no Playwright browsers here); the audio probe ran in Chrome only.
- Python packages live in the user site-packages, so run Python as `python -P` (not `-I`).

## Next (exact)

1. **Finish 6a** (The Voices' audit fixes) from `docs/plans/M5_specs/step6a-progress.md`: wire
   `tools/voices/others.py` into the analysis and `checkOthers`; render the Sounds of Earth spectrogram
   panels and read them (the lead) to give that test independent truth; decide the music-items question
   (proposed: refuse stretches on music items); the multi-harmonic octave fold with bootstrap margins and
   a two-sided coverage band; `voices.many` with one shared definition of reasonable settings (recompute
   the count-against-cut table); the hearing wording within the research; row 16, D-A32 and
   `src/game/nodesM5.ts` wording. One builder-opus, resumed from the progress note.
2. **Finish 6b's docs** (`docs/plans/M5_specs/step6b-progress.md`): How it's checked rows 5, 13 and 14;
   split `checkersM5.ts`; the `pictures.down` hint.
3. `npm run check`, deploy, live check.
4. The blind critic on a fresh whole-game capture (archive older inbox folders first); the QA audit; the
   M5 gate (PROGRESS and HANDOFF); then M6 (`docs/plans/M6.md`; research done in
   `docs/research/epilogue.md`).
