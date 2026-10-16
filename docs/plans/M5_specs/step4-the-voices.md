# M5 step 4 spec: The Voices

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (all hard rules; 1, 3, 4, 5, 6, 7, 9 and 13 above all), `docs/plans/M5.md` (The Voices), `docs/research/voices.md` (all of it: the greetings cannot be counted to 55 by silence; the band has no cutoff; the pitch methods and interval targets; what is UNVERIFIED), `data/record.json` (both sides, the tracks, D-A17's side break), `docs/DECISIONS.md` D-A05, D-A17, D-A18, D-A22, D-A29, the turntable and audio engine (`src/record/`, `src/audio/mixer.ts` `sharedContext()`), The Player chapter (`src/chapters/player/`: how the record is played), `src/game/nodesM5.ts` (your four nodes: `voices.many`, `voices.hearing`, `voices.octave`, `voices.others`; questions, glosses and hints are written, each `later: true`), `src/game/graph.ts` (the `voices` chapter is `built: false`), `src/ui/ResultView.tsx`, `src/chapters/headlines.ts`, `src/chapters/moments.ts`. The lossless Ozma transfers are in `sources/ozma-cd-*/` (FLAC; gitignored); the runtime audio is `public/media/audio/*.webm`. Another helper builds The Pictures at the same time: stay in your files and never run `npm run check` (targeted tests and single browser tests; the lead runs the full check).

## Files you own
`src/dsp/spectrum.ts`, `src/dsp/pitch.ts`, `src/dsp/segment.ts` and their tests (new, pure, no DOM), a reference analysis in Python `tools/voices/` writing `data/voices.json` (new; documented in `data/README.md`), `src/chapters/voices/*` (new), one line in `src/chapters/index.ts`, `tests/browser/voices.browser.mjs` (new), `docs/HOW_ITS_CHECKED.md` (a new row 16, The Voices, and its check ids). Set `built: true` for `voices` in `src/game/graph.ts` and clear `later: true` on each of your nodes in `src/game/nodesM5.ts` as your LAST changes, once they pass.

## The signal processing (pure TypeScript, with a Python reference as in M1 and M2)
- `spectrum.ts`: a radix-2 FFT, a Welch long-term spectrum (window and overlap stated), a spectrogram for display. Tests against synthetic signals (tones, white noise: known levels and frequencies) and against `numpy`/`scipy` on the same samples (the Python reference).
- `pitch.ts`: YIN (de Cheveigne and Kawahara 2002) with its threshold stated, and a pitch-class (chroma) histogram for polyphonic music. Tests on synthetic tones of known pitch: the error in cents measured and recorded (no published cents figure is quoted: `voices.md` 4).
- `segment.ts`: speech segments by short-time energy against a threshold and a minimum gap, both parameters exposed (the player sets them).
- `tools/voices/` (Python, run on the Ozma FLACs): the long-term spectra, the greetings' segment counts over a grid of thresholds and gaps (reproducing `voices.md`'s table), the pitch track of the named pieces, written to `data/voices.json` with provenance; the TypeScript, run on the same samples in Node, must agree with it (the M2 pattern).
- In the browser the analyses run in a Worker on the decoded runtime audio (Opus); a browser test checks that they agree with `data/voices.json` within a stated tolerance (the codec changes the high band: measure and state how much).

## The instrument and the four checkers (deduce on the instrument; a wrong answer shows its computed result)
The turntable from The Player plays the rest of the record (greetings, sounds, music, in the record's order with D-A17's side break shown as an inference); beside it a live spectrogram and, for a chosen track, the analysis tools.
1. `voices.many` (answer `{ threshold, gap, groups }`): on the greetings, the player sets the segmenter's threshold and gap and reads the count of voices; then sorts the segments' median pitches into groups. OK when the count is in the range the analysis finds over the reasonable settings (`voices.md` 1: the honest claim is "a few dozen at least", not 55; derive the accepted range from the table, state it) and the pitches form at least two groups (computed separation, for example a two-component fit against one). The message says plainly that silence alone cannot give the exact number and why (greetings run together; some pause inside).
2. `voices.hearing` (answer `{ topHz }`, in the alien's units on screen): the long-term spectrum of all the music and speech; the player marks where it falls into the noise. OK when the mark lies in the band where the spectrum crosses a computed level below its peak band (state the level, for example 50 dB, and why), and the message states it as a lower bound on what they make and hear, and that the record itself limits the band (`voices.md` 3).
3. `voices.octave` (answer `{ ratio, step }`): on a named Western piece (the Queen of the Night aria for the tracker; a chroma histogram for a polyphonic piece), the player reads the most common interval and the scale step from the histograms; OK when the ratio is within the tracker's measured error of 2:1 and the step within it of a twelfth of the octave (100 cents). The message names the piece and says other pieces on the record use other tunings.
4. `voices.others` (answer `{ track, start, end }`): the player marks the whale song (Ozma 03, with the UN greetings: `voices.md` 1 says it is Ozma-specific); OK when the marked span lies inside the whale-song segment found by the analysis (long sliding calls: a computed criterion such as call duration and pitch glide, stated).

Headlines and one staged moment (`voices.octave`: the histogram's peaks lining up on the octave and its twelve steps, the aria playing).

## The whole-game bot
When your nodes come into play (`later` cleared), `tests/browser/game.browser.mjs` (bot.game) must play them too, or it will stop short. Export your chapter's play path from your browser test and add one call to bot.game in the place the gating allows; another helper may add theirs at the same time, so re-read the file just before a small edit and change nothing else in it.

## Tests and looking
Node: the DSP against synthetic truth and the Python reference; each checker's right and wrong answers. Browser: the chapter opens after The Player's first sound; each node played through the instrument, once wrong and then right; audio plays through the shared context (the audio probe pattern); no console errors. Captures at 1440x900 and 1366x768 in `review/inbox/<timestamp>-voices/` with `manifest.json`. Look at every frame; fix what is wrong or ugly.

## Done when
Targeted vitest, the Python reference checks and the `voices` and `game` browser tests pass. Report: files, the reference agreement numbers, the accepted ranges and how each was derived, the right-answer readouts, the captures, anything you could not do (Firefox stays untested here: say so).

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies (numpy and scipy are installed for Python; run Python as `python -P`). Files under about 400 lines. No downloads.
