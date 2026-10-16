# M3 step 1 spec: the shell, the deduction graph, the codex, saves and hints

Subagent: `builder`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 5, 7, 13), `PLAN.md` ("The experience", "Look, feel and sound", "Architecture"), `docs/plans/M3.md`, `docs/DECISIONS.md` D-A06 (hub) and D-A07 (alien units, human gloss), `docs/HOW_ITS_CHECKED.md` (the deduction table: rows 1 to 15), and the M2 code you build on: `src/game/bus.ts`, `state.ts`, `model.ts`, `src/harness/api.ts`, `src/play/` (the bench), `src/ui/theme.css`, `vite.config.ts`, `tests/browser/instrument.browser.mjs`. Another helper is building the cover SVG (`tools/cover/`, `assets-src/cover/`, `public/media/cover/`); stay out of those.

This is M3 step 1: the frame every chapter lives in. No chapter content yet: each slice chapter gets a placeholder workbench that later steps replace. Everything changes state only through the command bus (rule 5), and every deduction is confirmed by a checker that calls the science, never by hand-typed answers (rule 1).

## Files you own
`src/game/` (extend: `deductions.ts`, `graph.ts`, `save.ts`, `settings.ts`, plus the bus and state changes needed), `src/ui/` (shell components, `glyphs.ts`, `units.ts` display helpers, CSS), `src/play/` (routing; the bench moves to `src/play/bench/` and the page `play/bench/index.html`, a fourth Vite input), `vite.config.ts` (the new input only), `src/checked/` (anchors only: give each deduction-table row an id `row-N` so the codex can link to it), tests (`src/game/*.test.ts`, `tests/browser/shell.browser.mjs`), and update `tests/browser/instrument.browser.mjs` and `tools/harness/capture.mjs` for the bench's new address.

## The deduction graph (`src/game/graph.ts` data, `src/game/deductions.ts` logic)
- A node: `{ id, chapter, key (English key for the glyph label), gloss (plain English, no em dashes), requires: id[], checkedRow: number (How it's checked row), hints: [nudge, method, answer] }`. The slice's nodes, by chapter (ids are stable; later milestones add the rest):
  - arrival: `arrival.purpose` (the dish and booms: built to send across distance and to sense), `arrival.heat` (three warm cylinders), `arrival.madeNotMined` (U-234 with almost no U-238, row 2), `arrival.fuelAge` (the heat source's age, row 1).
  - key: `key.binary` (two strokes are binary digits, row 3), `key.unit` (the unit is hydrogen's spin-flip, row 3), `key.timesNotLengths` (row 4).
  - player: `player.speed`, `player.start`, `player.direction`, `player.firstSound` (row 11).
  - pictures: `pictures.lineTime`, `pictures.sync`, `pictures.interlace`, `pictures.polarity`, `pictures.aspect`, `pictures.circle`, `pictures.firstFrames` (row 12).
  - Placeholders for later chapters (map, spot, trail, voices, portrait, epilogue) appear on the hub as locked "later" chapters with no nodes yet.
- Chapter gating (D-A06): arrival first; key after arrival's `arrival.purpose`; after `key.timesNotLengths` the hub opens player, pictures (and later map, spot, trail); pictures' line-time work needs `player.speed` (the record must be playable at the right speed to read the pictures off it).
- States: `locked`, `open`, `confirmed`; plus a list of attempts per node (`{ answer, ok, result, at }`), so wrong answers are remembered and shown (every wrong answer produces a meaningful wrong result: PLAN.md "Principles").
- Checkers: `registerChecker(id, (answer, ctx) => { ok, result, message })`. Step 1 registers test checkers only (behind a flag used by tests); steps 3 to 6 register the real ones, which call `src/science/`, `src/record/` and `src/dsp/`.
- Commands (added to the bus): `chapter.enter {chapter}`, `deduction.propose {id, answer}`, `hint.request {id}` (reveals the next tier: nudge, then method, then answer; counted), `codex.open {id?}`, `settings.set {name, value}`, `save.reset`.

## Saves and settings
- `localStorage['finder.save.v1']`: version, node states and attempts, current chapter, hints revealed, settings. Load on start, save on every state change (debounced), migrate by version (a test with a fake v0). A "Start over" control in settings (confirm first) dispatches `save.reset`.
- Settings: human gloss (off by default, D-A07), master volume, reduced motion, sound captions. Persisted.

## The shell (presentation v1)
- The alien instrument frame from PLAN.md "Look, feel and sound": deep indigo, cyan-green and violet instruments; warm gold only for the human artifact and what has been decoded from it.
- **Glyph labels** (`src/ui/glyphs.ts`): a deterministic generator that turns an English key into a short alien glyph word as inline SVG strokes (seeded by the key; same key, same glyphs; no randomness at run time), rendered above a quiet English gloss line.
- **Units** (`src/ui/units.ts`): the alien's units are hydrogen-based (time in hydrogen periods, length in hydrogen wavelengths, using `src/science/units.ts`); numbers are shown with Arabic digits (the translation layer), the unit as a glyph with its gloss, and with the human gloss setting on, SI in parentheses.
- Layout: a top bar (the vessel's status line, the hub ring of chapters, codex, settings, hint), the workbench area, the codex as a side drawer. The hub is a radial ring of chapter glyphs (locked ones dim), not a list.
- **Codex v1:** an entry per confirmed node: the alien glyph title, the gloss, the alien notation of the deduction (a short line of glyphs and numbers from the checker's result), the attempts that failed and what they showed, and a link "How it's checked" to `/checked/#row-N`.
- **Hints:** one button per open node, revealing tiers in order; never automatic.
- Each slice chapter shows a placeholder workbench ("This instrument is being built") listing its nodes and their states.
- Routes: `/play/` is the game (hash per chapter: `#arrival`, `#key`, `#player`, `#pictures`, `#hub`); `/play/bench/` is the M2 bench (keep it working; its harness API stays).
- Keyboard: Tab order sensible, Escape closes the codex and settings, visible focus.

## Tests
- Node (`src/game/*.test.ts`): gating (what opens when), propose with a test checker (ok and wrong, attempts recorded), hints reveal in order, save round trip and v0 migration, settings persistence, glyph determinism. Ids `game.graph`, `game.save`.
- Browser (`tests/browser/shell.browser.mjs`): `/play/` loads with no console errors; through `window.__finder`: enter arrival, confirm `arrival.purpose` with the test checker, the key chapter opens, the codex shows the entry with a working How it's checked link; reload and the state persists; `save.reset` clears it. Id `game.shell`.
- `npm run check` green (the bench tests updated for `/play/bench/`); `npm run capture` updated: the hub, a placeholder workbench, the codex open, settings open, each at 1440x900 and 390x844. Look at every capture yourself and fix anything broken or ugly before reporting.

## Done when
All of the above. Report: files, the check summary, the capture folder and what each capture shows, decisions you made that the spec did not settle.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Files under about 400 lines.
