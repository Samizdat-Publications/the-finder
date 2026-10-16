# M5 step 6a: where it paused (2026-10-16)

Paused at Stewart's request (quota) before the step was finished. The spec is
`docs/plans/M5_specs/step6a-voices-audit-fixes.md`; this note keeps what was found so the next session
resumes, not restarts. Nothing here is wired into the game yet.

## Item 1, `voices.others` by measurement: partly done

- **Written:** `tools/voices/others.py` (not imported anywhere yet; no behaviour changes).
- **Why voicing and pitch alone fail:** on track 03 the speech after about 140 s is noisy and hummed and
  rarely voiced at YIN's 0.1 threshold, while the whale's low pulses (about 100 Hz) and some harmonic calls
  (254 Hz at 210.8 s) are voiced at a speaking pitch; a cepstral peak and spectral flatness did not
  separate them either.
- **The rule in `others.py`:** a frame is speech when it is voiced at a speaking pitch (tracker 60 to 500
  Hz, CMND below 0.45, pitch at most the speakers' ceiling of 378.33 Hz) AND broadband (at least 70% of
  the 300 to 3,000 Hz bins stand 15 dB above the track's own floor in that bin, its 20th percentile) AND in
  a pitch run (under 50 cents a frame) of at least 3 frames. A stretch is "not theirs" when it holds at
  least one whole held call (the existing call finder) and no speech frame.
- **Results:** track 03: 9 calls, last speech at 187.43 s, no speech frames from 190 to 239 s; accepted
  stretch 187.44 to 244.09 s, matching the lead's reading (speech to about 188 s). Thresholds 0.3 and 0.6
  give the same; coverage 0.6 with 5-frame runs does not (flags speech near 199 and 210 s). Independent
  check: every 4 s window of Ozma 01 and 02 holds speech (100%).
- **Caveat for How it's checked:** the rule was chosen on track 03 against the lead's reading, so that test
  is not independent of the rule; Ozma 01 and 02 are the independent check, and the Sounds of Earth will be
  another once the lead reads its spectrograms.
- **Sounds of Earth (track 04), provisional:** 17 calls, 125 speech runs; accepted stretches (seconds,
  calls inside): 293.11 to 296.77 (1); 296.98 to 298.38 (2); 302.95 to 312.62 (1); 417.37 to 473.56 (10);
  620.26 to 675.18 (2). Some may be machines (horn, whistle, Morse) rather than animals.
- **Decision for the lead (open):** music items: the stated rule would accept an instrument's held notes as
  "not theirs". Proposed: refuse stretches on music items, with the measured held-tone counts in the
  message (measurement cannot tell a held note from a call).
- **Remaining:** wire `others.py` into `analyse.py` (an "others" block in `voices.json`: calls for all
  tracks, speech for the voices and sounds tracks; a whole-record pass costs 3 to 4 minutes; check the JSON
  size); rewrite `checkOthers` in `src/chapters/voices/checkers.ts` (refusals that say what was measured);
  test cases from the lead's reading (tolerance 2 s) with the Sounds of Earth case pending; a
  `voices.ref.speech` check in `tools/voices/checks.py`; the 60 s Sounds of Earth spectrogram panels for the
  lead to read; update `tests/browser/voices.browser.mjs` (its wrong-answer case expects "Speakers only").

## Item 2, the octave: design found, no code yet

- The plain fold (the mean resultant length R of 2 pi x pitch / P) cannot discriminate on the Gavotte's
  411 notes: R(1200) 0.379 but R(1242) 0.384, R(238) 0.681, R(100) 0.625; clickable peaks beat 1200 too (71
  cents 0.443, 1275 0.381). Reason: the first harmonic resolves P only to about P squared over the notes'
  3,141-cent span, roughly 480 cents near 1200.
- **What works:** a multi-harmonic fold: fold the notes modulo P, compare their pairwise closeness
  (Gaussian kernel, sigma 25 cents) with chance, sum over all harmonics. At sigma 25 the best fold from 30
  to 2,400 cents is 1199 cents (2.90), apart from its own double 2,398 (3.17); next 2117 (2.85), 1905 (2.80,
  about 3:1), 1408 (2.61); the named candidates 702 2.19, 498 1.60, 386 1.14. So two stacked fifths (about
  1406) and 3:1 come close but behind.
- **Remaining:** the bootstrap margins, the error bar re-derived, a two-sided coverage band, the TypeScript
  and Python twins, the checker and its messages computed from the comparison.

## Items 3 to 5: not started

`voices.many` with one shared definition of reasonable settings (the auditor's count-against-cut table must
be recomputed; it is not in the repo), the hearing wording within the research, and row 16, D-A32 and
`src/game/nodesM5.ts` wording.
