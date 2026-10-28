# V1.0 polish (2026-10-28): clear instruments, a fun "Do it for me", the big moments big

Stewart's direction (docs/STEWART_FEEDBACK.md, 2026-10-28): the player must see the value of each step; the
interfaces must be clearly understandable and not dense where they do not need to be; doing each step by hand and
clicking "Do it for me" on every step must be equally fun. Looking alien is the lowest priority. He asked for all
of the items below before his playtest on 2026-10-29.

## Shared pieces (already on `main`, commit 2ef0b16; do not edit them, report if they need a change)

- `src/ui/Fine.tsx`: `<Fine label?="Fine tune" open?>` folds secondary controls under one quiet line;
  `<Clamp lines?=2>` shows an explanation two lines deep with "more". Styles in `src/ui/shell.css`
  (`.hero-control` frames a panel's main control, `.hero-readout` its live value, `.fine`, `.clamp`, and locked
  question cards are now one quiet line).
- The tour's spotlight (`src/tour/Spotlight.tsx findTarget`) and every "Do it for me" action
  (`src/tour/actionsKit.ts reveal`, used by `click`, `press`, `setValue`) open a closed `<Fine>` fold that holds
  their control, so folding a control never strands a tour step.
- `src/tour/actionsKit.ts`: `sweep(input, to, ms = 1200)` moves a slider to its value in visible eased steps (instant
  with reduced motion), then fires change; `beat(ms = 500)` pauses so a result can be seen (skipped with reduced
  motion).

## The hero-control pass: rules for every instrument

1. **One main control per panel.** For each tool panel, the control the step needs is the hero: give its box
   `class="hero-control"` (and its live value `hero-readout`), make it the first thing in the panel, large enough
   to hit and read.
2. **Fold the rest.** Step buttons (`<< < > >>`, `+ -`), typed number boxes beside a slider, zoom, fit, lamp and
   view toggles, alternative views, and readouts that only matter to a curious player go inside `<Fine>`. A control
   a deduction cannot be done without stays out.
3. **Shorten the prose.** Explanations inside panels go in `<Clamp>` (two lines, "more"). The guide already explains
   each step; the panel should not say it all again.
4. **No "more below" on the step's control.** At 1440x900 and 1366x768 with the tour guide open, the step's control
   and its Propose button are on screen without scrolling the column.
5. **"Do it for me" shows its work.** In your chapter's `src/tour/actions/<chapter>.ts`, where an action jumps
   straight to the answer (a value typed in a box, a point set at once), make it visibly do the thing with
   `sweep()` and `beat()`: the slider sweeps, the needle moves, the mark grows, then a short beat on the result. At
   most about 4 s added per action. It must still resolve once the deduction is confirmed.
6. **Keep what works:** the guide's structure, the glyph headers with our units in brackets, the live decoding,
   the staged moments, the honesty notes (critic's "don't touch" list).

## Hard rules (CLAUDE.md, all apply)

Real data only (no hand-typed expected answers; numbers come from `data/` or `src/science/`); `src/science/` and
`src/dsp/` stay pure; one command bus (no bot-only shortcuts); seeded randomness; no checker, deduction or data
change; never an em dash anywhere (code, comments, text); every new or changed tour selector keeps working.

**Do not edit** (other builders work in parallel): anything under `src/ui/`, `src/tour/script.ts`,
`src/tour/actions.ts`, `src/tour/actionsKit.ts`, `src/tour/Spotlight.tsx`, `src/game/`, `src/science/`, `data/`,
another builder's chapter. If a tour selector in `src/tour/actions.ts` TARGETS must change, keep the old selector
valid instead (add the old class or data attribute to the new element); if that is impossible, report the exact
replacement line. If a tour stop's text no longer matches the screen, report the exact new text.

## Working in the shared checkout

All six builders work at once in the main checkout, `C:\Users\stewa\Documents\Claude\Golden Record`, each on its own
files only (the list in your section). Never touch another builder's files, never revert or "fix" a change you did
not make, and never commit: the lead commits. Your builds go to your own folder: prefix every build, browser test
and look with `FINDER_DIST=dist-<your letter>` (lower case, e.g. `FINDER_DIST=dist-c npm run build`, then
`FINDER_DIST=dist-c node tools/harness/browser-tests.mjs map`). If typecheck or the build fails in a file outside
your list, another builder is mid-change: wait a minute and retry; only your own files' errors are yours.
Browser tests run six at a time on one PC: a timing check that fails once under load and passes on a rerun is fine.

Must pass before you report: `npx tsc --noEmit -p tsconfig.json`; `npx vitest run` (the whole unit suite);
`npm run build`; `node tools/harness/browser-tests.mjs <your chapter>` for each of your chapters, plus
`node tools/harness/browser-tests.mjs tour-hold`. Then look: `node tools/harness/tour-look.mjs --stops <your stop
ids> --sizes 1440x900,1366x768 --open` and read every screenshot yourself; fix what looks cramped, clipped or
unclear. Do not commit.

Report (under 300 words): files changed; what the hero control is in each panel and what you folded; what each
"Do it for me" now shows; the final test output lines; the screenshot folder path; anything left or any tour
text or selector change for the lead.

## The work, by builder

- **A. Portrait** (`src/chapters/portrait/*`, `src/tour/actions/portrait.ts`, `tests/browser/portrait.browser.mjs`):
  (1) "They live there" (tour stop `portrait.sky`) as a full-stage moment: while that stop is on, the plate gives
  way to the Finder's sky at full stage size (the same SkyBackdrop and SendersMark the portrait.together moment
  draws, its brightest stars from the epoch model), the warm-white star ringed and named, a slow gentle drift or
  twinkle (still with reduced motion), and the plate returns after the stop. In free play the sky strip gets a
  "See the sky" button that opens the same full view, with a way back. (2) The clocks band's axis title runs into
  its first tick label ("beats before now155x10^12"): give the title its own place (left of the ticks or under
  them), no overlap at 1440x900, 1366x768 and 390x844.
