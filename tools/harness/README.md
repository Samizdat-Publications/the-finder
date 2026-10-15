# Browser harness

Playwright (library only) driving the installed Chrome. Playwright's own browsers are never downloaded:
the bundled Chromium does not spawn on this PC, and Firefox and WebKit are tried only if already present.

| Command | What it does |
|---|---|
| `npm run capture` | Builds if `dist/` is missing, serves it with `vite preview`, screenshots `/`, `/play/` and `/checked/` at 1440x900 and 390x844 into `review/inbox/<timestamp>/` with a `manifest.json`. Exit 1 on any console error. |
| `npm run probe:audio` | Makes 1-second test tones with ffmpeg in `build/probe/`, decodes each in an `OfflineAudioContext` at 96,000 Hz and 48,000 Hz, prints a table and writes `build/probe/report.json`. Checks the 96 kHz FLAC keeps exactly 96,000 samples. |

Files: `browser.mjs` (launch Chrome, open a page and collect console errors), `serve.mjs` (starts
`vite preview` on a free port through `process.execPath`, not npx), `capture.mjs`, `probe-audio.mjs`.

Needs ffmpeg on PATH (or `FFMPEG` set; the WinGet link is tried first).
