"""voices.others, Python reference: on every track the player can mark, where the long held calls are and where
speech is, frame by frame (10 ms frames, the same frames as the pitch tracker). A marked stretch is "not
theirs" when it holds at least one held call and no measured speech (docs/reviews/2026-10-16-M5-science-
audit.md, findings 1 and 2, the lead's decision); src/chapters/voices/checkers.ts judges with what this writes
into data/voices.json ("others").

- Held calls: vmusic.calls on the calls tracker (YIN 60 to 2,000 Hz), median pitch above the speakers' highest
  held pitch (greetings.speechCeilingHz), held at least vmusic.CALL_MIN_S. The same finder as the whale's.
- Speech: a frame is speech when it is voiced at a speaking pitch AND broadband, in a run of such frames:
  * voiced at a speaking pitch: YIN with the speech tracker (60 to 500 Hz) finds a period whose CMND is below
    SPEECH_CMND and whose pitch is at most the speakers' highest held pitch;
  * broadband: at least SPEECH_COVER of the FFT bins from 300 to 3,000 Hz stand SPEECH_ABOVE_DB above the
    track's own floor in that bin (its 20th percentile over the track's live frames). A voice's harmonics and
    formants light most of that band; a held call lights a few bins, a low pulse none of it;
  * runs: such frames whose pitch moves less than 50 cents per frame, at least SPEECH_MIN_FRAMES long.
  The rule was set on the UN greetings track (03) against the lead's own reading of its spectrograms (speech
  to about 188 s, calls alone after about 189 s) and is validated, independently, on the 55 greetings (02) and
  Waldheim (01), where every stretch of a few seconds must hold speech (tools/voices/checks.py voices.ref.speech).

Music items are measured too (their held tones are counted), but a stretch of one of their pieces of music is
never "not theirs": a held tone there is their own playing or singing, which this measurement cannot tell from
an animal's call. The checker says so with the counts.
"""
from __future__ import annotations

import numpy as np

import vdsp
import vmusic

SPEECH_CMND = 0.45
"""Voicing for speech is lenient: the UN greetings' speech is noisy and hummed, and its CMND minimum rarely falls
below YIN's own 0.1; 0.3 to 0.6 give the same verdicts on track 03 (checks.py voices.ref.speech)."""
SPEECH_BAND_HZ = (300.0, 3000.0)
"""The band a speaking voice's harmonics and formants fill (and where the whale's calls are single lines)."""
SPEECH_ABOVE_DB = 15.0
"""A bin is lit when it stands this far above the track's own floor in that bin."""
SPEECH_FLOOR_PCT = 20.0
"""Each bin's floor: its 20th percentile over the track's live frames (not digital silence)."""
SPEECH_COVER = 0.7
"""A frame is broadband when at least this share of the band's bins is lit."""
SPEECH_MIN_FRAMES = 3
"""Speech runs last at least 30 ms (a single lit, voiced frame may be a click under a call)."""
SPEECH_STEP_CENTS = 50.0
"""A speech run's pitch moves less than half a tempered step per 10 ms frame (vmusic.NOTE_STEP_CENTS)."""
NFFT = 1024
"""Band coverage frames: 1024 samples (23 ms at 44.1 kHz), Hann, centred on each 10 ms frame like YIN's."""


def band_cover(x: np.ndarray, sr: int, chunk: int = 4096) -> np.ndarray:
    """Per 10 ms frame: the share of the 300 to 3,000 Hz bins lit above the track's own floor (0 where the frame's
    window leaves the signal or the frame is digital silence)."""
    hop = vdsp.hop_of(sr)
    n = len(x) // hop
    starts = np.arange(n) * hop + hop // 2 - NFFT // 2
    ok = np.flatnonzero((starts >= 0) & (starts + NFFT <= len(x)))
    f = np.fft.rfftfreq(NFFT, 1 / sr)
    band = (f >= SPEECH_BAND_HZ[0]) & (f <= SPEECH_BAND_HZ[1])
    win = np.hanning(NFFT)
    db = np.full((n, int(band.sum())), -400.0)
    idx = np.arange(NFFT)
    for c in range(0, len(ok), chunk):
        ks = ok[c: c + chunk]
        fr = x[starts[ks][:, None] + idx[None, :]] * win
        db[ks] = 10 * np.log10(np.abs(np.fft.rfft(fr, axis=1))[:, band] ** 2 + 1e-20)
    live = db.mean(axis=1) > -150
    out = np.zeros(n)
    if not live.any():
        return out
    floor = np.percentile(db[live], SPEECH_FLOOR_PCT, axis=0)
    out[live] = ((db[live] - floor) > SPEECH_ABOVE_DB).mean(axis=1)
    return out


