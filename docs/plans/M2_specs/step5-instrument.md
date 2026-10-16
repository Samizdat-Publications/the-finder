# M2 step 5 spec: the bare instrument on /play/ (Stewart's first preview)

Subagent: `builder`. Written by the lead in build session 2 (2026-10-15).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 2, 5, 7, 13), `PLAN.md` ("Look, feel and sound", chapters 5 and 6), `docs/plans/M2.md` step 5, `src/record/README.md` and `src/record/engine.ts` (the `Turntable` class, `NeedleState`, events), `src/media/audio.ts`, `src/media/frames.ts` (`PictureDecoder`, `fetchSlice`, `FRAMES`, `frameEntry`), `src/dsp/params.ts` (`DecodeParams`, `referenceParams`), `src/dsp/colour.ts`, `data/record.json`, `data/frames.json`, `src/ui/theme.css`, `src/play/main.tsx` (the placeholder you replace), and `tools/harness/` (capture and browser-test runner). The science core, the decoder and the turntable are finished and tested: use them, do not change them (if one needs a change, stop and report).

This is M2 step 5: a bench with the two real instruments, the turntable and the picture decoder, on `/play/`. It is not the game (no story, no puzzles, no alien framing beyond the look): it is the first thing Stewart will open from the preview link, so it must be clear, honest, good-looking and fast to start.

## Architecture (these patterns carry into the game)
- **One command bus** (`src/game/bus.ts`, rule 5): a typed union of commands and a `dispatch(cmd)` that is the ONLY way state changes; the interface dispatches, tests and bots dispatch the same commands. Commands for now: `turntable.load {side}`, `turntable.drop {radiusMm}`, `turntable.setSpeed {secondsPerTurn}`, `turntable.setDirection {direction}`, `turntable.lift`, `decoder.select {frame}`, `decoder.setParam {name, value}`, `decoder.reset`, `decoder.run {speed: 'record' | 'fast'}`, `decoder.composeColour {image}`.
- **State** in Preact signals (`src/game/state.ts`), updated only by the bus handlers and by engine events.
- **Harness API** (`src/harness/api.ts`): `window.__finder = { dispatch, state(), waitFor(predicate, timeoutMs) }`, installed only when `import.meta.env.DEV` is true or the URL has `?harness=1` (never otherwise).

## The bench (`src/play/`)
- Layout: two panels side by side at 1440 wide, stacked on narrow screens (the page must not break at 390 wide; a short "best on a bigger screen" note there). Theme tokens from `src/ui/theme.css`; gold only on the record and on decoded pictures (PLAN.md "Gold means human").
- **Turntable panel:** an SVG drawing of the disc (gold, grooves suggested, label area) with the needle; click or drag on the disc (or a radius slider in mm) to choose where the needle drops; the region shown (lead-in, music, run-out); side 1 or 2 with a one-line note "Side 1 faces the spacecraft; where side 1 ends is an inference (D-A17)"; speed as seconds per turn (slider 1.8 to 7.2 s, with the cover's value from `data/cover.json` marked); direction (clockwise, counter-clockwise); Drop and Lift; a load progress bar in bytes; now playing: title, performer, origin, time into the side; volume. Load only what is needed: the item under the needle and the next one (not the whole 82 MB side), using the engine's options (read them; if the engine cannot do this, report).
- **Picture panel:** a frame picker (all 156: frame id, image number, title, and "mono" or the colour role); Decode at record speed (lines appear in real time, 8.32 ms each, about 4.3 s per picture, as they would come off the record) or Fast; the knobs that matter for the game: line time (absolute ms, the cover's 8.3396 ms marked; also shown as percent off), sync lock on or off, interlace offset on or off, polarity normal or inverted, droop correction on or off, rows per picture (300 to 420; the reference 355 marked); Reset to reference; a canvas showing the picture (512 columns appearing left to right) at a crisp integer scale; a small oscilloscope strip under it showing the raw signal of the line being drawn; for colour images, "Compose colour (order R, G, B is probable, not proven)" after the three frames decode.
- Footer: "Preview build (M2): the instruments, not the game. The pictures are decoded live from the 1977 image master tape; the sound is the Ozma 2017 remaster." with links to `/` and `/checked/`.
- Text: plain English, no em dashes, no promises of controls that do not exist.

## Tests and captures
- `tests/browser/instrument.browser.mjs` (runner: `tools/harness/browser-tests.mjs`): open `/play/`; through `window.__finder`: select L000, run fast, wait until done, read the canvas and confirm it equals the `PictureDecoder` output for the same params (byte-exact on the grayscale values); set line time +5% and confirm the picture changes and the circle is no longer round (use `src/dsp/ellipse.ts`); load side 1, drop the needle on music 7 (Johnny B. Goode: compute its radius with `Groove`), wait for `itemId` = its id, set 3.47 s per turn and confirm the state's speed ratio; no console errors. Id `instrument.bench`.
- Extend `tools/harness/capture.mjs` with instrument states set through `window.__finder` (`/play/?harness=1` on the preview build): L000 decoded with the reference settings; L000 at +5% line time; R072 decoded; image 12 (Earth) composed in colour; the turntable with the needle on Johnny B. Goode; each at 1440x900, plus `/play/` at 390x844. Look at every capture yourself (Read the PNGs) and fix anything broken or ugly before reporting.

## Done when
`npm run check` passes (all 7 steps), `npm run capture` writes the instrument captures with no console errors, and you have looked at them. Report: files, the check summary, the capture folder, what each capture shows, anything you could not do.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Files under about 400 lines.
