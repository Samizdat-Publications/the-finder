# PROGRESS

_Last updated: 2026-10-16 by build session 2 (Opus 5.5): M1 and M2 complete; M3 slice built, deployed and
reviewed (layout pass in flight); M4 started. Update after every meaningful chunk._

## Current milestone

**M4: Where and when (The Map, The Spot, The Trail, the reframed dating).** Plan: `docs/plans/M4.md`;
specs in `docs/plans/M4_specs/`. Steps 1 to 6 done: The Map, The Spot and The Trail are built, playable
after The Key, deployed and live-checked (31 deductions; `npm run check` green: 281 unit tests, 16
browser tests, 126 checks). In flight: step 7 (sound for the new moments, the whole-game bots, captures
for the critic) and the M4 science audit. Then the player-critic and the gate (step 8).

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
    - The data (`data/`, `tools/data/`, 133 data checks): cover, 4,503 pulsars, glitches, Crab, 3,934
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
      14 lines, D-A16), triangulation (95% region about 31 by 14 pc holding the Sun and about 1,070
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
  no-spoilers questions); the cover as exact SVG (533 binary digits verified, 0.26 mm against NASA's
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
  combined map age 44,068 yr, 95% 43,930 to 44,210; the motion fit alone 44,050 +/- 92 yr);
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
  p < 1e-12; detector D-A24), The Trail (only the warm-white star fits, 0.0043 +/- 0.20 deg, next 8.58 deg;
  distance over speed 44,100 yr; the neighbour twist; the region view; the reframe: 44,068 yr, 95% 43,930
  to 44,210, the motion agreeing within about 1 sigma). Measured quantities from a million up read as
  powers of ten; captions in the top bar. D-A26, D-A27.

## In flight

- M4 step 7: sound for the new moments, bot.game and bot.m4Wrong, captures for the critic
  (`docs/plans/M4_specs/step7-sound-bots-captures.md`, builder-opus).
- The M4 science audit (science-auditor, read-only).

## Known issues and open questions

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

1. When the science audit reports: fix or record every finding (DECISIONS.md for judgment calls).
2. When step 7 reports: look at its captures, commit, run the `player-critic` ("A new build is in
   review/inbox. Play it."), record its review and decisions in `docs/reviews/`, fix what is clear.
3. Gate (step 8): `npm run check`, deploy, live check, QA audit (also covers M3's gate), PROGRESS and
   HANDOFF, write `docs/plans/M5.md` (The Voices, Portrait, the epilogue; the critic's design follow-ups:
   an alien-script puzzle, Arrival as evidence selection; the Map axis "settle" aid if playtests need it).
