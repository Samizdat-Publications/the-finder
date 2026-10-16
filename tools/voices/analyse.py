"""The Voices' reference analysis (M5 step 4): runs on the lossless Ozma transfers and writes data/voices.json
(the numbers the four Voices checkers judge against) and build/voices/NN.wav (the mono samples the Node tests
read, so the TypeScript can be checked against this on the same samples).

Inputs : sources/ozma-cd-NN/NN.flac (tools/sources.json; 44.1 kHz, 16-bit stereo)
Outputs: data/voices.json, build/voices/02.wav, 03.wav, 14.wav
Run    : python -P tools/voices/analyse.py   (about 1 minute)

Every track is analysed as its mono mix (L + R) / 2 rounded to 16 bits, exactly the samples written to the
WAVs. What each part measures, and why its settings are what they are, is in docs/research/voices.md and in
data/README.md (voices.json). Deterministic: the bootstraps use fixed seeds.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vdsp  # noqa: E402
import vmusic  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_JSON = os.path.join(ROOT, "data", "voices.json")
WAV_DIR = os.path.join(ROOT, "build", "voices")

SPEECH = {"fminHz": 60.0, "fmaxHz": 500.0, "windowS": 1024 / 44100}
"""Pitch tracker for speaking voices: 60 to 500 Hz covers men, women and children; a 23.2 ms window holds
more than one period of the lowest (16.7 ms)."""
CALLS = {"fminHz": 60.0, "fmaxHz": 2000.0, "windowS": 1024 / 44100}
"""Pitch tracker for calls: the same, up to 2 kHz (whale calls on this track run near 1 kHz)."""
MUSIC = {"fminHz": 180.0, "fmaxHz": 2500.0, "windowS": 1024 / 44100}
"""Pitch tracker for the violin: its lowest string is G3 (196 Hz); 2.5 kHz is above its highest notes here."""
ARIA = {"fminHz": 280.0, "fmaxHz": 1800.0, "windowS": 2048 / 44100}
"""Tried for the Queen of the Night aria (soprano D4 to F6): the orchestra under her defeats a single-voice
tracker (the grid test below), so the step and octave are measured on the solo violin instead."""
GAPS = [0.15, 0.25, 0.4]
TABLE_THRESHOLDS = [-50, -45, -40, -35]
RESEARCH_TABLE = [[66, 34, 7], [105, 72, 31], [115, 93, 51], [130, 100, 66]]
"""docs/research/voices.md section 1: silent runs in Ozma 02 by threshold (rows) and minimum gap (columns)."""
REASONABLE_GAPS = (0.15, 0.40)
"""voices.md section 1: gaps between greetings are typically 0.2 to 0.5 s; the research's own grid spans
0.15 to 0.4 s. Shorter minimum gaps split single words; longer ones skip most of the gaps between voices."""
SPEC_TRACKS = [1, 2] + list(range(5, 32))
"""All the speech and music: Waldheim (01), the 55 greetings (02) and the 27 pieces (05 to 31). Track 03 (the
UN greetings over whale song) and 04 (the Sounds of Earth) are left out: not only theirs, or not voices."""
BAND_HZ = 250.0
NPERSEG = 4096
BOOT = 2000


def mono(n: int) -> tuple[np.ndarray, int]:
    nn = f"{n:02d}"
    x, sr = sf.read(os.path.join(ROOT, "sources", f"ozma-cd-{nn}", f"{nn}.flac"), dtype="float64")
    q = np.clip(np.round(x.mean(axis=1) * 32768), -32768, 32767)
    return q / 32768, sr


def write_wav(n: int, m: np.ndarray, sr: int) -> None:
    os.makedirs(WAV_DIR, exist_ok=True)
    sf.write(os.path.join(WAV_DIR, f"{n:02d}.wav"), np.round(m * 32768).astype(np.int16), sr, subtype="PCM_16")


def r(x: float, d: int = 4) -> float:
    return float(round(float(x), d))


def greetings() -> dict:
    m, sr = mono(2)
    write_wav(2, m, sr)
    raw = vdsp.frame_levels(m, sr)
    table = [[len(vdsp.silent_runs(raw, t, g)) for g in GAPS] for t in TABLE_THRESHOLDS]
    lv10 = np.round(raw * 10).astype(int)
    lv = lv10 / 10.0
    # Reasonable thresholds: a two-component mixture fitted to the frame levels (digital silence left out),
    # one component the noise between voices, the other the voices. A threshold is reasonable inside the
    # crossover, where a frame at that level is the noise with probability from 95% down to 5%.
    live = lv[lv > -100]
    _, w, mu, sd = vmusic.gmm(live, 2)
    lo_k, hi_k = int(np.argmin(mu)), int(np.argmax(mu))
    t_lo = posterior_level(w, mu, sd, lo_k, hi_k, 0.95)
    t_hi = posterior_level(w, mu, sd, lo_k, hi_k, 0.05)
    grid_t = np.arange(np.ceil(t_lo * 2) / 2, np.floor(t_hi * 2) / 2 + 1e-9, 0.5)
    grid_g = np.round(np.arange(REASONABLE_GAPS[0], REASONABLE_GAPS[1] + 1e-9, 0.01), 2)
    counts = np.array([[len(vdsp.segments(lv, t, g)) for g in grid_g] for t in grid_t])
    f0, ap = vdsp.yin(m, sr, SPEECH["fminHz"], SPEECH["fmaxHz"], SPEECH["windowS"])
    f0q = np.where(ap < vdsp.YIN_THRESHOLD, np.round(f0 * 100), 0).astype(int)
    f0c, apc = vdsp.yin(m, sr, CALLS["fminHz"], CALLS["fmaxHz"], CALLS["windowS"])
    ceiling = vmusic.longest_run_pitch(f0c, apc, vdsp.YIN_THRESHOLD)
    # One speaker for comparison: Kurt Waldheim (Ozma 01, the same transfer, one man).
    mw, srw = mono(1)
    write_wav(1, mw, srw)
    lw10 = np.round(vdsp.frame_levels(mw, srw) * 10).astype(int)
    fw, aw = vdsp.yin(mw, srw, SPEECH["fminHz"], SPEECH["fmaxHz"], SPEECH["windowS"])
    fw100 = np.where(aw < vdsp.YIN_THRESHOLD, np.round(fw * 100), 0).astype(int)
    ref_t = float(np.round((grid_t[0] + grid_t[-1]) / 2 * 2) / 2)
    ref_g = round((REASONABLE_GAPS[0] + REASONABLE_GAPS[1]) / 2, 2)
    one = vmusic.segment_pitches(lw10 / 10, fw100 / 100, ref_t, ref_g)
    sd_one = float(np.std(np.log2(one), ddof=1) * 12)
    many = vmusic.segment_pitches(lv, f0q / 100, ref_t, ref_g)
    sd_many = float(np.std(np.log2(many), ddof=1) * 12)
    groups = vmusic.voices_by_pitch(many, sd_one)
    from scipy.stats import f as fdist
    p_one = float(fdist.sf((sd_many / sd_one) ** 2, len(many) - 1, len(one) - 1))
    lr_bic = [r(vmusic.bic(np.log2(many), k) - vmusic.bic(np.log2(many), 1), 3) for k in (1, 2, 3)]
    return {
        "track": "ozma-02",
        "sampleRate": sr,
        "frameS": vdsp.FRAME_S,
        "levelsDb10": lv10.tolist(),
        "f0Hz100": f0q.tolist(),
        "researchTable": {"thresholdsDb": TABLE_THRESHOLDS, "gapsS": GAPS, "silentRuns": table, "research": RESEARCH_TABLE},
        "levelMixture": {"weights": [r(w[lo_k]), r(w[hi_k])], "meansDb": [r(mu[lo_k]), r(mu[hi_k])], "sdsDb": [r(sd[lo_k]), r(sd[hi_k])]},
        "reasonable": {"thresholdDb": [r(t_lo, 3), r(t_hi, 3)], "thresholdGridDb": [float(grid_t[0]), float(grid_t[-1])], "gapS": list(REASONABLE_GAPS)},
        "accepted": {"minVoices": int(counts.min()), "maxVoices": int(counts.max())},
        "speechCeilingHz": r(ceiling, 2),
        "oneSpeaker": {"track": "ozma-01", "levelsDb10": lw10.tolist(), "f0Hz100": fw100.tolist(),
                       "settings": {"thresholdDb": ref_t, "gapS": ref_g}, "segments": len(one), "sdSemitones": r(sd_one, 4)},
        "reference": {"segments": len(many), "sdSemitones": r(sd_many, 4), "voicesByPitch": groups,
                      "fTestP": float(f"{p_one:.3g}"), "bicMinusOne": lr_bic},
    }


POSTERIOR_EDGE = 0.95
"""The reasonable thresholds run from where a frame is the noise with probability 0.95 to where it is 0.05."""


def posterior_level(w, mu, sd, lo_k: int, hi_k: int, p: float) -> float:
    """The level between the two means where the noise component's posterior probability equals p (bisection)."""
    def post(t: float) -> float:
        a = w[lo_k] / sd[lo_k] * np.exp(-0.5 * ((t - mu[lo_k]) / sd[lo_k]) ** 2)
        b = w[hi_k] / sd[hi_k] * np.exp(-0.5 * ((t - mu[hi_k]) / sd[hi_k]) ** 2)
        return a / (a + b)
    a, b = float(mu[lo_k]), float(mu[hi_k])
    for _ in range(100):
        c = 0.5 * (a + b)
        if post(c) > p:
            a = c
        else:
            b = c
    return 0.5 * (a + b)


