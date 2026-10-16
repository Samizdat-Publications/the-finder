# M5 step 6a: where it stands (2026-10-16, second run, stopped at the lead's checkpoint)

Spec: `docs/plans/M5_specs/step6a-voices-audit-fixes.md`, with the lead's changes of 2026-10-16 (music items
refused with the held-tone count; the multi-harmonic fold with bootstrap margins and a two-sided coverage band in
both twins; the guided tour must keep passing; Sounds of Earth panels to review/archive, that case pending).
Nothing committed. Items 1 to 5 are implemented and tested; what remains is listed at the end.

## Verified this run

- `npx vitest run src/dsp src/chapters/voices src/game`: 16 files, 72 tests pass (1 todo: the Sounds of Earth
  case, pending). `npx tsc --noEmit`: no errors.
- `python -P tools/voices/checks.py`: every check passes (exit 0), new `voices.ref.speech`; prints
  `PENDING voices.ref.sounds` with the accepted stretches.
- Browser tests: `voices` pass (123 s), `game` pass on retry (the first attempt failed in The Pictures: "frame
  L004 is not loaded yet", not voices), `tour` with TOUR_ARCHIVE=1 pass (229 s; voices.many 15.5 s, hearing
  2.1 s, others 13.4 s, octave 0.8 s; screenshots in review/archive/2026-10-16T22-28-28-tour).
- `python -P tools/voices/analyse.py` rerun: data/voices.json 295 KB (was 269 KB), about 8 to 10 minutes.

## What changed, by item

1. **voices.others by measurement** (`tools/voices/others.py` wired into `analyse.py` as `others_pass`; new
   `others` block in voices.json; `whale` now taken from it). Checker (`checkers.ts checkOthers`, data from
   `data.ts measureStretch`): accept a stretch with at least one whole held call and no speech run touching it;
   refusals say the calls and speech measured; a music item is always refused with its held-tone count and "cannot
   tell". D-A32 amended. Track 03: last speech 187.44 s, no speech 190 to 234 s, accepted 187.44 to 244.09 s;
   Ozma 01 and 02: speech in every 4 s window (10 of 10, 56 of 56). Sounds of Earth (track 04) accepted
   stretches: 293.11 to 296.77 (1 call), 296.98 to 298.38 (2), 302.95 to 312.62 (1), 417.37 to 473.56 (10),
   620.26 to 675.18 (2); the calls at 464 to 469 s look like a 1 kHz machine tone (Morse?). Panels:
   `review/archive/2026-10-16T18-14-57-sounds-spectrograms/` (13 PNGs, index.txt) by `tools/voices/panels.py`.
2. **voices.octave** (`tools/voices/vfold.py`, `src/dsp/fold.ts`, twins agree: best within 0.01 cents, peaks within
   5e-5). Score: Gaussian kernel (sd 25 cents) closeness of notes a whole repeat apart, summed over every harmonic,
   with the k = 0 (own pitch) term removed, over chance (share of pairs at least P/2 apart). Why the change from
   the progress note's plain fold: with k = 0 kept, 2398 beat 1199 and 2117, 1905, 2191 were within the
   bootstrap (1199 won only 66%, 85%, 92%). Now: best 1198.805 cents, 2.633 times chance; beats all 43 other peaks
   (100 to 2400 cents) in 1000 of 1000 resamplings; table: 3:2 704.55 1.980 (margin 0.33 to 1.00), two 3:2
   1408.44 1.892 (0.45 to 1.06, no longer a near tie), 4:1 2398.77 1.667, 4:3 476.25 1.667, 3:1 1903.63 1.602,
   5:4 382.26 0.839. Bootstrap 95% 1196.80 to 1200.90; tracker systematic slope 0.32 +/- 0.07 cents per doubling
   (bound 0.45); tolerance 2.14 cents. Coverage on synthetic melodies 188/200 = 94.0% inside the two-sided binomial
   band 92.0 to 97.5%; the estimate reads +0.92 cents high on average (the chance term's tilt). The octave chart now
   draws the fold score (same x mapping, so the tour's click at 1200 snaps to about 1198.6 to 1198.8). Browser
   Worker best fold 1198.61. Known limit: on a two-octave synthetic major scale the fold prefers 3:2 (a
   fifth-generated scale); pitch.test.ts now uses three octaves and says so.
3. **voices.many**: one definition (thresholds -36.0 to -24.5 on the 0.5 dB grid, posterior 0.95 to 0.05; pauses
   0.15 to 0.40 s) in `analyse.py` and `data.ts isReasonable`; range 63 to 226; cut table 0.90: 66 to 204; 0.95:
   63 to 226; 0.99: 54 to 265; 0.999: 46 to 265; nearest about-55 setting: 57 at -37.5 dBFS and 0.40 s (noise
   posterior 0.977). "Separate voices" renamed "stretches of voice between pauses" (reading, panel label,
   headline). Hint about groups replaced with the spread.
4. **voices.hearing**: messages and readings say "they make sounds above their recording's hiss up to about
   17.1 kHz (3 dB rule)", sampling band 16.6 to 17.5, definition spread 15.0 to 18.5 kHz (added = 1/3 to 3 times
   the hiss; code moved to `tools/voices/vspec.py`). Gloss, hints, question ("How high do their voices reach?") and
   headline carry no hearing claim.
5. **Row 16** of docs/HOW_ITS_CHECKED.md rewritten (reference and Worker values named, whale as calls); D-A32
   amended; data/README.md voices.json section updated.

## Files

Modified: data/README.md, data/voices.json, docs/DECISIONS.md, docs/HOW_ITS_CHECKED.md,
src/chapters/voices/{ManyPanel.tsx, OctavePanel.tsx, checkers.ts, checkers.test.ts, data.ts, headlines.ts},
src/dsp/{pitch.test.ts, voices.ref.test.ts}, src/game/nodesM5.ts, src/tour/actions/voices.ts (comments only),
tests/browser/voices.browser.mjs, tools/voices/{analyse.py, checks.py, others.py}.
New: src/dsp/fold.ts, src/dsp/fold.test.ts, tools/voices/vfold.py, tools/voices/vspec.py, tools/voices/panels.py.

## What remains

- The lead reads the Sounds of Earth panels; then turn the `it.todo` in checkers.test.ts and the PENDING line in
  checks.py into real cases (and decide whether machine tones count as "not theirs").
- Tour script wording for the lead (src/tour/script.ts, not edited): voices.hearing `title` "What can they hear?",
  `look` "tells us something about their ears" and `why` "they can make them and hear them. Their hearing reaches
  at least this high" make the hearing claim the audit removed. voices.octave `todo` ("the peak where the pattern
  of notes comes back") still fits the fold chart.
- No TypeScript twin of the speech finder (the checker reads the reference's speech runs from voices.json).
- checks.py now takes several minutes (the octave coverage: 200 trials x 300 draws); not timed exactly.
- The voices browser test still writes its captures to review/inbox (unchanged behaviour).
- Run `npm run check` (the lead) and commit.
