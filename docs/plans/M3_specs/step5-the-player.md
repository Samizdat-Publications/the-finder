# M3 step 5 spec: The Player (build the turntable to the cover's specification)

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16). Launch after step 4
(The Key, with the shared cover viewer) has landed.

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 5, 7), `PLAN.md` chapter 5 (The Player) and "Principles from the kickoff", `docs/research/cover.md` section 1b (the record diagrams: 3.6 s per turn, the stylus at the edge, the side view with 53.8 minutes), `docs/HOW_ITS_CHECKED.md` row 11, `data/cover.json`, `data/record.json`, `src/record/` (timeline, groove, engine, sounds; `PLAYING_DIRECTION`, `R_OUTER_MUSIC_MM`, `R_INNER_MUSIC_MM`, `rotationPeriodFromCover`), `src/media/audio.ts`, `data/decoder.json` (the picture signal's line period), `src/chapters/key/` (its structure and the shared cover viewer), `src/chapters/registry.ts`, `src/game/graph.ts` (the player nodes and questions), `deductions.ts`, `src/ui/`, and `src/play/bench/` (the M2 turntable panel to learn from; do not change the bench except item 6 below).

This is M3 step 5: the player builds a record player to the cover's drawing and hears the first sound off the disc. Four deductions (`player.speed`, `player.start`, `player.direction`, `player.firstSound`), each confirmed by a checker computing from the cover data and the record model, each wrong answer heard as the physics says.

## Files you own
`src/chapters/player/` (instrument, the groove microscope, checkers, tests), `tests/browser/player.browser.mjs`, one line in `src/chapters/index.ts` (`import './player/index';`), and the bench fix in item 6.

## The instrument
- The cover's record drawings (through the shared cover viewer, zoomed to `#record`), now readable through the key the player found: the binary around the disc as a time per turn, the side view's number as a playing time, the stylus drawn at the rim.
- A turntable the player assembles: a speed control in seconds per turn (shown in the alien's time unit, human gloss optional), where the needle starts (anywhere across the disc, dragged), the direction of turn, Drop and Lift. The platter turns visibly at the set speed (respect reduced motion: show the rate as a number instead).
- **The groove microscope:** a close view of the disc surface at the needle, drawn procedurally from the groove model (`src/record/groove.ts`: pitch per side), showing the spiral's sense: as the disc turns, which way the groove carries a point (inward for one direction, outward for the other). This is how the direction is deduced: no arrow on the cover says which way it turns.
- Sound through the M2 engine (`Turntable`), loading only the item under the needle and the next.

## The deductions
1. **`player.speed`**: the player sets the speed; the checker compares the set period with the cover's (from `cover.json` through `rotationPeriodFromCover`, never typed) within the control's resolution (state it, at most 0.5%). A wrong speed is heard: pitch and tempo shifted by exactly the ratio k (the engine does it); the result reports k and the shift in semitones (12 log2 k).
2. **`player.start`**: where the needle goes: the outer edge (the drawing's stylus position, the start of the side's music at `R_OUTER_MUSIC_MM`), the inner edge or the centre label. The checker accepts a drop in the outer lead-in or the first turns of music. Inner edge: the run-out's locked groove clicks once per turn (the engine); the label: nothing (lifted, a soft thump).
3. **`player.direction`**: from the microscope: the right sense carries the needle inward from the rim (`PLAYING_DIRECTION`); the wrong sense plays the side backward (the engine's reversed buffers) and the microscope shows the groove running outward. The checker compares with `PLAYING_DIRECTION` and the groove model.
4. **`player.firstSound`**: with the three right, the needle down at the outer edge of side 1: the first sound off the disc is the picture signal (side 1 begins with the pictures, D-A17). Confirmed automatically when the turntable state is right (speed within resolution, direction right, needle in the music region of side 1 near the start) and the needle has played for a few seconds. The result reports what the instrument hears: not music, not speech; a steady pattern repeating every line period (from `data/decoder.json` at the record's speed, about 8.3 ms, shown in the alien's unit), which points the player to the cover's picture diagrams. Codex: "The first sound is a picture, sent line by line."

## Presentation, tests, done
- The alien look; gold for the record and the cover; the platter and needle drawn with care (this is a signature moment: the first sound off the disc).
- Node tests: each checker's right answer and wrong results (k and semitones, the run-out period T/k, the reversed flag); the groove microscope's direction model against `groove.ts`. Ids `player.speed`, `player.start`, `player.direction`, `player.firstSound`.
- Browser test (`tests/browser/player.browser.mjs`): through `window.__finder` only, with an `OfflineAudioContext` or the live context muted: the right sequence confirms all four; each wrong answer once gives its result; no console errors. Id `chapter.player`.
- Captures: the cover's record drawing read through the key, the turntable at the right speed, the microscope both directions, the needle at the run-out; look at each and fix what is wrong or ugly.
- Item 6, the bench: the radius readout on `/play/bench/` must follow a needle dropped through the bus (a known bug: `PROGRESS.md` "Known issues").
- `npm run check` passes. Report: files, the wrong results, the line period reported, the capture folder.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Files under about 400 lines.
