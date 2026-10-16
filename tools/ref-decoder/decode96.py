"""Reference 96 kHz decodes from the COMMITTED FLAC slices (M2 step 3). Entry script.

    python -P tools/ref-decoder/decode96.py [--out build/ref96/frames] [--frames L000,L019,...]

make_slices.py decodes each frame from its WAV slice right after cutting it, which needs the 1.46 GB
tape. This script repeats exactly that decode from `public/media/frames/<id>.flac` (lossless, so the
samples are identical to the WAV slices; tools/media/build_frames.py checks the round trip) with the
parameters in `data/decoder.json` and the seeds in `data/frames.json`, so a fresh clone without the
tape can regenerate `build/ref96/frames/*.png`, the pictures the TypeScript decoder (src/dsp/) is
tested against. The decode path is the same as make_slices.py's: track_from_seed at the first-line
offset with the frame's period as the prior, lock_edges, pulse_parity, DecodeParams at 96 kHz,
decode_frame.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import soundfile as sf  # noqa: E402
from PIL import Image  # noqa: E402

import decode  # noqa: E402
import sync  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE_RATE = 384_000  # Hz, the header rate the geometry is expressed in (images-and-audio.md section 2)


def params_for(dec: dict, channel: str, rate: int) -> decode.DecodeParams:
    g = dec["geometry"]
    ch = dec["channels"][channel]
    return decode.DecodeParams(rate=rate, w0=g["w0"], w1=g["w1"], n_rows=g["nRows"], tau=ch["tau"],
                               delta=g["delta"], clamp0=g["clamp0"], clamp1=g["clamp1"],
                               baseline=g["baseline"], clamp_smooth=g["clampSmooth"],
                               parity_profile=list(ch["parityProfile"]), p_lo=g["pLo"], p_hi=g["pHi"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "build", "ref96", "frames"))
    ap.add_argument("--frames", default="", help="comma-separated frame ids (default: all 156)")
    args = ap.parse_args()
    with open(os.path.join(ROOT, "data", "decoder.json"), encoding="utf-8") as fh:
        dec = json.load(fh)
    with open(os.path.join(ROOT, "data", "frames.json"), encoding="utf-8") as fh:
        frames = json.load(fh)["frames"]
    want = {s for s in args.frames.split(",") if s}
    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()
    n = 0
    for fr in frames:
        fid = fr["frame"]
        if want and fid not in want:
            continue
        q, sr = sf.read(os.path.join(ROOT, "public", fr["file"]), dtype="float64")
        if sr != fr["sampleRate"] or len(q) != fr["samples"]:
            sys.exit(f"{fid}: slice is {sr} Hz x {len(q)}, frames.json says {fr['sampleRate']} x {fr['samples']}")
        x = q * 32768.0 / fr["gain"]  # back to tape units (as make_slices.py)
        r = sr / BASE_RATE
        raw = sync.track_from_seed(x, fr["firstLineOffset"], dec["geometry"]["columns"], r,
                                   dec["frames"][fid]["periodSamples384k"])
        used, _fit, _n = sync.lock_edges(raw)
        par = decode.pulse_parity(x, used, r)
        img, _V, _lv = decode.decode_frame(x, used, par, params_for(dec, fr["channel"], sr))
        Image.fromarray(img).save(os.path.join(args.out, fid + ".png"))
        n += 1
    print(f"decode96: {n} frames to {os.path.relpath(args.out, ROOT)} in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
