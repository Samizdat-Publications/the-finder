"""Per-frame 96 kHz slices for the browser, and the decode the browser would get from them. Entry script.

Run after decode_all.py:  python -P tools/ref-decoder/make_slices.py

For each of the 156 frames: from 0.05 s before its first line sync to 0.05 s after the end of its last
line, one channel of the tape is decimated by exactly 4 (384 kHz header rate to 96 kHz) with
scipy.signal.resample_poly(x, 1, 4) (its default Kaiser-windowed anti-alias FIR, linear phase so no
delay), scaled by ONE global gain for all slices, and written as mono 16-bit PCM WAV under
build/slices/. build/slices/index.json lists them.

Then every frame is decoded again FROM ITS WAV FILE, at 96 kHz, with the same decoder and the same
geometry (all lengths scale with the rate), seeded only by the first-line offset in the index (as the
browser will be). The 96 kHz frames go to build/ref96/frames/, and their SSIM against the 384 kHz
decodes is added to build/ref/metrics.json under "slices".
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import soundfile as sf
from PIL import Image
from scipy.signal import resample_poly
from skimage.metrics import structural_similarity

import decode
import sync
import tape as tapemod

ROOT = tapemod.project_root()
REF = os.path.join(ROOT, "build", "ref")
SLICES = os.path.join(ROOT, "build", "slices")
REF96 = os.path.join(ROOT, "build", "ref96")
RATE = tapemod.HEADER_RATE  # Hz (images-and-audio.md section 2)
OUT_RATE = 96_000  # Hz, browser slice rate (spec; gourneau's browser assets use 96 kHz too, section 3)
DECIM = RATE // OUT_RATE  # exactly 4
PAD_S = 0.05  # s of tape kept before the first sync and after the last line (spec)
# Extra samples read on both sides so the anti-alias filter has real signal at the slice ends, then
# trimmed. resample_poly's default filter for 1/4 is 2 * 10 * 4 + 1 = 81 taps, so 4096 is ample.
FILTER_PAD = 4096
# Global gain headroom: full scale x HEADROOM / tape peak, leaving room for filter overshoot.
# Chosen here; the run asserts that no sample clipped.
HEADROOM = 0.9
LINES = sync.LINES_PER_FRAME


def main():
    t0 = time.time()
    os.makedirs(SLICES, exist_ok=True)
    os.makedirs(os.path.join(REF96, "frames"), exist_ok=True)
    with open(os.path.join(REF, "metrics.json"), encoding="utf-8") as fh:
        metrics = json.load(fh)
    edges = np.load(os.path.join(REF, "edges.npz"))
    t = tapemod.Tape(tapemod.default_tape_path(ROOT))
    peak = t.global_peak()
    gain = 32767.0 * HEADROOM / peak
    print(f"tape peak {peak:.5f}, gain {gain:.2f} (int16 per unit float)", flush=True)
    index = []
    max_abs = 0
    clipped = 0
    for fr in metrics["frames"]:
        fid = fr["id"]
        ch = 0 if fr["channel"] == "L" else 1
        e = edges[fid]
        start = int(np.floor((e[0] - PAD_S * RATE) / DECIM)) * DECIM
        end = int(np.ceil((e[-1] + fr["period_samples"] + PAD_S * RATE) / DECIM)) * DECIM
        x = t.read(ch, start - FILTER_PAD, end - start + 2 * FILTER_PAD)
        y = resample_poly(x, 1, DECIM)
        y = y[FILTER_PAD // DECIM:FILTER_PAD // DECIM + (end - start) // DECIM]
        q = np.round(y * gain)
        clipped += int(np.sum(np.abs(q) > 32767))
        q = np.clip(q, -32768, 32767).astype(np.int16)
        max_abs = max(max_abs, int(np.max(np.abs(q.astype(np.int32)))))
        path = os.path.join(SLICES, fid + ".wav")
        sf.write(path, q, OUT_RATE, subtype="PCM_16")
        index.append({"id": fid, "channel": fr["channel"], "image": fr["image"], "role": fr["role"],
                      "file": fid + ".wav", "slice_start_sample_384k": start,
                      "first_line_offset_96k": (float(e[0]) - start) / DECIM,
                      "length_96k": int(len(q)), "bytes": os.path.getsize(path),
                      "gain": gain, "sample_rate": OUT_RATE})
    with open(os.path.join(SLICES, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"gain": gain, "gain_meaning": "int16 value = round(tape float sample x gain)",
                   "tape_peak": peak, "sample_rate": OUT_RATE, "decimation": DECIM,
                   "filter": "scipy.signal.resample_poly(x, 1, 4) default (Kaiser, beta 5)",
                   "pad_seconds": PAD_S, "frames": index}, fh, indent=1)
    print(f"slices written: {len(index)}, max |int16| {max_abs}, clipped {clipped}, "
          f"total {sum(i['bytes'] for i in index) / 1e6:.1f} MB, {time.time() - t0:.0f} s", flush=True)

    # ---- decode each frame from its 96 kHz WAV ----
    r = OUT_RATE / RATE
    ssim, edge_err, recs = [], [], []
    for item, fr in zip(index, metrics["frames"]):
        fid = item["id"]
        q, sr = sf.read(os.path.join(SLICES, item["file"]), dtype="float64")
        assert sr == OUT_RATE
        x = q * 32768.0 / gain  # back to tape units (int16 full scale is 32768 in soundfile's float)
        raw = sync.track_from_seed(x, item["first_line_offset_96k"], LINES, r, fr["period_samples"])
        used, fit, n_rep = sync.lock_edges(raw)
        par = decode.pulse_parity(x, used, r)
        pd = dict(metrics["decode_params"][fr["channel"]])
        pd["rate"] = OUT_RATE
        p = decode.DecodeParams(**pd)
        img, _V, _lv = decode.decode_frame(x, used, par, p)
        Image.fromarray(img).save(os.path.join(REF96, "frames", fid + ".png"))
        ref = np.asarray(Image.open(os.path.join(REF, "frames", fid + ".png")))
        s = float(structural_similarity(ref, img, data_range=255))
        e384 = edges[fid]
        de = used * DECIM + item["slice_start_sample_384k"] - e384
        par384 = edges[fid + "_parity"]
        ssim.append(s)
        edge_err.append(float(np.sqrt(np.mean(de ** 2))))
        recs.append({"id": fid, "ssim": s, "edge_rms_diff_samples_384k": edge_err[-1],
                     "edges_replaced_96k": n_rep, "period_samples_384k": fit["P"] * DECIM,
                     "parity_agrees": float(np.mean(par == par384))})
    worst = int(np.argmin(ssim))
    metrics["slices"] = {"gain": gain, "tape_peak": peak, "max_abs_int16": max_abs, "clipped_samples": clipped,
                         "count": len(index), "max_bytes": max(i["bytes"] for i in index),
                         "total_bytes": sum(i["bytes"] for i in index),
                         "ssim_96_vs_384_mean": float(np.mean(ssim)), "ssim_96_vs_384_min": float(np.min(ssim)),
                         "ssim_worst_frame": recs[worst]["id"],
                         "edge_rms_diff_samples_384k_median": float(np.median(edge_err)),
                         "edge_rms_diff_samples_384k_max": float(np.max(edge_err)),
                         "per_frame": recs, "run_seconds": round(time.time() - t0, 1)}
    with open(os.path.join(REF, "metrics.json"), "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=1)
    print(f"96 kHz decodes: SSIM mean {np.mean(ssim):.4f}, min {np.min(ssim):.4f} ({recs[worst]['id']}), "
          f"edge rms diff median {np.median(edge_err):.2f} samples at 384 kHz; {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
