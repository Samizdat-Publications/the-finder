# M1 step 1 spec: the reference decoder

Subagent: `builder-opus`. Saved from the first build session (2026-10-15), where it was stopped
before finishing for a session switch. Relaunch it with the text below as the prompt (run in the
background). Check first whether anything it produced already exists.

**Update at handoff:** the tape download finished and verified (MD5 matches, SHA-256 recorded in
`tools/sources.json`), so ignore the "still downloading" and `.part` instructions below. The stopped
helper left UNVERIFIED drafts of `tools/ref-decoder/tape.py`, `sync.py` and `decode.py` (they compile;
nothing was run end to end). Tell the relaunched helper to read them and keep or rewrite them as it
judges.

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git repo on main; work in place; do NOT commit). Read `CLAUDE.md`, then `docs/research/images-and-audio.md` sections 1 to 3 (how the pictures are encoded, the tape, prior decoders), then `docs/plans/M1.md` step 1. This is M1 step 1: the offline reference decoder in Python. It is the ground truth the browser decoder (M2, TypeScript) must later match, so correctness and measured honesty matter more than speed.

## Inputs
- The genuine image tape: `sources/image-tape/384kHzStereo.wav`, 1,455,685,720 bytes, 32-bit float stereo, header rate 384,000 Hz (keep the header rate: it restores the cover's timing), 181,960,704 samples per channel, 473.86 s. It is still downloading when you start (a background job writes `sources/image-tape/384kHzStereo.wav.part`, then renames it when complete and MD5-verified). Write code first; poll for the final file with a sleep loop of at most 60 s between checks, never more than 20 minutes total; until it appears you can test on the `.part` file's first ~700 MB (frames L000 to about L030 and R000 to about R030 live there) by reading it as raw float32 interleaved stereo after the 88-byte header (confirm the header length by parsing the RIFF chunks of the .part file).
- NEVER load the whole file: read windows with `soundfile.SoundFile(...).seek()/.read()` (or `numpy.memmap` on the data chunk). One frame window is about 2.5 M samples per channel.
- Barry's reference tables: `sources/barry-frames/voyager.cpp` (2017; no licence, so read the numbers, copy no code). Arrays `start_points[2][78]` (sample offsets at 384 kHz; some entries add 3151, about one trace), `color[2][78]` (red/grn/blu/bnw), `orientation[2][78]` (0, 1, 2 with rotate meanings in its `switch` statements around lines 431 to 520). Parse these arrays out of the C source with a small regex parser in your code (`barry.py`), so the numbers are read from the source, never retyped.
- Image list: `docs/research/data/images/image_list_116.txt` (image number, title, channel, frame ids, mono/RGB).

## Python environment
Python 3.14 with numpy 2.4, scipy 1.17, soundfile 0.14, Pillow 12, scikit-image 0.26, matplotlib 3.11 (all in the user site-packages). Run every script as `python -P tools/ref-decoder/<script>.py ...` (-P stops Python putting the cwd on sys.path; downloaded files are untrusted data). Each entry script inserts its own folder into `sys.path` so sibling modules import. Do not pip install anything; if you think you need a package, stop and report.

## Files you own (create; touch nothing else)
`tools/ref-decoder/`: `tape.py` (WAV header parse, windowed channel reads), `barry.py`, `sync.py` (falling-edge detection, frame detection), `decode.py` (one frame to an image, all parameters explicit), `aspect.py` (circle ellipse fit), `decode_all.py` (entry: everything below), `make_slices.py` (entry), `checks.py` (entry, fast assertions), `README.md` (how it works, in plain language, with the measured numbers). Outputs go only under `build/ref/`, `build/ref96/` and `build/slices/` (gitignored).

## The method (the research is in images-and-audio.md; these are the requirements)
1. **Line sync on the falling edge.** Each vertical line ("trace") opens with a sync/blanking burst: a plateau, a sharp falling edge, a flat shelf. Alternate traces have different pulse widths (the cover's "staggered interlace"; peaks about 155 vs 45 samples before a shared falling edge per gourneau; Barry saw peak spacings alternating about 3100 and 3300). Locking to the falling edge (sub-sample, by interpolating the crossing of a mid level, or a matched filter) cuts timing error from about +/-100 samples to about +/-6. Record each line's parity (long or short pulse).
2. **Frame detection, independent of Barry.** Find the 78 frames per channel yourself: runs of 512 regularly spaced line syncs (spacing near 3197 samples at the header rate; the cover says 8.3396 ms = 3202.4; the tape runs about 0.16% fast). Look at the start-of-picture waveform (the cover draws a burst of 8 triangular peaks, a step to a plateau, then a drop to sync) and use it if it helps. First frames are near 15.63 s (left) and 16.94 s (right). Then compare every detected start with Barry's table: report the per-frame difference in samples and in lines, the median offset (definitions of "start" may differ by a constant or by one line), and how many agree within 1 line. Barry's table is validation, never the seed. If some frames cannot be found independently, say which and why; do not silently fall back.
3. **Per-frame line-period fit.** Robust linear fit of falling-edge time vs line index for each frame: report the period in samples and in ms (header rate), and the rms residual (wow and flutter / sync jitter). Decode using the per-line detected edges (outliers rejected and replaced by the fit), not a fixed period.
4. **DC restore and droop.** The tape is AC-coupled (bright top, dark bottom, trailing shadows). Clamp each line to its sync shelf level, and apply a first-order high-pass inverse (droop correction) with a time constant you estimate from the data (state how; for example the value that makes the shelf and uniform regions flattest across the frame). Report the time constant and show before and after on the circle frame.
5. **Polarity:** more signal is darker, so invert. Level mapping: per-frame robust percentile stretch (record the percentiles used); for colour triples, stretch each separation independently and say so in the README (absolute colour balance is not recoverable from the record).
6. **Interlace offset:** measure, do not hard-code, the vertical (within-line time) offset between even and odd lines, for example by cross-correlating the content of adjacent lines over the whole frame; report it in samples (Barry hard-coded 12 at 384 kHz) and apply it with sub-sample interpolation.
7. **Aspect from the calibration circle** (frame L000, image 1): the output image has one column per line (512 columns: line 1 at the left), and rows sampled down the active part of each line (time runs downward, as the cover's scan diagram draws it). Choose the number of rows (equivalently samples per row) so that an ellipse fitted to the circle's edge (scikit-image `EllipseModel` on edge points, or equivalent) has axis ratio 1.00. Report the fitted ratio at the chosen setting (target 1.00 +/- 0.01), the resulting frame aspect, and the active window (first and last sample after the edge that holds picture). Expect something near 512 x 384 (4:3); the 1992 CD-ROM images were 512 x 384, which is a sanity check, not a target. Use the SAME geometry for all 156 frames.
8. **Native orientation** is as decoded (line 1 at left, time downward). Nothing on the record says which way is up; do not rotate the native frames.

## Meaningful wrong results (these become the M2 browser tests, so measure them)
On the circle frame: decode free-running (no sync lock: line k starts at frame_start + k * P_used) with P_used = the measured period times (1 + e) for e in 0, +0.01, +0.05, +0.20. Measure the slant as the drift of the detected sync edge within each decoded line, in samples per line, and compare with the prediction (e times the true period). Also decode with the interlace offset dropped and measure the comb artifact (for example the even/odd residual shift, or edge jaggedness). Save the images and record measured vs predicted in metrics.json.

## Outputs
- `build/ref/frames/L000.png` ... `R077.png`: 8-bit grayscale, native orientation.
- `build/ref/colour/img008.png` etc.: the 20 colour composites from the triples in `image_list_116.txt`, assembled R, G, B in frame order (an inference; say so), with the three separations registered by cross-correlation (record the shifts).
- `build/ref/contact_native.png`: all 156 frames as labelled thumbnails (frame id and image number), native orientation, 13 columns x 12 rows, at most 4000 px wide.
- `build/ref/contact_upright.png`: the same with Barry's orientation table applied, captioned "orientation: Barry 2017 table, reference only".
- `build/ref/circle_fit.png`: the circle frame at full size with the fitted ellipse drawn on and the axis ratio printed; plus `circle_before_droop.png`.
- `build/ref/wrong/`: the wrong-period and no-interlace circle decodes.
- `build/ref/frame_starts.json` and `build/ref/metrics.json`: per frame: start sample, line period (samples, ms), rms jitter, residual slant after locking, parity pattern, Barry difference; globals: droop time constant, interlace offset, aspect geometry, circle axis ratio, wrong-result measurements, tape speed versus the cover (measured period / 8.3396 ms), run time.
- **Slices for the browser** (`make_slices.py`): for each frame, a mono WAV at 96,000 Hz, 16-bit PCM (`build/slices/L000.wav` ...), from 0.05 s before the frame's first sync to 0.05 s after its last line, decimated by exactly 4 with an anti-alias filter (`scipy.signal.resample_poly(x, 1, 4)`), with ONE global gain for all slices (set from the tape's global peak so nothing clips; record it). `build/slices/index.json`: frame id, channel, image number, colour role, slice start sample at 384 kHz, first-line offset within the slice in 96 kHz samples, length, gain, sample rate. Then decode every frame from its 96 kHz slice with the same decoder (parameterized by sample rate) into `build/ref96/frames/`, and record the SSIM (scikit-image `structural_similarity`) of each 96 kHz decode against the 384 kHz decode in metrics. This tells us what the browser loses by using 96 kHz slices.
- `checks.py`: fast (under 60 s), exits non-zero on failure, prints one PASS/FAIL line per check: re-decodes the circle frame live from the tape and checks axis ratio 1.00 +/- 0.01; checks metrics.json has 156 decoded frames, all frame starts found independently and within 1 line of Barry after the median offset (list exceptions), median line period within 0.01 ms of 8.326 ms (the research's measured value), wrong-period slants within 10% of prediction, every slice exists and is under 2 MB, mean 96-vs-384 SSIM reported (no threshold yet, just print it).

## Rules
- Every constant carries a comment with its unit and source (research file and section, or "measured here").
- Deterministic: no randomness.
- No em dash anywhere (use a comma, colon or spaced hyphen). Do not read .env files. Do not commit.
- Run the full `decode_all.py` once the tape is complete (it may take several minutes; run it with Bash `run_in_background` if your tooling allows, or in chunks), then `make_slices.py`, then `checks.py`. LOOK at `circle_fit.png` and `contact_native.png` yourself (Read the PNGs) and fix anything visibly wrong (tearing, slant, inverted, misdetected frames) before reporting.

## Report back (short)
Files created; the key numbers (circle axis ratio, frame geometry, median line period, jitter, droop constant, interlace offset, Barry agreement, wrong-result slants measured vs predicted, mean and worst 96-vs-384 SSIM, total run time); the final `checks.py` output; frames that look bad and why; anything you could not meet.
