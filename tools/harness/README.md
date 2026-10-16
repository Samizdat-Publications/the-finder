# Browser harness

Playwright (library only) driving the installed Chrome. Playwright's own browsers are never downloaded:
the bundled Chromium does not spawn on this PC, and Firefox and WebKit are tried only if already present.
Every tool that plays the game does it through `window.__finder` (the same command bus the interface uses,
src/harness/api.ts) and the real page, never by writing game state.

**`browser.mjs`** is the shared launch helper: it starts the installed Chrome headless with real GPU flags,
opens a page in a fresh context and collects its console errors, so every other tool fails the same way on
an error.

**`serve.mjs`** starts the site for the other tools: `startServer()` runs `vite preview` on the built `dist/`
folder and `startDevServer()` runs the Vite dev server (so a test can import any source module by URL inside
the page). Both run through this same node (`process.execPath`), never npx, and pick a port in 40000 to 49999
because a low ephemeral port once timed out in Chrome on this PC.

**`browser-tests.mjs`** runs every `tests/browser/*.browser.mjs` against the dev server, each in a fresh
browser context, with one retry that is reported as FLAKY, never silently green. A test default-exports
`run({ page, baseUrl, record, assert, log })`; `record` writes a check for How it's checked, and any console
error fails the test. `node tools/harness/browser-tests.mjs game` runs only the files whose names contain
`game` (here the whole-game bots, tests/browser/game.browser.mjs, which also write the critic's captures to
`review/inbox/<timestamp>-m4/`).

**`capture.mjs`** (`npm run capture`) builds `dist/` if it is missing, serves it, and screenshots the landing
page, the ring, the bench and the How it's checked page at 1440x900 and 390x844, plus the shell and the bench
in set states, into `review/inbox/<timestamp>/` with a `manifest.json`. It fails on any console error, failed
request or page error.

**`capture-layout.mjs`** is the layout review (M3 step 8b): it plays the slice's right-answer path at each
viewport size (`--sizes 1440x900,1366x768,390x844` by default), screenshots every key moment and measures
what a player would hit: page scroll, boxes that scroll on their own, anything running past the window, and
text smaller than the clue sizes. Output goes to `review/inbox/<timestamp>-layout/<size>/frames/` with a
`manifest.json`.

**`film-slice.mjs`** films the slice: the bot's own right-answer run (`playSlice` from
tests/browser/slice.browser.mjs) at 1440x900 with Playwright's video recording while the harness audio tap
records the page's real sound, pausing where a player would look. A clapperboard (a white frame and a 1 kHz
beep in the same task) lets ffmpeg line picture and sound up; the result is
`review/inbox/<timestamp>-slice/slice.mp4` (review material, never shipped) beside the run's screenshots,
`manifest.json` and `film.json`.

**`probe-audio.mjs`** (`npm run probe:audio`) checks which audio codecs each browser decodes through an
OfflineAudioContext: it makes one-second test tones with ffmpeg in `build/probe/`, decodes each at 96,000 Hz
and 48,000 Hz, checks the 96 kHz FLAC keeps exactly 96,000 samples, prints a table and writes
`build/probe/report.json`. Needs ffmpeg on PATH (or `FFMPEG` set; the WinGet link is tried first).

**`live-smoke.mjs`** checks a deployed build: it opens `/play/bench/?harness=1` on the given site, decodes two
picture frames and one colour image through the command bus, plays a piece of music, and screenshots each
state into `review/inbox/live-<timestamp>/`. It fails on any console error. Default site:
https://the-finder.stewartgregerson.workers.dev.

**`live-game.mjs`** checks the deployed game itself with no harness handle: it loads `/play/`, waits for the
ring, enters Arrival by clicking as a player would, waits for the encounter scene and screenshots both into
`review/inbox/live-game-<timestamp>/`. It fails on any console error or failed request.
