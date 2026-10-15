"""Fast checks for the media pipeline (M2 step 2). One PASS/FAIL line each; non-zero exit on any FAIL.
Run: python -P tools/media/checks.py   (add --deep to also decode every FLAC and compare with build/slices/*.wav)
"""
import hashlib, json, os, subprocess, sys, wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUB = os.path.join(ROOT, "public", "media")
fails = 0


def report(ok, msg):
    global fails
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok:
        fails += 1


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def main():
    deep = "--deep" in sys.argv
    big = [(os.path.join(d, f), os.path.getsize(os.path.join(d, f))) for d, _, fs in os.walk(PUB) for f in fs
           if os.path.getsize(os.path.join(d, f)) >= 20 * 1024 * 1024]
    nfiles = sum(len(fs) for _, _, fs in os.walk(PUB))
    report(not big, f"all {nfiles} files in public/media/ are under 20 MB" + (f" (over: {big})" if big else ""))

    # frames
    fj = json.load(open(os.path.join(ROOT, "data", "frames.json")))
    fr = fj["frames"]
    files = sorted(os.listdir(os.path.join(PUB, "frames")))
    report(len(fr) == 156 and len(files) == 156 and [f["frame"] + ".flac" for f in fr] == files,
           f"frames.json lists 156 frames matching the 156 FLAC files ({len(fr)} listed, {len(files)} on disk)")
    bad = []
    for f in fr:
        p = os.path.join(ROOT, "public", f["file"])
        if not os.path.exists(p) or os.path.getsize(p) != f["bytes"] or sha(p) != f["sha256"]:
            bad.append(f["frame"])
    report(not bad, f"every FLAC matches its recorded bytes and SHA-256 {bad[:5]}")
    bad = []
    for f in fr:
        p = os.path.join(ROOT, "public", f["file"])
        with open(p, "rb") as h:
            head = h.read(42)
        # FLAC STREAMINFO: total samples = 36 bits at bytes 21..25 (low nibble of byte 21 + 4 bytes), rate = 20 bits at 18..20
        rate = (head[18] << 12) | (head[19] << 4) | (head[20] >> 4)
        total = ((head[21] & 0x0F) << 32) | int.from_bytes(head[22:26], "big")
        if head[:4] != b"fLaC" or rate != 96000 or total != f["samples"]:
            bad.append((f["frame"], rate, total, f["samples"]))
    report(not bad, f"every FLAC header says 96000 Hz and the recorded sample count {bad[:3]}")
    if deep:
        bad = []
        for f in fr:
            back = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(ROOT, "public", f["file"]), "-f", "s16le", "-acodec", "pcm_s16le", "-"], capture_output=True).stdout
            with wave.open(os.path.join(ROOT, "build", "slices", f["frame"] + ".wav"), "rb") as w:
                src = w.readframes(w.getnframes())
            if back != src:
                bad.append(f["frame"])
        report(not bad, f"deep: all 156 FLACs decode sample-for-sample identical to build/slices WAVs {bad[:5]}")
    colour = {"mono", "R", "G", "B"}
    report(all(f["colourRole"] in colour and f["orientationBarry"] in (0, 1, 2) and f["title"] for f in fr),
           "frames have titles, colour roles and Barry orientation codes")
    report(len({f["image"] for f in fr}) == 116, "frames cover 116 distinct images")

    # record
    rj = json.load(open(os.path.join(ROOT, "data", "record.json")))
    s1, s2 = rj["sides"][0]["items"], rj["sides"][1]["items"]
    ids1 = [i["id"] for i in s1]
    ids2 = [i["id"] for i in s2]
    exp1 = ["pictures"] + [f"ozma-{n:02d}" for n in range(1, 16)]
    exp2 = [f"ozma-{n:02d}" for n in range(16, 32)]
    report(ids1 == exp1 and ids2 == exp2, f"record.json order: side 1 = pictures + Ozma 01 to 15, side 2 = Ozma 16 to 31")
    mus = [i["musicNumber"] for i in s1 + s2 if i["kind"] == "music"]
    report(mus == list(range(1, 28)), "music numbered 1 to 27 in record order")
    report(rj["sideBreak"]["afterMusic"] == 11 and rj["sideBreak"]["inference"] is True and rj["sideBreak"]["basis"] == "D-A17",
           "sideBreak is after music 11, flagged as an inference (D-A17)")
    audio = sorted(os.listdir(os.path.join(PUB, "audio")))
    report(audio == sorted([f"{n:02d}.webm" for n in range(1, 32)] + ["pictures.webm"]), f"public/media/audio holds 31 tracks + pictures.webm ({len(audio)} files)")
    src = {s["id"]: s for s in json.load(open(os.path.join(ROOT, "tools", "sources.json")))["sources"]}
    bad, dbad = [], []
    for i in s1 + s2:
        p = os.path.join(ROOT, "public", i["file"])
        if not os.path.exists(p) or os.path.getsize(p) != i["bytes"] or sha(p) != i["sha256"]:
            bad.append(i["id"])
        if i["source"] in src:
            want = src[i["source"]].get("lengthSeconds")
            if want and abs(i["durationS"] - want) > 0.1:
                dbad.append((i["id"], i["durationS"], want))
        if i["kind"] == "music" and not (i["performer"] and i["origin"] and i.get("nasaTitle")):
            bad.append(i["id"] + ":credits")
    report(not bad, f"every record.json item matches its file bytes and SHA-256, music has performer and origin {bad[:5]}")
    report(not dbad, f"Opus durations match the source FLAC lengths within 0.1 s {dbad[:5]}")
    pic = s1[0]["durationS"]
    report(abs(pic - 474.0) < 1.0, f"pictures.webm is {pic:.2f} s (tape is 181960704 samples at 384 kHz = 473.9 s)")
    d1, d2 = sum(i["durationS"] for i in s1), sum(i["durationS"] for i in s2)
    report(abs(d1 - rj["meta"]["sideDurationsS"]["1"]) < 0.01 and abs(d2 - rj["meta"]["sideDurationsS"]["2"]) < 0.01,
           f"side totals: side 1 {d1/60:.2f} min, side 2 {d2/60:.2f} min")
    print("TOTAL audio MB", round(sum(os.path.getsize(os.path.join(PUB, 'audio', f)) for f in audio) / 1e6, 1),
          "frames MB", round(sum(os.path.getsize(os.path.join(PUB, 'frames', f)) for f in files) / 1e6, 1))
    sys.exit(1 if fails else 0)


main()
