"""Line sync (falling edge) and frame detection.

What a trace looks like (measured here on the tape, consistent with images-and-audio.md section 1,
"Line sync"): every vertical line ends in a blanking plateau about 330 samples long, raised about
0.1 above the picture; inside it a sharp spike and a step up, then a sharp FALLING EDGE that opens the
next line, followed by a flat shelf about 290 samples long before the picture. Alternate traces put the
spike about 150 or about 45 samples before the edge (the "long" and "short" pulses of the staggered
interlace; gourneau's 155 vs 45). We lock to the falling edge, never to the spike.

Detection is in three stages:
1. `line_candidates`: a box matched filter (raised plateau before, shelf after) scored over the whole
   channel in chunks; local maxima are candidate syncs.
2. `chain_lines`: candidates are linked into runs whose spacing is one line period; isolated
   candidates are dropped. This gives the line sync train of the whole channel.
3. `refine_edge`: each edge is located to a fraction of a sample by the crossing of the mid level
   between the plateau just before it and the shelf just after it (linear interpolation).

Frames are found from the line train alone (`find_frames`): every picture is preceded by a burst of
"comb" lines (each filled with about 20 regular pulses, about 146 samples apart: the start-of-picture
marker), and the picture is the 512 regular lines that follow the burst.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import maximum_filter1d, uniform_filter1d

# ---- constants (384 kHz header-rate units unless stated) ----
# Nominal line period, samples at 384 kHz. Source: images-and-audio.md section 1 (measured on the master
# 3197.4; the cover's 8.3396 ms would be 3202.4). Used only as a search prior, never as the decode period.
NOMINAL_PERIOD = 3197.4
# Cover line time in ms (24-bit binary 101101001100000000000000 x 0.704 ns). Source: cover.md section 1c.
COVER_LINE_MS = 8.3396
# Lines per picture. Source: cover.md section 1c (raster label 1000000000 = 512) and NASA cover text.
LINES_PER_FRAME = 512
# Box matched filter geometry, samples at 384 kHz, measured here from the averaged sync waveform of
# frame L000: the blanking plateau spans about -330..0 before the edge, the shelf about 0..+290 after.
PLATEAU = (-300, -8)
SHELF = (12, 250)
# Spacing tolerance when chaining syncs, samples. Measured here: edge spacings alternate about 3192 and
# 3205 (parity stagger), plus wow and flutter of a few samples; 80 leaves a wide margin and is still far
# below the 146-sample comb pulse spacing that could fool a looser tracker.
CHAIN_TOL = 80
# Refinement windows for the sub-sample edge, samples: levels taken from these spans relative to the
# coarse edge. Measured here (the edge falls in about 6 samples, then rings for about 25).
PRE_LEVEL = (-14, -5)
POST_LEVEL = (25, 60)
# Comb (start-of-picture marker) pulse period, samples. Measured here (about 19 pulses in 2780 samples).
COMB_PERIOD = 146


def _box_score(x: np.ndarray, rate_scale: float = 1.0) -> np.ndarray:
    """Plateau mean minus shelf mean at every sample (zero at the borders)."""
    c = np.concatenate(([0.0], np.cumsum(x)))
    n = len(x)
    s = np.zeros(n)
    a0, a1 = (int(round(v * rate_scale)) for v in PLATEAU)
    b0, b1 = (int(round(v * rate_scale)) for v in SHELF)
    lo = -a0
    hi = n - b1
    if hi <= lo:
        return s
    idx = np.arange(lo, hi)
    pre = (c[idx + a1] - c[idx + a0]) / (a1 - a0)
    post = (c[idx + b1] - c[idx + b0]) / (b1 - b0)
    s[lo:hi] = pre - post
    return s


def sync_score(x: np.ndarray, rate_scale: float = 1.0) -> np.ndarray:
    """Sharp sync detector: the box score (raised plateau before, shelf after) plus the drop over about
    8 samples at 384 kHz. The box alone is broad (hundreds of samples); the drop term puts the peak on
    the falling edge itself."""
    h = max(1, int(round(4 * rate_scale)))
    d = np.zeros(len(x))
    d[h:-h] = x[:-2 * h] - x[2 * h:]
    return _box_score(x, rate_scale) + d


def line_candidates(read, n_total: int, rate_scale: float = 1.0, chunk: int = 4_000_000):
    """Candidate sync edges over a whole channel.

    `read(start, length)` returns samples. Returns (positions, scores) of local maxima of the box score
    that are the largest within +/- 1500 samples (less than half a line), with positive score.
    `rate_scale` = sample rate / 384000 (the geometry scales with it).
    """
    pos, sc = [], []
    ov = int(4000 * rate_scale)
    half = int(1500 * rate_scale)
    for s0 in range(0, n_total, chunk):
        a = max(s0 - ov, 0)
        b = min(s0 + chunk + ov, n_total)
        x = read(a, b - a)
        s = _box_score(x, rate_scale)
        m = maximum_filter1d(s, size=2 * half + 1, mode="constant", cval=-np.inf)
        cand = np.nonzero((s == m) & (s > 0.02))[0]
        keep = (cand + a >= s0) & (cand + a < s0 + chunk)
        cand = cand[keep]
        pos.append(cand + a)
        sc.append(s[cand])
    if not pos:
        return np.zeros(0, int), np.zeros(0)
    return np.concatenate(pos), np.concatenate(sc)


def chain_lines(pos: np.ndarray, period: float, tol: float):
    """Keep candidates that have a neighbour one period away (either side). Returns sorted positions."""
    pos = np.sort(pos)
    if len(pos) < 2:
        return pos
    keep = np.zeros(len(pos), bool)
    j = 0
    for i in range(len(pos)):
        # look forward for a candidate one period ahead
        target = pos[i] + period
        k = np.searchsorted(pos, target - tol)
        if k < len(pos) and abs(pos[k] - target) <= tol:
            keep[i] = True
            keep[k] = True
    return pos[keep]


def refine_edge(x: np.ndarray, c: int, rate_scale: float = 1.0, search: int = 12):
    """Sub-sample falling edge near integer index c.

    First the steepest drop within +/- `search` samples (difference over about 4 samples at 384 kHz),
    then the crossing of the mid level between the plateau level just before and the shelf level just
    after, linearly interpolated. Returns (edge_position_float, drop_amplitude) or (nan, 0).
    """
    r = rate_scale
    h = max(1, int(round(2 * r)))
    lo = c - int(search * r)
    hi = c + int(search * r) + 1
    if lo - h < 0 or hi + h >= len(x):
        return np.nan, 0.0
    seg = x[lo - h:hi + h]
    d = seg[:-2 * h] - seg[2 * h:]
    j = int(np.argmax(d)) + lo  # steepest drop centre
    p0, p1 = int(round(PRE_LEVEL[0] * r)), int(round(PRE_LEVEL[1] * r))
    q0, q1 = int(round(POST_LEVEL[0] * r)), int(round(POST_LEVEL[1] * r))
    if j + p0 < 0 or j + q1 >= len(x):
        return np.nan, 0.0
    pre = float(np.median(x[j + p0:j + p1 + 1]))
    post = float(np.median(x[j + q0:j + q1 + 1]))
    amp = pre - post
    if amp <= 0:
        return np.nan, 0.0
    mid = 0.5 * (pre + post)
    # walk from the steepest point back and forward to the mid crossing
    w0 = j - int(6 * r) - 1
    w1 = j + int(6 * r) + 1
    seg = x[w0:w1 + 1]
    above = seg > mid
    for i in range(len(seg) - 1):
        if above[i] and not above[i + 1]:
            f = (seg[i] - mid) / (seg[i] - seg[i + 1])
            return w0 + i + f, amp
    return float(j), amp


def _comb_parts(x: np.ndarray, rate_scale: float = 1.0):
    """High-pass x (subtract a moving average one comb period long) and return the running products
    needed for the comb feature: (y*y, y*y[+L], y*y[+L/2]) with L the comb period."""
    L = int(round(COMB_PERIOD * rate_scale))
    h = L // 2
    y = x - uniform_filter1d(x, size=L, mode="nearest")
    n = len(y)
    yy = y * y
    yl = np.zeros(n)
    yl[:n - L] = y[:n - L] * y[L:]
    yh = np.zeros(n)
    yh[:n - h] = y[:n - h] * y[h:]
    return yy, yl, yh


def comb_feature(x: np.ndarray, a: int, b: int, parts=None, rate_scale: float = 1.0):
    """Comb feature of x[a:b]: (r(L) - r(L/2)) and the rms of the high-passed body.

    For the start-of-picture comb (regular pulses L apart) r(L) is near +1 and r(L/2) negative, so the
    feature approaches 1.5 to 2; for picture lines and blank lines it is near 0. Returns (feature, rms).
    """
    if parts is None:
        parts = _comb_parts(x, rate_scale)
    yy, yl, yh = parts
    v = float(np.sum(yy[a:b]))
    if v <= 1e-12:
        return 0.0, 0.0
    return (float(np.sum(yl[a:b])) - float(np.sum(yh[a:b]))) / v, float(np.sqrt(v / (b - a)))


def comb_windows(read, n_total: int, rate_scale: float = 1.0, chunk: int = 4_000_000):
    """Comb feature on half-line steps over a whole channel, independent of any sync detection.

    Returns (centres, feature, rms) for windows of one nominal line length stepped by half a line.
    """
    W = int(round(NOMINAL_PERIOD * rate_scale))
    step = W // 2
    ov = 2 * W
    cs, fs, rs = [], [], []
    for s0 in range(0, n_total, chunk):
        a = max(s0 - ov, 0)
        b = min(s0 + chunk + ov, n_total)
        x = read(a, b - a)
        yy, yl, yh = _comb_parts(x, rate_scale)
        c_yy = np.concatenate(([0.0], np.cumsum(yy)))
        c_yl = np.concatenate(([0.0], np.cumsum(yl)))
        c_yh = np.concatenate(([0.0], np.cumsum(yh)))
        starts = np.arange(((s0 + step - 1) // step) * step, min(s0 + chunk, n_total - W), step)
        loc = starts - a
        v = c_yy[loc + W] - c_yy[loc]
        f = np.where(v > 1e-12, (c_yl[loc + W] - c_yl[loc] - (c_yh[loc + W] - c_yh[loc])) / np.maximum(v, 1e-12), 0.0)
        cs.append(starts + W // 2)
        fs.append(f)
        rs.append(np.sqrt(np.maximum(v, 0) / W))
    return np.concatenate(cs), np.concatenate(fs), np.concatenate(rs)


def robust_line_fit(k: np.ndarray, e: np.ndarray, use_parity: bool = True, n_iter: int = 6,
                    clip: float = 4.0):
    """Robust fit e_k = a + P k (+ b (-1)^k). Iterative sigma clipping with a MAD scale.

    Returns dict with a, P, b, inlier mask, residuals (all points), rms of inliers.
    """
    k = np.asarray(k, float)
    e = np.asarray(e, float)
    ok = np.isfinite(e)
    cols = [np.ones_like(k), k]
    if use_parity:
        cols.append(np.where(k.astype(int) % 2 == 0, 1.0, -1.0))
    A = np.stack(cols, 1)
    m = ok.copy()
    coef = None
    for _ in range(n_iter):
        coef, *_ = np.linalg.lstsq(A[m], e[m], rcond=None)
        res = np.where(ok, e - A @ coef, np.nan)
        mad = np.nanmedian(np.abs(res[m] - np.nanmedian(res[m])))
        sig = max(1.4826 * mad, 0.5)
        m_new = ok & (np.abs(res) <= clip * sig)
        if np.array_equal(m_new, m):
            break
        m = m_new
    res = np.where(ok, e - A @ coef, np.nan)
    out = {
        "a": float(coef[0]),
        "P": float(coef[1]),
        "b": float(coef[2]) if use_parity else 0.0,
        "inliers": m,
        "residuals": res,
        "rms": float(np.sqrt(np.mean(res[m] ** 2))),
        "model": A @ coef,
    }
    return out


# ---- frame detection ----
# HF rms above which a window or line is "comb" (start-of-picture marker). Measured here: comb windows
# 0.046 to 0.081, picture and blank windows about 0.012; no picture window run of 10 lines reaches 0.04.
COMB_RMS = 0.04
# Accepted comb-burst length in lines. Measured here: every burst is 20 to 21.5 lines (one left-channel
# burst at 27.6 s is split by a dropout into 10.5 + 8); the 6 s tone before the first frame is 548+.
BURST_LINES = (12, 30)
# Maximum gap, in half-line windows, bridged when merging burst pieces (the dropout above is 2).
BURST_MERGE_GAP = 4
# Tracking windows, samples at 384 kHz: search +/- TRACK_SEARCH around the prediction, accept the edge
# when within TRACK_ACCEPT of it. Measured here: same-parity prediction errors are a few samples.
TRACK_SEARCH = 40
TRACK_ACCEPT = 25


def find_bursts(centres, feat_rms, rate_scale: float = 1.0):
    """Comb bursts from comb_windows output: list of (start_sample, end_sample, n_lines)."""
    W = NOMINAL_PERIOD * rate_scale
    m = feat_rms > COMB_RMS
    idx = np.nonzero(m)[0]
    bursts = []
    if len(idx) == 0:
        return bursts
    s = idx[0]
    p = idx[0]
    for i in list(idx[1:]) + [None]:
        if i is not None and i - p <= BURST_MERGE_GAP:
            p = i
            continue
        a = centres[s] - W / 2
        b = centres[p] + W / 2
        nl = (b - a) / W - 1.0  # half-line windows overlap the burst edges by about half a line each side
        bursts.append((float(a), float(b), float(nl)))
        if i is not None:
            s = p = i
    return bursts


def track_lines(x, box, e0, n_lines, P0, rate_scale=1.0, direction=1):
    """Follow the sync train from edge e0 (float, index into x) for n_lines lines (including e0).

    Returns an array of refined edges (nan where no acceptable edge was found). Each prediction uses
    the last found edge of the same parity (so the alternating stagger is predicted exactly) and the
    running line period."""
    r = rate_scale
    edges = np.full(n_lines, np.nan)
    edges[0] = e0
    P = P0
    for k in range(1, n_lines):
        # last valid of same parity within 8 lines, else last valid
        ref = None
        for j in range(k - 2, max(k - 9, -1), -2):
            if np.isfinite(edges[j]):
                ref = j
                break
        if ref is None:
            for j in range(k - 1, max(k - 9, -1), -1):
                if np.isfinite(edges[j]):
                    ref = j
                    break
        if ref is None:
            break
        pred = edges[ref] + direction * (k - ref) * P
        c = int(round(pred))
        lo = c - int(TRACK_SEARCH * r)
        hi = c + int(TRACK_SEARCH * r) + 1
        if lo < 0 or hi >= len(x):
            break
        cc = lo + int(np.argmax(box[lo:hi]))
        e, amp = refine_edge(x, cc, r)
        if np.isfinite(e) and abs(e - pred) <= TRACK_ACCEPT * r:
            edges[k] = e
            # update the period from same-parity pairs (two lines apart)
            if k >= 2 and np.isfinite(edges[k - 2]):
                recent = []
                for j in range(k, max(k - 40, 1), -1):
                    if np.isfinite(edges[j]) and np.isfinite(edges[j - 2]):
                        recent.append(abs(edges[j] - edges[j - 2]) / 2)
                if recent:
                    P = float(np.median(recent))
    return edges


def line_rms(x, e_a, e_b, rate_scale=1.0):
    """HF rms of the body of the line between edges e_a and e_b (comb lines are about 0.06)."""
    r = rate_scale
    a = int(e_a + 320 * r)
    b = int(e_b - 360 * r)
    if a < 0 or b > len(x) or b - a < 500 * r:
        return np.nan
    L = int(round(COMB_PERIOD * r))
    seg = x[max(a - L, 0):min(b + L, len(x))]
    y = seg - uniform_filter1d(seg, size=L, mode="nearest")
    y = y[a - max(a - L, 0):a - max(a - L, 0) + (b - a)]
    return float(np.sqrt(np.mean(y * y)))


def locate_frame(x, burst_end_local, rate_scale=1.0, P0=None, n_back=30, n_lines=LINES_PER_FRAME):
    """Find line 1 of the picture that follows a comb burst ending near index burst_end_local of x.

    Lock on three consecutive syncs a few lines into the picture, track back through the burst, take
    line 1 as the first non-comb line after the last comb line, then track 512 lines forward.
    Returns dict(edges, first_index_in_track, comb_lines_before, box) or raises ValueError.
    """
    r = rate_scale
    P = (P0 or NOMINAL_PERIOD) * r
    box = sync_score(x, r)
    a = int(burst_end_local + 2 * P)
    b = int(burst_end_local + 3 * P)
    i2 = int(round(2 * P))
    trip = box[a:b] + box[a + int(round(P)):b + int(round(P))] + box[a + i2:b + i2]
    n0 = a + int(np.argmax(trip))
    e_seed, _ = refine_edge(x, n0, r)
    if not np.isfinite(e_seed):
        raise ValueError("no sync at the seed")
    back = track_lines(x, box, e_seed, n_back, P, r, direction=-1)[::-1]  # ascending time, seed last
    rms = [line_rms(x, back[i], back[i + 1], r) if np.isfinite(back[i]) and np.isfinite(back[i + 1]) else np.nan
           for i in range(len(back) - 1)]
    rms = np.array(rms)
    combs = np.nonzero(rms > COMB_RMS * 0.75)[0]  # 0.03: well above pictures (0.012), below combs
    if len(combs) == 0:
        raise ValueError("no comb lines found behind the seed")
    last = combs[-1]
    first_line_edge = back[last + 1]
    n_comb = int(np.sum(rms[:last + 1] > COMB_RMS * 0.75))
    edges = track_lines(x, box, first_line_edge, n_lines + 3, P, r, direction=1)
    return {"edges": edges, "comb_lines_before": n_comb, "box": box,
            "back_rms": rms, "line1_after_seed": len(back) - 2 - last}
