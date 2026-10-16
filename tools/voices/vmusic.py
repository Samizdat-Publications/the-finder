"""What the pitch track says, Python reference: notes, the interval (repetition) curve, the spectral-peak
histogram and its comb of equal steps, segment pitches and voices by pitch, Gaussian mixtures (BIC), and the
long tonal calls. The twin of the analysis
half of src/dsp/pitch.ts and src/dsp/segment.ts; every rule here is restated there and the Node tests check
that both give the same numbers on the same samples.
"""
from __future__ import annotations

import numpy as np

NOTE_STEP_CENTS = 50.0
"""A note is a run of voiced frames whose pitch moves less than this between 10 ms frames (half a tempered
semitone: vibrato moves a few cents per frame, a change of note at least one step)."""
NOTE_MIN_FRAMES = 6
"""A note lasts at least 60 ms (shorter runs are attacks, slides and tracker slips)."""
HIST_BIN = 10.0
"""Interval and pitch-class histograms, cents per bin."""
HIST_SPAN = 3600.0
"""Note pitches are histogrammed over +/- three octaves of 440 Hz, cents."""
CALL_STEP_CENTS = 100.0
"""A tonal call is a run of voiced frames moving less than one tempered step per 10 ms frame."""
CALL_MIN_S = 0.2
"""A call is held at least 0.2 s (20 frames): a stated choice, so a click or a squeak does not count; the
whale segment is the same for 0.15 to 0.3 s (tools/voices/checks.py voices.ref.whale)."""


def cents(f: np.ndarray) -> np.ndarray:
    """Cents relative to 440 Hz (only meaningful where f > 0)."""
    return 1200 * np.log2(np.where(f > 0, f, 1.0) / 440.0)


def runs(voiced: np.ndarray, c: np.ndarray, max_step: float) -> list[tuple[int, int]]:
    """Maximal runs of voiced frames whose pitch changes less than max_step cents per frame: [start, end)."""
    out = []
    n = len(c)
    i = 0
    while i < n:
        if voiced[i]:
            j = i
            while j + 1 < n and voiced[j + 1] and abs(c[j + 1] - c[j]) < max_step:
                j += 1
            out.append((i, j + 1))
            i = j + 1
        else:
            i += 1
    return out


def notes(f0: np.ndarray, ap: np.ndarray, threshold: float) -> list[tuple[int, int, float]]:
    """(start frame, frame count, median cents) of every note."""
    v = ap < threshold
    c = cents(f0)
    return [(a, b - a, float(np.median(c[a:b]))) for a, b in runs(v, c, NOTE_STEP_CENTS) if b - a >= NOTE_MIN_FRAMES]


def histogram(nc: np.ndarray) -> np.ndarray:
    """Count of notes per HIST_BIN-cent bin over [-HIST_SPAN, HIST_SPAN)."""
    nb = int(round(2 * HIST_SPAN / HIST_BIN))
    k = np.floor((nc + HIST_SPAN) / HIST_BIN).astype(int)
    k = k[(k >= 0) & (k < nb)]
    return np.bincount(k, minlength=nb).astype(np.float64)


def repetition_curve(h: np.ndarray, max_lag_bins: int) -> np.ndarray:
    """Normalised correlation of the pitch histogram with itself shifted by each lag (0 to max_lag_bins):
    how alike the note pattern is to itself moved up by that interval (1 at lag 0)."""
    out = np.zeros(max_lag_bins + 1)
    for k in range(max_lag_bins + 1):
        a = h[: len(h) - k]
        b = h[k:]
        den = np.sqrt((a * a).sum() * (b * b).sum())
        out[k] = (a * b).sum() / den if den > 0 else 0.0
    return out


def refine_peak(y: np.ndarray, k: int) -> float:
    """Parabolic refinement of a local maximum at index k (index units)."""
    if 0 < k < len(y) - 1:
        y0, y1, y2 = y[k - 1], y[k], y[k + 1]
        den = y0 - 2 * y1 + y2
        if den < 0:
            return k + 0.5 * (y0 - y2) / den
    return float(k)


