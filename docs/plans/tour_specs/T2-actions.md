# T2: the tour's "Do it for me" actions, spotlight targets, and the tour bot (builder-opus)

## Context

The guided tour (D-A33, `docs/plans/tour_specs/T1-core.md`, built in parallel by another builder) walks a
parent and child through all 43 deductions in the order of `src/tour/script.ts` (`STOPS`; read it, do not
edit it). For each do or watch stop the guide offers "Do it for me" (watch stops: "Show me"), which calls
`SHOW_ME[stop.id]()`, and spotlights the control named by `TARGETS[stop.id]`.

`docs/plans/tour_specs/controls.md` lists, for every deduction, the controls, selectors, right answers and
exactly how the bots complete it. The bots are the reference implementation:
`tests/browser/slice.browser.mjs`, `game.browser.mjs`, `album.browser.mjs`, `voices.browser.mjs`,
`map.browser.mjs`, `spot.browser.mjs`, `trail.browser.mjs`, `moments.mjs`.

## Files you own

- `src/tour/actions.ts` (replace the stub; keep its exported names and types: `SHOW_ME`, `TARGETS`, `ShowMe`).
  Split helpers into `src/tour/actionsKit.ts` (DOM helpers) and per-chapter files
  `src/tour/actions/<chapter>.ts` if it gets long.
- `src/tour/actions.test.ts` (Node/Vitest, no DOM): every do or watch stop in `STOPS` has a `SHOW_ME` entry
  and a non-empty `TARGETS` entry; every TARGETS selector parses (no DOM needed: check it is a non-empty
  string; optionally validate with a tiny regex).
- `tests/browser/tour.browser.mjs`: the tour bot (below).
- Nothing else. If you need a hook in an instrument (a data attribute, or an exported handle), say so in your
  report instead of editing the instrument, unless it is a one-line data attribute that changes no behaviour;
  list any such edit.

## Rules

- In-app code: import `dispatch` from `src/game/bus.ts` and read state from `src/game/state.ts` (signals) or
  `snapshot()`; do NOT use `window.__finder` (it is only installed in dev or with `?harness=1`; the tour must
  work on the live site).
- Rule 5 (one command bus): an action does only what a player can: bus commands the interface itself sends,
  and clicks, inputs and key presses on the real controls. Prefer working the visible controls (click the
  real button, set the real slider and fire its `input`/`change` event, click the real choice) so the
  screen shows what was done, then propose with the instrument's own Propose button where it has one. Fall
  back to `deduction.propose` through `dispatch` (as the bots do) where a control needs a pointer gesture on
  a canvas or SVG that is impractical in-page; in that case still move what you can (select the line, the
  tab, the frame) first.
- Seed-dependent answers (map, trail, spot age) come from the same model the bots use (`epochModel(game.seed)`
  in `src/chapters/shared/epochModel.ts` and friends, the spot's measured ratio), never typed constants.
  Constants the bots take from data (the cover's turn time, 8.3396 ms line time, 355 rows, 147.5 mm, frame
  ids) should be computed from or read from the same data modules the bots use where those exist; if a bot
  hard-codes one (e.g. `ROUND_ROWS = 355`), reuse its value and note it.
- Each action: first make sure the right chapter is showing (if not, `dispatch({type:'chapter.enter',
  chapter})`), wait for the instrument's ready attribute (helper `waitFor(selector | predicate, timeoutMs)`
  using setInterval polling at 50 to 100 ms, not rAF), switch to the right tab or view, perform the steps,
  and resolve only once `game.records.value[node]?.confirmed` (or the confirmed set) holds the node. Skip
  any staged moment (`[data-moment-skip]`) that appears after confirming. Reject with a readable Error if a
  step times out. Never propose a wrong answer (the bots do; the tour must not).
- Keep long waits honest: `player.firstSound` waits for the instrument to auto-propose after the drop (up to
  90 s); `pictures.album` develops 156 frames (up to 300 s); voices tools wait for their Worker analyses.
- No em dashes anywhere.

## TARGETS

For each stop, 1 to 3 selectors. The spotlight rings the FIRST VISIBLE match, so list them so that the first
visible one is always the next thing to touch: a control that only appears after an earlier step goes BEFORE
that earlier step's control (e.g. `['[data-propose-button="player.direction"]', '[data-direction="cw"]']`: the
propose button only appears after the direction click, so while it is hidden the direction button is ringed).
Where both stay visible (a choice and a disabled Propose button), ring the choice. Think through each one.

## The tour bot: `tests/browser/tour.browser.mjs`

Default-exports `run({ page, baseUrl, record, assert, log })` like the other browser tests (read
`tools/harness/README.md` and an existing test). It:
1. Opens `/play/?tour=1` on a fresh save (clear storage first, as `freshStart` does), 1440x900.
2. Walks every stop: screenshot the guide at the stop (before), then for do/watch stops clicks the guide's
   "Do it for me" or "Show me" button (find it by its text or a data attribute T1 gives it; coordinate with the
   T1 builder's DOM: read `src/tour/Guide.tsx` when it exists; until then use text), waits for the node to be
   confirmed (via `window.__finder.state()`), screenshot (after), then clicks Next. Story stops: screenshot,
   Next.
3. Asserts every node in the script is confirmed at the end, and that the guide's step counter advanced
   through every stop. Records one check `bot.tour` (claim: a bot completes the guided tour from a fresh
   save using only the guide's buttons; measured: stops passed, nodes confirmed, seconds).
4. Writes screenshots to `review/inbox/<timestamp>-tour/frames/` with `manifest.json` and `shots.txt`
   (reuse `reviewFolder` from slice.browser.mjs).
If T1's guide is not merged when you get here, write the bot against the spec in T1-core.md and say so; the
lead will run it after integration.

## Commands that must pass

- `npx tsc --noEmit -p tsconfig.json`
- `npx vitest run src/tour`
- If T1's guide exists in the tree by then: `node tools/harness/browser-tests.mjs tour` (it starts its own
  dev server). Otherwise test your actions directly: a throwaway Playwright script (in the scratchpad or
  `harness/out/`, not committed) that opens `/play/` on a fresh save and, for each stop in script order, calls
  the action (`await import('/src/tour/actions.ts')` inside `page.evaluate`, then `SHOW_ME[id]()`), asserting
  each node confirms. All 43 must confirm in order from a fresh save. Report the timing per action.

## Report

Files changed (and any instrument edits, with why); the per-action result table (id, ok, seconds); command
outputs; anything that could not be done in-page and how you fell back.
