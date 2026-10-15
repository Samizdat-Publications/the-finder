# M2 step 2 spec: the media pipeline

Subagent: `asset-smith`. Written by the lead in build session 2 (2026-10-15). Paste everything below the
`---` line as the prompt (or point the helper at this file).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit). Read `CLAUDE.md` (rules 2, 9, 11, 12 especially), `docs/plans/M2.md`, `docs/DECISIONS.md` D-A10, D-A17, D-A18, `docs/research/images-and-audio.md` sections 1, 4 and 5, `tools/ref-decoder/README.md` (the slices), `build/slices/index.json`, and `docs/research/data/images/image_list_116.txt`. Other helpers are building the site scaffold (`package.json`, `vite.config.ts`, `src/site|play|checked|ui`, `tools/harness/`, `tools/check.mjs`) and improving the decoder (`tools/ref-decoder/`); do not touch those.

This is M2 step 2: turn the checksum-verified raw sources into the small, committed runtime media the browser plays, plus the two data files that describe them.

## Inputs (already on disk, verified)
- Record audio: `sources/ozma-cd-01/01.flac` ... `sources/ozma-cd-31/31.flac` (44.1 kHz, 16-bit stereo; titles and MD5s in `tools/sources.json`).
- The picture tape: `sources/image-tape/384kHzStereo.wav` (32-bit float stereo, header 384,000 Hz = the record's speed).
- The 156 picture slices: `build/slices/L000.wav` ... `R077.wav` (96 kHz, 16-bit mono) and `build/slices/index.json`.

## Files you own
`tools/media/` (scripts, Python 3.14 run as `python -P`, or Node; ffmpeg 9 is on PATH), `public/media/audio/`, `public/media/frames/`, `data/record.json`, `data/frames.json`, `data/README.md` (append two sections only), `docs/CREDITS.md` (append per-track credit lines under "Record content"), `tools/sources.json` (only if you add a credits source page, same shape as the others).

## Outputs
1. **Music, greetings and sounds:** one Opus file per Ozma track in WebM, `public/media/audio/NN.webm` (NN = 01..31), libopus about 160 kbps VBR, 48 kHz stereo, no other processing (no normalization, no trimming beyond what the source has). Each file under 20 MB (check).
2. **The picture side as you would hear it:** `public/media/audio/pictures.webm` from the tape at its header rate (the record's speed), stereo, resampled to 48 kHz with a good anti-alias filter (`ffmpeg -af aresample=resampler=soxr`), Opus about 160 kbps. Under 20 MB.
3. **Picture slices:** `public/media/frames/L000.flac` ... `R077.flac`: FLAC of the WAV slices, identical samples (96 kHz, 16-bit, mono; `-compression_level 12`). Verify each round trip: decode the FLAC back to 16-bit PCM and compare sample for sample with the WAV (must be identical); record each file's bytes and SHA-256. Report the total size.
4. **`data/frames.json`:** `{ "meta": {...}, "frames": [ { "frame": "L000", "channel": "L", "index": 0, "image": 1, "title": "...", "colourRole": "mono"|"R"|"G"|"B", "file": "media/frames/L000.flac", "bytes": n, "sha256": "...", "sampleRate": 96000, "samples": n, "firstLineOffset": n (96 kHz samples, from index.json), "tapeStartSample384k": n, "gain": n, "orientationBarry": 0|1|2 (reference only) } ] }`. Titles and colour roles from `image_list_116.txt` and `index.json` (the decoder parsed Barry's orientation table; read it from `build/ref/metrics.json` or `tools/ref-decoder/barry.py`, do not retype).
5. **`data/record.json`:** the record's timeline: `{ "meta": {...}, "sideBreak": { "afterMusic": 11, "basis": "D-A17", "inference": true, "alternatives": [9, 10, 12] }, "sides": [ { "side": 1, "faces": "the spacecraft", "items": [...] }, { "side": 2, "faces": "outward", "items": [...] } ] }`. Side 1 order: the pictures, then Ozma tracks 01 to 04 (Waldheim, 55 languages, UN greetings and whales, Sounds of Earth), then music 1 to 11 (Ozma tracks 05 to 15); side 2: music 12 to 27 (Ozma tracks 16 to 31). Each item: `{ "id": "pictures"|"ozma-NN", "kind": "pictures"|"greeting"|"sounds"|"music", "musicNumber": n|null, "title": "...", "performer": "..."|null, "origin": "..."|null (for example "Senegal"), "durationS": n (exact, from the decoded file), "file": "media/audio/NN.webm", "bytes": n, "sha256": "...", "source": "ozma-cd-NN"|"image-tape" }`. Performers and origins: from NASA's music page for the Golden Record (find it from `docs/research/images-and-audio.md` section 5's NASA links, fetch it, cite its URL in `meta.sources` and in `docs/CREDITS.md`); where NASA and the Ozma track title disagree, keep both (`title` from Ozma, `nasaTitle` from NASA).
6. **Credits:** one line per track in `docs/CREDITS.md` under "Record content" (title, performer, origin, NASA as the source of the performer credit, Ozma 2017 remaster).
7. **`tools/media/checks.py`** (fast, one PASS/FAIL line each, non-zero exit on failure): every file in `public/media/` under 20 MB; every FLAC round-trips identically (or, faster, re-checks the recorded SHA-256 and the sample count); 156 frames in `frames.json` matching the files; 31 tracks plus the pictures in `record.json` matching the files and ordered as above; total durations per side reported.

## Rules
- Raw sources are never committed; everything under `public/media/` is (D-A10). Never run downloaded code. No em dash anywhere. Do not commit.
- Deterministic where possible (ffmpeg with `-map_metadata -1 -bitexact` for the FLACs so rebuilds are byte-identical; Opus encodes need only be reproducible in content).
- Report: files and total sizes (audio, frames), the per-side durations, any track over 20 MB, the checks output, anything that did not match.
