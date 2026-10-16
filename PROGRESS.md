# PROGRESS

_Last updated: 2026-10-16 by build session 2 (Opus 5.5): M1 and M2 complete; M3 steps 1 to 7 built.
Update after every meaningful chunk._

## Current milestone

**M3: Vertical slice (Arrival, The Key, The Player, The Pictures to the circle).** Plan:
`docs/plans/M3.md`; specs in `docs/plans/M3_specs/`. Steps 1 to 7 are built and committed (the shell,
the cover SVG, the Voyager model, the encounter scene, the four chapters, sound v1); step 8 (the slice
bots, a filmed run with sound, the Gemini video critic) is in flight; then the player-critic, deploy,
Stewart's playtest link (step 8) and the gate (step 9).

**Preview (still the M2 bench, redeployed with the slice at step 8):**
https://the-finder.stewartgregerson.workers.dev/play/

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

## In flight

- M3 step 8, the slice bots, the filmed run and the Gemini critic
  (`docs/plans/M3_specs/step8-bots-film-critics.md`, builder-opus).

## Known issues and open questions

- **Side break of the record** after music #11 is an inference (D-A17); alternatives logged.
- **Uranium spot position** is not on the cover diagram: our documented choice (M4).
- **Colour channel order** cannot be proven from the record: shown as "probable".
- **The decoded pictures' small geometry error** (D-A19) is detected but its origin is unresolved.
- **Three nearby stars lack radial velocities** published elsewhere (Sirius B, GJ 1245 A/B): source or
  copy them before the sky is shown (M3 step 3).
- **Firefox and Safari are untested** (no Playwright browsers here); the audio probe ran in Chrome only.
- Python packages live in the user site-packages, so run Python as `python -P` (not `-I`).

## Next (exact)

1. When step 8 reports: watch `slice.mp4` (Read frames if needed), read `gemini.md`, run the
   `player-critic` ("A new build is in review/inbox. Play it."), act on the clear findings.
2. Deploy (`npm run deploy`), run `npm run smoke:live`, send Stewart the playtest link with three
   questions; write his answers into `docs/STEWART_FEEDBACK.md` when they come.
3. M3 gate (step 9): `npm run check` green, QA audit, PROGRESS and HANDOFF, write `docs/plans/M4.md`
   (The Map, The Spot, the RTG clock, The Trail, reframed dating) and continue.
