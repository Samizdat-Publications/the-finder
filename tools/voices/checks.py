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
import vfold  # noqa: E402
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
    cuts = "; ".join(f"posterior {c['posterior']}: {c['minVoices']} to {c['maxVoices']}" for c in g["cutTable"])
    near = g["nearPublished"]
    check(
        "voices.ref.count",
        acc["minVoices"] >= 24,
        claim="Over every reasonable setting the greetings fall into a few dozen stretches of voice between pauses at least; the count depends on where a pause is taken to end a voice, and some settings give about the published 55.",
        measured=f"{acc['minVoices']} to {acc['maxVoices']} stretches over thresholds {g['reasonable']['thresholdGridDb']} dBFS (0.5 dB steps) and gaps {g['reasonable']['gapS']} s (0.01 s steps); by the noise-posterior cut: {cuts}; nearest to 55: {near['count']} at {near['thresholdDb']} dBFS and {near['gapS']} s (noise posterior there {near['noisePosterior']})",
        expected="'a few dozen at least' (voices.md 1), at least two dozen; NASA's 55 languages for comparison",
        tolerance=f"the one definition of reasonable settings (analyse.py REASONABLE_GAPS; the checker uses the same): thresholds from a two-component mixture of the frame levels (noise {g['levelMixture']['meansDb'][0]} +/- {g['levelMixture']['sdsDb'][0]} dB, voices {g['levelMixture']['meansDb'][1]} +/- {g['levelMixture']['sdsDb'][1]} dB) where a frame is the noise with probability 0.95 down to 0.05; gaps from voices.md 1",
        notes="At the 0.95 cut the range lies above 55, but a looser cut reaches it: several greetings hold pauses as long as the gaps between them (voices.md 1), so where the cut is set decides how many split. An exact count would need a hand-made onset list.",
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


def octave() -> None:
    vi = V["music"]["violin"]
    fo = vi["fold"]
    tol = vi["octaveTolCents"]
    worst = min(fo["peaks"], key=lambda p: p["marginLow"])
    ok = abs(vi["octaveCents"] - 1200) <= tol and all(p["marginLow"] > 0 for p in fo["peaks"])
    by_c = {p["cents"]: p for p in fo["peaks"]}
    named = ", ".join(f"{k} at {v} cents: {by_c[v]['score']:.3f} (wins {by_c[v]['bestWins']:.1%})" for k, v in fo["named"].items() if v is not None)
    check(
        "voices.ref.octave",
        ok,
        claim="On the solo violin, notes a doubled frequency apart line up: folded at 2:1 the notes a repeat apart gather more tightly than at any other ratio up to 4:1, by a bootstrapped margin.",
        measured=f"best fold {vi['octaveCents']:.2f} cents ({2 ** (vi['octaveCents'] / 1200):.5f}:1), {fo['bestScore']} times chance, from {len(vi['notes'])} notes; it beats all {len(fo['peaks'])} other peaks from 100 to 2400 cents, the closest margin {worst['marginLow']:.3f} to {worst['marginHigh']:.3f} (95%, {fo['draws']} resamplings) against {worst['cents']} cents; {named}",
        expected="2:1 = 1200 cents (voices.md 4), beating 3:2, 4:3, 5:4, two stacked 3:2 (1406), 3:1 and 4:1",
        tolerance=f"+/- {tol:.2f} cents: the bootstrap's 95% half-width over the notes ({fo['bootstrap']['halfWidthCents']}) and the tracker's systematic slope ({vi['trackerSlope']['centsPerOctave']} +/- {vi['trackerSlope']['se']} cents per doubling, 95% bound {vi['trackerSlope']['bound95']}) in quadrature; every margin's 2.5th percentile above 0",
        notes=f"Score (tools/voices/vfold.py): Gaussian kernel (sd {fo['sigmaCents']} cents) closeness of notes a whole repeat apart, summed over every harmonic of the fold, over chance. The plain sum that keeps a note's own pitch (k = 0) grows with the trial ratio: there 2117 cents and 3:1 came within the bootstrap of 2:1 and 4:1 beat it; with it removed the near-tie of 1406 (2.61 against 2.90) is gone too. The aria was tried first: the orchestra under the soprano defeats a single-voice tracker (grid resultant {V['music']['aria']['gridResultant100']}, the violin's {vi['gridResultant100']}).",
    )
    calibrate_octave()


def calibrate_octave() -> None:
    """Coverage of the octave's interval on synthetic melodies with an exact 2:1 octave: the violin's own notes
    snapped to a 100-cent grid (so the octave is exactly 1200), redrawn with the real intonation scatter (which
    holds the tracker's per-note error), estimated and bootstrapped exactly as the reference does."""
    from scipy.stats import binom
    vi = V["music"]["violin"]
    nc = np.array([n[2] / 100 for n in vi["notes"]])
    off = np.angle(np.exp(2j * np.pi * nc / 100).mean()) / (2 * np.pi) * 100
    grid = np.round((nc - off) / 100) * 100 + off
    sd = float(np.std(nc - grid))
    slope = vi["trackerSlope"]["bound95"]
    rng = np.random.default_rng(7)
    trials, draws, cover, errs = 200, 300, 0, []
    for _ in range(trials):
        mel = grid[rng.integers(0, len(grid), len(grid))] + rng.normal(0, sd, len(grid))
        notes = vfold.Notes(mel)
        est, _ = vfold.best(notes)
        pos, _ = vfold.boot_local(notes, est, vfold.resample_weights(len(mel), draws, rng))
        lo, hi = np.percentile(pos, [2.5, 97.5])
        cover += int(abs(est - 1200) <= np.hypot(max(est - lo, hi - est), slope))
        errs.append(est - 1200)
    share = cover / trials
    band = (binom.ppf(0.025, trials, 0.95) / trials, binom.ppf(0.975, trials, 0.95) / trials)
    check(
        "voices.ref.octaveCoverage",
        band[0] <= share <= band[1],
        claim="The octave's interval is honest: on synthetic melodies with an exact doubling it holds 1200 cents about 95% of the time.",
        measured=f"{cover} of {trials} synthetic melodies ({share:.1%}); {draws} bootstrap draws each; the estimate reads {np.mean(errs):+.2f} cents on average (sd {np.std(errs):.2f})",
        expected="95% (a 95% interval)",
        tolerance=f"{band[0]:.1%} to {band[1]:.1%}: the central 95% of a binomial count of {trials} trials at 95% (two-sided)",
        notes=f"melodies: the violin's {len(nc)} notes snapped to a 100-cent grid and redrawn with its intonation scatter (sd {sd:.1f} cents). The fold's chance term (the share of pairs half a repeat apart) falls as the ratio grows, so the peak reads a little high; the bootstrap does not see that bias, which is why the coverage sits a little under 95%.",
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
        claim="The greetings stand above their recording's own hiss to well over 10 kHz (by the 3 dB rule): a lower bound on the sounds the senders make, capped by the record itself.",
        measured=f"the greetings' long-term spectrum falls to the noise of their own silences at {sp['crossingHz'] / 1000:.2f} kHz (95% {lo / 1000:.2f} to {hi / 1000:.2f} kHz, block bootstrap); 95% of the greetings' power below {sp['greetingsEnergy95Hz'] / 1000:.2f} kHz, of all the music and speech below {sp['aggregateEnergy95Hz'] / 1000:.2f} kHz",
        expected="voices.md 3: no cutoff, a slow decay into vinyl and tape noise, detectable to well over 10 kHz; most energy below about 8 kHz",
        tolerance="crossing interval above 10 kHz and below 20 kHz (the top the runtime Opus audio carries; the transfer itself reaches 22.05 kHz)",
        notes=f"Measured on the greetings against their own silences (same transfer): other tracks carry their own hiss, which no silence on them measures. The rule alone moves it: where the voices add a third of the hiss to three times it, {sp['definitions']['spreadHz'][0] / 1000:.2f} to {sp['definitions']['spreadHz'][1] / 1000:.2f} kHz (the auditor's definitions gave 15.0 to 17.0). No claim is made about what they hear.",
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


def speech() -> None:
    """voices.others' speech finder against independent truth: the lead's reading of the UN greetings track's
    spectrograms (docs/reviews/2026-10-16-M5-science-audit.md: speech to about 188 s, calls alone from about 189 s
    to about 236 s, low moans to about 239.5 s) and the two all-speech tracks (Waldheim, the 55 greetings), where
    every 4 s stretch must hold speech."""
    tr = V["others"]["tracks"]
    t3 = tr["ozma-03"]
    sp = [(a / 100, (a + n) / 100) for a, n in t3["speech"]]
    last = max(b for a, b in sp if a < 210)
    inside = [(a, b) for a, b in sp if b > 190 and a < 234]
    acc = [(a / 100, b / 100, k) for a, b, k in t3["accepted"]]
    covers = any(a <= 190 and b >= 234 for a, b, _ in acc)
    windows = {}
    for tid in ("ozma-01", "ozma-02"):
        runs = [(a / 100, (a + n) / 100) for a, n in tr[tid]["speech"]]
        n = int(tr[tid]["frames"] / 100 // 4)
        live = [k for k in range(n) if any(b > 4 * k and a < 4 * (k + 1) for a, b in runs)]
        windows[tid] = (len(live), n)
    all_speech = all(a == b for a, b in windows.values())
    ok = abs(last - 188) <= 2 and not inside and covers and all_speech
    check(
        "voices.ref.speech",
        ok,
        claim="The speech finder (voiced at a speaking pitch, broadband, in runs) finds speech where people speak and none where only the whale calls: a stretch with held calls and no speech is not theirs.",
        measured=f"UN greetings track: last speech ends {last:.2f} s; speech runs between 190 and 234 s: {len(inside)}; accepted stretches {acc}; 4 s windows holding speech: Waldheim {windows['ozma-01'][0]} of {windows['ozma-01'][1]}, the 55 greetings {windows['ozma-02'][0]} of {windows['ozma-02'][1]}",
        expected="the lead's reading of the spectrograms (speech to about 188 s; calls alone about 189 to 236 s; moans to about 239.5 s); speech in every stretch of the two all-speech tracks",
        tolerance="2 s for the reading (a spectrogram read by eye to about a second, with faint calls under the last speakers from about 182 s): last speech within 188 +/- 2 s, none from 190 to 234 s, one accepted stretch covering 190 to 234 s; every 4 s window of Ozma 01 and 02",
        notes="The rule's thresholds were set on this track against this reading, so its part of the check is not independent of the rule; Ozma 01 and 02 are, and so are the Sounds of Earth's animal stretches (voices.ref.sounds, the lead's reading of 2026-10-22).",
    )


READ_ACCEPT = [(293.11, 296.77), (296.98, 298.38), (302.95, 312.62), (620.26, 675.18)]
"""The lead's reading (2026-10-22, docs/plans/M6_specs/voices-others-machines.md) of the Sounds of Earth panels
(review/archive/2026-10-16T18-14-57-sounds-spectrograms/, tools/voices/panels.py): the stretches holding animal
calls (gliding harmonic arcs and howls; a falling, wavering harmonic stack near 400 Hz, likely the horse of
"horse and cart"), s, as the 2026-10-16 pass found them."""
READ_MACHINE = (417.37, 473.56)
"""The same reading: the calls here are machines (a flat line near 3.7 kHz in the tools' hammering; keyed dashes of
a flat 1 kHz tone, the Morse code that docs/research/voices.md 2 lists between the riveter and the ship's horn;
NASA's sounds page has no list)."""


def sounds() -> None:
    """voices.others on the Sounds of Earth against the lead's reading: the animals' stretches accepted, the
    machines' refused; every call the reading calls a machine flagged machine-steady and no other call."""
    ot = V["others"]
    ru, tr = ot["rule"], ot["tracks"]
    so = tr["ozma-04"]
    acc = [(a / 100, b / 100, k) for a, b, k in so["accepted"]]
    # 0.01 s: one 10 ms frame, the resolution the stretches are stored and were read at.
    same = len(acc) == len(READ_ACCEPT) and all(abs(a - x) <= 0.01 and abs(b - y) <= 0.01 for (a, b, _), (x, y) in zip(acc, READ_ACCEPT))
    lab = []  # (track, start s, spread, read as machine, flagged)
    for tid in sorted(tr):
        for c in tr[tid].get("calls", []):
            s0, s1 = c[0] / 100, (c[0] + c[1]) / 100
            lab.append((tid, s0, c[4], tid == "ozma-04" and s0 >= READ_MACHINE[0] and s1 <= READ_MACHINE[1], c[6] == 1))
    flags_ok = all(m == f for *_, m, f in lab)
    mach = sorted(x[2] for x in lab if x[3])
    crea = sorted(x[2] for x in lab if not x[3])
    lo, hi = ru["machineGapCents"]
    gap_ok = lo == max(mach) and hi == min(crea) and lo < ru["machineSpreadCents"] < hi
    # Leave one out: the threshold placed without each call, then that call classified by it.
    miss = []
    for i, (tid, s0, sp, m, _) in enumerate(lab):
        rest_m = [x[2] for j, x in enumerate(lab) if j != i and x[3]]
        rest_c = [x[2] for j, x in enumerate(lab) if j != i and not x[3]]
        thr = (max(rest_m) + min(rest_c)) / 2
        if (sp < thr) != m:
            miss.append(f"{tid} {s0:.2f} s")
    lo_call = next(f"{t} {a:.2f} s" for t, a, sp, m, _ in lab if m and sp == max(mach))
    hi_call = next(f"{t} {a:.2f} s" for t, a, sp, m, _ in lab if not m and sp == min(crea))
    ok = same and flags_ok and gap_ok and (lo, hi) == (max(mach), min(crea))
    r2 = lambda c: f"{2 ** (c / 1200):.4f}"  # noqa: E731
    check(
        "voices.ref.sounds",
        ok,
        claim="On the Sounds of Earth the held calls of animals are accepted as other creatures' voices and the machine tones are not: a call whose pitch holds machine-steady is the senders' own making.",
        measured=(f"accepted stretches {acc}; 417.37 to 473.56 s not accepted ({sum(1 for x in lab if x[3])} calls there, all machine-steady); "
                  f"pitch spread (10 to 90% range, cents): machine calls {mach[0]:.2f} to {mach[-1]:.2f}, creature calls {crea[0]:.2f} to {crea[-1]:.2f} "
                  f"({len(crea)} calls on Ozma 03 and 04); gap {lo} to {hi} cents (ratios {r2(lo)} to {r2(hi)}), threshold {ru['machineSpreadCents']} cents; "
                  f"leave-one-out misclassified: {', '.join(miss) if miss else 'none'}"),
        expected="the lead's reading of the Sounds of Earth panels (docs/plans/M6_specs/voices-others-machines.md; review/archive/2026-10-16T18-14-57-sounds-spectrograms/): animals at 293.11 to 296.77, 296.98 to 298.38, 302.95 to 312.62 and 620.26 to 675.18 s; machines (a flat 3.7 kHz line in the tools' hammering, and the Morse code that docs/research/voices.md 2 lists between the riveter and the ship's horn) at 417.37 to 473.56 s",
        tolerance="exact: stretch bounds within one 10 ms frame (0.01 s); every machine flag as the reading says; the threshold strictly inside the measured gap",
        notes=("The threshold is placed with these labels (the middle of the gap between the calls read as machines and every other call), so the split itself is not independent of the reading; "
               "the accepted animal stretches are (they come from the speech finder and call finder, unchanged). "
               f"The gap is narrow: its low edge is the call at {lo_call}, its high edge the call at {hi_call}. "
               "Leave-one-out lists the calls a threshold placed without them would misclassify."),
    )
    print("voices.ref.sounds spreads (track, start s, spread cents, read as machine):", [(t, round(a, 2), sp, m) for t, a, sp, m, _ in lab])


if __name__ == "__main__":
    e_t = tracker_error()
    table()
    octave()
    step()
    hearing()
    whale()
    speech()
    sounds()
    print("trackerErrorCents95", e_t)
    sys.exit(1 if failed else 0)
