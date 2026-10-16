"""Export every parameter the browser picture decoder needs into data/decoder.json (M2 step 3).

Run after decode_all.py (it reads build/ref/metrics.json):
    python -P tools/ref-decoder/export_params.py

What it writes (all measured by decode_all.py on the 1977 tape; nothing here is chosen):
- `geometry`: the active window, rows, interlace offset, clamp span, droop baseline, clamp smoothing
  and level-stretch percentiles, in samples at the 384 kHz header rate (the browser scales them to its
  own rate, 96 kHz for the slices). Source: metrics.json `decode_params` (README sections 4 to 7).
- `channels`: the droop time constant tau and the 355-value parity level profile for each channel.
  Source: metrics.json `decode_params` (README section 4, "Streaks").
- `frames`: per frame, the fitted line period at 384 kHz, used only as the tracking prior, exactly as
  make_slices.py seeds its 96 kHz decode. Source: metrics.json `frames[].period_samples`.
- `reference`: the reference results the browser tests compare with (circle axis ratio, the wrong
  free-running slants, the no-interlace comb, the 96 kHz slice decode SSIM). Copied so a fresh clone
  without the tape or build/ can still run the tests.

Deterministic: the same metrics.json gives byte-identical output (no timestamps, fixed key order).
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
METRICS = os.path.join(ROOT, "build", "ref", "metrics.json")
OUT = os.path.join(ROOT, "data", "decoder.json")


def main() -> None:
    if not os.path.exists(METRICS):
        sys.exit("build/ref/metrics.json not found: run tools/ref-decoder/decode_all.py first")
    with open(METRICS, encoding="utf-8") as fh:
        m = json.load(fh)
    dp = m["decode_params"]
    L, R = dp["L"], dp["R"]
    shared = ["w0", "w1", "n_rows", "delta", "clamp0", "clamp1", "baseline", "clamp_smooth", "p_lo", "p_hi"]
    for k in shared:
        if L[k] != R[k]:
            sys.exit(f"decode_params.{k} differs between channels; the export assumes it is shared")
    if L["rate"] != 384000 or R["rate"] != 384000:
        sys.exit("decode_params are expected at the 384 kHz header rate")
    for ch in (L, R):
        if len(ch["parity_profile"]) != ch["n_rows"]:
            sys.exit("parity_profile length differs from n_rows")

    wrong = m["wrong_results"]
    aspect = m["aspect"]
    sl = m["slices"]
    out = {
        "meta": {
            "about": "Every parameter of the picture decoder (src/dsp/), as measured on the 1977 image tape by "
                     "the Python reference decoder (tools/ref-decoder/README.md). Lengths are samples at the "
                     "384 kHz header rate; the decoder scales them by its own rate / 384000.",
            "source": "build/ref/metrics.json (tools/ref-decoder/decode_all.py and make_slices.py)",
            "script": "tools/ref-decoder/export_params.py",
            "baseRate": 384000,
            "baseRateUnit": "Hz (the tape's header rate, images-and-audio.md section 2)",
        },
        "geometry": {
            "w0": L["w0"],
            "w1": L["w1"],
            "nRows": L["n_rows"],
            "columns": 512,
            "delta": L["delta"],
            "clamp0": L["clamp0"],
            "clamp1": L["clamp1"],
            "baseline": L["baseline"],
            "clampSmooth": L["clamp_smooth"],
            "pLo": L["p_lo"],
            "pHi": L["p_hi"],
        },
        "units": {
            "w0": "samples at 384 kHz after the line's falling edge: first picture sample (README section 7)",
            "w1": "samples at 384 kHz after the edge: end of the picture (README section 7)",
            "nRows": "rows per frame, set so the calibration circle is round (README section 7)",
            "columns": "lines per picture, one column each (cover: 512; README section 7)",
            "delta": "samples at 384 kHz: short-pulse lines' content lags long-pulse lines' (README section 6)",
            "clamp0": "samples at 384 kHz after the edge: start of the shelf used as the clamp level (README section 4)",
            "clamp1": "samples at 384 kHz after the edge: end of the clamp span, inclusive (README section 4)",
            "baseline": "tape units: the level the droop decays to (README section 4)",
            "clampSmooth": "lines: running median of clamp levels over same-parity lines (1 = off; README 'Streaks')",
            "pLo": "percent: black point of the per-frame level stretch (README section 5)",
            "pHi": "percent: white point of the per-frame level stretch (README section 5)",
            "tau": "samples at 384 kHz: droop (AC-coupling) time constant, edge-tail estimator (README section 4)",
            "parityProfile": "tape units per output row: long-pulse minus short-pulse level; half removed from each (README 'Streaks')",
            "periodSamples384k": "samples at 384 kHz: the frame's fitted line period, the tracking prior only (README section 3)",
        },
        "channels": {
            "L": {"tau": L["tau"], "parityProfile": [float(v) for v in L["parity_profile"]]},
            "R": {"tau": R["tau"], "parityProfile": [float(v) for v in R["parity_profile"]]},
        },
        "frames": {f["id"]: {"periodSamples384k": f["period_samples"]} for f in m["frames"]},
        "reference": {
            "about": "Results of the Python reference decoder that the browser decoder's tests compare with.",
            "circle": {
                "frame": "L000",
                "axisRatio": aspect["circle_axis_ratio"],
                "fit": aspect["circle_fit"],
                "target": "1.00 +/- 0.01 (README section 7)",
            },
            "freeRun": [
                {"e": w["e"], "periodUsed384k": w["period_used"],
                 "slantSamplesPerLine384k": w["slant_measured_samples_per_line"],
                 "slantPredicted384k": w["slant_predicted_samples_per_line"],
                 "linesMeasured": w["lines_measured"]}
                for w in wrong["free_run"]
            ],
            "noInterlace": {
                "evenOddShiftWithout384k": wrong["no_interlace"]["even_odd_shift_samples_without_offset"],
                "evenOddShiftWith384k": wrong["no_interlace"]["even_odd_shift_samples_with_offset"],
                "predictedWithout384k": wrong["no_interlace"]["predicted_shift_without_offset"],
                "ellipseRmsWithoutPx": wrong["no_interlace"]["ellipse_rms_residual_px_without_offset"],
                "ellipseRmsWithPx": wrong["no_interlace"]["ellipse_rms_residual_px_with_offset"],
            },
            "interlaceIqr384k": m["interlace"]["iqr"],
            "slices96": {
                "ssimMean": sl["ssim_96_vs_384_mean"],
                "ssimMin": sl["ssim_96_vs_384_min"],
                "ssimWorstFrame": sl["ssim_worst_frame"],
                "edgeRmsDiff384kMedian": sl["edge_rms_diff_samples_384k_median"],
            },
            "linePeriodMedian384k": m["line_period"]["median_samples"],
        },
    }
    text = json.dumps(out, indent=1, ensure_ascii=True) + "\n"
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
