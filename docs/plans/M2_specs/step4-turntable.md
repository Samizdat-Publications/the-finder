# M2 step 4 spec: the record timeline and the turntable engine

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-15).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit). Read `CLAUDE.md` (rules 1, 4, 5, 6, 7), `PLAN.md` chapter 5 (The Player) and "How it's checked" item 9, `docs/plans/M2.md` step 4, `docs/DECISIONS.md` D-A17 and D-A18, `docs/research/cover.md` section 1b (3.6 s per turn, 53.8 min per side, outside in), `data/record.json` and `data/README.md` (its schema), `HANDOFF.md` gotchas on browser audio, and `tools/harness/browser-tests.mjs` (the browser test runner; read its header). A parallel helper builds the picture decoder in `src/dsp/` and `src/media/frames.ts`; stay out of those.

This is M2 step 4: the model of the record as a physical object (needle position to side, track and time) and a Web Audio engine that plays the real record the way a turntable would, including every meaningful wrong result: wrong speed shifts pitch and tempo exactly, wrong direction plays it backward, a needle dropped off the music gives silence or run-out clicks.

## Files you own (create; touch nothing else)
`src/record/timeline.ts` (pure: no DOM), `src/record/groove.ts` (pure: geometry), `src/record/engine.ts` (browser: Web Audio), `src/record/sounds.ts` (browser: synthesized stylus sounds), `src/media/audio.ts` (browser: whole-file fetch with progress, decode, cache), tests `src/record/*.test.ts` (Node, pure parts), `tests/browser/turntable.browser.mjs`, and a section in a new `src/record/README.md`.

## Model
- **Timeline** (`timeline.ts`): from `data/record.json`, each side's items with start and end times (seconds from the start of the side's music, in order, using `durationS`). `itemAt(side, t)` returns the item and the offset into it; `sideDuration(side)`.
- **Groove** (`groove.ts`): a constant-pitch spiral played outside in at the cover's rate, one turn every T = 3.6 s (derive it from `data/cover.json` `record.rotationPeriod` through `src/science/units.ts`, do not type 3.6). Radii: the outermost music groove at 146.05 mm and the innermost at 60.3 mm (12-inch disc recording standard, IEC 60098 / RIAA; cite it in a comment and say the Voyager record's actual radii are not documented, so these are standard values), so the pitch per side is (146.05 - 60.3) mm / (sideDuration / T) turns. `timeAtRadius(side, r)` and `radiusAtTime(side, t)`; outside the music band: lead-in (r > 146.05 mm, a few turns of silent groove that lead the needle in) and run-out (r < 60.3 mm, a locked groove: a click every turn).
- **Speeds and direction:** the true speed is one turn per T (16 2/3 rpm). The player sets a turntable speed (turns per second) and a direction. `playbackRate = setSpeed / trueSpeed`; tempo and pitch both scale by that ratio (an AudioBufferSourceNode with `playbackRate`, which does not preserve pitch). The wrong direction plays a pre-rendered reversed copy of the buffer (negative playbackRate is unsupported) from the mirrored offset.

## Engine (`engine.ts`, `audio.ts`, `sounds.ts`)
- `audio.ts`: fetch each track's whole file (Range is ignored by the host) with a progress callback (ReadableStream byte count against Content-Length or `record.json` bytes), `decodeAudioData` in the page's AudioContext, cache by item id, and verify the SHA-256 from `record.json` when `crypto.subtle` is available (skip with a console note otherwise). Reversed buffers are made on demand and cached.
- `engine.ts`: `class Turntable` with `load(side, onProgress)`, `dropNeedle(radiusMm)`, `setSpeed(turnsPerSecond)`, `setDirection('cw' | 'ccw')` (which one is correct comes from the data: the groove spiral is cut so that playing outside in requires the disc to turn clockwise seen from above; document this as the standard and as the deduction the player makes under the microscope), `lift()`, and events (`position`, `itemchange`, `runout`). Crossing an item boundary schedules the next item's buffer sample-accurately. All timing uses the AudioContext clock, never `setTimeout` for audio. No game state lives here: the game's command bus (later) calls these methods.
- `sounds.ts`: synthesized (Web Audio nodes or generated buffers; no downloaded files): the stylus drop (a short thump and click), a light surface crackle at about -40 dB under the music, and the run-out click. Seeded randomness only (use `src/science/random.ts`).

## Tests
- Node (`src/record/*.test.ts`): side durations equal the sum of `record.json` durations; `itemAt` at every boundary; radius and time invert each other within 1e-9; the side's music spans exactly 146.05 to 60.3 mm; the number of turns per side equals sideDuration / T; ids `record.timeline`, `record.groove`.
- Browser (`tests/browser/turntable.browser.mjs`, via the runner), using the engine's own node-graph builder inside an `OfflineAudioContext` (no live audio device needed):
  - **Pitch:** a 1,000 Hz test tone buffer played at speed ratios k = 0.5, 0.97, 1, 1.03, 2: the measured frequency (fit or FFT peak with interpolation) equals 1,000 k within 0.1%, and the rendered duration equals the buffer duration / k within one render quantum. Id `turntable.pitch`. (PLAN.md "How it's checked" 9: a speed error of k changes the pitch by exactly k.)
  - **Direction:** a rising chirp played in the wrong direction comes out as the falling chirp (correlation with the time-reversed input above 0.99). Id `turntable.direction`.
  - **The real record:** load side 1, drop the needle at the radius of the start of music 7 (Johnny B. Goode), render 5 s offline at the true speed: the output correlates with the same 5 s of the decoded track file above 0.99; at 1.03 the correlation with the resampled track is again above 0.99. Id `turntable.record`.
  - **Run-out:** a needle inside 60.3 mm produces periodic clicks at intervals of T / k. Id `turntable.runout`.

## Done when
`npm run check` passes and the records above are written. Report: files, the measured pitch ratios and errors, the correlation numbers, the groove pitch per side in micrometres and the turns per side, anything that did not work.

## Rules
No em dash anywhere. Never read .env. Do not commit. Keep files under about 400 lines.
