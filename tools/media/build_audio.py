"""Transcode the record audio to Opus in WebM (M2 step 2, D-A18).

Inputs : sources/ozma-cd-NN/NN.flac (31 tracks), sources/image-tape/384kHzStereo.wav
Outputs: public/media/audio/NN.webm and public/media/audio/pictures.webm
Settings: libopus, 160 kbps VBR, 48 kHz stereo, no other processing. The picture tape is read at its
header rate (384 kHz = the record's speed) and resampled with SoX resampler (soxr).
Writes assets-src/manifests/media-audio.json with the exact settings. Run: python -P tools/media/build_audio.py
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "media", "audio")
OPUS = ["-c:a", "libopus", "-b:a", "160k", "-vbr", "on", "-application", "audio", "-ar", "48000", "-ac", "2"]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("FAILED: " + " ".join(cmd) + "\n" + r.stderr[-800:])


def track(n):
    nn = f"{n:02d}"
    src = os.path.join(ROOT, "sources", f"ozma-cd-{nn}", f"{nn}.flac")
    run(["ffmpeg", "-y", "-v", "error", "-i", src, "-map_metadata", "-1", "-vn", *OPUS, os.path.join(OUT, f"{nn}.webm")])
    return nn


def pictures():
    src = os.path.join(ROOT, "sources", "image-tape", "384kHzStereo.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", src, "-map_metadata", "-1", "-vn", "-af", "aresample=resampler=soxr",
         *OPUS, os.path.join(OUT, "pictures.webm")])


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as ex:
        f = ex.submit(pictures)
        for nn in ex.map(track, range(1, 32)):
            print("ok", nn, flush=True)
        f.result()
    print("ok pictures")
    man = os.path.join(ROOT, "assets-src", "manifests")
    os.makedirs(man, exist_ok=True)
    ver = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    json.dump({"script": "tools/media/build_audio.py", "tool": ver, "codec": "libopus 160k VBR, 48 kHz stereo, WebM",
               "picturesFilter": "aresample=resampler=soxr from 384 kHz header rate", "generated": False,
               "inputs": "sources/ozma-cd-NN/NN.flac, sources/image-tape/384kHzStereo.wav"},
              open(os.path.join(man, "media-audio.json"), "w"), indent=1)
