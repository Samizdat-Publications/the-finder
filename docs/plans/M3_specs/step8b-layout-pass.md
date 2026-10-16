# M3 step 8b spec: the layout pass (instruments on one screen, legible clues)

Subagent: `builder`. Written by the lead in build session 2 (2026-10-16) from the blind player-critic's
review (`docs/reviews/2026-10-16-M3-player-critic.md`).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 5, 7, 13), `PLAN.md` "Look, feel and sound", `docs/reviews/2026-10-16-M3-player-critic.md` (the problems and the "working, don't touch" list), `src/ui/` (shell, theme.css, shell.css, units.ts, Workbench, Hub, Codex), and the four chapters in `src/chapters/` (arrival, key, player, pictures, shared). Look at the latest captures in `review/inbox/*-slice/frames/` first: they are what the critic saw.

This is M3 step 8b: the slice works and its best moments land; between them it reads as a dashboard that does not fit the screen. Fix the presentation without changing what anything does (the checkers, the bus commands, the science and the tests' assertions stay as they are).

## Targets
1. **One screen per instrument.** At 1440x900 and at 1366x768, each chapter's instrument and the controls and readouts the player needs right now fit without page scrolling: use the full width (the narrow centred column wastes the margins); the scene or the main visual large; controls beside it, not below it; the notebook of deductions in a collapsible side column or a drawer (open by default on wide screens, closed on narrow ones). At 390 wide everything still works by scrolling.
2. **Panels stay put.** No scroll-into-view that slices a panel under the header; the header never covers content (reserve its height); results appear where the player is looking (in the instrument's own result area), not by scrolling the page.
3. **The clues are the most legible thing on screen.** Readout labels at least 13 px and values at least 15 px, contrast at least 4.5:1 against their background (WCAG AA) for every label, value, axis tick and footnote that carries evidence; decoration (glyph ornaments, grid lines) quieter than the clues. Check contrast with a small script over the theme tokens and report the pairs.
4. **Units in one system.** With the human gloss off, show only the alien unit; with it on, the alien unit then SI in parentheses. Numbers: no `e12` notation in the interface: write large numbers with a superscript power of ten (for example 1.59 × 10¹² beats) through one helper in `src/ui/units.ts` (keep its API).
5. **The ring.** A small legend for OPEN, DONE, LOCKED (needs another deduction first) and LATER (not built yet); finished chapters lit with their arcs; when all four slice chapters are done, a quiet flourish on the ring (a slow glow along the lit arcs; reduced motion: a static glow).
6. **The encounter scene in Arrival** fills most of the instrument area at both sizes; the scan panels float over or beside it without covering the craft (the scene can offset its framing: it already supports a view offset).

## Do not touch
The Pictures sequence's behaviour and look of the developing picture, the scope trace, the raking-light lamp, the ring's idea, the codex and its How it's checked links, the "THIS HOLDS." stamp, the turntable and microscope ideas (layout only).

## Tests and looking
- All existing tests must still pass unchanged in what they assert (selectors may move: if a test depends on layout, update it minimally and say so).
- Captures at 1440x900, 1366x768 and 390x844 for: the ring (fresh and finished), each chapter's instrument in its main state, the codex open. Put them in `review/inbox/<timestamp>-layout/` with a `manifest.json` (what each shows, plain words). Look at every one yourself; for each target above say in the report how the captures show it is met (or not).

## Done when
`npm run check` passes; the captures meet the targets. Report: files changed, the contrast table, each target with its evidence, anything you could not meet.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies.
