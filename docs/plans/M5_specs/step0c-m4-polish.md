# M5 step 0c spec: the M4 polish batch

Subagent: `builder`. Written by the lead in build session 2 (2026-10-16) from the blind critic's second M4
pass (`docs/reviews/2026-10-16-M4-player-critic.md`, "Second pass after step 7e").

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 5, 7, 13), the review above (the decisions marked "M5 polish batch" and both "Working, don't touch" lists), the captures it judged (`review/inbox/2026-10-16T09-58-02-m4/` and `2026-10-16T09-47-50-moments/`), `src/ui/` (`ResultView.tsx`, `Moment.tsx`, `moment.css`, `results.css`, `message.ts`), The Map (`src/chapters/map/`, especially `SkyAges.tsx`, `MapInstrument.tsx`), The Trail (`src/chapters/trail/`), the charts (`src/world/galaxy.ts`, `neighbourhood.ts`, `neighbourhoodModel.ts`, `chartControls.ts`) and the encounter scene's star colours (`src/world/skyModel.ts`, D-A21). Two other helpers work at the same time (the identification's science in `src/science/pulsarIdentify.ts` and `data/seeds.json`; the decoder's picture edge in `tools/ref-decoder/` and `src/dsp/`): stay out of those files, and never run `npm run check` (targeted tests and single browser tests only; the lead runs the full check).

Presentation only: no checker verdict, science result or bus command changes.

## The batch
1. **The Map's motion step: one control, one result.** The player drags the axis on the sky map; the live cost (the number that decides) and the verdict sit beside it; the side plots, the ages chart and the nudge buttons go under "show working" (open on demand). The Map's tool panel never covers more than a third of the galaxy chart at 1440x900 and 1366x768.
2. **Stars with presence on the charts.** Chart stars sized by apparent brightness and coloured from B-V exactly as the encounter scene does (`skyModel.ts`, D-A21: the warm-white star must read warm-white); the craft drawn as a small craft glyph rather than a dot; the home star distinct.
3. **Wrong answers verdict first.** A refused result shows one line first (the verdict with its key number, for example the angle against the cut), the rest of the message folded beneath it, in every chapter's result area (shared component).
4. **The moments.** An opaque backdrop (nothing of the instrument shows through); no stray points under the sentence; with the human gloss on, the SI reading under the hero number; with it off, a comparison in the alien's own terms where the checker's readings already hold one (for example the Spot's age against the fuel's age from Arrival when both are confirmed; do not compute new science).
5. **Units in chart labels.** The Trail's and the galaxy chart's labels (distances in pc, the region size) follow the human-gloss rule through `src/ui/units.ts`.
6. **The trail moment's label** ("travelled since") reads as plain English (for example "distance behind it").

## Tests and looking
All existing tests pass (update selectors minimally; say which). Re-run `node tools/harness/browser-tests.mjs game` and `moments`; look at the new captures (the Map motion step, the Trail chart, a wrong answer in three chapters, each moment) and fix what is wrong or ugly. Keep every "Working, don't touch" item.

## Done when
Targeted tests and the `game`, `moments`, `map` and `trail` browser tests pass. Report: files, before/after captures (folder and what each frame shows), anything you could not do.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies. Files under about 400 lines.
