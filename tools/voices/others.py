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

Machine tones (the lead's decision, docs/plans/M6_specs/voices-others-machines.md): a held call whose pitch is
machine-steady is the senders' own making, not another creature's voice. Each call's steadiness is the 10 to 90%
range of its pitch track, in cents, with nothing removed (SPREAD_PCT); its vibrato (the scatter, cents, about the
call's own straight-line glide) is measured and stored but does not decide. The threshold is not chosen: it is the
middle of the gap between the calls the lead read as machines (MACHINE_READING: on the Sounds of Earth, a flat
line in the hammering of the tools and machines section and keyed dashes of a flat 1 kHz tone, the Morse code)
and every other held call the pass finds on the greetings and the Sounds of Earth (the whale on track 03, the
animals of track 04). If the two groups overlap, the build stops (no clean gap). A stretch is accepted only with
at least one held call that is not machine-steady.

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
SPREAD_PCT = (10.0, 90.0)
"""A call's steadiness: the range between these percentiles of its pitch (cents), so one stray frame at an onset
does not decide (the spec's suggested 10 to 90% range)."""
MACHINE_READING = {"ozma-04": [(417.37, 473.56)]}
"""The lead's reading (2026-10-22) of the Sounds of Earth panels (review/archive/2026-10-16T18-14-57-sounds-
spectrograms/, tools/voices/panels.py): every held call from 417.37 to 473.56 s is a machine (a dead-flat line
at about 3.7 kHz inside rhythmic broadband hammering at 429 and 432.5 s; keyed dashes of a flat 1 kHz tone at
464 to 470 s, the Morse code, which docs/research/voices.md 2 lists between the riveter and the ship's horn).
Seconds on the track; a call is labelled a machine when it lies wholly inside. Used only to place the threshold."""
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


def steadiness(f0: np.ndarray, a: int, k: int) -> tuple[float, float]:
    """A call's pitch spread (the SPREAD_PCT range of its pitch, cents, nothing removed) and its vibrato (the
    standard deviation, cents, of its pitch about its own least-squares straight line)."""
    c = vmusic.cents(f0[a: a + k])
    lo, hi = np.percentile(c, SPREAD_PCT)
    x = np.arange(k, dtype=float)
    res = c - np.polyval(np.polyfit(x, c, 1), x)
    return float(hi - lo), float(res.std())


def machine_threshold(spreads: dict[str, list[float]], calls: dict[str, list]) -> dict:
    """The machine threshold from the measured calls: the middle of the gap between the largest spread among the
    calls the lead read as machines and the smallest among every other call (cents, rounded as stored). Raises if
    the groups overlap: no clean gap, so no threshold."""
    mach, crea = [], []
    for tid in sorted(spreads):
        reading = MACHINE_READING.get(tid, [])
        for (a, k, *_), sp in zip(calls[tid], spreads[tid]):
            s0, s1 = a * vdsp.FRAME_S, (a + k) * vdsp.FRAME_S
            (mach if any(s0 >= lo and s1 <= hi for lo, hi in reading) else crea).append(round(sp, 2))
    if not mach or not crea:
        raise SystemExit(f"voices.others: no machine or no creature calls to place the threshold ({len(mach)}, {len(crea)})")
    lo, hi = max(mach), min(crea)
    if not hi > lo:
        raise SystemExit(f"voices.others: no clean gap between machine calls (spreads {sorted(mach)}) and creature calls ({sorted(crea)})")
    return {"gapCents": [lo, hi], "thresholdCents": round((lo + hi) / 2, 3), "machineCalls": len(mach), "creatureCalls": len(crea)}


def accepted_stretches(calls: list, speech: list, frames: int, machine: list[bool] | None = None) -> list[tuple[int, int, int]]:
    """The longest stretches the rule accepts: between speech runs (and the track's ends), each holding at least
    one whole call that is not machine-steady. (start frame, end frame, such calls inside)."""
    if machine is None:
        machine = [False] * len(calls)
    cuts = [0] + [x for a, b in speech for x in (a, b)] + [frames]
    out = []
    for i in range(0, len(cuts), 2):
        a, b = cuts[i], cuts[i + 1]
        k = sum(1 for (s, n, *_), mc in zip(calls, machine) if s >= a and s + n <= b and not mc)
        if k:
            out.append((a, b, k))
    return out


def analysis(mono, items: list[dict], ceiling_hz: float, speech: dict, calls_cfg: dict) -> dict:
    """voices.json "others": for every item the player can mark (record.json's sides after the pictures), the held
    calls (start frame, frames, median Hz, glide cents, spread cents, vibrato cents, machine 0 or 1) and, for the
    greetings and the Sounds of Earth, the speech runs (start frame, frames) and the accepted stretches. Music items
    get their held tones (start frame, frames) only: see the module note. mono(n) reads Ozma track n as analyse.py
    does."""
    tracks, keep = {}, {}
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
        st = [steadiness(fc, a, k) for a, k, _, _ in cs]
        keep[it["id"]] = (cs, sp, st, len(fc))
        tracks[it["id"]] = {"kind": it["kind"], "frames": len(fc)}
    thr = machine_threshold({t: [x[0] for x in v[2]] for t, v in keep.items()}, {t: v[0] for t, v in keep.items()})
    for tid, (cs, sp, st, frames) in keep.items():
        mach = [round(s, 2) < thr["thresholdCents"] for s, _ in st]
        tracks[tid].update({
            "calls": [[a, k, round(hz, 2), round(g, 1), round(s, 2), round(v, 2), int(mc)]
                      for (a, k, hz, g), (s, v), mc in zip(cs, st, mach)],
            "speech": [[a, b - a] for a, b in sp],
            "accepted": [[a, b, k] for a, b, k in accepted_stretches(cs, sp, frames, mach)],
        })
    return {
        "rule": {"speechCmnd": SPEECH_CMND, "speechBandHz": list(SPEECH_BAND_HZ), "speechAboveDb": SPEECH_ABOVE_DB,
                 "speechFloorPct": SPEECH_FLOOR_PCT, "speechCover": SPEECH_COVER, "speechMinFrames": SPEECH_MIN_FRAMES,
                 "speechStepCents": SPEECH_STEP_CENTS, "nfft": NFFT, "callMinS": vmusic.CALL_MIN_S,
                 "callStepCents": vmusic.CALL_STEP_CENTS, "aboveHz": ceiling_hz,
                 "spreadPct": list(SPREAD_PCT),
                 "machineReadingS": {k: [list(x) for x in v] for k, v in sorted(MACHINE_READING.items())},
                 "machineSpreadCents": thr["thresholdCents"], "machineGapCents": thr["gapCents"],
                 "machineCalls": thr["machineCalls"], "creatureCalls": thr["creatureCalls"]},
        "tracks": tracks,
    }
