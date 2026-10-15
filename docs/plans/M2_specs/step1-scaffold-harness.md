# M2 step 1 spec: site scaffold, deploy config and browser harness

Subagent: `builder`. Written by the lead in build session 2 (2026-10-15). Paste everything below the
`---` line as the prompt (or point the helper at this file).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md`, `PLAN.md` ("Architecture", "Look, feel and sound"), `docs/plans/M2.md`, and `HANDOFF.md` ("Tools and paths", "Gotchas": npx.cmd ENOENT, wrangler and spaces in paths, the Browser pane, Playwright with installed Chrome). Other helpers work in `tools/ref-decoder/` and on audits; the science core (`src/science/`), `data/`, `tools/data/` and `tools/ref-decoder/` are off limits.

This is M2 step 1: the Vite site skeleton (three pages), the Cloudflare config, the check runner's build step, Stewart's play shortcut, and the Playwright harness (captures and an audio-codec probe). No game yet: the pages are honest placeholders the next steps fill.

## Files you own (create or modify; nothing else)
`package.json`, `package-lock.json`, `tsconfig.json` (JSX settings only), `vite.config.ts`, `vitest.config.ts` (only if needed to keep `src/science` tests node-only and to add a `jsdom`-free UI test setup), `index.html`, `play/index.html`, `checked/index.html`, `src/site/` (landing), `src/play/` (placeholder entry), `src/checked/` (the How it's checked page), `src/ui/boot.ts` (shared boot-error overlay), `src/ui/theme.css` (tokens), `public/` (favicon only), `wrangler.jsonc`, `tools/check.mjs` (add one step only, see below), `tests/hygiene.test.ts` (extend only, see below), `tests/site.test.ts`, `tools/harness/` (`browser.mjs`, `serve.mjs`, `capture.mjs`, `probe-audio.mjs`, `README.md`), `Play The Finder.bat`.

## Dependencies (pin exactly; `npm install --save-exact`)
devDependencies: `vite` 8.2.4, `@preact/preset-vite` 2.10.6, `playwright` 1.64.0 (library only: never download its browsers; use the installed Chrome with `channel: 'chrome'`), `wrangler` 4.147.0, `@types/three` 0.186.0. dependencies: `preact` 10.29.8 (the 10.x line; 11 is two weeks old), `@preact/signals` 2.11.3 (peer `preact >= 10.25`), `three` 0.186.1, `marked` 18.1.1. Keep the existing pins (TypeScript 7.0.2, Vitest 5.0.5, @types/node 26.6.5). If `@preact/preset-vite` needs `@babel/core`, pin the version npm resolves and say so.

## The site
- `vite.config.ts`: Preact preset; multi-page build with `build.rolldownOptions.input` = `index.html`, `play/index.html`, `checked/index.html`; `server.watch.ignored` and `optimizeDeps` must ignore `.claude/**`, `sources/**`, `build/**`, `harness/**`, `review/**`; `publicDir: 'public'`; `base: '/'`. Vitest config stays separate (science tests run in Node with no DOM).
- `tsconfig.json`: add `"jsx": "react-jsx"` and `"jsxImportSource": "preact"`; nothing else changes.
- Each HTML page: `<meta charset>`, viewport, title, a `#boot-error` overlay (pattern: `C:\Users\stewa\Documents\Claude\13F Fire Support Sim\index.html`, read only) wired in `src/ui/boot.ts` (window `error` and `unhandledrejection` show a readable message instead of a blank page), and one module script.
- `src/ui/theme.css`: design tokens for the alien interface (PLAN.md "Look, feel and sound": deep indigo background, cyan-green and violet accents, warm gold reserved for the human artifact), a readable sans and a mono stack, dark by default. Keep it small; the real interface comes in M3.
- `/` landing (`src/site/`): the title "The Finder", one honest paragraph (from PLAN.md "The short version", no em dashes), a "Play" link to `/play/`, a "How it's checked" link to `/checked/`, and a note "Early build: the experience is not playable yet." No images yet.
- `/play/` (`src/play/main.tsx`): a placeholder panel "The instrument loads here (M2)". Export nothing else; step 5 replaces it.
- `/checked/` (`src/checked/`): render `docs/HOW_ITS_CHECKED.md` (import it with `?raw`) through `marked` into a styled, readable page (tables scroll horizontally on narrow screens). This page must show the generated results table.
- `wrangler.jsonc`: `{ "name": "the-finder", "compatibility_date": "2026-10-15", "assets": { "directory": "./dist" } }` (default `html_handling`; no `not_found_handling`, no `main`).
- `package.json` scripts: `dev` (vite), `build` (vite build), `preview` (vite preview), `deploy` (build, then wrangler deploy run through `process.execPath` with the wrangler JS entry, from the project folder with relative paths, as a small `tools/deploy.mjs` if needed; the folder name has a space), `check` unchanged, `capture` (`node tools/harness/capture.mjs`), `probe:audio` (`node tools/harness/probe-audio.mjs`).
- `Play The Finder.bat` in Stewart's style (read `C:\Users\stewa\Documents\Claude\Excavator Sim\Play Cut and Fill.bat`): builds, starts `vite preview` and opens `http://localhost:4173/play/` in the default browser; plain-language comments; no em dashes.

## Checks
- `tools/check.mjs`: add a step "Site build" (vite build through `process.execPath` and Vite's JS entry, not npx) after the unit tests; renumber the step labels; keep everything else.
- `tests/hygiene.test.ts`: extend the size rule to every file under `public/` and, when `dist/` exists, under `dist/` (each under 20 MB); add `public/**` and `dist/**` nowhere else.
- `tests/site.test.ts`: the three HTML entries exist, each has the boot overlay and one module script; `wrangler.jsonc` points at `./dist`; `vite.config.ts` lists the three inputs.

## Harness (`tools/harness/`, adapted from `C:\Users\stewa\Documents\Claude\Excavator Sim\tools\harness\browser.mjs`, `serve.mjs`, `capture.mjs`; read only there)
- `browser.mjs`: launch installed Chrome via Playwright (`channel: 'chrome'`, headless), with the GPU flags from that file; a helper that opens a URL, waits for load and collects console errors.
- `serve.mjs`: start `vite preview` on a free port through `process.execPath` (not npx), return the URL, stop cleanly.
- `capture.mjs`: build if `dist/` is missing, serve, screenshot `/`, `/play/` and `/checked/` at 1440x900 and 390x844 into `review/inbox/<timestamp>/` with a `manifest.json`; fail on any console error.
- `probe-audio.mjs`: generate 1-second test tones with ffmpeg into `build/probe/` (FLAC 96 kHz 16-bit mono; FLAC 44.1 kHz stereo; Opus in Ogg and in WebM at 160 kbps; AAC-LC in .m4a), serve them, and in Chrome report for each: does `decodeAudioData` succeed in an `OfflineAudioContext` at 96,000 Hz and at 48,000 Hz, the decoded sample rate and length, and for the 96 kHz FLAC whether the decoded length equals the source sample count exactly (no resampling). Also try Playwright `firefox` and `webkit` only if they launch without downloading anything (they may not be installed; report "not available"). Write `build/probe/report.json` and print a table.

## Done when
`npm run check` passes (now 6 steps), `npm run build` produces `dist/` with the three pages, `npm run capture` writes screenshots with no console errors, `npm run probe:audio` prints its table. Report: the final package versions installed, the check summary, the probe table, the capture folder path, anything that did not work (exact errors).

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Keep files small and plain.
