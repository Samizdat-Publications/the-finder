# M3 step 2 spec: the cover, rebuilt as exact SVG

Subagent: `asset-smith`. Written by the lead in build session 2 (2026-10-15).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit). Read `CLAUDE.md` (rules 1, 9, 11, 12, 13), `PLAN.md` chapters 1, 2, 5, 6 (what the player does with each part of the cover), `docs/research/cover.md` (all; section 4 lists the image sources), `data/cover.json` and `data/README.md` (every etched number, the map geometry), and look at the sources yourself: `sources/cover-photo/GPN-2000-001978.jpg` (NASA's 1977 photo, 2215 x 2215), `sources/cover-diagram/cover-diagram-large.jpg` (NASA's labelled explanation), `sources/pioneer-svg/Pioneer_plaque.svg` (the same pulsar map, vector; its geometry is already extracted into `cover.json` by `tools/data/svgmap.py`). Other helpers work on `src/science/`; do not touch it.

This is M3 step 2: the Voyager record cover as a clean, exact, layered SVG that the game shows under a raking light and that the player reads mark by mark. It is a reconstruction of a real artifact, so geometry and every binary digit must be faithful; style is plain strokes (the game colours it).

## Files you own
`tools/cover/` (a reproducible generator: Python 3.14 run as `python -P`, or Node), `assets-src/cover/geometry.json` (every measured coordinate, with provenance), `public/media/cover/cover.svg` (the output, committed runtime media), `public/media/cover/overlay.png` is NOT shipped (write overlays to `build/cover/`), `tests/cover-svg.test.ts`, `docs/CREDITS.md` (one line if you use anything new).

## The SVG
- One `viewBox` in millimetres of the real cover (the cover is a 12-inch, about 307 mm square aluminium case; take the size from the research or measure the photo against the record's known 12-inch diameter, and say which). Origin and orientation as in the NASA photo.
- Groups with stable ids, each element carrying `data-*` attributes the game uses:
  - `#record`: the disc drawing seen from above with the stylus at the edge, the binary number around the rim (`data-id="record.rotationPeriod"`), and the side view with the play-time binary (`record.playTime`).
  - `#pictures`: the waveform diagram with its sync pulses and the line-time binary (`picture.lineTime`), the raster diagram with line labels 1, 10, 11 (`picture.lineLabels`) and the 512 (`picture.rasterLines`), the "staggered interlace" drawing, and the calibration-circle picture.
  - `#map`: the pulsar map, built from `cover.json` (`pulsarMap.gcLine`, `pulsarMap.lines[]`: angle, length, tick, breaks, digits along the line, `digitsAlongOwnLine` for B1240-64), scaled and placed where the photo has it; each line `data-id="pulsar.<order>"`.
  - `#hydrogen`: the two states of the hydrogen atom and the "1" (a single bar) between them.
  - The outer circle and anything else on the cover; nothing invented.
- Binary digits: each digit its own element (`class="bit one"` or `class="bit zero"`, `data-index`), a bar across the line of writing for 1, a short dash along it for 0, spaced and sized as on the cover. The MSB end as on the cover (cover.md: MSB nearest the origin on the map).
- Uranium spot: NOT drawn (it is not on the cover diagram; cover.md 1e). Leave a commented, empty `#uranium-spot` group with its documented game position for later.

## Method
- Measure positions from the 1977 photo and the NASA diagram into `assets-src/cover/geometry.json` (pixel coordinates, the transform to mm, and what each was measured from). Where the pulsar map's internal geometry comes from `cover.json`, only its placement and scale are measured.
- Generate the SVG from `geometry.json` and `cover.json` with a script (no hand-edited SVG), deterministically.
- Overlay: render the SVG over the photo (aligned by the measured transform) into `build/cover/overlay.png` and `build/cover/overlay_detail_*.png` (the four quadrants at full resolution). LOOK at them yourself and fix misplacements; report the RMS misalignment of at least 12 measured landmarks.

## Tests (`tests/cover-svg.test.ts`, Vitest, Node)
- Parse the SVG (a small XML parse; no new dependency unless necessary, say which), read every `data-id` binary group by its `bit` elements in order, and compare with `cover.json` strings exactly (all 14 pulsars, rotation, play time, line time, raster, labels). Id `cover.svg.binaries`.
- The map lines' angles and lengths in the SVG match `cover.json` within 0.05 deg and 0.1% (after the placement transform). Id `cover.svg.map`.
- The file is under 1 MB and has no external references.

## Done when
`npm run check` passes with the new test; the overlays look right to you. Report: files, the cover size you used and why, the landmark RMS, the test output, anything on the cover you could not place confidently.

## Rules
No em dash anywhere. Never read .env. Do not commit. No generated imagery: the cover is traced from the real artifact.
