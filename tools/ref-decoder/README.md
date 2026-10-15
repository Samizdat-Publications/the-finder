# Reference picture decoder (M1 step 1)

This folder turns the genuine 1977 image tape (`sources/image-tape/384kHzStereo.wav`, the Ozma
transfer; see `docs/research/images-and-audio.md` sections 1 to 3) into the 156 pictures the Golden
Record carries. It is the ground truth the browser decoder (M2) must match, so every step is measured
on the tape, and the numbers below come from `build/ref/metrics.json`, written by the run.

## How to run

From the project root (`C:\Users\stewa\Documents\Claude\Golden Record`):

```powershell
cd "C:\Users\stewa\Documents\Claude\Golden Record"; python -P tools/ref-decoder/decode_all.py; python -P tools/ref-decoder/make_slices.py; python -P tools/ref-decoder/checks.py
```

`decode_all.py` takes about 6 minutes, `make_slices.py` about 40 s, `checks.py` about 5 s. Outputs:
`build/ref/` (frames, colour composites, contact sheets, circle fit, wrong-result proofs,
`frame_starts.json`, `metrics.json`, `edges.npz`), `build/slices/` (96 kHz WAV slices and
`index.json`) and `build/ref96/` (pictures decoded from the slices). All are gitignored.

The 1.46 GB tape is never loaded whole: `tape.py` maps the data chunk and every step reads one frame
window (about 1.8 M samples) at a time. Nothing is random.

## Files

| File | What it does |
|---|---|
| `tape.py` | Reads the WAV header (32-bit float stereo, header rate 384,000 Hz kept as is) and returns windows of one channel. |
| `barry.py` | Parses Ron Barry's 2017 tables (frame starts, colour roles, orientations) out of `sources/barry-frames/voyager.cpp` with a small tokenizer. Used only to validate and, for one contact sheet, as a labelled reference. |
| `sync.py` | Finds the start-of-picture bursts, line 1 of every frame and each line's falling sync edge to a fraction of a sample; fits the line period. |
| `decode.py` | One frame to a picture: clamp, droop inverse, interlace shift, row sampling, polarity, level stretch. Also the droop estimator, free-running decodes and the slant meter. |
| `aspect.py` | Finds the calibration circle's ring and fits an ellipse to it. |
| `decode_all.py` | Entry: everything, in passes. |
| `make_slices.py` | Entry: 96 kHz slices for the browser, and the decode from them. |
| `checks.py` | Entry: fast PASS/FAIL checks. |

## What a line looks like

Each picture is 512 vertical lines ("traces"), drawn left to right; within a line, time runs down
the picture. Every line opens with a sync burst: a blanking plateau starting about 330 samples before
the edge, a spike (about 150 samples before the edge on one line, about 45 on the next: the two
alternating pulse widths of the cover's "staggered interlace"), then a sharp **falling edge**, then a
flat shelf. We lock every line to its falling edge, found to a fraction of a sample where the signal
crosses halfway between the level before and the shelf after.

## The method and the measured numbers

**1. Frames, found from the signal alone.** Before every picture the tape carries a burst of about 20
lines filled with regular pulses 197 samples apart (1951 Hz at the header rate; measured from the
spectrum of five bursts, 196.6 to 197.0). The burst is the cover's "8 triangular peaks" marker, repeated.
It is found on each channel from the high-passed signal (78 bursts on each channel; the long lead-in
tone at 10 s, 552 and 678 lines long, is rejected by its length). The comb is **not locked to the line
syncs**: it stops at any point of a line. So line 1 is defined as the first sync edge after the comb's
last pulse. All 156 frames were found this way, with no help from Barry's table. In every frame line 1
lies 0.01 to 1.06 lines after the last comb pulse; the one case above 1.0 is R037, where the sync that
should follow the comb is swallowed by the last comb pulse, so the first clean sync is the next one.

**2. Agreement with Barry (validation only).** Our starts differ from Barry's hand-made table by 0,
-1, -2 or +1 lines (76, 70, 9 and 1 frames). After removing the median offset (-3154 samples, one
line), 155 of 156 agree within one line. The exception is L041, where Barry's start lies 0.37 lines
before the end of the comb, inside it. Barry's own starts range from -0.4 to 2.1 lines after the comb
end, so the disagreements are his table's hand-picked spread, not missed frames.

**3. Line period.** A line fit (offset, period, plus the alternating stagger) to each frame's 512 edges:

- Median period **3195.05 samples = 8.3204 ms** at the header rate (cover: 8.3396 ms; the tape runs
  **0.23% fast** against the cover at the median).
- The period **drifts along the tape**: 3197.4 samples (8.3266 ms) at L000 and R000, falling steadily
  to about 3193.9 (8.3175 ms) at the last frames, identically on both channels: a tape-transport speed
  change of about 0.1% over the 7.5 minutes, as a reel-to-reel transport does when the reel radius
  changes. The research's 8.326 ms was measured near the start.
- Wow and flutter: median rms residual from the straight-line fit **4.6 samples**. Short-term sync
  jitter (from same-parity second differences, which cancel slow wow): **1.8 samples rms**.
- The two pulse widths alternate on every line of every frame (alternation fraction 1.000). The edges
  themselves are staggered: spacings alternate about 3191 and 3204 samples (stagger 6.3 samples).
- Decoding uses each line's own detected edge. Isolated misdetections (an edge more than 5 robust
  sigmas, and at least 4 samples, off a running median of the fit residuals) are replaced by the fit;
  only 4 edges in all 156 frames needed that. The residual slant after locking is zero to rounding
  (largest 7e-12 samples per line).

