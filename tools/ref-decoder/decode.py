"""One frame of the image tape to a picture. Every parameter is explicit (DecodeParams).

Per line k (one image column, line 1 at the left), starting at its falling edge e_k:
1. DC restore (clamp): the shelf just after the edge is the blanking reference level.
2. Droop inverse: the tape chain is AC-coupled (a first-order high-pass with time constant tau, which
   gives bright tops, dark bottoms and trailing shadows; images-and-audio.md section 3, "Typical
   artifacts"). For a first-order high-pass y of the true signal s, s(t) = y(t) + (1/tau) * integral of y.
   With s equal to the blanking level at the shelf time t0 this is
       s(t) = y(t) - y(t0) + (1/tau) * integral_{t0}^{t} y(u) du.
3. Interlace: lines with the short sync pulse are shifted by +delta/2 and lines with the long pulse by
   -delta/2 in time (delta measured, see measure_interlace), sub-sample, by integrating a cumulative sum.
4. Rows: the active window [w0, w1] (samples after the edge) is split into n_rows equal spans; each pixel
   is the mean of the signal over its span (exact area average with linear interpolation of the
   cumulative sum, so fractional sample positions are honoured).
5. Polarity: more signal is darker (images-and-audio.md section 1), so the value is negated.
6. Levels: per-frame robust percentile stretch to 0..255 (percentiles in DecodeParams).

Times are in samples of the decoded signal; geometry is stored at 384 kHz and scaled by rate/384000.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np

BASE_RATE = 384_000  # Hz, the header rate the geometry is expressed in (images-and-audio.md section 2)


@dataclass
class DecodeParams:
    rate: int = BASE_RATE  # Hz, sample rate of the signal being decoded
    w0: float = 300.0  # samples at 384 kHz after the edge: first sample of picture (measured, see README)
    w1: float = 2860.0  # samples at 384 kHz after the edge: end of picture (measured)
    n_rows: int = 384  # rows per frame (set from the calibration circle)
    tau: float = 1e12  # samples at 384 kHz: droop time constant (1e12 = no droop correction)
    delta: float = 0.0  # samples at 384 kHz: interlace offset, short-pulse lines relative to long
    clamp0: float = 60.0  # samples at 384 kHz: shelf span used as the clamp level (measured: the shelf
    clamp1: float = 240.0  # is flat from about +30 to +290 after the edge, ringing ends by about +25)
    p_lo: float = 0.5  # percent: black point of the level stretch
    p_hi: float = 99.5  # percent: white point of the level stretch

    def scaled(self, name: str) -> float:
        return getattr(self, name) * self.rate / BASE_RATE

    def to_dict(self):
        return asdict(self)


def line_matrix(x: np.ndarray, edges: np.ndarray, length: int, pad: int):
    """Rows of x starting at floor(edge) - pad, `length` samples each. Returns (M, base) where base is
    the integer start index of each row."""
    base = np.floor(edges).astype(np.int64) - pad
    idx = base[:, None] + np.arange(length)[None, :]
    idx = np.clip(idx, 0, len(x) - 1)
    return x[idx], base


def restore_lines(x: np.ndarray, edges: np.ndarray, p: DecodeParams):
    """Clamp and droop-correct every line. Returns (Z, base, pad) with Z[k, i] the restored signal at
    sample base[k] + i."""
    pad = int(np.ceil(p.scaled("clamp0"))) + 8
    length = int(np.ceil(p.scaled("w1") + abs(p.scaled("delta")) + 16)) + pad
    M, base = line_matrix(x, edges, length, pad)
    c0 = int(round(p.scaled("clamp0")))
    c1 = int(round(p.scaled("clamp1")))
    frac = edges - np.floor(edges)
    # clamp reference: median shelf level of each line
    ref = np.median(M[:, pad + c0:pad + c1 + 1], axis=1)
    tau = p.scaled("tau")
    # integral of y from t0 (centre of the clamp span) to each sample, rectangle rule (1 sample = 1 unit)
    t0 = pad + (c0 + c1) // 2
    cum = np.cumsum(M, axis=1)
    integ = cum - cum[:, t0:t0 + 1]
    Z = M - ref[:, None] + integ / tau
    return Z, base, frac


def sample_rows(Z: np.ndarray, base: np.ndarray, edges: np.ndarray, shifts: np.ndarray, p: DecodeParams):
    """Area-average Z over n_rows equal spans of [w0, w1] after each (shifted) edge."""
    w0 = p.scaled("w0")
    w1 = p.scaled("w1")
    n = p.n_rows
    # cumulative sum with a leading zero so S[i] = sum Z[:i]; S at fractional position u (samples from
    # base) is linear interpolation, which makes the span average exact for a piecewise-constant signal.
    S = np.concatenate([np.zeros((Z.shape[0], 1)), np.cumsum(Z, axis=1)], axis=1)
    bounds = w0 + (w1 - w0) * np.arange(n + 1) / n  # relative to the edge
    pos = (edges + shifts)[:, None] - base[:, None] + bounds[None, :]  # fractional index into Z
    pos = np.clip(pos, 0, Z.shape[1] - 1.000001)
    i = np.floor(pos).astype(np.int64)
    f = pos - i
    rows = np.arange(Z.shape[0])[:, None]
    Sv = S[rows, i] * (1 - f) + S[rows, i + 1] * f
    span = (w1 - w0) / n
    return np.diff(Sv, axis=1) / span  # (lines, n_rows)


def parity_shifts(parity_long: np.ndarray, p: DecodeParams) -> np.ndarray:
    d = p.scaled("delta")
    return np.where(parity_long, -d / 2.0, d / 2.0)


def decode_values(x: np.ndarray, edges: np.ndarray, parity_long: np.ndarray, p: DecodeParams) -> np.ndarray:
    """Float image (rows = time down, columns = lines), before polarity and stretch."""
    Z, base, _ = restore_lines(x, edges, p)
    V = sample_rows(Z, base, edges, parity_shifts(parity_long, p), p)
    return V.T  # (n_rows, n_lines)


def to_gray(V: np.ndarray, p: DecodeParams):
    """Polarity (more signal is darker) and percentile stretch to uint8. Returns (img, (lo, hi))."""
    W = -V
    lo, hi = np.percentile(W, [p.p_lo, p.p_hi])
    g = np.clip((W - lo) / max(hi - lo, 1e-9) * 255.0, 0, 255)
    return np.round(g).astype(np.uint8), (float(lo), float(hi))


def decode_frame(x, edges, parity_long, p: DecodeParams):
    V = decode_values(x, edges, parity_long, p)
    img, lv = to_gray(V, p)
    return img, V, lv


def pulse_parity(x: np.ndarray, edges: np.ndarray, rate_scale: float = 1.0) -> np.ndarray:
    """True where the line's sync spike is the long one (about 150 samples before the edge at 384 kHz)
    rather than the short one (about 45). Measured here on the averaged sync waveform of L000; the split
    point 100 lies midway."""
    r = rate_scale
    out = np.zeros(len(edges), bool)
    for k, e in enumerate(edges):
        a = int(e - 200 * r)
        b = int(e - 20 * r)
        if a < 0:
            continue
        j = a + int(np.argmax(x[a:b]))
        out[k] = (e - j) > 100 * r
    return out


def pair_lags(V: np.ndarray, max_lag: int = 30, hp: int = 61, lp: int = 1):
    """Content shift between every pair of adjacent columns of V, in rows (sub-row by a parabola through
    the cross-correlation peak). lag[k] > 0 means column k+1 shows the same content lag rows later.
    Columns are high-passed (minus a `hp`-row moving average) so slow shading does not dominate.
    Returns (lags, peak correlation) with nan where a column is featureless."""
    from scipy.ndimage import uniform_filter1d
    H = V - uniform_filter1d(V, size=hp, axis=0, mode="nearest")
    if lp > 1:
        H = uniform_filter1d(H, size=lp, axis=0, mode="nearest")
    n_rows, n_cols = H.shape
    m = max_lag
    lags = np.full(n_cols - 1, np.nan)
    peaks = np.full(n_cols - 1, np.nan)
    A = H[m:n_rows - m, :]
    na = np.sqrt(np.sum(A * A, axis=0))
    cc = np.zeros((2 * m + 1, n_cols - 1))
    for i, L in enumerate(range(-m, m + 1)):
        B = H[m + L:n_rows - m + L, 1:]
        nb = np.sqrt(np.sum(B * B, axis=0))
        cc[i] = np.sum(A[:, :-1] * B, axis=0) / np.maximum(na[:-1] * nb, 1e-12)
    j = np.argmax(cc, axis=0)
    for k in range(n_cols - 1):
        jj = j[k]
        if na[k] < 1e-6 or jj == 0 or jj == 2 * m:
            continue
        y0, y1, y2 = cc[jj - 1, k], cc[jj, k], cc[jj + 1, k]
        den = y0 - 2 * y1 + y2
        d = 0.5 * (y0 - y2) / den if den < 0 else 0.0
        lags[k] = (jj - m) + d
        peaks[k] = y1
    return lags, peaks


def measure_interlace(V: np.ndarray, parity_long: np.ndarray, max_lag: int = 30, min_peak: float = 0.5,
                      lp: int = 1):
    """Offset of short-pulse lines relative to long-pulse lines, in rows of V.

    Pairs long->short give (offset + content slope), pairs short->long give (-offset + content slope); the
    slope of genuinely slanted content cancels in offset = (median_ls - median_sl) / 2. Only pairs whose
    correlation peak exceeds min_peak (featured, matching columns) are used.
    Returns dict(offset, n_ls, n_sl, mad_ls, mad_sl, slope)."""
    lags, peaks = pair_lags(V, max_lag, lp=lp)
    ok = np.isfinite(lags) & (peaks > min_peak)
    pl = np.asarray(parity_long)
    ls = lags[ok & pl[:-1] & ~pl[1:]]
    sl = lags[ok & ~pl[:-1] & pl[1:]]
    if len(ls) < 5 or len(sl) < 5:
        return {"offset": float("nan"), "n_ls": int(len(ls)), "n_sl": int(len(sl))}
    mls, msl = float(np.median(ls)), float(np.median(sl))
    return {"offset": (mls - msl) / 2.0, "slope": (mls + msl) / 2.0, "n_ls": int(len(ls)), "n_sl": int(len(sl)),
            "median_ls": mls, "median_sl": msl,
            "mad_ls": float(np.median(np.abs(ls - mls))), "mad_sl": float(np.median(np.abs(sl - msl)))}
