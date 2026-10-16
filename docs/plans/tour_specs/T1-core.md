# T1: the guided tour, core (builder)

## Why

Stewart played the start and could not tell what to do, in what order, or why. He will use The Finder with
his nearly-12-year-old son: a parent walking a child through an interactive exhibit, on rails, scientific
but clear. The tour is a narrator panel that walks through every deduction in a fixed order. The free game
stays as it is ("Free play").

## Files you own

Create: `src/tour/state.ts` (if you want helpers), `src/tour/Guide.tsx`, `src/tour/Spotlight.tsx`,
`src/tour/StoryStage.tsx`, `src/tour/tour.css`, `src/tour/text.tsx` (the tiny formatter),
`src/tour/progress.ts` (pure helpers), `src/tour/tour.test.ts`, `src/tour/script.test.ts`.
Modify: `src/game/state.ts`, `src/game/bus.ts`, `src/game/gameService.ts`, `src/game/save.ts` (+ its test if
needed), `src/ui/Shell.tsx`, `src/ui/Workbench.tsx`, `src/ui/Hub.tsx`, `src/ui/shell.css` (only if needed),
`src/play/main.tsx`, `src/site/main.tsx` (landing page) and `index.html` if the landing copy lives there.
Read but do not edit: `src/tour/types.ts`, `src/tour/script.ts` (the lead writes it; it currently holds a
few stops, more will land while you work), `src/tour/actions.ts` (a stub; another builder fills it).

## Hard rules

- One command bus (rule 5): tour state changes only through new bus commands. The guide's buttons dispatch.
- No em dashes anywhere (code, comments, text). Plain English.
- Do not break the existing bots: a fresh save must still start with the tour OFF at the hub
  (`tests/browser/slice.browser.mjs` `freshStart` asserts `chapter === 'hub'`, 0 confirmed). The tour starts
  only from an explicit `tour.start`.
- Stage explicit paths only when committing; but do NOT commit: the lead commits.

## State and commands

- `game.tour`: `signal<{ on: boolean; step: number; furthest: number }>` (default off, 0, 0) in
  `src/game/state.ts`. Add to `snapshot()` if it lists game fields.
- Bus commands (`src/game/bus.ts`, handled in `gameService.ts`):
  - `{ type: 'tour.start'; step?: number }`: turns the tour on. With no step: resume at the stored step if
    the save has one with on/off history (step > 0), else at the first stop that is not finished (a story
    stop counts as finished once passed; for a fresh save that is 0). Also sets `humanGloss` to true (the
    tour always shows our units in brackets). Then goes to the stop (below).
  - `{ type: 'tour.goto'; step: number }`: clamp to the script; set step; raise `furthest`; enter the stop's
    chapter with the existing chapter-entering code if the game is not already there (`chapter: 'hub'` stops
    show the story stage, see below). Close the codex and settings drawers.
  - `{ type: 'tour.exit' }`: on = false (step and furthest kept), and go to the hub.
- Save (`src/game/save.ts`): add an optional `tour` field to the saved object; a save without it loads as
  off/0/0; clean bad values. Keep version 1 (the field is optional). Unit tests for round trip and bad input.

## The guide panel (`Guide.tsx`)

Shown whenever `game.tour.on`. Where:
- On a chapter workbench: in place of the notebook column (`Workbench.tsx`: when the tour is on, render the
  guide instead of `<aside class="notebook">`, hide the Notebook toggle, and make the bench lay out as if the
  notebook were open, with the guide column about 360 to 400 px wide at 1440x900 and 1366x768). The guide
  column scrolls on its own if its text is long; its Next button stays visible (sticky footer).
- On the hub with the tour on: `StoryStage.tsx` replaces the ring: a centred card (max about 720 px wide)
  over the existing background, large readable type (18 to 20 px body), the stop's title, its text sections,
  and the same Back / Next footer. For the very first stop, show the cover drawing beside or above the text,
  using the existing exact cover SVG (`src/chapters/shared/coverSvg.ts`; look at how `CoverViewer.tsx` uses it).

What the guide shows for the current stop `STOPS[step]`:
1. A header: part title (from `PARTS`), "Step n of N", a thin progress bar over the whole tour, and a row of
   small part dots (done, current, ahead). Clicking a dot of a part at or before `furthest` jumps to that
   part's first stop (`tour.goto`).
2. The title (h2), then `look` under a small label "What we're looking at".
3. For `do` and `watch` stops whose node is not confirmed yet:
   - `todo` in a highlighted box labelled "Your turn" (do) or "Watch" (watch).
   - Buttons: for do: "Show me where" (scrolls the spotlight target into view, centred, and flashes it) and
     "Do it for me" (secondary). For watch: "Show me" as the main button (runs the action). Both run
     `SHOW_ME[stop.id]` from `src/tour/actions.ts`; while running the button reads "Working..." and is
     disabled; an error is shown in the guide in one line. If the action is missing, hide the button.
   - If the node's last attempt was refused (`game.records.value[node].attempts`, last `ok === false`), a
     gentle line: "Not quite. The instrument's result says why. Try again, or press Do it for me."
