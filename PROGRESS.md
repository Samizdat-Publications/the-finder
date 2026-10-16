# PROGRESS

_Last updated: 2026-10-16 by build session 2 (Opus 5.5): M1 and M2 complete pending the QA audit;
M3 started. Update after every meaningful chunk._

## Current milestone

**M3: Vertical slice (Arrival, The Key, The Player, The Pictures to the circle).** Plan:
`docs/plans/M3.md` (steps 1 to 9; specs go in `docs/plans/M3_specs/`). Step 2 (the cover as exact SVG)
is in flight. M1 (ground truth) and M2 (engines and scaffold) are built, checked and audited: two science audits
and a QA gate audit (2026-10-16) passed, their findings fixed.

**Preview (M2 bench, not the game):** https://the-finder.stewartgregerson.workers.dev/play/

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

## In flight

- M3 step 1, the shell, deduction graph, codex, saves and hints (`docs/plans/M3_specs/step1-shell-graph-codex.md`, builder).
- M3 step 2, the cover as exact SVG (`docs/plans/M3_specs/step2-cover-svg.md`, asset-smith).

## Known issues and open questions

- **Side break of the record** after music #11 is an inference (D-A17); alternatives logged.
- **Uranium spot position** is not on the cover diagram: our documented choice (M4).
- **Colour channel order** cannot be proven from the record: shown as "probable".
- **The decoded pictures' small geometry error** (D-A19) is detected but its origin is unresolved.
- **The bench's radius readout** does not follow a needle dropped through the bus (M3 step 5).
- **Three nearby stars lack radial velocities** published elsewhere (Sirius B, GJ 1245 A/B): source or
  copy them before the sky is shown (M3 step 3).
- **Firefox and Safari are untested** (no Playwright browsers here); the audio probe ran in Chrome only.
- Python packages live in the user site-packages, so run Python as `python -P` (not `-I`).

## Next (exact)

1. M3 step 1 (shell, deduction graph, codex v1, saves, hints, chapter routing; the bench moves to
   `/play/bench/`) and step 2 (the cover SVG) are in flight: review each report, look at the captures,
   run `npm run check`, commit.
2. Then M3 steps 3 to 9 in order (Arrival scene and workbenches, The Key, The Player, The Pictures,
   sound, bots and critics, deploy and Stewart's playtest link, gate), each with a spec in
   `docs/plans/M3_specs/` first.
