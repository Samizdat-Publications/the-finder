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
sys.path.insert(0, os.path.join(ROOT, "tools"))
from checkrecord import record_check  # noqa: E402
REF = os.path.join(ROOT, "build", "ref")
SLICES = os.path.join(ROOT, "build", "slices")
RATE = tapemod.HEADER_RATE  # Hz (images-and-audio.md section 2)
# Calibration circle must be round to 1 percent (spec; the target the aspect is chosen for).
AXIS_TOL = 0.01
# Wrong-period slants must match e x P within 10 percent (spec).
SLANT_TOL = 0.10
# Browser slice size limit, bytes (spec: under 2 MB).
SLICE_MAX = 2_000_000
# Visibility threshold for the remaining geometry error, percent. A CHOSEN threshold (perceptual), not a
# measured one: a circle 2% out of round still looks round in a 512-line picture.
PERCEPTUAL_LIMIT_PCT = 2.0
FRAMES_TOTAL = 156  # 78 per channel (images-and-audio.md section 1, "Frames and channels")
# Research's measured line period (images-and-audio.md section 1, "Samples per line": 3197.4 samples at
# 384 kHz, aizquier's 3197 plus 0.4; the same table's "8.326 ms" is that value truncated, 3197.4 samples
# being 8.32656 ms). Quoted to 0.1 sample, so the tolerance is the rounding, +/- 0.05 samples. Compared
# with the first frame, L000, because the period drifts along the reel and earlier decoders
# calibrated on the opening frames.
RESEARCH_START_SAMPLES = 3197.4
RESEARCH_START_TOL = 0.05
# Cover line time, ms (24-bit binary x 0.70402 ns; images-and-audio.md section 1, "Line time").
COVER_MS = 8.3396
# Lines per picture on the cover (cover.md section 1c: raster label 1000000000 = 512).
LINES_COVER = sync.LINES_PER_FRAME
# Registration uncertainty in our columns, pixels: the affine fits of geometry_check.py are set by line
# art about one pixel wide and the ring fits leave 1.08 px rms (README section 7); 2 px, chosen from that.
REG_TOL_PX = 2.0

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


def right_edge(m):
    """decoder.ref.rightEdge: every decoded frame is as wide as the longest raster measured on the tape, and
    NASA's clean images 5 and 6 (tests only) put their rightmost ink past the cover's 512 lines and inside
    our decoded width."""
    from PIL import Image
    ra = m.get("raster")
    gpath = os.path.join(REF, "geometry_check.json")
    if not ra or not os.path.exists(gpath):
        check("right edge measured", False, "run decode_all.py and geometry_check.py")
        return
    with open(gpath, encoding="utf-8") as fh:
        edges = json.load(fh).get("right_edge") or []
    cols = ra["decoded_columns"]
    widths = {Image.open(os.path.join(REF, "frames", f["id"] + ".png")).size[0] for f in m["frames"]}
    ok_raster = cols == ra["max"] and widths == {cols} and len(ra["unmeasured"]) <= 1
    parts, ok_edges = [], len(edges) == 2
    for e in edges:
        if "error" in e:
            ok_edges = False
            parts.append(f"{e['frame']}: {e['error']}")
            continue
        ink = e["clean_rightmost_ink_in_our_columns"]
        reach = max(ink, e["clean_card_right_in_our_columns"])  # where NASA's picture ends, in our columns
        # cut before: NASA's picture runs past the cover's 512 columns (boundary 511.5); whole now: it ends
        # inside the decoded width (boundary cols - 0.5), within the registration's own uncertainty
        ok_edges &= (LINES_COVER - 0.5) < reach <= (cols - 0.5) + REG_TOL_PX
        parts.append(f"{e['frame']} vs NASA image {e['image']} (NCC {e['ncc']:.2f}): the cover's 512 lines ended at "
                     f"{e['cover_512_edge_in_clean_px']:.0f} of its {e['clean_width_px']} px "
                     f"({100 * e['cover_512_edge_fraction_of_clean_width']:.1f}% of the width, "
                     f"{100 * e['cover_512_edge_fraction_of_card']:.1f}% of the card); its rightmost ink is our column "
                     f"{ink:.1f}, its card edge our column {e['clean_card_right_in_our_columns']:.1f}")
    txt = (f"rasters on the tape: {ra['min']} to {ra['max']} lines (median {ra['median']:.0f}; histogram {ra['histogram']}; "
           f"{ra['frames_measured']} of 156 frames measured, unmeasured {ra['unmeasured'] or 'none'}); decoded {cols} columns; "
           + "; ".join(parts))
    ok = ok_raster and ok_edges
    check("right edge: the decode takes the whole raster on the tape, and NASA's images 5 and 6 end inside it", ok, txt)
    record_check("decoder.ref.rightEdge",
                 "The 1977 tape carries each picture past the cover's 512 lines (534 to 536 lines), and the decoders take "
                 "the whole raster, so the Solar System parameters frames show their last column whole (Mars 6800; Pluto "
                 "14000 and 591).",
                 txt,
                 "the longest raster measured on the tape; NASA's clean images 5 and 6 (tests only) registered into our "
                 "frames end (card edge or rightmost ink) past column 511.5 and inside the decoded edge",
                 "raster end: the first of 9 consecutive flat lines (high-passed rms under 0.0009; post-raster lines measure "
                 "0.0005 to 0.0007, picture lines 0.0009 or more); registration as decoder.ref.aspectIndependent, within 2 px",
                 ok,
                 "Before M5 the decoders took the cover's 512 lines and cut the last column of L004 and L005. The cover's "
                 "512 is the raster label, not the end of the picture: the frames' rasters end at 534 to 536 lines, then the "
                 "tape carries flat lines until the next frame's start-of-picture comb. The measurements (window, droop, "
                 "interlace, aspect, streaks) stay on the first 512 lines; only the pictures are wider. NASA's image 6 is "
                 "cropped tighter than the tape (its card ends through the last 0 of 14000, about our column 517; the "
                 "tape carries card to about column 529). L006 is unmeasured: its syncs drop out from line 533; its "
                 "last columns are decoded on fitted line starts.")