def boot_interval(vals: np.ndarray, est: float) -> float:
    """Half-width of the bootstrap's central 95% interval, about the estimate (the larger side)."""
    lo, hi = np.percentile(vals, [2.5, 97.5])
    return float(max(est - lo, hi - est))


def tone(f0: float, sr: int, dur: float, rng: np.random.Generator, snr_db: float = 30.0) -> np.ndarray:
    """Five harmonics at 1/k amplitude, random phases, white noise at snr_db below the tone's power."""
    t = np.arange(int(dur * sr)) / sr
    x = sum(np.sin(2 * np.pi * k * f0 * t + rng.uniform(0, 2 * np.pi)) / k for k in range(1, 6))
    x = 0.3 * x / np.sqrt(np.mean(x * x))
    x = x + rng.normal(0, np.sqrt(np.mean(x * x)) * 10 ** (-snr_db / 20), len(x))
    return np.round(x * 32768) / 32768


def tracker_errors() -> dict[str, np.ndarray]:
    """YIN on synthetic tones of known pitch with each tracker setting (40 tones per setting, log-uniform over
    its range, seeded): every voiced frame's error, cents."""
    rng = np.random.default_rng(42)
    errs = {}
    for name, p, lo, hi in [("speech", SPEECH, 70, 450), ("music", MUSIC, 200, 2200), ("calls", CALLS, 300, 1800)]:
        e = []
        for f in np.exp(rng.uniform(np.log(lo), np.log(hi), 40)):
            x = tone(f, 44100, 0.5, rng)
            f0, ap = vdsp.yin(x, 44100, p["fminHz"], p["fmaxHz"], p["windowS"])
            v = ap < vdsp.YIN_THRESHOLD
            e.extend((1200 * np.log2(f0[v] / f)).tolist())
        errs[name] = np.array(e)
    return errs


