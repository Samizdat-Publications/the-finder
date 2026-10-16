"""voices.octave, Python reference: where a melody's notes come back. The twin of src/dsp/fold.ts (the Node tests
check both give the same numbers on the same notes).

The question is whether notes a whole repeat apart (a trial interval P, in cents) do the same work: fold the note
pitches modulo P and ask how much closer than chance notes from different repeats land. For one pair of notes
whose pitches differ by d cents, the closeness is the Gaussian kernel (sd SIGMA) summed over every whole repeat
k P with k not 0:  P x sum_{k != 0} phi(d - k P). Its sum over all k (the wrapped Gaussian) is computed exactly
from the Fourier series of the fold (Poisson summation, summed over all harmonics):
    P x sum_k phi(d - k P) = 1 + 2 sum_{h >= 1} exp(-2 pi^2 SIGMA^2 h^2 / P^2) cos(2 pi h d / P),
and the k = 0 term P x phi(d) is removed: a note beside a note of the same pitch says nothing about repeats (with
it left in, every fold of a melody that repeats notes grows with P, and folds wider than the octave win; the
progress note of 2026-10-16 and docs/plans/M5_specs/step6a-progress.md). Chance for the remaining images: a pair
at least half a repeat apart lands anywhere in the fold, closeness 1 on average, and a nearer pair has no whole
repeat to land on, closeness about 0. So the score is
    S(P) = mean over pairs of P x sum_{k != 0} phi(d - k P)  /  share of pairs at least P / 2 apart,
1 for notes with no repeat at P, higher the more tightly notes a repeat apart coincide.

Weights: a bootstrap resample is the notes with multiplicities w; pairs are distinct notes (a note drawn twice is
not a pair with itself), each weighted w_i w_j.
"""
from __future__ import annotations

import numpy as np

SIGMA = 25.0
"""Kernel sd, cents: a quarter of a tempered step; the Gavotte's intonation scatter about its 100-cent grid is
about 10 to 15 cents (tools/voices/checks.py voices.ref.octaveCoverage), and twice that keeps every note of a
pitch class inside one kernel."""
RANGE = (30.0, 2400.0)
"""The trial intervals, cents: the octave chart's span (OctavePanel.tsx; ratio 1.02 to 4)."""
G_MIN = 1e-12
"""Harmonics are summed while their weight exp(-2 pi^2 SIGMA^2 h^2 / P^2) is at least this (the rest is below
double-precision rounding of the sum)."""
LOCAL_CENTS = 25.0
"""A candidate's own peak is the highest score within +/- a quarter tone of it (a click on the chart, a bootstrap
resample's peak)."""


def harmonics(p: float) -> np.ndarray:
    hmax = int(np.floor(p / (np.pi * SIGMA * np.sqrt(2)) * np.sqrt(-np.log(G_MIN))))
    return np.arange(1, max(1, hmax) + 1, dtype=np.float64)


class Notes:
    """Note pitches (cents) with the pair tables every score needs."""

    def __init__(self, cents: np.ndarray):
        self.c = np.asarray(cents, dtype=np.float64)
        n = len(self.c)
        iu, ju = np.triu_indices(n, 1)
        d = np.abs(self.c[iu] - self.c[ju])
        order = np.argsort(d, kind="stable")
        self.i, self.j, self.d = iu[order], ju[order], d[order]
        self.phi0 = np.exp(-0.5 * (self.d / SIGMA) ** 2) / (SIGMA * np.sqrt(2 * np.pi))

    def stats(self, w: np.ndarray) -> tuple[float, float, np.ndarray, float, float]:
        """(W^2 - sum w^2, sum w^2, cumulative pair weight by distance, total pair weight, the pairs' mean
        unfolded kernel phi(d)) for weights w."""
        pw = w[self.i] * w[self.j]
        s2 = float((w * w).sum())
        tot = float(pw.sum())
        return float(w.sum() ** 2 - s2), s2, np.cumsum(pw), tot, float((pw * self.phi0).sum()) / tot

    def score(self, p: float, w: np.ndarray | None = None) -> float:
        w = np.ones(len(self.c)) if w is None else w
        return self._score(p, w, *self.stats(w))

    def _score(self, p, w, den, s2, cum, tot, pw_phi) -> float:
        h = harmonics(p)
        g = np.exp(-2 * np.pi ** 2 * SIGMA ** 2 * h ** 2 / p ** 2)
        z = np.exp(2j * np.pi * np.outer(h, self.c) / p) @ w
        wrapped = 1 + 2 * float((g * (np.abs(z) ** 2 - s2)).sum()) / den
        r = wrapped - p * pw_phi
        k = int(np.searchsorted(self.d, p / 2, side="right"))
        q = 1 - (float(cum[k - 1]) if k > 0 else 0.0) / tot
        return r / q if q > 0 else 0.0

    def curve(self, grid: np.ndarray, w: np.ndarray | None = None) -> np.ndarray:
        w = np.ones(len(self.c)) if w is None else w
        out = np.empty(len(grid))
        for a in range(0, len(grid), 400):  # one matrix product per block of trial intervals (boot_scores)
            out[a: a + 400] = boot_scores(self, np.asarray(grid[a: a + 400], dtype=np.float64), w[None, :])[0]
        return out


