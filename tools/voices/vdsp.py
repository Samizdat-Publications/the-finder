"""The Voices' signal processing, Python reference (numpy, scipy): the twin of src/dsp/spectrum.ts,
src/dsp/pitch.ts and src/dsp/segment.ts. The TypeScript runs the same algorithms on the same samples in
Node and must agree with this (the M2 pattern; src/dsp/voices.ref.test.ts).

- Frame levels: 10 ms non-overlapping frames of the mono mix, RMS in dBFS with the AES17 convention (a
  full-scale sine reads 0 dBFS, so 20 log10(rms * sqrt 2)). With this convention the silent-run counts
  reproduce docs/research/voices.md section 1's table exactly.
- Segments: sound between silent runs (frames below the threshold) at least `min_gap_s` long.
- Long-term spectrum: scipy.signal.welch, periodic Hann, 50% overlap, constant detrend, density.
- Pitch: YIN (de Cheveigne and Kawahara 2002, JASA 111(4) 1917-1930, doi:10.1121/1.1458024): difference
  function, cumulative mean normalized difference (CMND), absolute threshold (0.1, the paper's value),
  first local minimum below it, parabolic interpolation of the CMND around it. One estimate per 10 ms frame,
  the window centred on the frame.
"""
from __future__ import annotations

import numpy as np
from scipy import signal

FRAME_S = 0.010
"""Frame length for levels and pitch, s (voices.md section 1 measured with 10 ms RMS frames)."""
SINE_DB = 20 * np.log10(np.sqrt(2.0))
"""AES17: the RMS of a full-scale sine reads 0 dBFS (+3.01 dB on plain RMS)."""
FLOOR_DB = -200.0
"""Level written for digital silence, dBFS (a stand-in for minus infinity)."""
YIN_THRESHOLD = 0.1
"""YIN absolute threshold on the CMND (de Cheveigne and Kawahara 2002, step 4: 0.1)."""


def hop_of(sr: int) -> int:
    return int(round(FRAME_S * sr))


def frame_levels(x: np.ndarray, sr: int) -> np.ndarray:
    """dBFS (AES17) of each whole 10 ms frame."""
    hop = hop_of(sr)
    n = len(x) // hop
    fr = x[: n * hop].reshape(n, hop).astype(np.float64)
    ms = (fr * fr).mean(axis=1)
    out = np.full(n, FLOOR_DB)
    pos = ms > 0
    out[pos] = 10 * np.log10(ms[pos]) + SINE_DB
    return np.maximum(out, FLOOR_DB)


def silent_runs(levels: np.ndarray, threshold_db: float, min_gap_s: float) -> list[tuple[int, int]]:
    """Runs of frames below the threshold lasting at least min_gap_s: [start, end) frame indices."""
    sil = levels < threshold_db
    d = np.diff(np.concatenate([[0], sil.astype(np.int8), [0]]))
    starts = np.flatnonzero(d == 1)
    ends = np.flatnonzero(d == -1)
    need = int(round(min_gap_s / FRAME_S))
    return [(int(a), int(b)) for a, b in zip(starts, ends) if b - a >= need]


def segments(levels: np.ndarray, threshold_db: float, min_gap_s: float) -> list[tuple[int, int]]:
    """Stretches of sound between qualifying silent runs, trimmed to their first and last loud frame."""
    gaps = silent_runs(levels, threshold_db, min_gap_s)
    cuts = [0]
    for a, b in gaps:
        cuts += [a, b]
    cuts.append(len(levels))
    out = []
    for i in range(0, len(cuts), 2):
        a, b = cuts[i], cuts[i + 1]
        loud = np.flatnonzero(levels[a:b] >= threshold_db)
        if len(loud):
            out.append((a + int(loud[0]), a + int(loud[-1]) + 1))
    return out