def music() -> dict:
    """The octave on the solo violin (notes from the pitch tracker, the repetition curve's peak near a doubling),
    and the step on Gould's piano (spectral peaks, the comb of equal divisions of that octave that fits best)."""
    m, sr = mono(14)
    write_wav(14, m, sr)
    f0, ap = vdsp.yin(m, sr, MUSIC["fminHz"], MUSIC["fmaxHz"], MUSIC["windowS"])
    ns = vmusic.notes(f0, ap, vdsp.YIN_THRESHOLD)
    nc = np.array([round(c * 100) / 100 for _, _, c in ns])
    octave = octave_of(nc)
    rng = np.random.default_rng(20261016)
    bo = [o for o in (octave_of(nc[rng.integers(0, len(nc), len(nc))]) for _ in range(BOOT)) if o is not None]
    # The aria, tried with a tracker set for the soprano: how well its notes sit on a 100-cent grid.
    ma, sra = mono(15)
    fa, aa = vdsp.yin(ma, sra, ARIA["fminHz"], ARIA["fmaxHz"], ARIA["windowS"])
    na = np.array([c for _, _, c in vmusic.notes(fa, aa, vdsp.YIN_THRESHOLD)])
    grid = lambda c: float(np.abs(np.exp(2j * np.pi * c / 100).mean()))  # noqa: E731
    # The piano.
    mp, srp = mono(21)
    write_wav(21, mp, srp)
    cs, ws, fr = vdsp.chroma_peaks(mp, srp)
    h = vmusic.chroma_histogram(cs, ws)
    centres = vmusic.bin_centres(len(h), vmusic.CHROMA_BIN)
    scores = vmusic.comb_scores(centres, h, octave)
    k = vmusic.COMB_K[0] + int(np.argmax(scores))
    # Block bootstrap over frames (blocks of 20 frames, about 0.9 s): how often the same comb wins.
    nfr = int(fr.max()) + 1
    by_frame = [np.flatnonzero(fr == j) for j in range(nfr)]
    rng2 = np.random.default_rng(1685)
    wins = 0
    for _ in range(PIANO_BOOT):
        starts = rng2.integers(0, nfr - BLOCK + 1, nfr // BLOCK)
        idx = np.concatenate([by_frame[j] for s0 in starts for j in range(s0, s0 + BLOCK)])
        hb = vmusic.chroma_histogram(cs[idx], ws[idx])
        sc = vmusic.comb_scores(centres, hb, octave)
        wins += int(vmusic.COMB_K[0] + int(np.argmax(sc)) == k)
    ranked = sorted(range(len(scores)), key=lambda i: -scores[i])
    fit = vmusic.grid_fit(centres, h, octave / k)
    return {
        "violin": {
            "track": "ozma-14",
            "piece": "Partita for Violin Solo no. 3 in E major, BWV 1006: Gavotte (Bach; Arthur Grumiaux)",
            "notes": [[a, n, int(round(c * 100))] for a, n, c in ns],
            "octaveCents": r(octave, 3),
            "bootstrap": {"draws": BOOT, "kept": len(bo), "octaveHalfWidthCents": r(boot_interval(np.array(bo), octave), 3)},
            "gridResultant100": r(grid(nc)),
            "trackerError95Cents": r(np.percentile(np.abs(tracker_errors()["music"]), 95), 4),
        },
        "aria": {"track": "ozma-15", "notes": int(len(na)), "gridResultant100": r(grid(na))},
        "piano": {
            "track": "ozma-21",
            "piece": "The Well-Tempered Clavier, Book II: Prelude and Fugue no. 1 in C major (Bach; Glenn Gould)",
            "peaks": int(len(cs)),
            "histBinCents": vmusic.CHROMA_BIN,
            "hist": [r(v, 7) for v in h],
            "combScores": [r(v, 5) for v in scores],
            "combK": k,
            "runnerUpK": vmusic.COMB_K[0] + ranked[1],
            "fit": {"offsetCents": r(fit[1], 3), "sdCents": r(fit[2], 3), "background": r(fit[3])},
            "bootstrap": {"draws": PIANO_BOOT, "blockFrames": BLOCK, "sameK": r(wins / PIANO_BOOT)},
        },
    }


PIANO_BOOT = 200
"""Bootstrap draws for the piano's comb (each refits 35 combs; 200 resolve a winning share near 1)."""


def octave_of(nc: np.ndarray) -> float | None:
    """The repetition curve's peak nearest a doubling (within one tempered step of 1200 cents), cents."""
    h = vmusic.histogram(nc)
    curve = vmusic.repetition_curve(h, int(2400 / vmusic.HIST_BIN))
    pk = vmusic.peak_near(curve, 1200 / vmusic.HIST_BIN, int(100 / vmusic.HIST_BIN))
    return None if pk is None else pk * vmusic.HIST_BIN


def spectrum(noise_threshold_db: float) -> dict:
    """Long-term spectra: every speech and music track (for display), and the deduction's measurement on the
    greetings (Ozma 02): their long-term spectrum against the same transfer's own silence between voices, and
    where the one falls into the other, with a block bootstrap over Welch segments for its uncertainty."""
    edges = np.arange(0.0, 22050.0 + 1e-9, BAND_HZ)
    edges = np.append(edges, 22050.0) if edges[-1] < 22050 else edges
    per, tot, nseg = {}, None, 0
    for n in SPEC_TRACKS:
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
    for _ in range(BOOT):
        sp = block_resample(speech_seg, BLOCK, rng).mean(axis=0)
        no = block_resample(noise_seg, BLOCK, rng).mean(axis=0)
        bc.append(crossing(10 * np.log10(sp / no), edges))
    lo, hi = np.percentile(bc, [2.5, 97.5])
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
        "bootstrap": {"draws": BOOT, "blockSegments": BLOCK},
    }


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


