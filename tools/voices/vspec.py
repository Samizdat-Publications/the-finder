"""The Voices' long-term spectra and where the greetings fall into their own hiss (voices.hearing), Python
reference; moved out of analyse.py (which re-exports these names). The twin of src/dsp/spectrum.ts.
"""
from __future__ import annotations

import numpy as np

import vdsp

BAND_HZ = 250.0
NPERSEG = 4096
EDGE_FACTORS = [1 / 3, 1 / 2, 1.0, 2.0, 3.0]
"""The edge's definition alone, as a spread: where what the voices add over the hiss falls to a third, a half, one,
two and three times the hiss itself (a factor of three either side of the 3 dB rule's 'equal', SNR_EDGE_DB). The
auditor's own definitions (docs/reviews/2026-10-16-M5-science-audit.md, finding 7) moved it 15.0 to 17.0 kHz."""


def r(x: float, d: int = 4) -> float:
    return float(round(float(x), d))


BLOCK = 20
"""Block bootstrap: Welch segments overlap by half and speech is correlated over a syllable or two, so whole
blocks of 20 segments (about 0.9 s) are resampled together."""


def block_resample(seg: np.ndarray, block: int, rng: np.random.Generator) -> np.ndarray:
    nb = max(1, len(seg) // block)
    starts = rng.integers(0, max(1, len(seg) - block + 1), nb)
    return np.concatenate([seg[s: s + block] for s in starts])


def quiet_stretches(m: np.ndarray, sr: int, threshold_db: float) -> list[np.ndarray]:
    """Every stretch of the greetings quieter than threshold_db (and not digital silence) long enough for one
    Welch segment: the transfer's own noise between voices."""
    lv = vdsp.frame_levels(m, sr)
    hop = vdsp.hop_of(sr)
    quiet = (lv < threshold_db) & (lv > -100)
    d = np.diff(np.concatenate([[0], quiet.astype(np.int8), [0]]))
    return [m[a * hop: b * hop] for a, b in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)) if (b - a) * hop >= NPERSEG]


SNR_EDGE_DB = 10 * np.log10(2.0)
"""Where the sound falls into the noise: the aggregate is twice the noise power (3.01 dB above it), so what the
tracks add equals the record's own noise there (a signal-to-noise ratio of one)."""


TOP_HZ = 20_000.0
"""Bands are judged only up to 20 kHz: the game's runtime audio is Opus, which codes at most 20 kHz (fullband,
RFC 6716 section 2), so the browser can measure nothing above it. The crossing lies well below."""


def crossing(snr: np.ndarray, edges: np.ndarray, edge_db: float = SNR_EDGE_DB) -> float:
    """The frequency above which the signal stays within edge_db of the noise (bands up to TOP_HZ): the last
    band centre still above it, interpolated linearly to where the band-centre curve meets it; TOP_HZ if the
    last band is still above it."""
    nb = int(np.searchsorted(edges, TOP_HZ, side="right")) - 1
    snr = snr[:nb]
    edges = edges[: nb + 1]
    centres = 0.5 * (edges[:-1] + edges[1:])
    above = np.flatnonzero(snr > edge_db)
    if len(above) == 0:
        return float(centres[0])
    k = int(above[-1])
    if k == len(snr) - 1:
        return float(edges[-1])
    s0, s1 = snr[k], snr[k + 1]
    return float(centres[k] + (s0 - edge_db) / (s0 - s1) * (centres[k + 1] - centres[k]))


def spectrum(mono, tracks: list[int], noise_threshold_db: float, boot: int) -> dict:
    """Long-term spectra: every speech and music track (for display), and the deduction's measurement on the
    greetings (Ozma 02): their long-term spectrum against the same transfer's own silence between voices, and
    where the one falls into the other, with a block bootstrap over Welch segments for its uncertainty."""
    edges = np.arange(0.0, 22050.0 + 1e-9, BAND_HZ)
    edges = np.append(edges, 22050.0) if edges[-1] < 22050 else edges
    per, tot, nseg = {}, None, 0
    for n in tracks:
        m, sr = mono(n)
        f, p, ns = vdsp.welch(m, sr, NPERSEG)
        bp = vdsp.band_power(f, p, edges)
        per[f"ozma-{n:02d}"] = bp
        tot = bp * ns if tot is None else tot + bp * ns
        nseg += ns
    agg = tot / nseg
    m, sr = mono(2)
    speech_seg = vdsp.segment_bands(m, sr, NPERSEG, edges)
    noise_seg = np.concatenate([vdsp.segment_bands(x, sr, NPERSEG, edges) for x in quiet_stretches(m, sr, noise_threshold_db)])
    speech = speech_seg.mean(axis=0)
    noise = noise_seg.mean(axis=0)
    cross = crossing(10 * np.log10(speech / noise), edges)
    rng = np.random.default_rng(1977)
    bc = []
    for _ in range(boot):
        sp = block_resample(speech_seg, BLOCK, rng).mean(axis=0)
        no = block_resample(noise_seg, BLOCK, rng).mean(axis=0)
        bc.append(crossing(10 * np.log10(sp / no), edges))
    lo, hi = np.percentile(bc, [2.5, 97.5])
    snr = 10 * np.log10(speech / noise)
    spread = [crossing(snr, edges, 10 * np.log10(1 + f)) for f in EDGE_FACTORS]
    cum = np.cumsum(agg) / agg.sum()
    k95 = int(np.searchsorted(cum, 0.95))
    cum2 = np.cumsum(speech) / speech.sum()
    return {
        "bandEdgesHz": [float(e) for e in edges],
        "welch": {"nperseg": NPERSEG, "overlap": 0.5, "window": "periodic Hann", "detrend": "constant", "scaling": "density"},
        "tracks": list(per.keys()),
        "perTrackDb": {k: [r(10 * np.log10(v), 3) for v in per[k]] for k in per},
        "aggregateDb": [r(10 * np.log10(v), 3) for v in agg],
        "aggregatePeakBandHz": [float(edges[int(np.argmax(agg))]), float(edges[int(np.argmax(agg)) + 1])],
        "aggregateEnergy95Hz": float(edges[k95 + 1]),
        "greetingsDb": [r(10 * np.log10(v), 3) for v in speech],
        "noiseDb": [r(10 * np.log10(v), 3) for v in noise],
        "noiseSegments": int(len(noise_seg)),
        "greetingsSegments": int(len(speech_seg)),
        "greetingsEnergy95Hz": float(edges[int(np.searchsorted(cum2, 0.95)) + 1]),
        "crossingHz": r(cross, 1),
        "crossingBandHz": [r(lo, 1), r(hi, 1)],
        "bootstrap": {"draws": boot, "blockSegments": BLOCK},
        "definitions": {"addedOverNoise": [r(f, 4) for f in EDGE_FACTORS], "crossingHz": [r(c, 1) for c in spread],
                        "spreadHz": [r(min(spread), 1), r(max(spread), 1)]},
    }
