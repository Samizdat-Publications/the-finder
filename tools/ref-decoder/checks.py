"""Fast assertions on the reference decoder's outputs (under a minute). Entry script.

Run after decode_all.py and make_slices.py:  python -P tools/ref-decoder/checks.py
Prints one PASS/FAIL line per check and exits non-zero if any check fails.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import aspect
import decode
import sync
import tape as tapemod

ROOT = tapemod.project_root()
REF = os.path.join(ROOT, "build", "ref")
SLICES = os.path.join(ROOT, "build", "slices")
RATE = tapemod.HEADER_RATE  # Hz (images-and-audio.md section 2)
# Calibration circle must be round to 1 percent (spec; the target the aspect is chosen for).
AXIS_TOL = 0.01
# Research's measured line time and tolerance, ms (images-and-audio.md section 1 "Line time": 8.326 ms;
# the spec allows 0.01 ms).
RESEARCH_LINE_MS = 8.326
LINE_MS_TOL = 0.01
# Wrong-period slants must match e x P within 10 percent (spec).
SLANT_TOL = 0.10
# Browser slice size limit, bytes (spec: under 2 MB).
SLICE_MAX = 2_000_000
FRAMES_TOTAL = 156  # 78 per channel (images-and-audio.md section 1, "Frames and channels")

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f": {detail}" if detail else ""), flush=True)


def circle_live(m):
    """Re-detect frame L000 near its recorded start, decode it and fit the circle."""
    t = tapemod.Tape(tapemod.default_tape_path(ROOT))
    f0 = next(f for f in m["frames"] if f["id"] == "L000")
    P = f0["period_samples"]
    a = int(f0["start_sample"] - 30 * P)
    x = t.read(0, a, int(560 * P))
    fr = sync.locate_frame2(x, f0["comb_end_sample"] - a, 1.0, P, n_lines=sync.LINES_PER_FRAME)
    used, _fit, _n = sync.lock_edges(fr["edges"])
    par = decode.pulse_parity(x, used)
    p = decode.DecodeParams(**m["decode_params"]["L"])
    img, V, _ = decode.decode_frame(x, used, par, p)
    fit = aspect.fit_ellipse(aspect.ring_points(-V))
    return fit, used[0] + a - f0["start_sample"]


def main():
    t0 = time.time()
    with open(os.path.join(REF, "metrics.json"), encoding="utf-8") as fh:
        m = json.load(fh)

    fit, dstart = circle_live(m)
    r = fit["axis_ratio"]
    check("circle axis ratio 1.00 +/- 0.01 (live decode of L000)", abs(r - 1.0) <= AXIS_TOL,
          f"{r:.4f}, {m['aspect']['columns']} x {m['aspect']['rows']}, re-detected start differs by {dstart:.2f} samples")

    frames = m["frames"]
    pngs = [f for f in frames if os.path.exists(os.path.join(REF, "frames", f["id"] + ".png"))]
    check("156 frames decoded", len(frames) == FRAMES_TOTAL and len(pngs) == FRAMES_TOTAL,
          f"{len(frames)} in metrics, {len(pngs)} PNGs")

    fpc = m["frames_per_channel"]
    check("all frame starts found independently (78 per channel, no errors)",
          m["all_found_independently"] and not m["detection"]["L"]["errors"] and not m["detection"]["R"]["errors"],
          f"L {fpc['L']}, R {fpc['R']}")

    # Our line 1 is, by definition, the first sync edge after the last comb pulse: it must lie after
    # the comb end and within about one line of it (1.1 lines allows one frame, R037, whose first
    # post-comb sync is swallowed by the last comb pulse; see README).
    gaps = [(f["start_sample"] - f["comb_end_sample"]) / f["period_samples"] for f in frames]
    check("every line 1 is the first sync after the start-of-picture comb (0 to 1.1 lines after it)",
          min(gaps) > 0 and max(gaps) <= 1.1, f"gap {min(gaps):.3f} to {max(gaps):.3f} lines")

    # Barry agreement. An exception is "explained" when Barry's own start is inside the comb (before its
    # last pulse) or at least 1.5 lines after it, i.e. his hand-picked start skipped or preceded the
    # first clean line; his table itself spreads from -0.4 to 2.1 lines after the comb end.
    b = m["barry"]
    byid = {f["id"]: f for f in frames}
    unexplained = []
    notes = []
    for fid in b["exceptions"]:
        f = byid[fid]
        bl = (f["barry_start"] - f["comb_end_sample"]) / f["period_samples"]
        notes.append(f"{fid}: Barry {bl:+.2f} lines from the comb end")
        if not (bl < 0 or bl >= 1.5):
            unexplained.append(fid)
    check("every start within 1 line of Barry after the median offset, or the exception explained",
          not unexplained,
          f"median offset {b['median_offset_samples']:.1f} samples, {b['within_1_line_after_median']}/156 within; "
          f"exceptions {notes or 'none'}; unexplained {unexplained or 'none'}; histogram (lines) {b['diff_lines_histogram']}")

    lp = m["line_period"]
    check("median line period within 0.01 ms of 8.326 ms", abs(lp["median_ms"] - RESEARCH_LINE_MS) <= LINE_MS_TOL,
          f"{lp['median_ms']:.5f} ms ({lp['median_samples']:.2f} samples), tape speed vs cover {lp['tape_speed_vs_cover']:.5f}")

    bad = []
    for w in m["wrong_results"]["free_run"]:
        if w["e"] == 0:
            continue
        rel = abs(w["slant_measured_samples_per_line"] / w["slant_predicted_samples_per_line"] - 1)
        if rel > SLANT_TOL:
            bad.append(w["e"])
    txt = ", ".join(f"e={w['e']:+.2f}: {w['slant_measured_samples_per_line']:.2f} vs {w['slant_predicted_samples_per_line']:.2f}"
                    for w in m["wrong_results"]["free_run"])
    check("wrong-period slants within 10% of prediction", not bad, txt)

    idx_path = os.path.join(SLICES, "index.json")
    ok = os.path.exists(idx_path)
    detail = "index.json missing"
    if ok:
        with open(idx_path, encoding="utf-8") as fh:
            idx = json.load(fh)["frames"]
        sizes = [os.path.getsize(os.path.join(SLICES, i["file"])) if os.path.exists(os.path.join(SLICES, i["file"])) else -1
                 for i in idx]
        ok = len(idx) == FRAMES_TOTAL and min(sizes) > 0 and max(sizes) < SLICE_MAX
        detail = f"{len(idx)} slices, largest {max(sizes) / 1e6:.3f} MB"
    check("every slice exists and is under 2 MB", ok, detail)

    s = m.get("slices")
    if s:
        print(f"INFO  96 kHz vs 384 kHz SSIM: mean {s['ssim_96_vs_384_mean']:.4f}, worst {s['ssim_96_vs_384_min']:.4f} "
              f"({s['ssim_worst_frame']})")
    else:
        check("96 kHz SSIM reported", False, "run make_slices.py")
    print(f"INFO  checks took {time.time() - t0:.1f} s")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