def crossing(snr: np.ndarray, edges: np.ndarray) -> float:
    """The frequency above which the signal stays within SNR_EDGE_DB of the noise (bands up to TOP_HZ): the last
    band centre still above it, interpolated linearly to where the band-centre curve meets it; TOP_HZ if the
    last band is still above it."""
    nb = int(np.searchsorted(edges, TOP_HZ, side="right")) - 1
    snr = snr[:nb]
    edges = edges[: nb + 1]
    centres = 0.5 * (edges[:-1] + edges[1:])
    above = np.flatnonzero(snr > SNR_EDGE_DB)
    if len(above) == 0:
        return float(centres[0])
    k = int(above[-1])
    if k == len(snr) - 1:
        return float(edges[-1])
    s0, s1 = snr[k], snr[k + 1]
    return float(centres[k] + (s0 - SNR_EDGE_DB) / (s0 - s1) * (centres[k + 1] - centres[k]))


def whale(ceiling_hz: float) -> dict:
    m, sr = mono(3)
    write_wav(3, m, sr)
    f0, ap = vdsp.yin(m, sr, CALLS["fminHz"], CALLS["fmaxHz"], CALLS["windowS"])
    cs = vmusic.calls(f0, ap, vdsp.YIN_THRESHOLD, ceiling_hz)
    seg = [cs[0][0] * vdsp.FRAME_S, (cs[-1][0] + cs[-1][1]) * vdsp.FRAME_S] if cs else None
    return {
        "track": "ozma-03",
        "calls": [[a, n, r(hz, 2), r(g, 1)] for a, n, hz, g in cs],
        "segmentS": [r(seg[0], 2), r(seg[1], 2)] if seg else None,
        "minCallS": vmusic.CALL_MIN_S,
    }


