"""Line sync (falling edge) and frame detection.

What a trace looks like (measured here on the tape, consistent with images-and-audio.md section 1,
"Line sync"): every vertical line ends in a blanking plateau about 330 samples long, raised about
0.1 above the picture; inside it a sharp spike, then a sharp FALLING EDGE that opens the next line,
followed by a flat shelf before the picture. Alternate traces put the spike about 150 or about 45
samples before the edge (the "long" and "short" pulses of the staggered interlace; gourneau's 155 vs
45). We lock to the falling edge, never to the spike.

Frame detection, from the signal alone:
1. `comb_windows` / `find_bursts`: every picture is preceded by a burst of about 20 lines filled with
   regular pulses 197 samples apart (the start-of-picture comb). Bursts are found over the whole
   channel from the high-passed rms in half-line windows (chunked reads).
2. `locate_frame2`: the last comb pulse is found (`comb_mask`, `last_comb_pulse`); the comb is not
   locked to the line syncs, so line 1 is defined as the first sync edge after that last pulse. A
   seed sync three lines later is locked with a three-line matched sum of `sync_score`, and the train
   is tracked back to line 1 and forward (`track_lines`, which predicts each edge from the last edge of
   the same parity, so the alternating stagger is predicted exactly).
3. `refine_edge`: each edge is located to a fraction of a sample by the crossing of the mid level
   between the level just before it and the shelf just after it (linear interpolation).
4. `lock_edges`: line fit (offset, period, parity stagger) and replacement of isolated outliers.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import uniform_filter1d

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
# Refinement windows for the sub-sample edge, samples: levels taken from these spans relative to the
# coarse edge. Measured here (the edge falls in about 6 samples, then rings for about 25).
PRE_LEVEL = (-14, -5)
POST_LEVEL = (25, 60)
# Comb (start-of-picture marker) pulse period, samples at 384 kHz. Measured here: the spectral peak of
# the burst before frames L000, L001, L002, L022 and L039 lies at 196.6 to 197.0 samples (1951 Hz).
COMB_PERIOD = 197


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


# ---- whole-channel frame detection (independent of Barry's table) ----
# Lines tracked per frame beyond the 512 of the picture, to see what follows the last line.
EXTRA_LINES = 40
# Comb presence test, measured here: the start-of-picture comb is a train of pulses COMB_PERIOD apart
# that is NOT locked to the line syncs (it ends at any phase of a line, even inside a line). A sample is
# "comb" when, over a window of COMB_WIN samples, the high-passed signal has rms above COMB_RMS_FINE
# and normalized autocorrelation at lag COMB_PERIOD above COMB_AC. A single sync spike has a low lag-197
# autocorrelation; picture content has rms about 0.01 or less (both measured on frames L000-L010).
COMB_WIN = 4 * COMB_PERIOD
COMB_RMS_FINE = 0.03
COMB_AC = 0.5


def comb_mask(x: np.ndarray, rate_scale: float = 1.0) -> np.ndarray:
    """Boolean per-sample mask of the start-of-picture comb (window ending at each sample)."""
    L = int(round(COMB_PERIOD * rate_scale))
    W = int(round(COMB_WIN * rate_scale))
    y = x - uniform_filter1d(x, size=L, mode="nearest")
    n = len(y)
    yy = y * y
    yl = np.zeros(n)
    yl[:n - L] = y[:n - L] * y[L:]
    cy = np.concatenate(([0.0], np.cumsum(yy)))
    cl = np.concatenate(([0.0], np.cumsum(yl)))
    m = np.zeros(n, bool)
    if n <= W + L:
        return m
    a = np.arange(0, n - W - L)
    e = cy[a + W] - cy[a]
    ac = (cl[a + W] - cl[a]) / np.maximum(e, 1e-12)
    rms = np.sqrt(e / W)
    m[a + W + L] = (rms > COMB_RMS_FINE) & (ac > COMB_AC)
    return m


# A comb pulse is a high-passed peak above PULSE_MIN (measured here: comb pulses swing about +/- 0.1,
# picture detail after the clamp stays under 0.03) that has another such peak one COMB_PERIOD earlier,
# within PULSE_TOL samples (the measured period spread is 196.6 to 197.0; 10 is generous).
PULSE_MIN = 0.04
PULSE_TOL = 10


def last_comb_pulse(x: np.ndarray, rough_end: int, rate_scale: float = 1.0) -> int:
    """Index of the last pulse of the comb train, searched back from rough_end over one comb window and
    a period. Isolated peaks (a sync spike alone) do not count: a pulse needs a predecessor one period
    earlier."""
    from scipy.signal import find_peaks
    r = rate_scale
    L = COMB_PERIOD * r
    a = max(int(rough_end - COMB_WIN * r - 3 * L), 0)
    b = min(int(rough_end + 2), len(x))
    seg = x[a:b]
    y = seg - uniform_filter1d(seg, size=max(3, int(round(L))), mode="nearest")
    pk, _ = find_peaks(y, height=PULSE_MIN, distance=max(1, int(L / 2)))
    good = [p for p in pk if np.any(np.abs((p - pk) - L) <= PULSE_TOL * r)]
    if not good:
        return int(rough_end)
    return a + int(good[-1])


def locate_frame2(x: np.ndarray, burst_end_local: float, rate_scale: float = 1.0, P0: float | None = None,
                  n_lines: int = LINES_PER_FRAME + EXTRA_LINES):
    """Line 1 of the picture after a comb burst, and its sync train.

    The comb's last pulse (comb_mask) is found near the burst end; a seed sync is locked three lines
    after it (the three-line matched sum of sync_score), the train is tracked back a few lines, and line
    1 is the first sync edge after the last comb pulse. Then n_lines edges are tracked forward.
    """
    r = rate_scale
    P = (P0 or NOMINAL_PERIOD) * r
    lo = int(max(burst_end_local - 3 * P, 0))
    hi = int(min(burst_end_local + 3 * P, len(x)))
    m = comb_mask(x[lo:hi], r)
    idx = np.nonzero(m)[0]
    if len(idx) == 0:
        raise ValueError("no comb pulses near the burst end")
    rough = lo + int(idx[-1])  # end of the last comb window: up to COMB_WIN + COMB_PERIOD late
    # The comb end is the peak of its last pulse. A pulse that falls inside the blanking before an
    # edge does not reach that line's picture, so line 1 is the first edge after this peak.
    comb_end = last_comb_pulse(x, rough, r)
    box = sync_score(x, r)
    a = int(comb_end + 2 * P)
    b = int(comb_end + 3 * P)
    i1, i2 = int(round(P)), int(round(2 * P))
    trip = box[a:b] + box[a + i1:b + i1] + box[a + i2:b + i2]
    n0 = a + int(np.argmax(trip))
    e_seed, _ = refine_edge(x, n0, r)
    if not np.isfinite(e_seed):
        raise ValueError("no sync at the seed")
    back = track_lines(x, box, e_seed, 5, P, r, direction=-1)[::-1]
    after = back[np.isfinite(back) & (back > comb_end)]
    if len(after) == 0:
        raise ValueError("no sync edge after the comb")
    first = float(after[0])
    if first - comb_end > 1.2 * P:
        raise ValueError("gap between comb end and first tracked sync exceeds a line")
    edges = track_lines(x, box, first, n_lines, P, r, direction=1)
    return {"edges": edges, "comb_end": comb_end, "box": box}


def detect_channel(tape, channel: int):
    """All frames on one channel, from the signal alone.

    1. Comb feature over the whole channel in half-line windows (chunked reads), giving the
       start-of-picture bursts (BURST_LINES long; the long lead-in tone is rejected by length).
    2. For each burst, a window around it is read, line 1 is the first sync edge after the burst's last
       comb pulse (`locate_frame2`), and 512 + EXTRA_LINES syncs are tracked.
    Returns (frames, bursts, rejected_bursts); each frame has absolute edges and the comb end sample.
    """
    read = lambda a, n: tape.read(channel, a, n)
    c, _f, rms = comb_windows(read, tape.n)
    bursts_all = find_bursts(c, rms)
    bursts = [b for b in bursts_all if BURST_LINES[0] <= b[2] <= BURST_LINES[1]]
    rejected = [b for b in bursts_all if not (BURST_LINES[0] <= b[2] <= BURST_LINES[1])]
    frames = []
    P = NOMINAL_PERIOD
    for (ba, bb, nl) in bursts:
        w0 = int(bb - 4 * P)
        n = int((LINES_PER_FRAME + EXTRA_LINES + 12) * P)
        x = tape.read(channel, w0, n)
        try:
            fr = locate_frame2(x, bb - w0, 1.0, P)
        except ValueError as err:
            frames.append({"burst": [ba, bb, nl], "error": str(err)})
            continue
        frames.append({"burst": [ba, bb, nl], "edges": fr["edges"] + w0, "comb_end": fr["comb_end"] + w0})
    return frames, bursts, rejected


def track_from_seed(x: np.ndarray, seed: float, n_lines: int, rate_scale: float = 1.0, P0: float | None = None):
    """Refine the sync edge nearest `seed` (index into x) and track n_lines lines forward. Used by the
    96 kHz slice decoder, which is given the first-line offset by the slice index."""
    r = rate_scale
    P = (P0 or NOMINAL_PERIOD) * r
    box = sync_score(x, r)
    lo = int(seed - TRACK_SEARCH * r)
    hi = int(seed + TRACK_SEARCH * r) + 1
    c = lo + int(np.argmax(box[lo:hi]))
    e0, _ = refine_edge(x, c, r)
    if not np.isfinite(e0):
        raise ValueError("no sync edge at the seed")
    return track_lines(x, box, e0, n_lines, P, r, direction=1)


# Edge outlier test: residuals from the line fit are compared with their running median over
# LOCK_WIN lines (which follows real wow and flutter); an edge is an outlier when it departs from that
# by more than LOCK_CLIP robust sigmas, and never for less than LOCK_MIN samples (a few times the
# measured same-parity jitter of about 1.8 samples). Chosen here.
LOCK_WIN = 15
LOCK_CLIP = 5.0
LOCK_MIN = 4.0


def lock_edges(edges: np.ndarray):
    """Line fit (offset, period, parity stagger) of the detected edges, then outlier replacement
    relative to the fit plus a running median of its residuals (so slow wow and flutter is kept, and
    only isolated misdetections are replaced). Returns (used_edges, fit, n_replaced)."""
    from scipy.ndimage import median_filter
    k = np.arange(len(edges))
    fit = robust_line_fit(k, edges, use_parity=True)
    res = fit["residuals"]
    filled = np.where(np.isfinite(res), res, 0.0)
    smooth = median_filter(filled, size=LOCK_WIN, mode="nearest")
    dev = res - smooth
    ok = np.isfinite(dev)
    sig = 1.4826 * np.median(np.abs(dev[ok])) if np.any(ok) else 0.0
    bad = ~ok | (np.abs(np.where(ok, dev, 0.0)) > max(LOCK_CLIP * sig, LOCK_MIN))
    used = np.where(bad, fit["model"] + smooth, edges)
    return used, fit, int(np.sum(bad))


def same_parity_jitter(edges: np.ndarray) -> float:
    """Short-term edge jitter (samples rms) from same-parity second differences: for white timing noise
    of rms s, e[k+2] - 2 e[k] + e[k-2] has rms s * sqrt(6). Slow wow and flutter cancels."""
    d2 = edges[4:] - 2 * edges[2:-2] + edges[:-4]
    d2 = d2[np.isfinite(d2)]
    med = np.median(d2)
    mad = 1.4826 * np.median(np.abs(d2 - med))
    return float(mad / np.sqrt(6.0))
