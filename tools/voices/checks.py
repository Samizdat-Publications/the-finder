"""The Voices' reference checks (M5 step 4): each compares the reference analysis (data/voices.json, written by
tools/voices/analyse.py) or the reference algorithms with independent truth: docs/research/voices.md's table,
synthetic tones of known pitch, synthetic melodies with a known octave. Writes check records for How it's
checked (tools/checkrecord.py). Run: python -P tools/voices/checks.py   (about 2 minutes). Exit 1 on a failure.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, str(Path(HERE).parent))
import analyse  # noqa: E402
import vdsp  # noqa: E402
import vmusic  # noqa: E402
from checkrecord import record_check  # noqa: E402

V = json.load(open(os.path.join(analyse.ROOT, "data", "voices.json"), encoding="utf-8"))
failed: list[str] = []


def check(id: str, ok: bool, **kw) -> None:
    record_check(id=id, passed=bool(ok), **kw)
    print(("PASS " if ok else "FAIL ") + id + ": " + kw["measured"])
    if not ok:
        failed.append(id)


def tracker_error() -> float:
    """YIN on synthetic tones of known pitch, with each tracker setting: per-frame errors in cents."""
    errs = analyse.tracker_errors()
    allabs = np.abs(np.concatenate(list(errs.values())))
    e95 = float(np.percentile(np.abs(errs["music"]), 95))
    assert abs(e95 - V["music"]["violin"]["trackerError95Cents"]) < 1e-3, "voices.json's tracker error is stale"
    check(
        "voices.ref.tracker",
        all(np.percentile(np.abs(v), 95) < 5 for v in errs.values()),
        claim="The pitch tracker (YIN, threshold 0.1) reads synthetic tones of known pitch to within a few cents; its measured error is the tracker term in the octave's tolerance.",
        measured=", ".join(f"{k}: 95% of frames within {np.percentile(np.abs(v), 95):.3f} cents, worst {np.abs(v).max():.2f} ({len(v)} frames)" for k, v in errs.items()),
        expected="The tones' own pitches (40 per setting, log-uniform over each range; five harmonics; noise 30 dB down; 16-bit)",
        tolerance="95% of frames within 5 cents (a twentieth of a tempered step; voices.md 4 quotes no published figure, so the game measures its own)",
        notes=f"all settings together: 95% within {np.percentile(allabs, 95):.3f} cents",
    )
    return e95


def table() -> None:
    t = V["greetings"]["researchTable"]
    ok = t["silentRuns"] == t["research"]
    check(
        "voices.ref.table",
        ok,
        claim="Cutting the greetings at their pauses gives a count that depends on the settings: the reference reproduces the research's table of silent runs exactly.",
        measured=f"silent runs by threshold {t['thresholdsDb']} dBFS and minimum gap {t['gapsS']} s: {t['silentRuns']}",
        expected=f"docs/research/voices.md section 1: {t['research']}",
        tolerance="exact (same frames: 10 ms RMS of the mono mix, dBFS with a full-scale sine at 0)",
    )
    g = V["greetings"]
    acc = g["accepted"]
    check(
        "voices.ref.count",
        acc["minVoices"] >= 24,
        claim="Over every reasonable setting the greetings fall into a few dozen separate voices at least; silence alone cannot give the published 55.",
        measured=f"{acc['minVoices']} to {acc['maxVoices']} segments over thresholds {g['reasonable']['thresholdGridDb']} dBFS (0.5 dB steps) and gaps {g['reasonable']['gapS']} s (0.01 s steps)",
        expected="'a few dozen at least' (voices.md 1), at least two dozen; NASA's 55 languages for comparison",
        tolerance=f"thresholds from a two-component mixture of the frame levels (noise {g['levelMixture']['meansDb'][0]} +/- {g['levelMixture']['sdsDb'][0]} dB, voices {g['levelMixture']['meansDb'][1]} +/- {g['levelMixture']['sdsDb'][1]} dB): where a frame is the noise with probability 0.95 down to 0.05; gaps from voices.md 1",
        notes="The whole range lies above 55: several greetings hold pauses as long as the gaps between them (voices.md 1), so they split; an exact count would need a hand-made onset list.",
    )
    ref = g["reference"]
    check(
        "voices.ref.pitchSpread",
        ref["voicesByPitch"] >= 2 and ref["fTestP"] < 1e-3,
        claim="The greetings' pitches spread far wider than one speaker's: several voices, high and low, by pitch alone.",
        measured=f"segment pitches spread {ref['sdSemitones']} semitones (sd, {ref['segments']} segments) against Waldheim's {g['oneSpeaker']['sdSemitones']} ({g['oneSpeaker']['segments']} segments), F-test p = {ref['fTestP']}; about {ref['voicesByPitch']} single voices' worth of pitch; a two-group mixture is NOT preferred over one (BIC minus one: {ref['bicMinusOne']})",
        expected="One man (Ozma 01, the same transfer) as the single-voice spread; two or more voices",
        tolerance="at least two voices' worth of pitch (one speaker's own gives about one) and p below 0.001",
        notes="The voices' pitches form a wide continuum, not two clean groups: the deduction is the spread, not a two-group split.",
    )


def octave(e_tracker: float) -> None:
    vi = V["music"]["violin"]
    e = float(np.hypot(vi["bootstrap"]["octaveHalfWidthCents"], e_tracker))
    check(
        "voices.ref.octave",
        abs(vi["octaveCents"] - 1200) <= e,
        claim="On the solo violin, the notes' pattern repeats itself at a doubled frequency: the repetition curve peaks at 2:1.",
        measured=f"peak at {vi['octaveCents']:.2f} cents ({2 ** (vi['octaveCents'] / 1200):.5f}:1) from {len(vi['notes'])} notes",
        expected="2:1 = 1200 cents (voices.md 4)",
        tolerance=f"+/- {e:.2f} cents: the bootstrap's 95% half-width over the notes ({vi['bootstrap']['octaveHalfWidthCents']}) and the tracker's 95% error ({e_tracker:.3f}) in quadrature",
        notes=f"The aria was tried first: the orchestra under the soprano defeats a single-voice tracker (its notes sit on a 100-cent grid with resultant {V['music']['aria']['gridResultant100']}, the violin's {vi['gridResultant100']}).",
    )
    calibrate_octave(e_tracker)


def calibrate_octave(e_tracker: float) -> None:
    """Coverage of the octave's bootstrap interval on synthetic melodies with an exact 2:1 octave: the violin's
    own notes snapped to a 100-cent grid (so the octave is exactly 1200), with the real intonation scatter."""
    vi = V["music"]["violin"]
    nc = np.array([n[2] / 100 for n in vi["notes"]])
    off = np.angle(np.exp(2j * np.pi * nc / 100).mean()) / (2 * np.pi) * 100
    grid = np.round((nc - off) / 100) * 100 + off
    resid = nc - grid
    sd = float(np.std(resid))
    rng = np.random.default_rng(7)
    trials, cover = 200, 0
    for _ in range(trials):
        mel = grid[rng.integers(0, len(grid), len(grid))] + rng.normal(0, sd, len(grid))
        est = analyse.octave_of(mel)
        boots = [analyse.octave_of(mel[rng.integers(0, len(mel), len(mel))]) for _ in range(300)]
        boots = np.array([b for b in boots if b is not None])
        hw = analyse.boot_interval(boots, est)
        cover += int(abs(est - 1200) <= np.hypot(hw, e_tracker))
    share = cover / trials
    check(
        "voices.ref.octaveCoverage",
        0.9 <= share <= 1.0,
        claim="The octave's interval is honest: on synthetic melodies with an exact doubling it holds 1200 cents about 95% of the time.",
        measured=f"{cover} of {trials} synthetic melodies ({share:.1%}); 300 bootstrap draws each",
        expected="about 95% (a 95% interval)",
        tolerance="90% to 100% (binomial: 200 trials at 95% give 91% to 98% at 2 sigma; the tracker term only widens it)",
        notes=f"melodies: the violin's {len(nc)} notes snapped to a 100-cent grid and redrawn with its intonation scatter (sd {sd:.1f} cents)",
    )


def step() -> None:
    pi = V["music"]["piano"]
    oc = V["music"]["violin"]["octaveCents"]
    sc = pi["combScores"]
    k = pi["combK"]
    margin = sc[k - vmusic.COMB_K[0]] - sorted(sc)[-2]
    check(
        "voices.ref.step",
        k == 12 and pi["bootstrap"]["sameK"] >= 0.95,
        claim="On Gould's piano, the pitch classes sit on a comb of 12 equal steps per doubling: the step is a twelfth of the octave, 100 cents.",
        measured=f"best comb {k} steps (score {sc[k - 2]:.3f}; runner-up {pi['runnerUpK']}, {margin:.3f} lower); the same comb in {pi['bootstrap']['sameK']:.0%} of {pi['bootstrap']['draws']} block-bootstrap draws; spread about each tooth {pi['fit']['sdCents']} cents; step {oc / k:.2f} cents",
        expected="12-tone equal temperament, a step of 2^(1/12) = 100 cents (voices.md 4)",
        tolerance="the 12-step comb best in at least 95% of the draws",
        notes="Only for the Western pieces: the Javanese, Indian and Chinese pieces on the record use other tunings (voices.md 4).",
    )


def hearing() -> None:
    sp = V["spectrum"]
    lo, hi = sp["crossingBandHz"]
    check(
        "voices.ref.hearing",
        10_000 < lo <= sp["crossingHz"] <= hi < analyse.TOP_HZ,
        claim="The greetings stay above the record's own noise to well over 10 kHz: a lower bound on what the senders make and hear, capped by the record itself.",
        measured=f"the greetings' long-term spectrum falls to the noise of their own silences at {sp['crossingHz'] / 1000:.2f} kHz (95% {lo / 1000:.2f} to {hi / 1000:.2f} kHz, block bootstrap); 95% of the greetings' power below {sp['greetingsEnergy95Hz'] / 1000:.2f} kHz, of all the music and speech below {sp['aggregateEnergy95Hz'] / 1000:.2f} kHz",
        expected="voices.md 3: no cutoff, a slow decay into vinyl and tape noise, detectable to well over 10 kHz; most energy below about 8 kHz",
        tolerance="crossing interval above 10 kHz and below 20 kHz (the top the runtime Opus audio carries; the transfer itself reaches 22.05 kHz)",
        notes="Measured on the greetings against their own silences (same transfer): other tracks carry their own hiss, which no silence on them measures.",
    )


def whale() -> None:
    wh = V["whale"]
    g = V["greetings"]
    m, sr = analyse.mono(3)
    f0, ap = vdsp.yin(m, sr, analyse.CALLS["fminHz"], analyse.CALLS["fmaxHz"], analyse.CALLS["windowS"])
    alt = {}
    keep = vmusic.CALL_MIN_S
    for d in (0.15, 0.3):
        vmusic.CALL_MIN_S = d
        cs = vmusic.calls(f0, ap, vdsp.YIN_THRESHOLD, g["speechCeilingHz"])
        alt[d] = [cs[0][0] * 0.01, (cs[-1][0] + cs[-1][1]) * 0.01] if cs else None
    vmusic.CALL_MIN_S = keep
    seg = wh["segmentS"]
    ok = seg is not None and seg[0] > 150 and len(wh["calls"]) >= 3 and all(a is not None and a[0] >= seg[0] - 1 for a in alt.values())
    check(
        "voices.ref.whale",
        ok,
        claim="On the UN greetings track, long tonal calls higher than any speaking voice gather in one stretch near the end: the whale song.",
        measured=f"{len(wh['calls'])} calls from {seg[0]:.2f} to {seg[1]:.2f} s (each held at least {wh['minCallS']} s, median pitch above {g['speechCeilingHz']} Hz, glides {min(c[3] for c in wh['calls']):.0f} to {max(c[3] for c in wh['calls']):.0f} cents); with calls of at least 0.15 s: {alt[0.15]}, 0.3 s: {alt[0.3]}",
        expected="the whale song with the UN greetings on the Ozma transfer (voices.md 1); no call among the greetings themselves",
        tolerance="every call after 150 s, at least three, and the start stable within 1 s for calls of 0.15 to 0.3 s",
        notes=f"{g['speechCeilingHz']} Hz is the highest median pitch of any run held 0.2 s in the 55 greetings (Ozma 02), with the same tracker",
    )


if __name__ == "__main__":
    e_t = tracker_error()
    table()
    octave(e_t)
    step()
    hearing()
    whale()
    print("trackerErrorCents95", e_t)
    sys.exit(1 if failed else 0)