def grid_of(step: float = 1.0) -> np.ndarray:
    return np.arange(RANGE[0], RANGE[1] + 1e-9, step)


def refine(y: np.ndarray, k: int) -> float:
    """Parabolic refinement of a local maximum at index k (index units)."""
    if 0 < k < len(y) - 1:
        y0, y1, y2 = y[k - 1], y[k], y[k + 1]
        den = y0 - 2 * y1 + y2
        if den < 0:
            return k + 0.5 * (y0 - y2) / den
    return float(k)


def peaks(grid: np.ndarray, y: np.ndarray) -> list[tuple[float, float]]:
    """Every local maximum of the score over the grid: (cents, refined; score at the grid point)."""
    step = grid[1] - grid[0]
    out = []
    for k in range(1, len(y) - 1):
        if y[k] >= y[k - 1] and y[k] > y[k + 1]:
            out.append((float(grid[0] + refine(y, k) * step), float(y[k])))
    return out


def local_peak(notes: Notes, centre: float, w: np.ndarray | None = None, step: float = 1.0) -> tuple[float, float]:
    """The highest score within +/- LOCAL_CENTS of centre: (cents, refined; score)."""
    g = np.arange(centre - LOCAL_CENTS - step, centre + LOCAL_CENTS + step + 1e-9, step)
    y = notes.curve(g, w)
    k = int(np.argmax(y[1:-1])) + 1
    return float(g[0] + refine(y, k) * step), float(y[k])


COARSE = 5.0
"""The repeat is searched on a 5-cent grid first (a fold's peak is about 10 cents wide or more: moving P by d
moves a note k repeats up by k d, and the Gavotte's notes span under three repeats of 1200, so d of 25 / 3 cents
already moves the farthest pairs by a kernel width); the three highest coarse peaks are then refined."""
FINE_HALF = 5.0
"""Each coarse peak is refined on a 1-cent grid within +/- one coarse step."""


def best(notes: Notes, w: np.ndarray | None = None) -> tuple[float, float]:
    """The repeat: the highest score over RANGE (a 5-cent grid, then its three highest peaks on a 1-cent grid,
    refined by a parabola). src/dsp/fold.ts bestFold is the same procedure."""
    g = grid_of(COARSE)
    y = notes.curve(g, w)
    loc = [k for k in range(1, len(y) - 1) if y[k] >= y[k - 1] and y[k] > y[k + 1]]
    loc = sorted(loc, key=lambda k: -y[k])[:3] or [int(np.argmax(y))]
    out = (float(g[0]), -np.inf)
    for k in loc:
        f = np.arange(g[k] - FINE_HALF, g[k] + FINE_HALF + 1e-9, 1.0)
        yf = notes.curve(f, w)
        j = int(np.argmax(yf))
        if yf[j] > out[1]:
            out = (float(f[0] + refine(yf, j)), float(yf[j]))
    return out


def boot_scores(notes: Notes, pvals: np.ndarray, w: np.ndarray, chunk: int = 50) -> np.ndarray:
    """Scores for many weight vectors at once: w is (draws, notes); returns (draws, len(pvals)). The same
    arithmetic as Notes.score, vectorised over the draws."""
    w = np.asarray(w, dtype=np.float64)
    s2 = (w * w).sum(axis=1)
    den = w.sum(axis=1) ** 2 - s2
    ks = np.searchsorted(notes.d, np.asarray(pvals) / 2, side="right")
    a = np.empty(len(w))
    q = np.empty((len(w), len(pvals)))
    for b0 in range(0, len(w), chunk):
        wc = w[b0: b0 + chunk]
        pw = wc[:, notes.i] * wc[:, notes.j]
        tot = pw.sum(axis=1)
        a[b0: b0 + chunk] = (pw * notes.phi0).sum(axis=1) / tot
        cum = np.cumsum(pw, axis=1)
        before = np.where(ks[None, :] > 0, cum[:, np.maximum(ks - 1, 0)], 0.0)
        q[b0: b0 + chunk] = 1 - before / tot[:, None]
    # Every (trial interval, harmonic) row in one matrix product: many small products are slow in OpenBLAS.
    pv = np.asarray(pvals, dtype=np.float64)
    hs = [harmonics(float(p)) for p in pv]
    rows_p = np.concatenate([np.full(len(h), p) for p, h in zip(pv, hs)])
    rows_h = np.concatenate(hs)
    ph = 2 * np.pi * np.outer(rows_h / rows_p, notes.c)
    wt = np.ascontiguousarray(w.T)
    zc = np.cos(ph) @ wt
    zs = np.sin(ph) @ wt
    g = np.exp(-2 * np.pi ** 2 * SIGMA ** 2 * rows_h ** 2 / rows_p ** 2)
    terms = g[:, None] * (zc * zc + zs * zs - s2[None, :])
    starts = np.concatenate([[0], np.cumsum([len(h) for h in hs])[:-1]])
    wrapped = 1 + 2 * np.add.reduceat(terms, starts, axis=0).T / den[:, None]
    r = wrapped - pv[None, :] * a[:, None]
    return np.where(q > 0, r / np.where(q > 0, q, 1), 0.0)