4. Once the node is confirmed (or straight away on a story stop): `why` under "What we just learned",
   `human` under "The real story" (styled as a quote card, a different accent), `ask` under "Talk about it"
   (a question card). Missing fields are skipped.
5. Footer: "Back" (to step - 1, disabled on 0) and "Next" (primary, large; disabled while a do or watch node
   is unconfirmed, with the text "Next unlocks when this step is done"). On the last stop Next reads "Finish"
   and exits the tour to the hub.
6. If the game's current chapter is not the stop's chapter (the player wandered), a line "You have left this
   step." with a button "Go back to it" (`tour.goto` the same step).
7. When the node gets confirmed while the guide is showing, scroll the guide column to the "What we just
   learned" section and give it a soft highlight (respect reduced motion).

Text: `src/tour/text.tsx` renders a string: paragraphs split on a blank line, `**bold**` to `<strong>`. Nothing
else (no HTML injection).

## The spotlight (`Spotlight.tsx`)

While a do or watch stop is unconfirmed, find the first element matching any selector in
`TARGETS[stop.id]` that is visible (non-zero box, not `hidden`, inside the document), and draw a fixed
position ring around its bounding box (`pointer-events: none`, z-index above the instruments but below the
codex, settings drawers and the moment overlay), with a soft pulsing glow in the guide accent (static when
`reducedMotion`). Update its position on a 250 ms interval and on scroll (capture) and resize: the Claude
Browser pane pauses requestAnimationFrame, so do not rely on rAF alone. Hide it when no target is visible.
"Show me where" calls `scrollIntoView({ block: 'center', behavior: 'smooth' })` on the target (also scroll an
inner scrolling column if the target is inside one) and flashes the ring twice.

## Top bar and entry points

- Top bar (`Shell.tsx`) with the tour on: the status line reads "Guided tour: <part title>"; hide Ring and
  Hint; keep Codex and Settings; add a "Leave tour" button (`tour.exit`). With the tour off: add a "Guided
  tour" button that dispatches `tour.start`.
- Hub (`Hub.tsx`, tour off): in the ring's centre replace "Choose where to work." with a primary button
  "Start the guided tour" (or "Resume the guided tour" when `game.tour.step > 0`) and a small line "or pick
  any lit chapter to explore on your own".
- `src/play/main.tsx`: if the URL has `?tour=1` (or the hash is `#tour`), dispatch `tour.start` after the save
  loads, then remove the parameter with `history.replaceState`.
- Landing page (`src/site/main.tsx` or `index.html`, wherever the copy is): primary button "Start the guided
  tour" linking `/play/?tour=1`; secondary "Free play" linking `/play/`; keep "How it's checked". Replace the
  "Early build" line and the blurb with:
  "You are a scientist on a world circling a small red star, about 44,000 years from now. Your telescopes
  catch a cold, tiny machine falling past: Voyager 1, carrying a golden record from a planet you have never
  heard of. Work out what it is, how old it is, how to play it, what it shows, where it came from and who
  sent it. Every answer is the real one, checked against real data."
  and under the buttons: "The guided tour walks you through every step in order, and explains why. Best
  with headphones, a big screen, and someone to talk it over with."

## Styling

Use the existing tokens in `src/ui/theme.css`. The guide must read easily: body 15 to 16 px in the column,
line height 1.5, clear section labels (small caps or the mono label style the shell uses), generous spacing,
contrast 4.5:1 or better (there is a contrast test over theme tokens: `src/ui/contrast.test.ts`; add any new
token pairs to it). "Your turn" box: accent border. "The real story": warm gold accent (the record's colour).
"Talk about it": a speech-bubble feel. Next button: big and obvious.

## Tests that must pass

- `npx tsc --noEmit -p tsconfig.json`
- `npx vitest run src/tour src/game src/ui`
- New unit tests: tour commands (start on a fresh save goes to step 0 and turns the gloss on; goto clamps
  and raises furthest and enters the chapter; exit keeps step); save round trip; `script.test.ts`: every
  stop id unique; every do/watch stop has a `node` in `NODES` and a `todo`; each node appears at most once;
  for every stop with a node, every node in its `requires` appears on an earlier stop (once the script holds
  all nodes this proves the rails respect the gating); no em dash (U+2014) in any text field; every stop's
  part is in `PARTS` and parts appear in `PARTS` order. Also a test that is `it.todo` until the script is
  complete: every playable node in `NODES` appears in the script.
- Then the full browser regression for the parts you touched:
  `node tools/harness/browser-tests.mjs shell` and `node tools/harness/browser-tests.mjs slice` (they start
  their own dev server; read `tools/harness/README.md`). Both must still pass (tour off by default).
- Look at it yourself: start the dev server (`node node_modules/vite/bin/vite.js --port 5198`) and take
  Playwright screenshots (installed Chrome, `channel: 'chrome'`, see `tools/harness/browser.mjs`) at
  1440x900 of: the landing page, `/play/?tour=1` (the first story card), the Arrival workbench with the
  guide on the `arrival.intro` stop, and 1366x768 of the same workbench. Save them to
  `review/tour/` and list them in your report.

## Report

Files changed; the final output of the commands above; the screenshot paths; anything you could not do;
any judgement call you made.