**4. DC restore and droop.** The tape chain is AC-coupled: an untreated decode has bright tops, dark
bottoms and trailing shadows (`build/ref/circle_before_droop.png`). Each line is clamped to the median
of its shelf (60 to 240 samples after the edge), and the first-order high-pass is inverted:
`s(t) = y(t) - y(t0) + (1/tau) * (integral of y from t0 to t)`, t0 the shelf centre.
The time constant tau is estimated, not chosen: the end-of-line blanking plateau (295 to 170 samples
before the next edge) and the shelf are both blanking levels, so their true difference is the same on
every line, and across lines `plateau - shelf = C - I/tau`, where I is the integral of the signal
between them. A straight-line fit over all lines of a channel (each frame its own C) gives:

- Left channel: **tau = 401 samples = 1.04 ms** at the header rate (per-frame median 410, IQR 375 to
  440).
- Right channel: **tau = 229 samples = 0.60 ms** (per-frame median 219, IQR 188 to 250).

Cross-check on the left channel: the calibration card of L000 is uniform apart from the ring, so its
background spread should be smallest at the true tau. Scanning tau gives a broad minimum at 450, and
the estimate 401 is within 0.3% of that minimum (card std 0.0244 against 0.0379 with no droop
correction). See `circle_fit.png` against `circle_before_droop.png`.

**5. Polarity and levels.** More signal is darker, so the value is negated. Each frame is stretched
independently from its 0.5th to its 99.5th percentile to 0..255 (both recorded per frame). Colour
separations are stretched independently too, so **absolute colour balance is not recoverable** from
these files.

**6. Interlace offset (measured).** The content of adjacent lines was cross-correlated over every
frame (1 sample per row, featured line pairs only). Pairs long-to-short and short-to-long are combined
so that genuinely slanted content cancels. Short-pulse lines' content lags long-pulse lines' content by
**7.31 samples** (median of 155 frames, IQR 6.99 to 8.02). Barry hard-coded 12. The decode moves
long-pulse lines by -3.66 and short-pulse lines by +3.66 samples, by sub-sample interpolation. Note
the edge stagger is 6.3 samples: most of the "interlace" offset may simply be the sync edges being
staggered while the picture runs on an even clock.

**7. Geometry and aspect.** One image column per line (512 columns, line 1 at the left), rows sampled
down the active part of each line. The active window is **258 to 2898 samples after the edge (2640
samples)**: where the across-line spread of the signal, median over all frames, is at least a quarter
of its level inside the picture. The number of rows was chosen so that an ellipse fitted to the
calibration circle's ring is round: **355 rows (7.44 samples per row)**, fitted axis ratio
**1.0005** (horizontal over vertical; target 1.00 +/- 0.01), rms point residual 1.1 px. Frame:
**512 x 355, aspect 1.44**. The same geometry is used for all 156 frames. (The 1992 CD-ROM images
were 512 x 384; Barry used 540 x 364, about 7.4 samples per row, close to ours.)