def welch(x: np.ndarray, sr: int, nperseg: int = 4096) -> tuple[np.ndarray, np.ndarray, int]:
    """One-sided PSD (units^2/Hz), periodic Hann, 50% overlap, constant detrend; and the segment count."""
    f, p = signal.welch(x, sr, window="hann", nperseg=nperseg, noverlap=nperseg // 2, detrend="constant", scaling="density")
    nseg = 0 if len(x) < nperseg else 1 + (len(x) - nperseg) // (nperseg // 2)
    return f, p, nseg


def segment_bands(x: np.ndarray, sr: int, nperseg: int, edges: np.ndarray) -> np.ndarray:
    """Each Welch segment's periodogram (same window, overlap, detrend and scaling as welch()) in bands:
    (segments, bands). Their mean over segments is welch() in bands."""
    if len(x) < nperseg:
        return np.zeros((0, len(edges) - 1))
    f, _, s = signal.spectrogram(x, sr, window="hann", nperseg=nperseg, noverlap=nperseg // 2, detrend="constant",
                                 scaling="density", mode="psd")
    out = np.zeros((s.shape[1], len(edges) - 1))
    for i in range(len(edges) - 1):
        k = (f >= edges[i]) & (f < edges[i + 1])
        out[:, i] = s[k].mean(axis=0)
    return out


def band_power(f: np.ndarray, p: np.ndarray, edges: np.ndarray) -> np.ndarray:
    """Mean PSD of the bins with lo <= f < hi in each band."""
    out = np.zeros(len(edges) - 1)
    for i in range(len(edges) - 1):
        k = (f >= edges[i]) & (f < edges[i + 1])
        out[i] = p[k].mean() if k.any() else np.nan
    return out


QUIET_DB = -60.0
"""Frames quieter than this (dBFS, AES17) are not pitch-tracked: f0 0, aperiodicity 1 (speeds the tracker; no
speech or music on these tracks is that quiet: the greetings' noise between voices sits near -50 dBFS)."""


def yin(x: np.ndarray, sr: int, fmin: float, fmax: float, window_s: float, threshold: float = YIN_THRESHOLD,
        chunk: int = 256) -> tuple[np.ndarray, np.ndarray]:
    """YIN per 10 ms frame: f0 (Hz, 0 where no frame fits) and the CMND value at the chosen lag (aperiodicity).

    Frame k's window of round(window_s * sr) samples starts at k*hop + hop//2 - window//2 (centred on the frame); lags
    run from floor(sr / fmax) to ceil(sr / fmin). Frames whose window plus lags leave the signal get f0 0 and
    aperiodicity 1, as do frames below QUIET_DB. Voiced means aperiodicity < threshold.
    """
    hop = hop_of(sr)
    n = len(x) // hop
    tmin = int(np.floor(sr / fmax))
    tmax = int(np.ceil(sr / fmin))
    W = int(round(window_s * sr))
    L = W + tmax + 1
    N = 1 << int(np.ceil(np.log2(L + W)))
    f0 = np.zeros(n)
    ap = np.ones(n)
    starts = np.arange(n) * hop + hop // 2 - W // 2
    lv = frame_levels(x, sr)
    ok = np.flatnonzero((starts >= 0) & (starts + L <= len(x)) & (lv >= QUIET_DB))
    xd = x.astype(np.float64)
    idx = np.arange(L)
    taus = np.arange(tmax + 1)
    for c in range(0, len(ok), chunk):
        ks = ok[c: c + chunk]
        seg = xd[starts[ks][:, None] + idx[None, :]]  # (m, L)
        a = np.zeros((len(ks), N))
        a[:, :W] = seg[:, :W]
        b = np.zeros((len(ks), N))
        b[:, :L] = seg
        r = np.fft.irfft(np.conj(np.fft.rfft(a, axis=1)) * np.fft.rfft(b, axis=1), n=N, axis=1)[:, : tmax + 1]
        cs = np.concatenate([np.zeros((len(ks), 1)), np.cumsum(seg * seg, axis=1)], axis=1)
        ea = cs[:, W]
        eb = cs[:, taus + W] - cs[:, taus]
        d = ea[:, None] + eb - 2 * r
        d[:, 0] = 0.0
        d = np.maximum(d, 0.0)
        cm = np.cumsum(d[:, 1:], axis=1)
        dn = np.ones_like(d)
        with np.errstate(divide="ignore", invalid="ignore"):
            dn[:, 1:] = np.where(cm > 0, d[:, 1:] * taus[1:] / cm, 1.0)
        for j, k in enumerate(ks):
            row = dn[j]
            tau = -1
            t = tmin
            while t <= tmax:
                if row[t] < threshold:
                    while t + 1 <= tmax and row[t + 1] < row[t]:
                        t += 1
                    tau = t
                    break
                t += 1
            if tau < 0:
                tau = tmin + int(np.argmin(row[tmin: tmax + 1]))
            ap[k] = row[tau]
            shift = 0.0
            if tmin < tau < tmax:
                y0, y1, y2 = row[tau - 1], row[tau], row[tau + 1]
                den = y0 - 2 * y1 + y2
                if den > 0:
                    shift = 0.5 * (y0 - y2) / den
            f0[k] = sr / (tau + shift)
    return f0, ap


CHROMA = {"nperseg": 8192, "hop": 2048, "fminHz": 80.0, "fmaxHz": 2000.0, "relMin": 0.1}
"""Spectral peaks for a pitch-class histogram of polyphonic music: Hann frames of 8192 samples (5.4 Hz bins at
44.1 kHz) every 2048; peaks between 80 Hz and 2 kHz (the fundamentals and low partials of a piano's middle,
where inharmonicity is small) at least a tenth of the frame's largest there."""


def chroma_peaks(x: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Every spectral peak: cents re 440 Hz (parabolic interpolation of the log magnitude), its magnitude as
    weight, and its frame index. Frames start at 0, every hop, while the whole frame fits."""
    n, hop = CHROMA["nperseg"], CHROMA["hop"]
    win = signal.get_window("hann", n)
    lo = int(np.floor(CHROMA["fminHz"] * n / sr))
    hi = int(np.ceil(CHROMA["fmaxHz"] * n / sr))
    nf = 1 + (len(x) - n) // hop if len(x) >= n else 0
    cs, ws, fs = [], [], []
    k = np.arange(lo, hi + 1)
    for j in range(nf):
        a = np.abs(np.fft.rfft(x[j * hop: j * hop + n] * win))
        band = a[lo: hi + 1]
        mx = band.max()
        if mx <= 0:
            continue
        sel = (a[k] > a[k - 1]) & (a[k] >= a[k + 1]) & (a[k] >= CHROMA["relMin"] * mx)
        for q in k[sel]:
            y0, y1, y2 = np.log(a[q - 1] + 1e-300), np.log(a[q]), np.log(a[q + 1] + 1e-300)
            den = y0 - 2 * y1 + y2
            dq = 0.5 * (y0 - y2) / den if den < 0 else 0.0
            cs.append(1200 * np.log2((q + dq) * sr / n / 440.0))
            ws.append(a[q])
            fs.append(j)
    return np.array(cs), np.array(ws), np.array(fs, dtype=int)