def boot_local(notes: Notes, centre: float, w: np.ndarray, step: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    """Each draw's own peak within +/- LOCAL_CENTS of centre: (cents, refined; score)."""
    g = np.arange(centre - LOCAL_CENTS - step, centre + LOCAL_CENTS + step + 1e-9, step)
    y = boot_scores(notes, g, w)
    k = np.argmax(y[:, 1:-1], axis=1) + 1
    pos = np.array([g[0] + refine(row, int(kk)) * step for row, kk in zip(y, k)])
    return pos, y[np.arange(len(y)), k]


def resample_weights(n: int, draws: int, rng: np.random.Generator) -> np.ndarray:
    """Bootstrap resamples of n notes as multiplicities, (draws, n)."""
    return np.stack([np.bincount(rng.integers(0, n, n), minlength=n) for _ in range(draws)]).astype(np.float64)


BOOT = 1000
"""Bootstrap draws over the notes for the repeat's position and for each candidate's margin."""
MIN_CANDIDATE = 4 * SIGMA
"""Peaks below four kernel widths (100 cents) are not compared: a fold that narrow cannot separate notes at
all (the score there stays near 1, chance), so they are not ratios at which anything comes back."""
NAMED = {"3:2": 701.955, "4:3": 498.045, "5:4": 386.314, "two 3:2": 1403.910, "3:1": 1901.955, "4:1": 2400.0}
"""Ratios a player may think of, cents (just intervals): each is judged at its own nearest peak."""


def analysis(cents: np.ndarray, seed: int) -> dict:
    """The repeat on a melody's notes: the best fold, its bootstrap interval, and every other peak of the score
    (each a ratio the player can click) with the bootstrapped margin by which the best beats it."""
    notes = Notes(cents)
    p_best, s_best = best(notes)
    pk = [(p, s) for p, s in peaks(grid_of(1.0), notes.curve(grid_of(1.0))) if p >= MIN_CANDIDATE]
    rng = np.random.default_rng(seed)
    w = resample_weights(len(cents), BOOT, rng)
    pos, _ = boot_local(notes, p_best, w)
    lo, hi = np.percentile(pos, [2.5, 97.5])
    others = sorted([(p, s) for p, s in pk if abs(p - p_best) > LOCAL_CENTS], key=lambda t: t[0])
    sc = boot_scores(notes, np.array([p_best] + [p for p, _ in others]), w)
    cands = []
    for m, (p, s) in enumerate(others, start=1):
        d = sc[:, 0] - sc[:, m]
        cands.append({
            "cents": round(p, 2), "score": round(s, 4),
            "marginLow": round(float(np.percentile(d, 2.5)), 4), "marginHigh": round(float(np.percentile(d, 97.5)), 4),
            "bestWins": round(float((d > 0).mean()), 4),
        })
    named = {}
    for name, c in NAMED.items():
        near = min(cands, key=lambda q: abs(q["cents"] - c)) if cands else None
        named[name] = near["cents"] if near and abs(near["cents"] - c) <= LOCAL_CENTS else None
    return {
        "sigmaCents": SIGMA, "rangeCents": list(RANGE), "draws": BOOT, "seed": seed,
        "bestCents": round(p_best, 3), "bestScore": round(s_best, 4),
        "bootstrap": {"lowCents": round(float(lo), 3), "highCents": round(float(hi), 3),
                      "halfWidthCents": round(float(max(p_best - lo, hi - p_best)), 3)},
        "peaks": cands, "named": named,
        "spanCents": round(float(cents.max() - cents.min()), 2),
    }
