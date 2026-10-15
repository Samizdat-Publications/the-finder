"""Slices -> FLAC, plus data/frames.json (M2 step 2, D-A18).

Inputs : build/slices/*.wav (96 kHz, 16-bit, mono) and build/slices/index.json,
         docs/research/data/images/image_list_116.txt, Barry's orientation table via tools/ref-decoder/barry.py
Outputs: public/media/frames/<id>.flac (lossless, -compression_level 12, -map_metadata -1 -bitexact),
         data/frames.json
Each FLAC is decoded back to 16-bit PCM and compared sample for sample with the WAV.
Run: python -P tools/media/build_frames.py
"""
import hashlib, json, os, subprocess, sys, wave
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "ref-decoder"))
import barry  # noqa: E402

SL = os.path.join(ROOT, "build", "slices")
OUT = os.path.join(ROOT, "public", "media", "frames")


def wav_pcm(path):
    with wave.open(path, "rb") as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 96000), path
        return w.readframes(w.getnframes())


def one(fr):
    fid = fr["id"]
    wav = os.path.join(SL, fid + ".wav")
    flac = os.path.join(OUT, fid + ".flac")
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-map_metadata", "-1", "-bitexact",
                        "-fflags", "+bitexact", "-flags:a", "+bitexact", "-c:a", "flac", "-compression_level", "12", flac],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed {fid}: {r.stderr[-500:]}")
    back = subprocess.run(["ffmpeg", "-v", "error", "-i", flac, "-f", "s16le", "-acodec", "pcm_s16le", "-"],
                          capture_output=True).stdout
    src = wav_pcm(wav)
    if back != src:
        sys.exit(f"ROUND TRIP MISMATCH {fid}")
    data = open(flac, "rb").read()
    return fid, len(data), hashlib.sha256(data).hexdigest(), len(src) // 2


def main():
    os.makedirs(OUT, exist_ok=True)
    idx = json.load(open(os.path.join(SL, "index.json")))
    b = barry.load()
    titles = {}
    for line in open(os.path.join(ROOT, "docs", "research", "data", "images", "image_list_116.txt"), encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) >= 5 and p[0].isdigit():
            titles[int(p[0])] = p[1]
    assert len(titles) == 116, len(titles)
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = {r[0]: r for r in ex.map(one, idx["frames"])}
    frames = []
    for fr in idx["frames"]:
        fid = fr["id"]
        _, nbytes, sha, ns = res[fid]
        ch = 0 if fr["channel"] == "L" else 1
        i = int(fid[1:])
        assert ns == fr["length_96k"], (fid, ns, fr["length_96k"])
        frames.append({
            "frame": fid, "channel": fr["channel"], "index": i, "image": fr["image"], "title": titles[fr["image"]],
            "colourRole": fr["role"], "file": f"media/frames/{fid}.flac", "bytes": nbytes, "sha256": sha,
            "sampleRate": 96000, "samples": ns, "firstLineOffset": fr["first_line_offset_96k"],
            "tapeStartSample384k": fr["slice_start_sample_384k"], "gain": fr["gain"],
            "orientationBarry": b["orientation"][ch][i],
        })
    meta = {
        "about": "The 156 picture slices (78 per channel) of the 1977 image tape, as lossless FLAC for the browser decoder.",
        "sampleRate": 96000, "bitDepth": 16, "channels": 1, "gainMeaning": idx["gain_meaning"],
        "tapeSampleRate384k": 384000, "decimation": idx["decimation"], "padSeconds": idx["pad_seconds"],
        "filter": idx["filter"], "firstLineOffsetUnit": "samples at 96 kHz, from the start of the slice",
        "orientationBarryNote": "Ron Barry's 2017 table (tools/ref-decoder/barry.py): reference only, 0 upright, 1 and 2 turned. Never used by the decoder.",
        "sourceSlices": "build/slices (tools/ref-decoder/make_slices.py)", "script": "tools/media/build_frames.py",
        "totalBytes": sum(f["bytes"] for f in frames), "count": len(frames),
    }
    json.dump({"meta": meta, "frames": frames}, open(os.path.join(ROOT, "data", "frames.json"), "w"), indent=1)
    print("frames", len(frames), "bytes", meta["totalBytes"])


if __name__ == "__main__":
    main()