def main() -> None:
    g = greetings()
    mus = music()
    spec = spectrum(g["reasonable"]["thresholdDb"][0])
    wh = whale(g["speechCeilingHz"])
    out = {
        "meta": {
            "about": "The Voices' reference analysis of the Ozma transfers (M5 step 4); see data/README.md.",
            "script": "tools/voices/analyse.py",
            "built": date.today().isoformat(),
            "sources": "sources/ozma-cd-NN/NN.flac (tools/sources.json), mono mix (L + R) / 2 rounded to 16 bits",
            "research": "docs/research/voices.md",
            "yin": {"threshold": vdsp.YIN_THRESHOLD, "frameS": vdsp.FRAME_S, "quietDb": vdsp.QUIET_DB,
                    "speech": SPEECH, "calls": CALLS, "music": MUSIC, "aria": ARIA},
            "notes": {"stepCents": vmusic.NOTE_STEP_CENTS, "minFrames": vmusic.NOTE_MIN_FRAMES, "histBinCents": vmusic.HIST_BIN},
            "snrEdgeDb": r(SNR_EDGE_DB, 6),
            "crossingTopHz": TOP_HZ,
        },
        "greetings": g,
        "spectrum": spec,
        "music": mus,
        "whale": wh,
    }
    with open(OUT_JSON, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, separators=(",", ":"), sort_keys=True)
        fh.write("\n")
    print("voices.json written:", os.path.getsize(OUT_JSON), "bytes")
    print("table", g["researchTable"]["silentRuns"])
    print("reasonable", g["reasonable"], "accepted", g["accepted"], "ceiling", g["speechCeilingHz"])
    print("violin", {k: v for k, v in mus["violin"].items() if k != "notes"})
    print("aria", mus["aria"], "piano", {k: v for k, v in mus["piano"].items() if k not in ("hist", "combScores")}, mus["piano"]["combScores"][:14])
    print("crossing", spec["crossingHz"], spec["crossingBandHz"], "energy95", spec["greetingsEnergy95Hz"], spec["aggregateEnergy95Hz"], "noise segs", spec["noiseSegments"])
    print("whale", wh["segmentS"], len(wh["calls"]))


if __name__ == "__main__":
    main()
