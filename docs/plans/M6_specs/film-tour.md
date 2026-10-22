# Spec: film the guided tour with sound, for the ongoing Gemini critic

**Goal.** Stewart wants the Gemini video critic (`tools/critic_gemini/critic.py`) running throughout the
build, on each new chapter as it lands and on the whole tour at the end. The critic needs a review folder
holding `slice.mp4` (picture and the game's real sound, in sync), `frames/*.png` and `shots.txt`. Today only
the slice can be filmed that way (`tools/harness/film-slice.mjs`). Make the guided tour filmable the same way.

**Files you own (create or modify, nothing else):**
- `tools/harness/film-tour.mjs` (new)
- `tools/critic_gemini/watch.mjs` (new): film then critique in one command
- `tools/critic_gemini/README.md` (add a section for both)
- `tools/harness/film-slice.mjs` only to export reusable pieces (the clapperboard sync, mux) if you factor them
  out; keep its behaviour identical.

**film-tour.mjs**
```
node tools/harness/film-tour.mjs [--from <stopId>] [--to <stopId>] [--chapters a,b] [--out <folder>] [--hold 1]
```
- Drives the tour exactly as `tests/browser/tour.browser.mjs` (bot.tour) does: fresh save, `/play/?tour=1` at
  1440 x 900 on the Vite dev server (harness handle on, so the audio tap `window.__finder.startAudioTap` works),
  only the guide's own buttons ([data-tour-act], [data-tour-next]). Reuse its helpers by import; do not fork its
  logic.
- `--from/--to` (stop ids from `src/tour/script.ts` STOPS) or `--chapters` select the filmed stretch. Stops
  before the stretch are fast-forwarded with "Do it for me" and Next with filming not yet started (or, if
  faster and reliable, by issuing the same bus commands the tour issues; never by writing state directly). The
  film starts at the first selected stop.
- While filming, pause where a viewer would read: hold each stop's guide text on screen for a reading time of
  about 1 s per 15 words (capped at 12 s, scaled by `--hold`), then act, then hold the result about 4 s.
- Sound: the same clapperboard sync as film-slice (white flash plus 1 kHz beep right after the tap starts), the
  same mux to H.264 and AAC, the same 50 MB cap (lower the bitrate or the frame size if needed, never exceed).
- Output `review/inbox/<timestamp>-tour-film/` with `slice.mp4` (name kept so critic.py works unchanged),
  `frames/` screenshots at each stop (before and after), `shots.txt` (one line per shot: file, what it shows,
  what the player just did), `film.json` (length, stops filmed, offset corrected).

**watch.mjs**
```
node tools/critic_gemini/watch.mjs [same selection flags] [--estimate-only]
```
Runs film-tour, then `python -P tools/critic_gemini/critic.py <folder>`; prints the review path. If the critic
fails for any reason (upload refused, spend cap, model error, empty answer), it exits non-zero and writes
`<folder>/CRITIC_FAILED.txt` with the reason (no key material). The lead relies on this to tell Stewart.

**Rules.** CLAUDE.md hard rules apply: never print or copy the key; no em dashes anywhere (code comments too);
stage nothing in git (the lead commits). Review folders are gitignored.

**Must pass.** Run `node tools/harness/film-tour.mjs --chapters key` (a short stretch) and check with ffprobe
that the mp4 has a video and an audio stream, length plausible, audio not silent (mean volume above -60 dB),
and under 50 MB. Do NOT run the Gemini critic yourself (the lead spends). `npx tsc --noEmit` stays clean.

**Report:** files changed; the ffprobe output and volume for your test film; how long the fast-forward took;
anything flaky.
