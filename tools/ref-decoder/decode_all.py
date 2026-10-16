"""Reference decode of every picture on the image tape (M1 step 1). Entry script.

Run from the project root:  python -P tools/ref-decoder/decode_all.py
Outputs go under build/ref/ (gitignored). See README.md in this folder for the method and the numbers.

Passes (each reads only one frame window of about 1.8 M samples per channel at a time):
 1. Frame detection on each channel from the signal alone (sync.detect_channel), then comparison with
    Barry's 2017 start table (validation only).
 2. Per frame: robust line-period fit, jitter, parity of the sync pulses; droop statistics.
 3. Droop time constant per channel (decode.fit_tau, pooled over all frames of the channel).
 4. Active window: from the across-line spread of the droop-corrected signal, all frames.
 5. Interlace offset: adjacent-line cross-correlation, all frames.
 6. Aspect: number of rows that makes the calibration circle (L000) round.
 7. Final decode of all 156 frames, colour composites, contact sheets, wrong-result proofs, metrics.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

import aspect
import barry
import decode
import sync
import tape as tapemod

ROOT = tapemod.project_root()
OUT = os.path.join(ROOT, "build", "ref")
RATE = tapemod.HEADER_RATE  # Hz, header rate (images-and-audio.md section 2)
LINES = sync.LINES_PER_FRAME  # 512 lines per picture (cover.md section 1c; NASA cover text)
# Cover line time, ms: binary 101101001100000000000000 x 0.70402 ns (images-and-audio.md section 1).
COVER_LINE_MS = sync.COVER_LINE_MS
# Research's measured line time on the master, ms (images-and-audio.md section 1, "Line time").
RESEARCH_LINE_MS = 8.326
# Margin read before line 1 and after the last tracked line of a frame window, samples at 384 kHz.
MARGIN = 4000
# Active-window rule: the window spans the samples (after the edge) where the median across frames of
# the across-line standard deviation of the droop-corrected signal is at least WINDOW_FRAC of its
# typical level inside the picture (median over WINDOW_REF samples after the edge). Chosen here: a
# quarter of the picture level is well above the shelf (about 0.003 vs 0.035) and catches the first
# and last sample-and-hold dot of content.
WINDOW_FRAC = 0.25
WINDOW_REF = (1000, 2600)
# Search limits for the window edges, samples after the edge (inside the shelf / before the end-of-line
# blanking step at about P - 330; measured here, README "What a line looks like").
WINDOW_SEARCH = (150, 3000)
# Lines of each frame excluded from the window statistics at either side (the left and right borders
# are often blank card). Chosen here.
STAT_LINES = (20, 500)
# Interlace: the cross-correlation search range in samples and the minimum peak correlation for a pair
# of adjacent lines to count (featured lines only). Chosen here.
IL_MAX_LAG = 40
IL_MIN_PEAK = 0.5
# Wrong-period factors for the meaningful-wrong-result proofs (spec: e = 0, +0.01, +0.05, +0.20).
WRONG_E = [0.0, 0.01, 0.05, 0.20]
# Level stretch percentiles (DecodeParams defaults: 0.5 and 99.5 percent).
# Contact sheet: 13 x 12 cells of 296 px (13 x 300 = 3900 px wide, under the 4000 px limit).
CELL = 296
GAP = 4
LABEL_H = 18
# Heuristic for "content after line 512": a line is active when its high-passed rms exceeds this
# (measured here: blank framing lines 0.001 to 0.002, picture lines 0.004 to 0.01).
ACTIVE_RMS = 0.003
# End of the raster (M5 step 0b, README "Where the raster ends"). The cover's 512 is not the end of the
# picture: after its last picture line every frame carries lines whose body is flat, high-passed rms
# (line_activity) 0.0005 to 0.0007 tape units, against 0.0009 or more on every picture line, blank card
# margins included (measured here on all 156 frames). A frame's raster ends where the first run of
# RASTER_RUN consecutive flat lines (rms under RASTER_FLAT) begins, searched from line RASTER_FROM.
# RASTER_FLAT sits between the two measured ranges; RASTER_RUN (chosen) keeps an isolated quiet picture
# line from ending the raster; RASTER_FROM (chosen) is far inside every picture.
RASTER_FLAT = 0.0009
RASTER_RUN = 9
RASTER_FROM = 400
# Droop cross-check grid on the calibration card, samples at 384 kHz. Chosen here to bracket the
# estimate by a factor of 2 to 5 each way.
TAU_SCAN = [200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 2000]
# Parity level profile: smoothed along the line over this many output rows (about 70 samples, a few
# sample-and-hold dots) so that frame-to-frame noise does not enter it. Chosen here.
PARITY_SMOOTH = 9
# Frames shown before and after the droop and streak changes (bright objects with smears below them,
# and the calibration card). Chosen by the lead.
COMPARE_FRAMES = ["R007", "R027", "R063", "L000"]
# Clamp smoothing tested for the streak report (same-parity running median, lines).
CLAMP_SMOOTH_TEST = 5


def log(*a):
    print(*a, flush=True)


def frame_id(ch: int, i: int) -> str:
    return ("L" if ch == 0 else "R") + f"{i:03d}"


def load_image_list():
    """image number, title, channel, frame ids, mono/RGB from docs/research/data/images/image_list_116.txt."""
    path = os.path.join(ROOT, "docs", "research", "data", "images", "image_list_116.txt")
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5 or not parts[0].strip().isdigit():
                continue
            out.append({"image": int(parts[0]), "title": parts[1], "channel": parts[2],
                        "frames": parts[3].split(","), "kind": parts[4].strip()})
    return out


def frame_window(t, ch, edges):
    a = int(np.floor(np.nanmin(edges))) - MARGIN
    b = int(np.ceil(np.nanmax(edges))) + MARGIN + 3300
    return t.read(ch, a, b - a), a


def line_activity(x, a, edges):
    """High-passed rms of each line body (edge k + 320 to edge k+1 - 360), for the content heuristic."""
    from scipy.ndimage import uniform_filter1d
    out = []
    for k in range(len(edges) - 1):
        s = int(edges[k]) - a + 320
        n = int(edges[k + 1]) - a - 360
        seg = x[s - 20:n + 20]
        y = seg - uniform_filter1d(seg, size=41, mode="nearest")
        out.append(float(np.sqrt(np.mean(y[20:-20] ** 2))))
    return np.array(out)


def raster_lines(x, a, edges):
    """Lines of picture before the flat post-raster lines (README "Where the raster ends"), or None when
    tracking stops (a NaN edge) before a run of RASTER_RUN flat lines is found. Same line body and
    high-pass as line_activity, over consecutive tracked lines only."""
    act = []
    for k in range(len(edges) - 1):
        if not (np.isfinite(edges[k]) and np.isfinite(edges[k + 1])):
            break
        act.append(line_activity(x, a, edges[k:k + 2])[0])
    act = np.array(act)
    for k in range(RASTER_FROM, len(act) - RASTER_RUN + 1):
        if np.all(act[k:k + RASTER_RUN] < RASTER_FLAT):
            return k
    return None


# Colour registration: separations are aligned by normalized cross-correlation of their gradient
# magnitude (edges, not brightness, which legitimately differs between colours; e.g. the solar spectrum
# moves from separation to separation) over integer shifts up to REG_MAX pixels, refined to a fraction
# of a pixel with a parabola. REG_MAX chosen here: frames are each locked to their own syncs, so only
# small residual offsets are expected.
REG_MAX = 6


def register(ref, mov):
    """(row, col) shift to apply to mov to align it with ref, and the peak correlation."""
    def grad(a):
        return np.hypot(ndimage.sobel(a, 0), ndimage.sobel(a, 1))
    A = grad(ref)
    Bm = grad(mov)
    m = REG_MAX
    Ac = A[m:-m, m:-m]
    Ac = (Ac - Ac.mean()) / (Ac.std() + 1e-12)
    cc = np.zeros((2 * m + 1, 2 * m + 1))
    for i, dr in enumerate(range(-m, m + 1)):
        for j, dc in enumerate(range(-m, m + 1)):
            Bc = Bm[m - dr:Bm.shape[0] - m - dr, m - dc:Bm.shape[1] - m - dc]
            Bc = (Bc - Bc.mean()) / (Bc.std() + 1e-12)
            cc[i, j] = float(np.mean(Ac * Bc))
    i, j = np.unravel_index(int(np.argmax(cc)), cc.shape)

    def para(y0, y1, y2):
        den = y0 - 2 * y1 + y2
        return 0.5 * (y0 - y2) / den if den < 0 else 0.0

    fr = para(cc[i - 1, j], cc[i, j], cc[i + 1, j]) if 0 < i < 2 * m else 0.0
    fc = para(cc[i, j - 1], cc[i, j], cc[i, j + 1]) if 0 < j < 2 * m else 0.0
    # cc[i, j] compares ref(p) with mov(p - (dr, dc)), so mov is moved by +(dr, dc)
    return np.array([i - m + fr, j - m + fc]), float(cc[i, j])


def save_gray(path, img):
    Image.fromarray(img).save(path)


def label_font():
    try:
        return ImageFont.load_default(size=14)
    except TypeError:
        return ImageFont.load_default()


def contact_sheet(images, labels, path, caption=None):
    cols, rows = 13, 12
    font = label_font()
    cap_h = 26 if caption else 0
    W = cols * (CELL + GAP) + GAP
    H = rows * (CELL + LABEL_H + GAP) + GAP + cap_h
    sheet = Image.new("L", (W, H), 32)
    d = ImageDraw.Draw(sheet)
    if caption:
        d.text((GAP, 5), caption, fill=230, font=font)
    for i, (img, lab) in enumerate(zip(images, labels)):
        r, c = divmod(i, cols)
        im = Image.fromarray(img)
        s = min(CELL / im.width, CELL / im.height)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        x0 = GAP + c * (CELL + GAP)
        y0 = cap_h + GAP + r * (CELL + LABEL_H + GAP)
        sheet.paste(im, (x0 + (CELL - im.width) // 2, y0 + (CELL - im.height) // 2))
        d.text((x0 + 2, y0 + CELL + 1), lab, fill=230, font=font)
    sheet.save(path)


def main():
    t_start = time.time()
    os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "colour"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "wrong"), exist_ok=True)
    t = tapemod.Tape(tapemod.default_tape_path(ROOT))
    if t.rate != RATE:
        raise SystemExit(f"header rate {t.rate}, expected {RATE}")
    B = barry.load()
    imlist = load_image_list()
    frame_to_image = {}
    for im in imlist:
        for j, fid in enumerate(im["frames"]):
            frame_to_image[fid] = (im["image"], ("R", "G", "B")[j] if im["kind"] == "RGB" else "mono")

    # ---------- 1. frame detection ----------
    frames = []  # dicts in channel order
    detection = {}
    for ch in (0, 1):
        t0 = time.time()
        found, bursts, rejected = sync.detect_channel(t, ch)
        errors = [f for f in found if "error" in f]
        good = [f for f in found if "edges" in f]
        detection["LR"[ch]] = {"bursts": len(bursts), "frames_found": len(good),
                               "errors": [{"burst_s": f["burst"][1] / RATE, "error": f["error"]} for f in errors],
                               "rejected_bursts": [{"start_s": a / RATE, "lines": n} for a, _b, n in rejected],
                               "seconds": round(time.time() - t0, 1)}
        log(f"channel {'LR'[ch]}: {len(bursts)} bursts, {len(good)} frames, {len(errors)} errors, "
            f"{time.time() - t0:.0f} s")
        for i, f in enumerate(good):
            frames.append({"id": frame_id(ch, i), "ch": ch, "index": i, "edges_raw": f["edges"],
                           "comb_end": f["comb_end"], "burst": f["burst"]})
    n_found = {ch: sum(1 for f in frames if f["ch"] == ch) for ch in (0, 1)}

    # ---------- 2. per-frame fit, parity, droop statistics ----------
    base = decode.DecodeParams()
    droop_groups = {0: [], 1: []}
    for f in frames:
        e_all = f["edges_raw"]
        e = e_all[:LINES]
        used, fit, n_rep = sync.lock_edges(e)
        x, a = frame_window(t, f["ch"], e_all)
        par = decode.pulse_parity(x, used - a)
        dy, I = decode.droop_stats(x, used - a, base)
        droop_groups[f["ch"]].append((dy, I))
        act = line_activity(x, a, e_all[np.isfinite(e_all)])
        quiet = np.nonzero(act[LINES:] < ACTIVE_RMS)[0]
        f.update({"used": used, "fit": fit, "n_replaced": n_rep, "parity_long": par,
                  "P": fit["P"], "rms_resid": fit["rms"], "jitter": sync.same_parity_jitter(e),
                  "stagger": 2 * abs(fit["b"]),
                  "active_lines_after_512": int(quiet[0]) if len(quiet) else int(len(act) - LINES),
                  "raster_lines": raster_lines(x, a, e_all),
                  "tau_frame": None})
        dI = I - I.mean()
        beta = float(np.sum(dI * (dy - dy.mean())) / np.sum(dI * dI))
        f["tau_frame"] = -1.0 / beta if beta < 0 else float("nan")
    log(f"pass 2 done, {time.time() - t_start:.0f} s")
    # Columns decoded: the longest raster measured on the tape, so no frame's picture is cut (README
    # "Where the raster ends"). Every measurement below (window, droop, interlace, aspect, streaks, slant)
    # stays on the cover's 512 lines; only the final pictures take the whole raster.
    rl = [f["raster_lines"] for f in frames if f["raster_lines"] is not None]
    COLUMNS = int(max(rl))
    for f in frames:
        x, a = frame_window(t, f["ch"], f["edges_raw"])
        used_c, _fit_c, n_rep_c = sync.lock_edges(f["edges_raw"][:COLUMNS])
        f.update({"used_cols": used_c, "parity_cols": decode.pulse_parity(x, used_c - a), "n_replaced_cols": n_rep_c})
    log(f"raster: {len(rl)} frames measured, {min(rl)} to {max(rl)} lines (median {np.median(rl):.0f}); "
        f"decoding {COLUMNS} columns")

    # ---------- 3. droop time constant per channel ----------
    tau = {}  # line-integral estimate first; replaced by the chosen estimate in pass 4b
    tau_info = {}
    for ch in (0, 1):
        tv, se, n = decode.fit_tau(droop_groups[ch])
        tf = np.array([f["tau_frame"] for f in frames if f["ch"] == ch])
        tau[ch] = tv
        tau_info["LR"[ch]] = {"tau_samples_384k": tv, "tau_ms_header_rate": tv / RATE * 1e3, "se_samples": se,
                              "lines": n, "per_frame_median": float(np.nanmedian(tf)),
                              "per_frame_iqr": [float(np.nanpercentile(tf, 25)), float(np.nanpercentile(tf, 75))]}
        log(f"tau {'LR'[ch]}: {tv:.1f} +/- {se:.1f} samples (per-frame median {np.nanmedian(tf):.0f})")

    # ---------- 4. active window ----------
    full = decode.DecodeParams(w0=0.0, w1=3180.0, n_rows=3180)
    profs = []
    for f in frames:
        x, a = frame_window(t, f["ch"], f["edges_raw"])
        p = decode.DecodeParams(**{**full.to_dict(), "tau": tau[f["ch"]]})
        V = decode.decode_values(x, f["used"] - a, f["parity_long"], p)
        profs.append(np.std(V[:, STAT_LINES[0]:STAT_LINES[1]], axis=1))
    md = np.median(np.array(profs), axis=0)
    ref = float(np.median(md[WINDOW_REF[0]:WINDOW_REF[1]]))
    thr = WINDOW_FRAC * ref
    above = np.nonzero(md[WINDOW_SEARCH[0]:WINDOW_SEARCH[1]] >= thr)[0] + WINDOW_SEARCH[0]
    w0, w1 = float(above[0]), float(above[-1] + 1)
    log(f"active window {w0:.0f}..{w1:.0f} samples after the edge ({w1 - w0:.0f} samples)")

    # ---------- 4b. droop from picture content (edge tails), card check, choice ----------
    tails = {0: ([], []), 1: ([], [])}
    for f in frames:
        x, a = frame_window(t, f["ch"], f["edges_raw"])
        sl, mn = decode.edge_tail_stats(x, f["used"] - a, decode.DecodeParams(w0=w0, w1=w1))
        tails[f["ch"]][0].append(sl)
        tails[f["ch"]][1].append(mn)
    tau_line = dict(tau)
    tau_tail = {}
    for ch in (0, 1):
        sl = np.concatenate(tails[ch][0])
        mn = np.concatenate(tails[ch][1])
        tv, icpt, n = decode.fit_tau_tails(sl, mn)
        # spread: the same fit on each half of the frames (even and odd frame index)
        halves = []
        for h in (0, 1):
            hs = np.concatenate(tails[ch][0][h::2])
            hm = np.concatenate(tails[ch][1][h::2])
            halves.append(decode.fit_tau_tails(hs, hm)[0])
        tau_tail[ch] = tv
        tau_info["LR"[ch]]["line_integral_tau_samples_384k"] = tau_line[ch]
        tau_info["LR"[ch]]["edge_tail_tau_samples_384k"] = tv
        tau_info["LR"[ch]]["edge_tail_intercept"] = icpt
        tau_info["LR"[ch]]["edge_tail_n"] = n
        tau_info["LR"[ch]]["edge_tail_split_half"] = halves
        log(f"edge-tail tau {'LR'[ch]}: {tv:.1f} samples from {n} tails (halves {halves[0]:.0f}, {halves[1]:.0f}); "
            f"line-integral {tau_line[ch]:.1f}")
    # card check on L000 at provisional geometry (the card spread does not depend on it)
    circ = next(f for f in frames if f["id"] == "L000")
    xc, ac = frame_window(t, 0, circ["edges_raw"])
    ec = circ["used"] - ac
    n_prov = int(round((w1 - w0) / 7.5))
    _i, Vc0, _l = decode.decode_frame(xc, ec, circ["parity_long"],
                                      decode.DecodeParams(w0=w0, w1=w1, n_rows=n_prov, tau=tau_tail[0]))
    gimg = _i.astype(float)
    bgm = ndimage.median_filter(gimg, size=aspect.BG_SIZE, mode="nearest")
    card = ndimage.binary_erosion((bgm - gimg) < 20, iterations=4)  # 20 grey levels: off the ring
    card[:, :STAT_LINES[0]] = False
    card[:, STAT_LINES[1]:] = False

    def card_std(tv):
        V_ = decode.decode_values(xc, ec, circ["parity_long"], decode.DecodeParams(w0=w0, w1=w1, n_rows=n_prov, tau=tv))
        return float(np.std(V_[card]))

    scan = [{"tau": tv, "card_std": card_std(tv)} for tv in TAU_SCAN]
    best = min(scan, key=lambda q: q["card_std"])
    # Choice rule (from the lead): prefer the edge-tail estimator when, on the left channel, it is
    # at least as close to the card optimum as the line-integral estimator.
    use_tail = abs(tau_tail[0] - best["tau"]) <= abs(tau_line[0] - best["tau"])
    tau = dict(tau_tail if use_tail else tau_line)
    droop_flat = {"card_flatness_scan_L000": scan, "card_flatness_best_tau": best["tau"],
                  "card_std_at_line_integral": card_std(tau_line[0]),
                  "card_std_at_edge_tail": card_std(tau_tail[0]),
                  "card_std_without_droop_correction": card_std(1e12),
                  "chosen": "edge_tail" if use_tail else "line_integral",
                  "tau_used": {"L": tau[0], "R": tau[1]}}
    log(f"card best tau {best['tau']}; using the {droop_flat['chosen']} estimates: L {tau[0]:.1f}, R {tau[1]:.1f}")

    # ---------- 5. interlace offset ----------
    il = []
    for f in frames:
        x, a = frame_window(t, f["ch"], f["edges_raw"])
        p = decode.DecodeParams(w0=w0, w1=w1, n_rows=int(w1 - w0), tau=tau[f["ch"]], delta=0.0)
        V = decode.decode_values(x, f["used"] - a, f["parity_long"], p)
        m = decode.measure_interlace(V, f["parity_long"], max_lag=IL_MAX_LAG, min_peak=IL_MIN_PEAK)
        f["interlace"] = m
        if np.isfinite(m["offset"]):
            il.append(m["offset"])
    il = np.array(il)
    delta = float(np.median(il))
    log(f"interlace offset {delta:.2f} samples (median of {len(il)} frames, IQR "
        f"{np.percentile(il, 25):.2f}..{np.percentile(il, 75):.2f})")

    # ---------- 6. aspect from the calibration circle ----------
    def circle_decode(n_rows, **kw):
        p = decode.DecodeParams(w0=w0, w1=w1, n_rows=int(n_rows), tau=tau[0], delta=delta)
        for k, v in kw.items():
            setattr(p, k, v)
        img, V, lv = decode.decode_frame(xc, ec, circ["parity_long"], p)
        return img, V, p

    n_rows = int(round((w1 - w0) / 7.5))  # provisional start (Barry's 2680 samples / 364 rows = 7.4)
    history = []
    for _ in range(4):
        img, V, _p = circle_decode(n_rows)
        fit = aspect.fit_ellipse(aspect.ring_points(-V))
        history.append({"n_rows": n_rows, "axis_ratio": fit["axis_ratio"]})
        nxt = int(round(n_rows * fit["axis_ratio"]))
        if nxt == n_rows:
            break
        n_rows = nxt
    img, V, pc = circle_decode(n_rows)
    cfit = aspect.fit_ellipse(aspect.ring_points(-V))
    log(f"aspect: {n_rows} rows, circle axis ratio {cfit['axis_ratio']:.4f}, tilt {cfit['theta_deg']:.2f} deg")
    spr = (w1 - w0) / n_rows

    # circle images
    def draw_fit(img, fit, path, text):
        im = Image.fromarray(img).convert("RGB")
        d = ImageDraw.Draw(im)
        ex, ey = aspect.ellipse_outline(fit)
        d.line(list(zip(ex.tolist(), ey.tolist())), fill=(255, 40, 40), width=1)
        d.text((6, 6), text, fill=(255, 220, 0), font=label_font())
        im.save(path)

    img_nd, V_nd, _ = circle_decode(n_rows, tau=1e12)
    save_gray(os.path.join(OUT, "circle_before_droop.png"), img_nd)

    # ---------- 6b. parity level profile and streak measurements ----------
    base_params = {ch: decode.DecodeParams(w0=w0, w1=w1, n_rows=n_rows, tau=tau[ch], delta=delta) for ch in (0, 1)}
    par_profs = {0: [], 1: []}
    streak_new_tau = []
    for f in frames:
        x, a = frame_window(t, f["ch"], f["edges_raw"])
        V = decode.decode_values(x, f["used"] - a, f["parity_long"], base_params[f["ch"]])
        par_profs[f["ch"]].append(decode.parity_offsets(V, f["parity_long"]))
        _g, lv = decode.to_gray(V, base_params[f["ch"]])
        streak_new_tau.append(decode.streak_index(V, lv))
    parity_profile = {}
    parity_info = {}
    for ch in (0, 1):
        arr = np.array(par_profs[ch])
        prof = ndimage.uniform_filter1d(np.median(arr, axis=0), PARITY_SMOOTH, mode="nearest")
        h0 = np.median(arr[0::2], axis=0)
        h1 = np.median(arr[1::2], axis=0)
        parity_profile[ch] = prof
        parity_info["LR"[ch]] = {"rms_tape_units": float(np.sqrt(np.mean(prof ** 2))),
                                 "max_abs_tape_units": float(np.max(np.abs(prof))),
                                 "split_half_correlation": float(np.corrcoef(h0, h1)[0, 1])}
        log(f"parity profile {'LR'[ch]}: rms {parity_info['LR'[ch]]['rms_tape_units'] * 1e3:.2f}e-3, "
            f"split-half r {parity_info['LR'[ch]]['split_half_correlation']:.3f}")

    # ---------- 7. final decode of every frame ----------
    params = {ch: decode.DecodeParams(w0=w0, w1=w1, n_rows=n_rows, tau=tau[ch], delta=delta,
                                      parity_profile=[float(v) for v in parity_profile[ch]]) for ch in (0, 1)}
    images = {}
    per_frame = []
    Bst = B["start_points"]
    for f in frames:
        x, a = frame_window(t, f["ch"], f["edges_raw"])
        el = f["used"] - a
        img, V, lv = decode.decode_frame(x, f["used_cols"] - a, f["parity_cols"], params[f["ch"]])
        images[f["id"]] = img
        f["streak_final"] = decode.streak_index(V[:, :LINES], lv)  # on the cover's 512, as before
        save_gray(os.path.join(OUT, "frames", f["id"] + ".png"), img)
        last = float(f["edges_raw"][LINES - 1]) - a
        sl = decode.measure_slant(x, el, f["P"], last)
        bs = Bst[f["ch"]][f["index"]] if f["index"] < len(Bst[f["ch"]]) else None
        par = f["parity_long"]
        im_no, role = frame_to_image.get(f["id"], (None, None))
        per_frame.append({
            "id": f["id"], "channel": "LR"[f["ch"]], "image": im_no, "role": role,
            "start_sample": float(f["used"][0]), "start_s": float(f["used"][0]) / RATE,
            "comb_end_sample": int(f["comb_end"]), "burst_lines": float(f["burst"][2]),
            "period_samples": f["P"], "period_ms": f["P"] / RATE * 1e3,
            "rms_resid_samples": f["rms_resid"], "jitter_samples": f["jitter"],
            "parity_stagger_samples": f["stagger"], "edges_replaced": f["n_replaced"],
            "residual_slant_samples_per_line": sl["slope"],
            "parity_first_line": "long" if par[0] else "short",
            "parity_alternation": float(np.mean(par[1:] != par[:-1])),
            "interlace_offset_samples": f["interlace"]["offset"],
            "tau_frame_samples": f["tau_frame"],
            "streak_index_final": f["streak_final"],
            "active_lines_after_512": f["active_lines_after_512"],
            "raster_lines": f["raster_lines"],
            "edges_replaced_decoded_columns": f["n_replaced_cols"],
            "levels": {"p_lo": params[f["ch"]].p_lo, "p_hi": params[f["ch"]].p_hi, "lo": lv[0], "hi": lv[1]},
            "barry_start": bs,
            "barry_diff_samples": (float(f["used"][0]) - bs) if bs is not None else None,
        })
    # final circle fit (all final parameters, including the parity profile)
    xfin = decode.decode_values(xc, ec, circ["parity_long"], params[0])
    cfit_final = aspect.fit_ellipse(aspect.ring_points(-xfin))
    draw_fit(images["L000"], cfit_final, os.path.join(OUT, "circle_fit.png"),
             f"L000 fitted ellipse: axis ratio {cfit_final['axis_ratio']:.3f} (horizontal/vertical), "
             f"{LINES} x {n_rows}")
    log(f"final circle axis ratio {cfit_final['axis_ratio']:.4f}")

    # streak index under alternative settings, and before/after pictures
    old_params = {ch: decode.DecodeParams(w0=w0, w1=w1, n_rows=n_rows, tau=tau_line[ch], delta=delta) for ch in (0, 1)}
    cs_params = {ch: decode.DecodeParams(**{**params[ch].to_dict(), "clamp_smooth": CLAMP_SMOOTH_TEST}) for ch in (0, 1)}
    streak_old, streak_cs = [], []
    os.makedirs(os.path.join(OUT, "droop_compare"), exist_ok=True)
    for f in frames:
        x, a = frame_window(t, f["ch"], f["edges_raw"])
        el = f["used"] - a
        img_o, V_o, lv_o = decode.decode_frame(x, el, f["parity_long"], old_params[f["ch"]])
        streak_old.append(decode.streak_index(V_o, lv_o))
        _ic, V_c, lv_c = decode.decode_frame(x, el, f["parity_long"], cs_params[f["ch"]])
        streak_cs.append(decode.streak_index(V_c, lv_c))
        if f["id"] in COMPARE_FRAMES:
            new = images[f["id"]]
            gap = np.full((new.shape[0], 6), 255, np.uint8)
            Image.fromarray(np.hstack([img_o, gap, new])).save(os.path.join(OUT, "droop_compare", f["id"] + ".png"))
    streaks = {"definition": "per frame: rms over lines of each line's offset from a 7-line running median "
                             "(median down the line), in grey levels of the frame's own stretch; mean over 156 frames",
               "before_line_integral_tau_no_parity": float(np.mean(streak_old)),
               "edge_tail_tau_no_parity": float(np.mean(streak_new_tau)),
               "final_edge_tail_tau_with_parity_profile": float(np.mean([f["streak_final"] for f in frames])),
               f"final_plus_clamp_median_{CLAMP_SMOOTH_TEST}": float(np.mean(streak_cs)),
               "parity_profile": parity_info,
               "compare_images": ["droop_compare/" + i + ".png" for i in COMPARE_FRAMES],
               "compare_layout": "left: previous decode (line-integral tau, no parity profile); right: final"}
    log("streak index mean: " + ", ".join(f"{k} {v:.2f}" for k, v in streaks.items() if isinstance(v, float)))

    # Barry agreement after the median offset
    diffs = np.array([p["barry_diff_samples"] for p in per_frame], float)
    P_med = float(np.median([p["period_samples"] for p in per_frame]))
    med_off = float(np.median(diffs))
    for p in per_frame:
        p["barry_diff_lines"] = p["barry_diff_samples"] / P_med
        p["barry_diff_lines_after_median"] = (p["barry_diff_samples"] - med_off) / P_med
    within = [abs(p["barry_diff_lines_after_median"]) <= 1.0 + 0.02 for p in per_frame]
    exceptions = [p["id"] for p, w in zip(per_frame, within) if not w]
    hist = {}
    for p in per_frame:
        k = str(int(round(p["barry_diff_lines"])))
        hist[k] = hist.get(k, 0) + 1
    log(f"Barry: median offset {med_off:.1f} samples, {sum(within)}/{len(within)} within 1 line, exceptions {exceptions}")

    # ---------- wrong results on the circle ----------
    wrong = []
    s0 = float(circ["used"][0]) - ac
    last_c = float(circ["edges_raw"][LINES - 1]) - ac
    Pc = circ["P"]
    for e in WRONG_E:
        starts = decode.free_run_edges(s0, Pc * (1 + e), LINES)
        par_free = np.array([circ["parity_long"][0] if k % 2 == 0 else not circ["parity_long"][0]
                             for k in range(LINES)])
        p = params[0]
        img_w, _, _ = decode.decode_frame(xc, starts, par_free, p)
        name = f"free_run_e{e:+.2f}.png"
        save_gray(os.path.join(OUT, "wrong", name), img_w)
        sl = decode.measure_slant(xc, starts, Pc, last_c)
        pred = -e * Pc
        wrong.append({"e": e, "period_used": Pc * (1 + e), "image": "wrong/" + name,
                      "slant_measured_samples_per_line": sl["slope"], "slant_predicted_samples_per_line": pred,
                      "ratio": (sl["slope"] / pred) if e else None, "lines_measured": sl["n_used"]})
        log(f"free run e={e:+.2f}: slant {sl['slope']:.2f} (predicted {pred:.2f}) samples/line")
    # no interlace offset
    p_noil = decode.DecodeParams(**{**params[0].to_dict(), "delta": 0.0})
    img_noil, _, _ = decode.decode_frame(xc, ec, circ["parity_long"], p_noil)
    save_gray(os.path.join(OUT, "wrong", "no_interlace.png"), img_noil)
    fine = dict(w0=w0, w1=w1, n_rows=int(w1 - w0), tau=tau[0])
    m_no = decode.measure_interlace(decode.decode_values(xc, ec, circ["parity_long"], decode.DecodeParams(**fine, delta=0.0)),
                                    circ["parity_long"], IL_MAX_LAG, IL_MIN_PEAK)
    m_yes = decode.measure_interlace(decode.decode_values(xc, ec, circ["parity_long"], decode.DecodeParams(**fine, delta=delta)),
                                     circ["parity_long"], IL_MAX_LAG, IL_MIN_PEAK)
    # jaggedness of the ring edge: rms of even/odd alternation of the ring's top and bottom crossings
    def ring_comb(img):
        pts = aspect.ring_points(img.astype(float))
        fitr = aspect.fit_ellipse(pts)
        return fitr["rms_residual_px"], fitr["axis_ratio"]

    noil_rms, noil_ratio = ring_comb(img_noil)
    il_rms, _ = ring_comb(images["L000"])
    no_interlace = {"image": "wrong/no_interlace.png",
                    "even_odd_shift_samples_without_offset": m_no["offset"],
                    "even_odd_shift_samples_with_offset": m_yes["offset"],
                    "predicted_shift_without_offset": delta,
                    "ellipse_rms_residual_px_without_offset": noil_rms,
                    "ellipse_rms_residual_px_with_offset": il_rms}
    log(f"no interlace: residual even/odd shift {m_no['offset']:.2f} (with offset {m_yes['offset']:.2f})")

    # ---------- colour composites ----------
    colour = []
    for im in imlist:
        if im["kind"] != "RGB":
            continue
        r, g, b = (images[fid].astype(np.float64) for fid in im["frames"])
        shifts = {}
        out = [r]
        for nm, ch_img in (("G", g), ("B", b)):
            sh, peak = register(r, ch_img)
            shifts[nm] = [float(sh[0]), float(sh[1]), float(peak)]
            out.append(ndimage.shift(ch_img, sh, order=1, mode="nearest"))
        rgb = np.clip(np.round(np.stack(out, axis=-1)), 0, 255).astype(np.uint8)
        name = f"img{im['image']:03d}.png"
        Image.fromarray(rgb, "RGB").save(os.path.join(OUT, "colour", name))
        colour.append({"image": im["image"], "title": im["title"], "frames": im["frames"], "file": "colour/" + name,
                       "shift_rows_cols_peakcorr_to_R": shifts})

    # ---------- contact sheets ----------
    ids = [f["id"] for f in frames]
    labels = []
    for fid in ids:
        im_no, role = frame_to_image.get(fid, (None, None))
        labels.append(f"{fid}  #{im_no}" + ("" if role in (None, "mono") else f" {role}"))
    contact_sheet([images[i] for i in ids], labels, os.path.join(OUT, "contact_native.png"))
    up = []
    for f in frames:
        o = B["orientation"][f["ch"]][f["index"]]
        up.append(np.rot90(images[f["id"]], k=barry.ORIENT_ROT90_K[o]))
    contact_sheet(up, labels, os.path.join(OUT, "contact_upright.png"),
                  caption="orientation: Barry 2017 table, reference only")

    # ---------- save ----------
    # the decoded columns' edges (COLUMNS lines): make_slices.py cuts and checks the slices with them
    np.savez(os.path.join(OUT, "edges.npz"), **{f["id"]: f["used_cols"] for f in frames},
             **{f["id"] + "_parity": f["parity_cols"] for f in frames})
    starts_json = [{k: p[k] for k in ("id", "channel", "image", "role", "start_sample", "start_s", "comb_end_sample",
                                      "barry_start", "barry_diff_samples", "barry_diff_lines",
                                      "barry_diff_lines_after_median")} for p in per_frame]
    with open(os.path.join(OUT, "frame_starts.json"), "w", encoding="utf-8") as fh:
        json.dump(starts_json, fh, indent=1)
    periods = np.array([p["period_samples"] for p in per_frame])
    metrics = {
        "tape": {"path": "sources/image-tape/384kHzStereo.wav", "header_rate": t.rate, "samples_per_channel": t.n},
        "detection": detection,
        "frames_decoded": len(per_frame),
        "frames_per_channel": {"L": n_found[0], "R": n_found[1]},
        "all_found_independently": n_found[0] == 78 and n_found[1] == 78,
        "line_period": {"median_samples": P_med, "median_ms": P_med / RATE * 1e3,
                        "min_ms": float(periods.min() / RATE * 1e3), "max_ms": float(periods.max() / RATE * 1e3),
                        "cover_ms": COVER_LINE_MS, "tape_speed_vs_cover": COVER_LINE_MS / (P_med / RATE * 1e3),
                        "research_ms": RESEARCH_LINE_MS},
        "jitter": {"median_rms_resid_samples": float(np.median([p["rms_resid_samples"] for p in per_frame])),
                   "median_same_parity_jitter_samples": float(np.median([p["jitter_samples"] for p in per_frame])),
                   "median_parity_stagger_samples": float(np.median([p["parity_stagger_samples"] for p in per_frame])),
                   "max_abs_residual_slant": float(np.max(np.abs([p["residual_slant_samples_per_line"] for p in per_frame])))},
        "droop": {"model": "first-order high-pass inverse, s = y - y(t0) + (1/tau) * integral of y from the shelf centre",
                  "method": "two estimators per channel: (1) line integral: pooled within-frame least squares of "
                            "(end-of-line plateau - shelf) against the line integral, slope = -1/tau; (2) edge tail: "
                            "least squares of the raw slope against the raw mean over tails after large steps in the "
                            "picture, slope = a - mean/tau. The L000 card flatness scan picks which one is used.",
                  "per_channel": tau_info,
                  "circle_background_flatness": droop_flat},
        "streaks": streaks,
        "active_window": {"w0_samples": w0, "w1_samples": w1, "rule": f"median across frames of across-line std >= "
                          f"{WINDOW_FRAC} x its level over {WINDOW_REF}", "picture_level": ref,
                          "threshold": thr},
        "interlace": {"offset_samples_384k": delta, "frames_used": int(len(il)),
                      "iqr": [float(np.percentile(il, 25)), float(np.percentile(il, 75))],
                      "meaning": "short-pulse lines' content lags long-pulse lines' content by this many samples "
                                 "after their own falling edges; decode shifts long lines by -offset/2 and short by +offset/2",
                      "barry_hard_coded": 12},
        "raster": {"decoded_columns": COLUMNS, "frames_measured": len(rl),
                   "unmeasured": [f["id"] for f in frames if f["raster_lines"] is None],
                   "min": int(min(rl)), "median": float(np.median(rl)), "max": int(max(rl)),
                   "histogram": {str(v): int(sum(1 for q in rl if q == v)) for v in sorted(set(rl))},
                   "rule": f"first line >= {RASTER_FROM} starting {RASTER_RUN} lines of high-passed rms < {RASTER_FLAT}",
                   "meaning": "lines of picture per frame on the tape; the cover's raster label says 512"},
        "aspect": {"columns": LINES, "rows": n_rows, "samples_per_row": spr, "frame_aspect": LINES / n_rows,
                   "circle_axis_ratio": cfit_final["axis_ratio"],
                   "circle_axis_ratio_meaning": "horizontal extent / vertical extent of the fitted ellipse (hx/hy); "
                                                "the row count is chosen to make this 1, so it is a procedure self-test",
                   "circle_minor_over_major": cfit_final["axes_ratio_minor_major"],
                   "circle_major_axis_tilt_deg": cfit_final["theta_deg"],
                   "one_row_changes_hx_over_hy_by": 1.0 / n_rows,
                   "circle_fit": cfit_final,
                   "circle_axis_ratio_at_aspect_choice": cfit["axis_ratio"], "iterations": history,
                   "circle_centre_column": cfit["xc"], "circle_centre_row": cfit["yc"]},
        "decode_params": {"L": params[0].to_dict(), "R": params[1].to_dict()},
        "wrong_results": {"free_run": wrong, "no_interlace": no_interlace},
        "barry": {"median_offset_samples": med_off, "within_1_line_after_median": int(sum(within)),
                  "exceptions": exceptions, "diff_lines_histogram": hist},
        "colour": colour,
        "frames": per_frame,
        "run_seconds": round(time.time() - t_start, 1),
    }
    with open(os.path.join(OUT, "metrics.json"), "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    log(f"done in {time.time() - t_start:.0f} s")


if __name__ == "__main__":
    main()