def main():
    t0 = time.time()
    with open(os.path.join(REF, "metrics.json"), encoding="utf-8") as fh:
        m = json.load(fh)

    fit, dstart = circle_live(m)
    r = fit["axis_ratio"]
    rows = m["aspect"]["rows"]
    ok = abs(r - 1.0) <= AXIS_TOL
    txt = (f"hx/hy {r:.4f} (one row = {100 / rows:.2f}%), true ellipse minor/major {fit['axes_ratio_minor_major']:.4f} "
           f"with its major axis at {fit['theta_deg']:.0f} deg, {m['aspect']['columns']} x {rows}, "
           f"re-detected start differs by {dstart:.2f} samples")
    check("PROCEDURE SELF-TEST circle: live decode of L000 reproduces hx/hy 1.00 +/- 0.01 (the row count was "
          "chosen for this, so it confirms the procedure, not the geometry)", ok, txt)
    record_check("decoder.ref.circle",
                 "Procedure self-test: decoding the calibration circle live from the tape with the stored geometry "
                 "reproduces a horizontal-to-vertical extent ratio of 1.00 (the row count was chosen to make it so).",
                 txt, "hx/hy 1.00", "+/- 0.01 (the spec; one row changes it by 0.28%)", ok,
                 "Not an independent geometry test: see decoder.ref.aspectIndependent. The fitted ellipse is not a perfect "
                 "circle: minor/major 0.993 with a diagonal major axis, a shear no row count removes.")

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
    record_check("decoder.ref.frameStarts",
                 "All 156 frames are found from the signal alone, and their starts agree with Ron Barry's hand-made "
                 "2017 table.",
                 f"{b['within_1_line_after_median']} of 156 within 1 line after the median offset "
                 f"({b['median_offset_samples']:.0f} samples); exceptions: {', '.join(notes) or 'none'}",
                 "every start within 1 line of Barry's", "1 line (Barry's own starts spread over 2.5 lines)",
                 bool(m["all_found_independently"]) and not unexplained,
                 "Barry's table is validation only, never a seed. L041: his start lies inside the start-of-picture comb.")
    check("every start within 1 line of Barry after the median offset, or the exception explained",
          not unexplained,
          f"median offset {b['median_offset_samples']:.1f} samples, {b['within_1_line_after_median']}/156 within; "
          f"exceptions {notes or 'none'}; unexplained {unexplained or 'none'}; histogram (lines) {b['diff_lines_histogram']}")

    lp = m["line_period"]
    byid_p = {f["id"]: f["period_samples"] for f in frames}
    p_start = float(byid_p["L000"])
    ok_start = abs(p_start - RESEARCH_START_SAMPLES) <= RESEARCH_START_TOL
    fast_start = COVER_MS / (p_start / RATE * 1e3) - 1
    fast_med = COVER_MS / lp["median_ms"] - 1
    txt = (f"first frame L000: {p_start:.3f} samples = {p_start / RATE * 1e3:.5f} ms (R000 "
           f"{byid_p['R000'] / RATE * 1e3:.5f} ms); median of 156 frames "
           f"{lp['median_ms']:.4f} ms; cover {COVER_MS} ms, so the tape runs {100 * fast_start:.2f}% (start) to "
           f"{100 * fast_med:.2f}% (median) fast; the period falls along the reel from {lp['max_ms']:.4f} to "
           f"{lp['min_ms']:.4f} ms")
    check("line period at the start of the reel (L000) matches the research's independent 3197.4 samples",
          ok_start, txt)
    record_check("decoder.ref.linePeriod",
                 "The tape's line period, locked to the falling sync edges, matches an independent earlier measurement "
                 "and runs slightly fast against the cover's 8.3396 ms.",
                 txt, "3197.4 samples (8.3266 ms) on the master (images-and-audio.md section 1)",
                 "+/- 0.05 samples at L000 (the rounding of the quoted value); the median and the drift are information",
                 ok_start,
                 "The period drifts from 3197.4 to about 3193.9 samples along the reel, the same on both channels "
                 "(a tape transport effect). Only the first frame is compared, because the research's value is for the "
                 "opening frames; the median (8.3204 ms) and the drift are reported, not gated.")

    bad = []
    for w in m["wrong_results"]["free_run"]:
        if w["e"] == 0:
            continue
        rel = abs(w["slant_measured_samples_per_line"] / w["slant_predicted_samples_per_line"] - 1)
        if rel > SLANT_TOL:
            bad.append(w["e"])
    txt = ", ".join(f"e={w['e']:+.2f}: {w['slant_measured_samples_per_line']:.2f} vs {w['slant_predicted_samples_per_line']:.2f}"
                    for w in m["wrong_results"]["free_run"])
    check("PROCEDURE SELF-TEST slant meter: free-running decodes at (1+e) x period give slant -e x period within 10% "
          "(arithmetic once the edges are regular; it confirms the meter works)", not bad, txt)
    record_check("decoder.ref.slant",
                 "Slant-meter self-test: decoding the circle free-running with the line time 1%, 5% and 20% too long "
                 "slants the picture by e x the line period per line, as measured by the sync-edge slant meter.",
                 txt, "-e x period samples per line", "within 10%", not bad,
                 "A self-test of the meter the browser tests reuse, not an independent measurement.")

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
        txt = (f"mean {s['ssim_96_vs_384_mean']:.4f}, worst {s['ssim_96_vs_384_min']:.4f} ({s['ssim_worst_frame']}); "
               f"sync edges agree to {s['edge_rms_diff_samples_384k_median']:.2f} samples rms (384 kHz) in the median frame")
        print(f"INFO  96 kHz vs 384 kHz SSIM: {txt}")
        record_check("decoder.ref.ssim96",
                     "Decoding the 96 kHz browser slices loses little against decoding the 384 kHz tape.",
                     txt, "reported; no threshold yet (M2 sets the browser's)", "none (informational)", True,
                     "Same decoder and geometry at both rates; the 96 kHz decode is seeded only by the slice index.")
    else:
        check("96 kHz SSIM reported", False, "run make_slices.py")

    # Independent geometry: registration against NASA's clean gallery images (geometry_check.py).
    gpath = os.path.join(REF, "geometry_check.json")
    if os.path.exists(gpath):
        with open(gpath, encoding="utf-8") as fh:
            g = json.load(fh)
        xs, sh = g["x_over_y_scale"], g["shear"]
        n_img = len(g["used"])
        asp = 100 * (xs["mean"] - 1.0)  # percent: our aspect offset against the clean images
        asp_se = 100 * xs["sem"]
        shr = 100 * sh["mean"]
        shr_se = 100 * sh["sem"]
        # Criterion (a CHOSEN threshold, not a measured one): a geometry error is invisible when it is under
        # 2% (a circle 2% out of round still looks round in a 512-line picture). Both errors must stay under
        # it at their 2-standard-error upper bounds.
        asp_hi = abs(asp) + 2 * asp_se
        shr_hi = abs(shr) + 2 * shr_se
        ok = asp_hi < PERCEPTUAL_LIMIT_PCT and shr_hi < PERCEPTUAL_LIMIT_PCT
        cr = g.get("circle_registration") or {}
        txt = (f"{n_img} images against clean copies: aspect offset {asp:+.2f} +/- {asp_se:.2f}% "
               f"({abs(asp) / asp_se:.1f} standard errors: a detection, not agreement); shear {shr:+.2f} +/- {shr_se:.2f}% "
               f"({abs(shr) / shr_se:.0f} standard errors); upper bounds {asp_hi:.2f}% and {shr_hi:.2f}%; "
               f"the circle registered against the gallery circle: x/y {cr.get('x_over_y_scale', float('nan')):.4f}, "
               f"shear {cr.get('shear', float('nan')):+.4f}")
        check("independent geometry: remaining aspect and shear errors under the chosen 2% visibility limit "
              "(the errors themselves are detected)", ok, txt)
        record_check("decoder.ref.aspectIndependent",
                     "Against clean published copies of nine record images, the remaining errors in our picture "
                     "geometry are measurable but too small to see.",
                     txt, f"|aspect offset| and |shear| each under {PERCEPTUAL_LIMIT_PCT:.0f}% (chosen visibility threshold)",
                     "at mean + 2 standard errors of the mean over the images", ok,
                     "Measured, not agreement: our aspect is off by about 0.9% (about 2.6 standard errors) and our frames "
                     "are sheared by about 1.4% against the clean NASA gallery copies (tests only). The shear's origin is "
                     "unresolved: the 1977 equipment, the artwork or its copy, the gallery scans, or our decode. Our own "
                     "circle is a diagonal ellipse (0.9934 at 137 deg; shear +0.0066 if the artwork is round), opposite in "
                     "sign, and the gallery circle (0.986 at 136.9 deg) sits on the same diagonal.")
    else:
        check("independent geometry check run", False, "run geometry_check.py")

    # The right edge (M5 step 0b, README "Where the raster ends"): the decode must take the whole raster
    # the tape carries, so the Solar System parameters frames keep their last column.
    right_edge(m)
    print(f"INFO  checks took {time.time() - t0:.1f} s")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
