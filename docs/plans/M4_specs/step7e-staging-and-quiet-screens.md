# M4 step 7e spec: stage the discoveries, quiet the working screens

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16) from the blind critic's M4
review (`docs/reviews/2026-10-16-M4-player-critic.md`).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 5, 7, 13), the review above (every decision marked "Fix now (7e)" and the "Working, don't touch" list), the captures it judged (`review/inbox/2026-10-16T08-08-55-m4/frames/` with `shots.txt`), `PLAN.md` "Look, feel and sound", `src/ui/` (shell, notebook, Codex, Workbench, theme tokens, `message.ts`, `pastProposal.tsx`), the M4 chapters (`src/chapters/map|spot|trail/`), `src/chapters/shared/CoverViewer.tsx`, and the charts (`src/world/galaxy.ts`, `neighbourhood.ts`, `chartControls.ts`).

This is presentation only: no checker, science, bus command or test assertion about results changes (selectors may move; say which).

## 1. Results lead with a headline; the working folds
- A shared result component used by every chapter's result area (all seven chapters; Arrival, The Key, The Player and The Pictures included): for a confirmed result, a headline (the key quantity large, in the alien's units with the human gloss rule, its glyph label above it) and one plain sentence; the full message and the readings under a "show working" fold (closed by default, remembered per player in settings). A refused result keeps its message visible (it teaches), shorter where it can be, with the readings folded.
- Each checker already returns its readings; choose the headline reading per deduction in one table in the chapter (no checker changes). Keep the codex as it is (it is the full record).

## 2. Staged moments
- `src/ui/Moment.tsx` (new): a short full-screen moment that dims the instrument, shows a backdrop, one large number in the alien's units with its glyph label, and one sentence, then returns; skippable (click, Escape, any key); reduced motion: a still with no camera moves; a caption line for the sound that plays (reuse the cue's caption).
- Moments on confirming: `map.region` (the galaxy chart framing the region, the map's lines converging on it), `spot.age` (the cover under a low lamp with the spot's position glowing faintly, the age large), `trail.origin` (the neighbourhood chart: the craft's path drawn back from the craft to the warm-white star across the dark, the craft and the star labelled, the travel distance), `trail.neighbour` (the alien's own sky with the warm-white star marked as the nearest and fifth-brightest), `trail.when` (the reframe's ages collapsing onto one line, the map's age large). Use the charts' own handles (`frame`, `showTrail`, `showRegion`) and the instruments' existing visuals; no new art assets.
- Triggered from game state (a node confirmed), so the bots see them; the bots skip them through the same skip control a player uses. Test: each moment appears once on its node, is skippable, and the game state is unchanged by it.

## 3. Quieter, bigger working screens
- **The Map:** the galaxy chart keeps the largest area at every step; the ages-across-the-sky plots open beside it (or as a panel over its lower part that can be collapsed), never squeezing it to a strip at 1440x900 or 1366x768; the plot legend in plain words.
- **Scroll cues:** where a column scrolls, a soft fade at the clipped edge and a small cue; a new result scrolls into view inside its own column; the codex drawer dims what it covers.
- **Confirmed cards:** "N answers that did not hold" in red becomes a quiet tally after confirmation ("1 earlier try"), still opening the attempts.
- **The Spot:** opens with the raking lamp low (the angle The Key uses), so the cover's relief shows.
- **Galaxy chart labels:** labels avoid each other and bright points (a simple screen-space declutter: drop or nudge the lower-priority label), the home star and the Galactic centre always kept.

## 4. From the M3 and M4 QA audit (`review/archive/qa/`, summarised in PROGRESS)
- **No long freeze on entering a chapter.** `trailRows()` blocks the main thread for about 1 s on the dev machine (the Trail browser test's 1 s bound failed once at 1,023 ms), so a laptop would freeze for seconds; `identification()` and `region()` take 0.2 to 0.7 s. Compute the epoch model's heavy parts off the main thread or in cooperative chunks (a Worker that runs the same pure science, or async versions that yield every few milliseconds), cached per seed, behind the instrument's "measuring" state; the checkers keep their synchronous getters (they throw until the part is ready, so the bus refuses instead of recording). Target and test: no main-thread long task over 100 ms on entering The Map, The Spot or The Trail at 1440x900 (a PerformanceObserver for long tasks in the browser tests), and record the GPU adapter and CPU in the perf checks.
- **Old saves' seeds.** A save made by Start over before step 7d carries a time-based seed that may fail a check (about 1.3% do). On load, a save whose seed is neither the default nor in `data/seeds.json` moves to the next validated seed; deductions already confirmed stay confirmed with the readings they recorded. Unit test.
- **Contour text.** Results print "the 100.000% contour"; write levels above 99.9% as "beyond the 99.9% contour" (and below as now).
- **The Trail chart's labels** ("the craft" over "Gl 445 (home)") get the same declutter as the galaxy chart.

## Tests and looking
All existing tests pass (update selectors minimally; say which). Re-run the whole-game bot to make a new capture (`node tools/harness/browser-tests.mjs game`, which writes `review/inbox/<timestamp>-m4/`) plus captures of the five moments at 1440x900 and 1366x768; look at every frame and fix what is wrong or ugly. Keep the "Working, don't touch" items as they are.

## Done when
`npm run check` passes. Report: files, the headline chosen per deduction, the five moments (what each shows), the capture folders and what each frame shows, anything you could not do.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies. Files under about 400 lines.
