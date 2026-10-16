# M3 step 4 spec: The Key (strokes, the hydrogen unit, times not lengths)

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16). Launch after step 2
(the cover SVG) has landed.

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 3, 5, 7), `PLAN.md` chapter 1 (The Key) and "Principles from the kickoff", `docs/research/cover.md` section 1 (the binary notation, the hydrogen key, the record and picture numbers), `docs/HOW_ITS_CHECKED.md` rows 3 and 4, `data/cover.json`, `public/media/cover/cover.svg` and its generator's README or comments (the `data-id` groups, `class="bit one|zero"`), `src/science/units.ts`, `src/science/types.ts` (`PulsarCatalogue`), `src/game/graph.ts` (the key nodes and their questions), `deductions.ts`, `src/ui/` (shell, units, glyphs), and `src/chapters/arrival/` if it exists (follow its structure). Other helpers may be working on Arrival and on sound; stay in your files.

This is M3 step 4: the player reads the cover's key. Three deductions (`key.binary`, `key.unit`, `key.timesNotLengths`), each confirmed by a checker that computes from the cover data and the physics, each wrong answer showing its meaningful wrong result.

## Files you own
`src/chapters/key/` (the chapter view, the cover viewer component reusable by later chapters as `src/chapters/shared/CoverViewer.tsx` or similar, checkers, any pure helper with tests), `src/chapters/key/*.test.ts`, `tests/browser/key.browser.mjs`. Mount the chapter where the shell routes `#key`.

## The cover viewer (reused by The Player and The Pictures)
- `cover.svg` drawn in warm gold on the dark instrument background, pannable and zoomable (wheel and drag; keyboard too), with a raking light the player moves (drag a light handle around the rim: azimuth and elevation). The light reveals the etched strokes by shading them as relief (an SVG lighting filter or a canvas pass using the strokes as a height map); low light shows little, raking light shows every mark. Respect reduced motion.
- Strokes are selectable: hovering a binary group highlights it; selecting a stroke shows its kind in the instrument (orientation relative to its line of writing), never its meaning until deduced.

## The deductions
1. **`key.binary`** (question: what do the two kinds of stroke mean?). The instrument counts, over every binary group in the SVG (`data-id` groups and their `bit` elements; count them from the SVG, not by hand), how many groups begin with each kind of stroke, and lets the player tabulate a few. The player proposes: a positional number in base two, with one kind as 1 and the other as 0 (and chooses which), or one of the wrong readings (letters, decoration, a tally of marks). The checker: base two with the bar as 1 is the only reading consistent with every group beginning with the same stroke (a written number never begins with 0) and with the single bar between the two hydrogen drawings reading as 1. Choosing the dash as 1 makes every number begin with 0 (shown); a tally gives values that change with no pattern (shown, computed); letters give no repeated structure (state how you show it). Record readings: groups counted, all beginning with the bar.
2. **`key.unit`** (question: what is the unit?). An atlas of hydrogen transitions (from the physics, with sources in comments): the 21 cm hyperfine line (`HYDROGEN_HZ` in `units.ts`), Lyman-alpha, Balmer-alpha (H-alpha), Paschen-alpha, and the hydrogen ionization limit; each a frequency, and so a period and a wavelength. The drawing between the two hydrogen states (spin flipped) is evidence for the hyperfine one. A live units panel converts the cover's numbers (from `cover.json`, through `units.ts`, never retyped) with the chosen unit: the record's turn, the side's playing time, the picture line time, and the 14 map numbers. The checker: with the hyperfine unit the 14 map numbers fall inside the range of periods of known pulsars in the alien's catalogue (`data/pulsars.json`: count how many of the 14 land between the catalogue's shortest and longest periods; for the hyperfine unit all 14, for every other transition none: compute and show), and the record turns once every few seconds (a turntable speed a human hand could build); with Lyman-alpha the record turns in microseconds, and so on, each shown as the instrument's reading.
3. **`key.timesNotLengths`** (question: are the cover's numbers times, or lengths?). Read the same numbers as lengths (the transition's wavelength times the number, `binaryToMetres`) and compare with the size of the record the alien is holding (its diameter from the model, `public/media/models/voyager.json` record disc, about 0.31 m): the turn would be a million kilometres, the picture line thousands of kilometres. Read as times they are a turn of a few seconds, a side of about 54 minutes and a line of 8.34 ms. The checker computes both readings for every number and accepts "times" only when the length readings are absurd by the stated criterion (larger than the craft by orders of magnitude; state the factor) and the time readings are physical.

## Presentation, tests, done
- The alien look from the shell; gold for the cover and for what has been decoded from it; the numbers in the alien's units with the human gloss setting (D-A07).
- Node tests: each checker's right answer and each wrong answer's computed result; the counts from the SVG match `cover.json`'s number of binary strings; the pulsar-range test for each transition; ids `key.binary`, `key.unit`, `key.timesNotLengths`.
- Browser test (`tests/browser/key.browser.mjs`): through `window.__finder` only, play The Key right and with each wrong answer once; no console errors; the hub opens The Player and The Pictures afterwards. Id `chapter.key`.
- Captures: the cover under flat light, under raking light, the stroke tally, the atlas with the hyperfine choice, the atlas with Lyman-alpha (absurd readings), the times-versus-lengths panel. Look at every one and fix what is wrong or ugly.
- `npm run check` passes. Report: files, the counts and readings each wrong answer shows, the capture folder.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Files under about 400 lines.