def peak_near(y: np.ndarray, centre_bin: float, half_width_bins: int) -> float | None:
    """The highest local maximum within +/- half_width_bins of centre_bin, refined; None if there is none."""
    lo = max(1, int(np.floor(centre_bin - half_width_bins)))
    hi = min(len(y) - 2, int(np.ceil(centre_bin + half_width_bins)))
    best = None
    for k in range(lo, hi + 1):
        if y[k] >= y[k - 1] and y[k] > y[k + 1] and (best is None or y[k] > y[best]):
            best = k
    return None if best is None else refine_peak(y, best)


COMB_K = (2, 36)
"""Equal divisions of the octave the comb tries: halves to 36 parts (a third of a tempered step; finer combs fit
anything)."""
CHROMA_BIN = 5.0
"""The piano's spectral-peak histogram, cents per bin (unfolded, over +/- HIST_SPAN)."""


def chroma_histogram(cs: np.ndarray, ws: np.ndarray) -> np.ndarray:
    """Spectral-peak magnitude per CHROMA_BIN-cent bin over [-HIST_SPAN, HIST_SPAN), normalised to sum 1."""
    nb = int(round(2 * HIST_SPAN / CHROMA_BIN))
    k = np.floor((cs + HIST_SPAN) / CHROMA_BIN).astype(int)
    ok = (k >= 0) & (k < nb)
    h = np.bincount(k[ok], weights=ws[ok], minlength=nb)
    return h / h.sum()


def bin_centres(nb: int, width: float) -> np.ndarray:
    return -HIST_SPAN + (np.arange(nb) + 0.5) * width


def grid_fit(c: np.ndarray, w: np.ndarray, step: float, iters: int = 80) -> tuple[float, float, float, float]:
    """How well weighted pitches sit on a grid of the given step: a mixture of a normal spread about the nearest
    tooth and a uniform background, fitted by EM (start: offset from the weighted circular mean, sd step/6,
    background 0.5; sd kept between 1 cent and step/4). Returns the mean log density ratio against no grid
    at all (0 for pitches with no grid; higher is a better grid), the offset, the sd and the background share."""
    w = w / w.sum()
    off = np.angle((w * np.exp(2j * np.pi * c / step)).sum()) / (2 * np.pi) * step
    sd, eps = step / 6, 0.5

    def dens(o: float, s: float) -> tuple[np.ndarray, np.ndarray]:
        r = np.mod(c - o + step / 2, step) - step / 2
        return r, step * np.exp(-0.5 * (r / s) ** 2) / (s * np.sqrt(2 * np.pi))

    for _ in range(iters):
        r, g = dens(off, sd)
        post = (1 - eps) * g / ((1 - eps) * g + eps) * w
        sw = post.sum()
        if sw <= 0:
            break
        off += (post * r).sum() / sw
        sd = min(step / 4, max(1.0, np.sqrt((post * r * r).sum() / sw)))
        eps = min(0.999, max(0.0, 1 - sw))
    _, g = dens(off, sd)
    pos = w > 0
    return float((w[pos] * np.log((1 - eps) * g[pos] + eps)).sum()), float(off), float(sd), float(eps)


def comb_scores(c: np.ndarray, w: np.ndarray, octave_cents: float) -> list[float]:
    """grid_fit's score for k = COMB_K[0]..COMB_K[1] equal steps per octave."""
    return [grid_fit(c, w, octave_cents / k)[0] for k in range(COMB_K[0], COMB_K[1] + 1)]


SEG_MIN_VOICED = 10
"""A segment's pitch is the median of its voiced frames, given at least 10 of them (0.1 s)."""


def segment_pitches(levels: np.ndarray, f0: np.ndarray, threshold_db: float, gap_s: float) -> np.ndarray:
    """Median pitch (Hz) of each segment with at least SEG_MIN_VOICED voiced frames (f0 > 0)."""
    from vdsp import segments
    out = []
    for a, b in segments(levels, threshold_db, gap_s):
        v = f0[a:b]
        v = v[v > 0]
        if len(v) >= SEG_MIN_VOICED:
            out.append(float(np.median(v)))
    return np.array(out)


