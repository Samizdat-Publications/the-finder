# M4 step 7c spec: result messages in the alien's units, and past verdicts marked as past

Subagent: `builder`. Written by the lead in build session 2 (2026-10-16), from the M3 layout pass's leftovers
and step 7's review of the M4 captures. Runs after step 7b (both edit the chapters' checkers).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 5, 7 and 13), `docs/DECISIONS.md` D-A07 and D-A22 (alien units, the human gloss), `src/ui/units.ts` (`quantity`, `quantityText`, `formatMeasured`), `src/game/deductions.ts` (`CheckResult.message`, `Attempt`), the seven chapters' `checkers.ts`, and every place a checker's message is shown (the notebook, `src/ui/Codex.tsx`, each instrument's result area).

## The problem
Readouts follow the human-gloss setting (alien units only when it is off), but the checkers' message sentences print SI and human units regardless ("0.3625 s", "44,100 years", "0.749 pc", "8.7 W"). With the gloss off, the player reads two unit systems side by side, which the blind critic marked down. Separately, an instrument keeps showing the last rejection after the player has changed the instrument (a 100-beat rejection under a day-long count; a wrong-star rejection under the corrected ruler), which reads as a current verdict.

## 1. Messages carry quantities, the interface renders them
- `src/ui/message.ts` (new, pure, tested): `q(dim, si, digits?)` returns a token embedded in the message text (a short plain-ASCII syntax of your choice that cannot occur in English text), and `renderMessage(text, humanGloss)` replaces each token with `quantityText` (alien unit; SI in parentheses when the gloss is on). Text with no tokens (saves written before this change) renders unchanged.
- Every checker in all seven chapters writes each physical quantity in its messages with `q(...)`: times (including years), lengths (including pc and AU), speeds, masses, powers, energies, temperatures, frequencies. Plain counts, angles in degrees, ratios, p-values and odds stay as they are.
- Every place that shows a message renders it with `renderMessage` and the current gloss setting: the notebook, the codex, each instrument's result area. Saved attempts keep their token text so they re-render when the gloss changes.
- A test renders every checker's right message and every wrong message the chapters' Node tests produce, for the default seed, with the gloss off, and fails on any SI or human unit word or symbol (s, ms, min, h, days, years, m, mm, km, pc, AU, ly, km/s, W, K, kg, g, J, eV, MeV, Hz, as whole words or after a number); with the gloss on, each such quantity appears once in alien units with SI in parentheses.

## 2. Past verdicts marked as past
- When the player changes an instrument's input after a proposal (a control, a slider, a picked star, the counting time, the frame), that instrument's shown result is marked as the last proposal, not a verdict on what is on screen now: dimmed, with a small label "your last proposal" and its own values, until the next proposal replaces it. A confirmed result (THIS HOLDS) is never dimmed.
- One small shared helper (for example a hook taking the instrument's current input and the input of the last attempt) used by each chapter's result area; no chapter logic changes.
- Browser tests: in two chapters (The Spot's counter and The Trail's ruler), propose wrong, change the input, and assert the result is marked as the last proposal; propose right and assert it is not.

## Tests and looking
All existing tests pass (update text assertions that quote messages, and say which). Captures at 1440x900 into `review/inbox/<timestamp>-messages/` of one result per chapter with the gloss off and one with it on, and the two "last proposal" cases; look at every one.

## Done when
`npm run check` passes. Report: files, the token syntax, the unit-word test's list and result, the captures and what each shows, anything you could not do.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies. Files under about 400 lines.
