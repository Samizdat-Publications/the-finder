# PROGRESS

_Last updated: 2026-10-22 by build session 5 (Opus 5.5): M7 (polish) under way after the V1.0 draft. Update after every meaningful chunk._

## Current milestone

**M7, polish and ship (started 2026-10-22, build session 5; checklist `docs/plans/M7.md`).** No notes from Stewart
on the V1.0 draft yet, so M7 runs from the critics' list. Landed so far:
- **Step 1, clipped and stray things:** chart labels stay inside their chart (`labelLayout.ts` takes the chart's
  bounds: the Galactic centre's label flips left at the edge); Arrival's scene labels sit right of their part,
  else left, else below, inside the open area, and a part hidden under the scan panel shows no label; Our Frame's
  second Sound button is gone (a "Playing: Cavatina" line instead; the top bar has the button); Portrait's "Their
  world" lines wrap instead of running past the panel at 1366x768.
- **Step 2, the tour opens on the spacecraft:** the three prologue cards stand beside the encounter scene (the
  craft under the far-future sky, `src/tour/StoryScene.tsx`); "Hold up your disc" dims the scene and shows the
  cover drawing large.
- **Step 3, one obvious control per step:** while a tour stop is unfinished, what holds neither its control nor its
  answer dims (hover or focus brings it back; canvases never dim), and the control scrolls into view by itself if
  the stop opens with it below the fold (`src/tour/Spotlight.tsx`).
- **Step 4, shorter words:** the ten longest "What we just learned" boxes cut to at most about 40 words (from 60;
  the one hand-typed "about 44,000 years" became "tens of thousands of years"); on the tour a result's human value
  leads, large, and the alien value follows small; a "part 4 of 12" counter beside the part dots.
- **Step 5 (part), the Trail chart given depth:** faint distance rings and spokes in the plane through the craft,
  a thin stalk from every star down to that plane (fainter for stars whose depth is uncertain), a soft glow behind;
  about 0.5 ms more per frame on the laptop GPU.
- **Step 6, laptop performance:** `tests/browser/perf-igpu.browser.mjs` on the Intel Arc 140T: the encounter scene
  and both charts draw in 2 to 9 ms per frame (bound 25), live frames 4 to 15 ms (bound 34). Entering The Map is
  recorded against 100 ms but not asserted (D-A38): about half the runs stall 130 to 450 ms inside the browser's
  first WebGL call, in the GPU process; warm-ups and the power preference did not fix it.
- **Step 8 (part), the planets table:** Allen's Astrophysical Quantities (1973) matches Saturn's day and Venus's mass
  and four cells within a last digit; Mercury's day and Venus's diameter stay unexplained
  (`docs/research/planets-1970s.md`; Allen read from an OCR scan, page images unchecked).
- **A look tool:** `node tools/harness/tour-look.mjs --stops 1,6,45 [--open] [--wait 9000] [--sizes ...]` screenshots
  chosen tour stops from a confirmed save in seconds (`--open`: as the player meets them), into `review/archive/`.

**V1.0 draft (2026-10-22): every chapter is built and playable, start to finish.** Stewart asked for the two
outstanding chapters, every outstanding item and a V1.0 draft for his review.
- **Portrait (chapter 8, D-A36):** the senders' portrait on a gold plate built only from the player's own
  confirmed results (their star, how they look, their world, numbers, voices, machine), and one deduction, One
  story: the four clocks (fuel, uranium spot, the map read from the warm-white star, the journey) combined by
  inverse-variance weighting, accepted inside the 99.9% band; the bright band is the map clock's own bar. Default
  seed 44,041 +/- 68 yr; coverage 188 of 200 seeds against each clock's own true start; the truth accepted in 200
  of 200. Ends on the Finder's own sky with the Sun ringed as "the senders' star"; its own chord bed and cue.
- **Our Frame (chapter 9, D-A37):** out of the fiction in six sections: the turn, both Voyagers now (live), still
  listening (instrument lamps), the slow future (the real Gliese 445 pass), the map older than the machine, the
  hand-etched line with credits; Beethoven's Cavatina playing quietly through the bus; sourced facts in
  `data/epilogue.json`.
- **The tour** has a Portrait part and a six-stop Our Frame part (65 stops, 44 deductions); the guide turns Our
  Frame to each section and holds its own controls while it leads.
- **Fixed today (many from Gemini 4 Argon's two reviews, D-A34, and the M6 science audit):** the Spot refusing
  the true pure start on about 2% of seeds (Chernoff boundary, 99.9%); Start over leaving chapters half-solved;
  clicks derailing "Do it for me"; the Map entry stall (69 to 93 ms before; 51 to 68 ms alone after, though one full check under load recorded 100 ms, at the limit); Sounds of Earth machine tones
  counted as animals; The Key's whistling bed; a hygiene step in `npm run check`; an accessibility test (axe, 0
  violations over 17 pages) and a keyboard check; social preview tags; M5 step 6b's leftovers.
- **Last fixes before the draft (QA audit):** the tour's click-hold now really holds a child's clicks on the
  instrument during "Do it for me" (it let them through before; `bot.tourHold` uses real clicks); Portrait fits
  at 1366x768; a current social preview image; the final full check 207 of 207; deployed and live-checked (the
  game and the landing page at https://the-finder.pages.dev).
- **The ongoing critic:** `node tools/critic_gemini/watch.mjs --chapters <parts>` films a stretch of the tour with
  sound and runs the Gemini video critic (reviews in `docs/reviews/2026-10-22-*-gemini-critic.md`).

**The guided tour (D-A33, extended 2026-10-22): 65 stops through all 44 deductions** (Portrait and a six-stop
Our Frame part added; tour bot 65 of 65, 44 of 44 from a fresh save). Its first version, 2026-10-16 evening: Stewart's playtest note (docs/STEWART_FEEDBACK.md):
he could not tell what to do or why; the audience is him walking his almost-12-year-old son through it.
The landing page's first button now starts a guided tour: 58 stops through all 43 deductions in one fixed
order, a guide panel in place of the notebook (what we're looking at, your turn with the control spotlit,
what we just learned, the real story, talk about it), "Do it for me" on every step, story cards for the
prologue and finale (the live where-is-Voyager-tonight panel). Free play is unchanged. Printable cover
STLs in `print/`. Tour bot 58 of 58 stops, 43 of 43 from a fresh save; live tour check passes.

**M5 closed (2026-10-22):** The Pictures complete and The Voices; the M5 science audit's fixes all landed (6a, 6b,
and today the Sounds of Earth case by the lead's reading of the spectrogram panels: machine tones refused).

**M4 closed (2026-10-16):** The Map, The Spot and The Trail playable after The Key; 31 deductions from a
fresh save (bot.game); a science audit, a QA audit and two blind critic passes, every finding fixed or
carried with a decision; `npm run check` green (328 unit tests, 19 browser tests, 147 checks); deployed
and live-checked.

**The game:** https://the-finder.stewartgregerson.workers.dev/ (guided tour from the first button; Free play from the ring)

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

- **The guided tour (2026-10-16 evening, build session 3):** `src/tour/` (script, guide, story stage,
  spotlight, Voyager-now, Do-it-for-me actions per chapter), tour commands on the bus and in the save,
  landing and hub entry points; specs in `docs/plans/tour_specs/`; the control digest
  `docs/plans/tour_specs/controls.md`; The Map's chart exports `chartHandle()` so the tour clicks pulsars
  onto lines; Trail readouts stack label over value; the human gloss reads days up to two years. Bots:
  `tests/browser/tour.browser.mjs` (bot.tour), `tools/harness/live-tour.mjs`. Blind critic on the tour:
  `docs/reviews/2026-10-16-tour-player-critic.md` (6 to 8; its "explains too much" declined per Stewart).
  Printable relief plate (PLAN M8 bonus): `print/` STLs at 200, 250 and 305 mm. Full check: all green but
  the `enter` perf test (101 ms against 100 under load; 78 ms alone). Deployed and live-checked.

- **Edge (2026-10-16):** every browser test passes in the installed Edge, 21 of 21, audio included
  (`FINDER_BROWSER=msedge node tools/harness/browser-tests.mjs`); the whole-game bot needed one retry (a
  click timed out at 120 s). M6 (Portrait, Our Frame) was built 2026-10-22; see Current milestone.

## In flight

- Nothing running.

## Known issues and open questions

- **Entering The Map on a laptop GPU (D-A38):** about half the time one 130 to 450 ms freeze inside the browser's
  first WebGL call. The fix is drawing the charts in a Worker (OffscreenCanvas); then assert `perf.igpu.enterMap`.
- **M7 still open:** the art pass on the galaxy chart, the hub ring and the instrument frames (the alien instrument
  look); the landing page's footage refreshed from a new tour film; the blind critic on the polished tour; the QA
  audit; the leftovers in docs/plans/M7.md step 8 (the Pictures' notebook scroll, ring labels on phones).

- **Entering The Map** still shows one long task: 51 to 68 ms alone, 100 ms (the limit) in the last full check under load, on a cold browser (the first WebGL context; limit
  100, passes); a context warmed at boot would remove it.
- **Portrait with the guide open at 1366x768:** the "Their world" panel scrolls inside itself (a letter clipped
  at its edge); nothing is unreachable.
- **The critics' layout notes for M7** (`docs/reviews/2026-10-22-V1-player-critic.md`): dense instrument screens,
  the tour's prologue as plain text cards, scene art (Arrival's labels and the galaxy view's centre label clip).
- **The machine-tone threshold** in voices.others rests on one whale call (4 cents of gap; stretch verdicts are
  robust). **The planets' 8 discrepancies** are probably 1970s values (Argon); carried, labelled "cause UNVERIFIED".
- **Tour:** "Do it for me" works the real controls everywhere except where a canvas gesture has no in-page
  handle (none left after the Map's chartHandle). The tour's spotlight rings a group of choices, not the
  right one. Any new deduction must get a tour stop and an action, or `src/tour/*.test.ts` fails.

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

0. **Stewart reviews the V1.0 draft** (now with the M7 changes above) (the guided tour from the landing page, end to end, with his son if he
   likes) and writes notes at the top of `docs/STEWART_FEEDBACK.md`. Act on them first.
1. M7, the rest of `docs/plans/M7.md`: the galaxy chart, hub ring and instrument-frame art (Free play should feel
   more alien); the charts off the main thread (D-A38); a fresh tour film for the landing page; the blind critic
   and a QA audit at the gate; the step 8 leftovers; a Firefox check (`docs/NEEDS_STEWART.md` item 3).
2. After the main version: `docs/IDEAS.md` (the younger version, 8th-grade level).