- **B. Our Frame** (`src/chapters/epilogue/*`, `tests/browser/epilogue.browser.mjs`): the five later sections (now,
  listening, future, map, line) each lead with a full-width picture at the top of the stage, the text beneath it,
  content top-aligned (no empty band above). Pictures: **now**, a new one: "Where they are tonight", the Sun at the
  centre, the two Voyagers placed from the Horizons ephemeris already loaded (true directions in the ecliptic plane,
  distances on a squeezed scale stated on the picture, e.g. rings at 1, 10 and 100 times Earth's distance), Earth's
  orbit, and the planets' orbits only if their distances are already in `data/` (cite which file in a comment);
  the live numbers stay beneath. **listening**: the instrument lights become the picture, larger, first.
  **future**: the closest-approach chart enlarged to the stage width as the picture, the table compact beneath.
  **map**: its chart as the picture. **line**: the etched line view as the picture. The turn section stays as it is.
- **C. The Map and The Trail** (`src/chapters/map/*`, `src/chapters/trail/*`, `src/world/*`,
  `src/tour/actions/map.ts`, `src/tour/actions/trail.ts`, their browser tests and `tests/browser/charts.browser.mjs`):
  (1) Galaxy chart labels: every pulsar matched to a cover line wears a small readable tag with its line number
  (11 to 12 px, beside its halo, through the existing label declutter in `src/world/labelLayout.ts`); the Galactic
  centre label is cut to its name and one distance ("Galactic centre, 8,270 pc" style, values from the data as
  now), the uncertainty and "(modern)" moved to show working or a hover title; the faint grid ring labels stay
  readable (not below 11 px). (2) The hero-control pass for both chapters.
- **D. The Voices** (`src/chapters/voices/*`, `src/tour/actions/voices.ts`, `tests/browser/voices.browser.mjs`):
  (1) Marking a stretch must reveal something, not be busywork: while the player drags across the spectrogram, the
  marked region shows live what it holds (from the same measurement the checker uses: held calls and speech
  inside), and each held call inside is drawn on the spectrogram as a bright trace at its pitch from its start to
  its end; on release the marked stretch plays once so it is heard. No marks are shown outside the player's own
  stretch (the finding stays theirs). "Do it for me" drags the mark across the calls visibly over about 1.5 s,
  then plays it. (2) The hero-control pass for The Voices (the two-column track list of about 30 tracks is the
  densest part: show it compactly, the current face first).
- **E. Arrival, The Key, The Player, The Spot** (`src/chapters/{arrival,key,player,spot}/*`, their
  `src/tour/actions/*.ts`, their browser tests): the hero-control pass. The Player is the densest screen (four
  columns: the cover drawing, the lamp and zoom, the turntable, the groove microscope with a long paragraph): lead
  with the turntable. `src/chapters/key/parts.tsx` is imported by other chapters: change it only additively.
- **F. The Pictures** (`src/chapters/pictures/*`, `src/tour/actions/pictures.ts`, `tests/browser/pictures.browser.mjs`,
  `album.browser.mjs`, `decoder.browser.mjs`, `slice.browser.mjs`): the hero-control pass. The knob panel (line
  time with four step buttons and a typed box, line start, stagger, polarity, rows with four step buttons, develop
  buttons) is the densest part: each step's knob leads, steppers and typed boxes fold.
