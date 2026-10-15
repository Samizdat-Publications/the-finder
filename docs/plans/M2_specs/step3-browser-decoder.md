# M2 step 3 spec: the browser picture decoder

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-15).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit). Read `CLAUDE.md` (rules 2, 3, 4, 6, 7), `docs/plans/M2.md` step 3, `docs/DECISIONS.md` D-A04 and D-A18, `tools/ref-decoder/README.md` (the method and every measured number), then the reference code itself: `tools/ref-decoder/sync.py`, `decode.py`, `aspect.py`, `decode_all.py`, `make_slices.py`; `build/ref/metrics.json` (`decode_params` holds every parameter, including the per-channel droop tau and the parity level profiles), `build/slices/index.json`, `data/frames.json`. Browser tests use `tools/harness/browser-tests.mjs` (read its header). A parallel helper builds the turntable in `src/record/`; stay out of it.

This is M2 step 3: the TypeScript port of the reference decoder that runs in the browser, live, from the 96 kHz FLAC slices in `public/media/frames/`. It must reproduce the Python reference's 96 kHz decodes (`build/ref96/frames/*.png`), and it must also be able to decode WRONG, on purpose, because the game's puzzles are "tune the decoder until the circle is round".

## Files you own (create; touch nothing else)
- `src/dsp/` (pure TypeScript: no DOM, no three.js, no Preact, no `Math.random`; the hygiene test enforces it): `params.ts` (the `DecodeParams` type and a `referenceParams(channel)` built from the data file), `sync.ts` (falling-edge detection, the start-of-picture comb, line 1, per-line edges, robust line-period fit, outlier replacement), `decode.ts` (one frame to 8-bit grayscale, every step a parameter; a progressive API that decodes lines k..m so the game can reveal a picture line by line), `colour.ts` (register and compose an R, G, B triple), `ellipse.ts` (algebraic ellipse fit for the circle's axis ratio), `worker.ts` (a Worker wrapper: transferable Float32Array in, line batches out; message types exported), plus tests `src/dsp/*.test.ts`.
- `src/media/frames.ts` (browser only, may use the DOM): fetch a FLAC slice whole (Workers static assets ignore Range), decode it in an `OfflineAudioContext` at exactly 96,000 Hz, assert the decoded length equals `frames.json` `samples`, hand the samples to the Worker.
- `data/decoder.json` and its builder `tools/ref-decoder/export_params.py` (reads `build/ref/metrics.json` `decode_params` and the aspect geometry; writes every parameter the browser needs, with units and provenance; deterministic).
- `tools/ref-decoder/decode96.py` (or a flag on the existing 96 kHz path): regenerate `build/ref96/frames/*.png` from the COMMITTED `public/media/frames/*.flac` (soundfile reads FLAC), so a fresh clone without the 1.46 GB tape can still run the comparison.
- `tests/support/ssim.ts` (SSIM matching scikit-image `structural_similarity` defaults for 8-bit grayscale: 7x7 uniform window, K1 0.01, K2 0.03, data range 255, sample covariance; test it against two or three values computed with scikit-image in a one-off Python run you paste into a fixture), `tests/support/wav.ts` (16-bit PCM WAV reader), `tests/browser/decoder.browser.mjs`.

## Requirements
1. **Parity with the reference.** Port the algorithm faithfully at 96 kHz (`sample rate` is a parameter; nothing assumes 384 kHz). Same line-1 rule, same edge lock, same droop inverse with the per-channel tau, same parity level profile, same polarity and percentile stretch, same aspect geometry (512 x 355). Where the Python uses scipy or numpy routines, implement the same math (comment the equivalence).
2. **Node tests** (`src/dsp/*.test.ts`): read the 96 kHz slices from `build/slices/*.wav` if present; otherwise convert the committed FLACs once into `build/wav96/` with ffmpeg; if neither is possible, SKIP with one clear line. Then:
   - Every one of the 156 frames: SSIM against `build/ref96/frames/<id>.png` at least 0.98 (report mean and worst). If `build/ref96` is missing, generate it with `decode96.py` first (from the test, through `python -P`), or SKIP clearly. Id `decoder.frames`.
   - The circle (L000): axis ratio 1.00 +/- 0.01 at the reference geometry. Id `decoder.circle`.
   - Wrong results: free-running decodes of L000 with the line time off by +1%, +5% and +20% produce the slants recorded in `build/ref/metrics.json` (`wrong` section) within 10%; dropping the interlace offset produces the comb measured there. Id `decoder.slant`.
   - Determinism: same input and params, identical bytes.
   - Keep the Node suite under about 60 s in total for this step (if all 156 frames are slower than that, test a fixed, documented subset of 24 spread across both channels in `npm test`, and add `npm run test:decoder:all` for all 156, which you run once and report).
3. **Browser test** (`tests/browser/decoder.browser.mjs`): in installed Chrome via the runner, load `/media/frames/L000.flac` and two others through `src/media/frames.ts` (the real `decodeAudioData` path), decode in the Worker, and compare with the Node decode of the same slice: at most 1 grey level difference per pixel (V8 in both; report the max). Record the decode time per frame in the Worker (target under 250 ms on this PC). Id `decoder.browser`.
4. **Records:** every test above writes its record (`tests/support/record.ts` in Node, the runner's `record` in the browser) with a plain claim, the measured value, what it was compared with, and the tolerance's basis.

## Done when
`npm run check` passes (7 steps), the decoder tests are green, and you have looked at three TS decodes yourself (write them to `build/ts96/` as PNGs: L000, L019, R072) and they match the reference by eye. Report: files, the SSIM mean and worst (subset and all 156), the circle ratio, the slants measured vs metrics, the browser max pixel difference and per-frame time, anything you could not match and why.

## Rules
Every constant has its unit and source (the reference README, `metrics.json`, or the cover). No em dash anywhere. Never read .env. Do not commit.