def voices_by_pitch(pitches_hz: np.ndarray, sd_one_semitones: float) -> int:
    """How many voices' worth of pitch the segments span: the central 95% of their pitches (2.5th to 97.5th
    percentile, linear interpolation), in semitones, over one speaker's 95% range (2 x 1.96 sd), rounded to the
    nearest whole number (one speaker's own pitches give about 1). At 2 or more, one voice could not have said
    them all."""
    st = 12 * np.log2(pitches_hz)
    lo, hi = np.percentile(st, [2.5, 97.5])
    return int(np.floor((hi - lo) / (2 * 1.959963984540054 * sd_one_semitones) + 0.5))


# ---- voice groups: a one-dimensional Gaussian mixture by EM, compared by BIC ----

def gmm(x: np.ndarray, k: int, iters: int = 200) -> tuple[float, np.ndarray, np.ndarray, np.ndarray]:
    """EM for a k-component 1-D Gaussian mixture. Start: means at the (i + 0.5)/k quantiles (sorted data,
    linear interpolation), common sd = sd of x, equal weights. Variances floored at (0.01 sd)^2. Returns
    (log-likelihood, weights, means, sds)."""
    xs = np.sort(x)
    n = len(x)
    sd0 = x.std()
    mu = np.array([np.interp((i + 0.5) / k * (n - 1), np.arange(n), xs) for i in range(k)])
    var = np.full(k, sd0 * sd0)
    w = np.full(k, 1.0 / k)
    floor = (0.01 * sd0) ** 2
    ll = -np.inf
    for _ in range(iters):
        lp = np.log(w)[None, :] - 0.5 * np.log(2 * np.pi * var)[None, :] - 0.5 * (x[:, None] - mu[None, :]) ** 2 / var[None, :]
        m = lp.max(axis=1, keepdims=True)
        lse = m[:, 0] + np.log(np.exp(lp - m).sum(axis=1))
        new = lse.sum()
        r = np.exp(lp - lse[:, None])
        nk = r.sum(axis=0)
        w = nk / n
        mu = (r * x[:, None]).sum(axis=0) / nk
        var = np.maximum((r * (x[:, None] - mu[None, :]) ** 2).sum(axis=0) / nk, floor)
        if abs(new - ll) < 1e-10:
            ll = new
            break
        ll = new
    lp = np.log(w)[None, :] - 0.5 * np.log(2 * np.pi * var)[None, :] - 0.5 * (x[:, None] - mu[None, :]) ** 2 / var[None, :]
    m = lp.max(axis=1, keepdims=True)
    ll = float((m[:, 0] + np.log(np.exp(lp - m).sum(axis=1))).sum())
    return ll, w, mu, np.sqrt(var)


def bic(x: np.ndarray, k: int) -> float:
    ll = gmm(x, k)[0]
    return -2 * ll + (3 * k - 1) * np.log(len(x))


def calls(f0: np.ndarray, ap: np.ndarray, threshold: float, min_hz: float) -> list[tuple[int, int, float, float]]:
    """Long tonal calls: runs (CALL_STEP_CENTS) at least CALL_MIN_S long whose median pitch is above min_hz.
    (start frame, frame count, median Hz, glide in cents = highest minus lowest pitch in the run)."""
    v = ap < threshold
    c = cents(f0)
    need = int(round(CALL_MIN_S / 0.010))
    out = []
    for a, b in runs(v, c, CALL_STEP_CENTS):
        if b - a >= need:
            med = float(np.median(f0[a:b]))
            if med > min_hz:
                out.append((a, b - a, med, float(c[a:b].max() - c[a:b].min())))
    return out


def longest_run_pitch(f0: np.ndarray, ap: np.ndarray, threshold: float) -> float:
    """The highest median pitch of any run at least CALL_MIN_S long (the speech ceiling for calls)."""
    v = ap < threshold
    c = cents(f0)
    need = int(round(CALL_MIN_S / 0.010))
    meds = [float(np.median(f0[a:b])) for a, b in runs(v, c, CALL_STEP_CENTS) if b - a >= need]
    return max(meds) if meds else 0.0