def speech_runs(f0: np.ndarray, ap: np.ndarray, cover: np.ndarray, ceiling_hz: float) -> list[tuple[int, int]]:
    """Runs of speech frames: [start, end) frame indices."""
    n = min(len(f0), len(cover))
    v = (ap[:n] < SPEECH_CMND) & (f0[:n] > 0) & (f0[:n] <= ceiling_hz) & (cover[:n] >= SPEECH_COVER)
    c = vmusic.cents(f0[:n])
    return [(a, b) for a, b in vmusic.runs(v, c, SPEECH_STEP_CENTS) if b - a >= SPEECH_MIN_FRAMES]


def measure(m: np.ndarray, sr: int, ceiling_hz: float, speech: dict, calls_cfg: dict) -> dict:
    """One track: its held calls and its speech runs (frame indices)."""
    fc, ac = vdsp.yin(m, sr, calls_cfg["fminHz"], calls_cfg["fmaxHz"], calls_cfg["windowS"])
    cs = vmusic.calls(fc, ac, vdsp.YIN_THRESHOLD, ceiling_hz)
    fs, as_ = vdsp.yin(m, sr, speech["fminHz"], speech["fmaxHz"], speech["windowS"])
    sp = speech_runs(fs, as_, band_cover(m, sr), ceiling_hz)
    return {"calls": cs, "speech": sp, "frames": len(fc)}


def accepted_stretches(calls: list, speech: list, frames: int) -> list[tuple[int, int, int]]:
    """The longest stretches the rule accepts: between speech runs (and the track's ends), each holding at least
    one whole call. (start frame, end frame, calls inside)."""
    cuts = [0] + [x for a, b in speech for x in (a, b)] + [frames]
    out = []
    for i in range(0, len(cuts), 2):
        a, b = cuts[i], cuts[i + 1]
        k = sum(1 for s, n, *_ in calls if s >= a and s + n <= b)
        if k:
            out.append((a, b, k))
    return out


def analysis(mono, items: list[dict], ceiling_hz: float, speech: dict, calls_cfg: dict) -> dict:
    """voices.json "others": for every item the player can mark (record.json's sides after the pictures), the held
    calls (start frame, frames, median Hz, glide cents) and, for the greetings and the Sounds of Earth, the speech
    runs (start frame, frames). Music items get their held tones (start frame, frames) only: see the module note.
    mono(n) reads Ozma track n as analyse.py does."""
    tracks = {}
    for it in items:
        n = int(it["id"].split("-")[1])
        m, sr = mono(n)
        fc, ac = vdsp.yin(m, sr, calls_cfg["fminHz"], calls_cfg["fmaxHz"], calls_cfg["windowS"])
        cs = vmusic.calls(fc, ac, vdsp.YIN_THRESHOLD, ceiling_hz)
        if it["kind"] == "music":
            tracks[it["id"]] = {"kind": "music", "frames": len(fc), "held": [[a, k] for a, k, _, _ in cs]}
            continue
        fs, as_ = vdsp.yin(m, sr, speech["fminHz"], speech["fmaxHz"], speech["windowS"])
        sp = speech_runs(fs, as_, band_cover(m, sr), ceiling_hz)
        tracks[it["id"]] = {
            "kind": it["kind"], "frames": len(fc),
            "calls": [[a, k, round(hz, 2), round(g, 1)] for a, k, hz, g in cs],
            "speech": [[a, b - a] for a, b in sp],
            "accepted": [[a, b, k] for a, b, k in accepted_stretches(cs, sp, len(fc))],
        }
    return {
        "rule": {"speechCmnd": SPEECH_CMND, "speechBandHz": list(SPEECH_BAND_HZ), "speechAboveDb": SPEECH_ABOVE_DB,
                 "speechFloorPct": SPEECH_FLOOR_PCT, "speechCover": SPEECH_COVER, "speechMinFrames": SPEECH_MIN_FRAMES,
                 "speechStepCents": SPEECH_STEP_CENTS, "nfft": NFFT, "callMinS": vmusic.CALL_MIN_S,
                 "callStepCents": vmusic.CALL_STEP_CENTS, "aboveHz": ceiling_hz},
        "tracks": tracks,
    }
