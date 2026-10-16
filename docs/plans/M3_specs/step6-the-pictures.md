# M3 step 6 spec: The Pictures, to the calibration circle and the first frames

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16). Launch after step 4
(The Key, with the shared cover viewer) has landed; it can run in parallel with step 5.

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 2, 3, 5, 7), `PLAN.md` chapter 6 (The Pictures) and "Principles from the kickoff", `docs/research/cover.md` section 1c (the picture diagrams: the waveform with its sync pulses, 8.34 ms, the staggered interlace, the 512 lines, the calibration circle), `docs/research/images-and-audio.md` sections 1 and 3 (polarity, the slide mounts at the frame edges, the artifacts), `docs/HOW_ITS_CHECKED.md` row 12, `docs/DECISIONS.md` D-A04 and D-A19, `tools/ref-decoder/README.md`, `data/decoder.json`, `data/frames.json`, `src/dsp/` (`DecodeParams`, `referenceParams`, `decodeFrame`, `measureSlant`, `measureInterlace`, `ellipse.ts`), `src/media/frames.ts` (`PictureDecoder`, `fetchSlice`), `src/chapters/key/` (the shared cover viewer), `src/chapters/registry.ts`, `src/game/graph.ts` (the pictures nodes), `deductions.ts`, `src/ui/`, and `src/play/bench/PicturePanel.tsx` (the M2 decoder panel to learn from).

This is M3 step 6: the player tunes a decoder until the calibration circle comes out round, then watches the first pictures develop. Seven deductions (`pictures.lineTime`, `pictures.sync`, `pictures.interlace`, `pictures.polarity`, `pictures.aspect`, `pictures.circle`, `pictures.firstFrames`). Every picture shown is decoded live from the real 1977 tape (rule 2); every check measures the decoded picture (rule 3).

## Files you own
`src/chapters/pictures/` (instrument, scope, checkers, tests), `tests/browser/pictures.browser.mjs`, one line in `src/chapters/index.ts`.

## The instrument
- The cover's picture diagrams (shared cover viewer, `#pictures`), readable through the key: the waveform with its sync pulses and the line-time number, the raster with its line labels and 512, the staggered interlace, the calibration circle.
- An oscilloscope of the signal (the frame's 96 kHz slice): several lines at once, the sync pulses visible as sharp falling edges, triggerable on them once found.
- The decoder, starting FREE-RUNNING (sync lock off, interlace off, the player's own line time, polarity and rows unset at neutral values that are clearly wrong): the canvas shows what those settings give, live, line by line at record speed or fast.
- Knobs: line time (alien unit, the cover's value findable on the cover, not marked on the knob), sync lock, interlace offset, polarity, rows per picture. Droop correction is on and not a puzzle in the slice (say so in a comment; it can become one later).

## The deductions (each checker measures the decoded picture)
1. **`pictures.lineTime`**: with sync lock off, the player sets the line time; the checker measures the slant (`measureSlant` on the free-running decode) and accepts when the residual slant is below the threshold set by the tape's own wow and flutter (state the number from the reference README: the measured rms residual), which in practice means the cover's 8.34 ms within the tape's 0.16 to 0.23% speed offset. A wrong line time shows the predicted slant (e times the period per line) and tearing.
2. **`pictures.sync`**: the scope shows each line opening with a sharp falling edge; turning on sync lock locks every line to its own edge; the checker measures the line-start jitter before and after (free-running: the wow and flutter wobble; locked: the measured 1.8-sample jitter at 384 kHz scaled to 96 kHz) and accepts when the lock removes the wobble.
3. **`pictures.interlace`**: the cover's "staggered interlace" drawing; the comb on vertical edges until the offset is applied; the checker uses `measureInterlace` (even/odd shift before and after; the reference's numbers: about 8.4 samples without, 0.6 with, at 96 kHz).
4. **`pictures.polarity`**: is more signal darker or lighter? The physical cue: each frame is a photograph of a slide in its mount, so the mount at the frame's edges must be dark (no light through it); the checker measures the mean level of the frame's outer border against its centre on several frames and accepts the polarity that makes the border the darker. The wrong polarity shows bright mounts and a negative picture.
5. **`pictures.aspect`**: rows per picture: the calibration circle must come out round: the checker fits the ring (`ellipse.ts`) and accepts an axis ratio of 1.00 +/- 0.01 (the reference geometry is 355 rows); a wrong row count squashes it into an ellipse (show the measured ratio). This is a procedure the player performs, the same as the reference decoder's self-test, which is right: the record gives the circle exactly for this.
6. **`pictures.circle`**: confirmed when all five are right and the circle is round: the harmonic swell (a placeholder tone until the sound pass, step 7) and the codex entry "They see."
7. **`pictures.firstFrames`**: the next frames (L001 to L004 and their channel partners, as the record plays them) develop line by line at record speed; confirmed after the player has watched at least three decode. Codex lists what was seen as the decoded thumbnails (gold), never a clean published image (rule 2).

## Presentation, tests, done
- The alien look; gold for decoded pictures; the developing picture is the chapter's centrepiece (large, crisp, line by line).
- Node tests: each checker against decodes of the real slices (via the WAV copies used by `src/dsp` tests, SKIP clearly if unavailable): right settings pass; each wrong setting fails with its measured result; the border-polarity cue holds on at least 20 frames across both channels (report the margin). Ids `pictures.lineTime`, `pictures.sync`, `pictures.interlace`, `pictures.polarity`, `pictures.aspect`.
- Browser test (`tests/browser/pictures.browser.mjs`): through `window.__finder` only, tune from the free-running start to the round circle, then watch three frames; each wrong setting once gives its result; no console errors. Id `chapter.pictures`.
- Captures: free-running (slanted and torn), line time right but unlocked, locked without interlace (comb), wrong polarity, squashed circle, round circle, a frame developing midway; look at each and fix what is wrong or ugly.
- `npm run check` passes. Report: files, every measured number the checkers use, the polarity margins, the capture folder.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Files under about 400 lines.
