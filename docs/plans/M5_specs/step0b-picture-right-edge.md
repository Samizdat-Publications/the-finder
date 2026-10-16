# M5 step 0b spec: does the tape carry the right edge our decode cuts?

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 2, 3, 4, 7, 9, 13), `docs/research/teaching-frames.md` (the L004 and L005 readings and the cut last column), `docs/research/images-and-audio.md` (the tape and its picture format), `docs/DECISIONS.md` D-A04 and D-A19 (the geometry check against nine NASA images: aspect and shear), the reference decoder (`tools/ref-decoder/`, its checks `decoder.ref.*`) and the browser decoder (`src/dsp/`, `src/media/frames.ts`, `data/frames.json`, `data/decoder.json`). Our decoded frames are in `build/ref/frames/` and `build/ref96/frames/`. NASA's clean images already downloaded are under `sources/nasa-gr-*/` (images 1, 3, 4, 5, 14, 15, 32, 37, 39, 40; image 5 is frame L004). Two other helpers work at the same time (the identification's science; the interface polish batch): stay in your files and never run `npm run check` (targeted tests and `python -P tools/ref-decoder/checks.py` only; the lead runs the full check).

## The question
On L004 and L005 (Solar System parameters) the last column of numbers runs off the right edge of our decode (Pluto's "1400..." and "591..."; Mars's 6800 at the edge of L004). Is that the tape (the picture was framed that way in 1977), or our decoder (too few lines decoded per frame, a late frame start, or the line stretch)?

## What to do
1. Measure on the tape: how many scan lines each of L004 and L005 actually carries between its frame boundaries (sync pulses), against the 512 the decoder takes, and where the first and last lines with picture content sit. Compare with a few other frames.
2. Register our L004 against NASA's clean image 5 (`sources/nasa-gr-005/`) as the M1 geometry check does (tests only: clean images never enter the game, rule 2) and report where the right edge of our decode falls in NASA's image, in NASA's pixels and as a fraction of its width. If L005's clean image (image 6) is needed, add it to `tools/sources.json` from the same NASA gallery the others came from (URL, size, SHA-256), fetch it with `node tools/fetch-sources.mjs`, and credit it.
3. Conclude. If the tape carries more of the picture than we decode, fix both decoders (reference first, then the browser decoder to match pixel for pixel, as in M2) so the whole picture decodes, and keep every existing decoder check green (re-run the M1 geometry checks). If the tape ends where our decode ends, record that as a check (`decoder.ref.edgeL004` or similar) with the evidence, so the game can say honestly that the 1977 picture is cut there.
4. Update `docs/research/teaching-frames.md` (the cut column paragraph) and `docs/HOW_ITS_CHECKED.md` (the new check id) with the answer.

## Done when
`python -P tools/ref-decoder/checks.py` passes, the browser decoder test passes (`node tools/harness/browser-tests.mjs decoder`), and the vitest decoder tests pass. Report: the line counts, the registration result, the conclusion with evidence (the lead will look at the frames), files, anything you could not do.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies. Downloads only per rule 9. Never re-encode images into audio.
