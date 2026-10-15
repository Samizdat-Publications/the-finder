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

`decode_all.py` takes about 8 minutes, `make_slices.py` about 40 s, `checks.py` about 5 s. Outputs:
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
`s(t) = y(t) - y(t0) + (1/tau) * (integral of (y - baseline) from t0 to t)`, t0 the shelf centre,
baseline 0. The time constant tau is estimated twice per channel, never chosen:

- **Line integral.** The end-of-line blanking plateau (295 to 170 samples before the next edge) and
  the shelf are both blanking levels, so across lines `plateau - shelf = C - I/tau`, I the integral
  of the signal between them (a straight-line fit, each frame its own C).
- **Edge tails (from picture content, no card needed).** After a large step along a line (the
  smoothed signal changes by more than 0.04 over 12 samples, one sample-and-hold dot), wherever the
  true picture is flat the raw signal decays as `y' = (b - y)/tau`. For each tail (250 samples,
  starting 30 after the step, no other step of a third that size inside it) the slope and mean are
  measured, and over all tails of a channel `slope = a - mean/tau` is fitted by least squares.

| Channel | Line integral | Edge tails (split halves) | Tails |
|---|---|---|---|
| Left | 401 samples (1.04 ms) | **448** (455, 442) | 20,017 |
| Right | 229 samples (0.60 ms) | **246** (238, 259) | 12,166 |

Validation on the left channel: the L000 card is uniform apart from the ring, so its background spread
should be smallest at the true tau. The scan has its minimum at **450** (card std 0.02406 at 450,
0.02409 at 400, 0.0365 with no droop correction). The edge-tail value lands on it, so by the rule
"prefer the edge-tail estimator when it agrees with the card on the left" the decoder uses the
edge-tail values on both channels: **L 448, R 246**. On the right the two estimators agree within 7%,
so the right channel's short time constant is real, not an estimator artefact. Sensitivity of the
edge-tail fit (prototype on half the frames): tail 150 to 400 samples and skip 15 to 100 give
L 451 to 507 and R 227 to 270. The fitted intercept would put the decay level at -0.007 to -0.02, but
the L000 card is clearly flattest with baseline 0 (card std 0.024 at 0 against 0.031 at -0.005), so
the decoder keeps baseline 0. Before and after (left: previous decode with the line-integral tau and no
parity correction; right: final): `build/ref/droop_compare/R007.png`, `R027.png`, `R063.png`,
`L000.png`. The change is visible but modest: the smears below the aircraft in R063 are fainter; the
light shafts in R027 are probably real (an underwater photograph).

**Streaks.** Measured first, with a streak index per frame: each line's offset from a 7-line running
median, taken as the median down the line (so content edges do not count), rms over the 512 lines,
in grey levels of the frame's own stretch. Mean over all 156 frames:

| Decode | Streak index |
|---|---|
| Previous (line-integral tau, no parity correction) | 4.97 |
| Edge-tail tau | 3.71 |
| **Edge-tail tau plus parity level profile (final)** | **3.14** |
| Final plus clamp levels smoothed (median of 5 same-parity lines) | 3.19 |

Two findings. (1) Part of the streaking is a systematic difference between long-pulse and short-pulse
lines that depends on the position down the line. Measured per frame (median of long-line offsets minus
short-line offsets, per row), its median over all frames of a channel is extremely reproducible (split
halves of the frames correlate 0.998 left and 0.999 right). It is smoothed over 9 rows and half is
removed from each parity (`DecodeParams.parity_profile`, 355 values per channel, stored in
`metrics.json`). Size: rms 0.0042 (left) and 0.0069 (right) tape units, up to 0.020 at the bottom of
right-channel lines. (2) The rest is independent line to line (lag-1 correlation about 0). It is not
clamp noise: longer, shorter, mean or median shelf windows and smoothing the clamp levels across 5 or 9
same-parity lines change it by under 0.1 grey level on average (kept as `DecodeParams.clamp_smooth`,
off). It is not a per-line gain change either: the sync-step amplitude does not correlate with it.
Its source is still open.
The worst frames by the final index are L036 (7.4), R075 (7.3), L009 (7.2), L072 (6.0) and R051 (5.7).
The circle axis ratio with all final settings is **1.0002**.

**5. Polarity and levels.** After the parity level profile (see "Streaks"), more signal is darker, so the value is negated. Each frame is stretched
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
samples)**: where the across-line spread of the droop-corrected signal (line-integral tau), median over all frames, is at least a quarter
of its level inside the picture. The number of rows was chosen so that an ellipse fitted to the
calibration circle's ring is round: **355 rows (7.44 samples per row)**, fitted axis ratio
**1.0002** with all final settings (horizontal over vertical; target 1.00 +/- 0.01), rms point
residual 1.1 px. Frame:
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
it applied, and roughens the ring edge (ellipse rms residual 1.39 px against 1.08 px).
`build/ref/wrong/no_interlace.png`.

## Browser slices

`make_slices.py` cuts each frame from 0.05 s before line 1 to 0.05 s after line 512, decimates by
exactly 4 (`scipy.signal.resample_poly(x, 1, 4)`, linear phase) to 96 kHz, 16-bit mono, with ONE global
gain (52,494.7 per unit; tape peak 0.5618 at 90% of full scale; largest slice sample 23,679; nothing
clipped). Each slice is 0.84 MB, 131 MB in all. `build/slices/index.json` gives frame id, channel,
image, colour role, slice start (384 kHz samples), first-line offset (96 kHz samples), length, gain
and rate. Every frame was then decoded from its WAV file at 96 kHz with the same code, seeded only by
the index's first-line offset: SSIM against the 384 kHz decode **0.986 mean, 0.970 worst (L009, a
dark spectrum separation)**;
edge times agree to 0.6 samples (384 kHz) rms in the median frame, 1.0 at worst.

## Known limits

- **Right-channel smears.** Both droop estimators put the right channel's tau near 230 to 250, and
  the final decode uses 246, yet faint bright smears remain below bright objects (R063, R007). The chain
  is probably not exactly first order. A per-line two-point restore (forcing the next shelf to the same
  level) removed more of the smear but made line-to-line streaking worse by about 40% on R063, R007
  and L000 (measured with an earlier, unnormalised form of the index), so it was not adopted.
- **512 is the cover's number, not the end of the picture.** In 41 frames picture activity continues
  for up to 24 lines after line 512, and the circle's centre sits at column 267.4 rather than 256, so
  the slide raster is probably about 530 lines with the circle centred in it. We decode 512 lines as
  the cover states; `sync.EXTRA_LINES` tracks 40 more, so a wider decode is a one-line change.
- Random line-to-line streaks remain (final index 3.1 grey levels on average); their source is not the
  clamp (see "Streaks").
- Line 1 is a definition (first sync after the comb). Barry's table differs by up to two lines.