**8. Orientation.** Native frames are as decoded (line 1 at the left, time downward). Nothing on the
record says which way is up. `contact_upright.png` applies Barry's orientation table, as a labelled
reference only: his code 1 is a quarter turn clockwise, code 2 anticlockwise (read from the loops that
write his still images).

**9. Colour.** The 20 colour images are three consecutive frames each (from
`docs/research/data/images/image_list_116.txt`), assembled R, G, B in frame order: an inference
(gourneau shows the record alone cannot prove the order; the decoded solar spectrum does come out blue,
green, red from left to right). G and B are registered to R by cross-correlating their edge maps
(gradient magnitude, so a spectrum whose bright band moves between separations is not "aligned"),
within 6 pixels, to a tenth of a pixel. Shifts are recorded in `metrics.json`; they are all under
1.7 px, typically G -0.2 rows and B -0.5 to -0.9 rows. The solar spectrum (image 8) has a weak edge
correlation (0.14), so its registration is not meaningful.

## Meaningful wrong results (for the M2 browser tests)

All on the circle frame L000, measured with one slant meter: for each decoded line, the real falling
edge is found within half a line of the line start actually used, the offsets are unwrapped and fitted
against the line number.

| Decode | Slant measured (samples/line) | Predicted (e x period) |
|---|---|---|
| Free-running at the measured period (e = 0) | 0.00 | 0 |
| Period 1% long | -31.96 | -31.97 |
| Period 5% long | -159.86 | -159.87 |
| Period 20% long | -639.48 | -639.48 |
| Locked to each line's edge (the real decode) | 0.00 | 0 |

Images: `build/ref/wrong/free_run_e+0.00.png` and so on. Dropping the interlace offset leaves an
even/odd content shift of 8.8 samples on L000 (7.3 predicted from the global offset), against 1.3 with
it applied, and roughens the ring edge (ellipse rms residual 1.35 px against 1.09 px).
`build/ref/wrong/no_interlace.png`.

## Browser slices

`make_slices.py` cuts each frame from 0.05 s before line 1 to 0.05 s after line 512, decimates by
exactly 4 (`scipy.signal.resample_poly(x, 1, 4)`, linear phase) to 96 kHz, 16-bit mono, with ONE global
gain (52,494.7 per unit; tape peak 0.5618 at 90% of full scale; largest slice sample 23,679; nothing
clipped). Each slice is 0.84 MB, 131 MB in all. `build/slices/index.json` gives frame id, channel,
image, colour role, slice start (384 kHz samples), first-line offset (96 kHz samples), length, gain
and rate. Every frame was then decoded from its WAV file at 96 kHz with the same code, seeded only by
the index's first-line offset: SSIM against the 384 kHz decode **0.989 mean, 0.978 worst (L061)**;
edge times agree to 0.6 samples (384 kHz) rms in the median frame, 1.0 at worst.

## Known limits

- **Right-channel droop.** The right channel's tau (229) is estimated the same way as the left's, but
  right-channel pictures show bright vertical smears below bright objects (for example R063, R027,
  R007), a sign of over-correction; decodes at about 300 look cleaner by eye. The late-line picture
  spans give longer estimates (about 300 to 400, with a wide spread) than the blanking plateau, so the
  chain is probably not exactly first order. There is no calibration card on the right channel to
  settle it. Unresolved; the method is applied as measured.
- **512 is the cover's number, not the end of the picture.** In 41 frames picture activity continues
  for up to 24 lines after line 512, and the circle's centre sits at column 267.4 rather than 256, so
  the slide raster is probably about 530 lines with the circle centred in it. We decode 512 lines as
  the cover states; `sync.EXTRA_LINES` tracks 40 more, so a wider decode is a one-line change.
- Vertical streaks remain from per-line clamp noise integrated by the droop inverse.
- Line 1 is a definition (first sync after the comb). Barry's table differs by up to two lines.
