# Spec: Our Frame (chapter 9, the epilogue)

_Lead: 2026-10-22. Read first: `docs/plans/M6.md` "Our Frame", `docs/research/epilogue.md` (every fact and its
wording), `docs/plans/M6_specs/architecture-brief.md`, CLAUDE.md hard rules. Note: the light-day is from
EARTH (M6.md's "from the Sun" is wrong; the research note and `epilogue.lightDay` are right)._

## What it is

The game steps out of the fiction. Until now the player was the Finder, 44,000 years from now, in alien units.
Here the voice is ours, today, in human units, plainly marked. About five minutes, no deduction, a quiet end
with the record playing. It opens after `portrait.together`.

## The page

One chapter view, a vertical sequence of six short sections the player moves through with a large **Next**
button (and arrow keys / Page Down), one section on screen at a time at 1440x900 and 1366x768 (no page scroll),
with a dot row to jump back. A thin rule at the top reads "Now, our side of the story" in plain type (no glyphs
anywhere in this chapter; this is the visible break from the fiction). Plain human units throughout (km, hours,
years, AD dates), independent of the gloss setting.

1. **The turn.** "You have been the Finder, a scientist 44,000 years from now. Now step back to your own time:
   the year the machine is still flying." Below, the live date and time (the viewer's clock).
2. **Right now.** The existing `VoyagerNow` component (`src/tour/VoyagerNow.tsx`), ticking: both Voyagers' distance
   from Earth, light time, distance from the Sun, speed. Move its maths into `src/science/voyagerNow.ts`
   (pure: `TDB_MINUS_UTC_DAYS` and `voyagerNow(bodies, date)`), with a unit test against the `epilogue.today`
   values, and have both the tour widget and this chapter use it. The light-day line: "On 18 November 2026, at
   about 10:16 UTC, Voyager 1 is one light-day from Earth: light, or a radio message, takes a full day (to within
   seconds) to cross the gap. NASA gives 10:16:07; these tables give HH:MM:SS." Computed time from `crossingJd`;
   NASA's from the data file. After the date has passed, the past-tense form.
3. **Still listening.** Voyager 1 runs 2 of its 10 instruments, Voyager 2 runs 3: a small table of the ten
   instruments per craft, on or off with the date turned off and why (power or degraded), from the data file.
   "Their power falls by about 4 watts a year as the plutonium decays." One line tying back: "This is the same
   decay you used as a clock in Arrival" (link that opens the How it's checked row of the fuel clock).
4. **The slow future.** The real Gliese 445 pass: our number computed live (`discoveryState` in
   `src/science/epoch.ts`: 0.573 pc, about 1.9 light-years, about 44,100 years after launch, AD year from
   launch plus that), beside the published ones from the data file (Bailer-Jones and Farnocchia 2019: 44.0
   thousand years, 0.575 pc; NASA's popular wording 1.6 to 1.7 light-years in about 40,000 years). Small diagram:
   the Sun, Voyager 1's path, Gliese 445's path, closest approach marked (computed positions, schematic scale
   stated). The game's premise said aloud: "That is where this story was set."
5. **The map is older than the machine.** The pulsar map's periods were measured in 1970 and 1971; launch was
   1977-09-05: "about six years before launch". If the player confirmed `map.old`, show their own reading
   beside it; the per-pulsar epochs from the science (`docs/research/clocks.md`; compute from the code that
   already dates the map today, do not type them). One line: "So when the clocks in Portrait disagreed by a few
   years, this is one reason: each started at a different moment."
6. **The line in the run-out groove.** Draw the record's centre (reuse the record view from The Player, or the
   cover SVG's record drawing) and zoom slowly to the space between the label and the grooves, where the text
   appears set along the circle in a light, hand-drawn style: "To the makers of music - all worlds, all times".
   Below: "Etched by hand between the label and the grooves. Timothy Ferris asked for one line made by a human
   hand." (from the data file). Then the credits (from `docs/CREDITS.md`: render the main sources and people as
   a short roll; link to the full file on GitHub is NOT available, the repo is private, so render the list) and
   two links: "How every step is checked" (`/checked/`) and "Back to the ring".

**The record plays.** On entering the chapter, through the bus only (rule 5): `turntable.load` the side holding
music track 27 (Beethoven's Cavatina, the last piece on the record: find it in `data/record.json`),
`turntable.setVolume` low, `turntable.drop` at that track's start radius; lift it on leaving the chapter. If the
audio is not loaded, show its progress quietly; nothing blocks. A small "Sound: the record, track 27, Cavatina"
caption (captions setting) and a mute toggle that uses the existing sound setting.

## Data

`data/epilogue.json` (new, built by a script `tools/data/build-epilogue.mjs` from a hand-entered source table in
that script, each fact with its URL and the date read, exactly as `docs/research/epilogue.md` gives them): the
instruments of both craft with off dates and reasons; the power loss per year; NASA's light-day time; the
published Gliese 445 numbers; the map's period epoch years; the inscription text (written with a spaced hyphen)
and the Ferris line; the "as of" date (NASA status of 4 August 2026). Add a data check in `tools/data/checks.py`
style (or a vitest) that the JSON matches the research note's numbers. Add the sources to `docs/CREDITS.md` if
not already there.

## Wiring

- `src/chapters/epilogue/` (`index.ts`, `EpilogueInstrument.tsx`, sections, `epilogue.css`); add
  `./epilogue/index` to `src/chapters/index.ts` (re-read the file first: the Portrait helper adds a line too).
- `CHAPTERS` epilogue entry (`graph.ts:73`): `requires: ['portrait.together']`, flip `built: true` last.
- **A chapter with no deduction:** `chapterStatus` (`src/game/deductions.ts:86-92`) must report a built,
  open chapter with no nodes as 'done' once it has been entered (record that in the save as a small set of
  visited chapters, following the `tour?` optional-field precedent in `save.ts`, with migration; or, if simpler and
  honest, 'done' as soon as it is open: decide, and say which in a comment). Make Hub's "finished" glow and the
  bot.game assert work.
- Sound: Our Frame keeps the 'hub' bed but quiet under the record (ducking is automatic while the needle plays).
- Tests: `tests/browser/epilogue.browser.mjs` (enter after Portrait via the bus with `?testcheckers=1` or after
  the real chain, step through all six sections by keyboard, check the live numbers tick and match
  `voyagerNow` in the page, the light-day sentence, the instrument table counts 2 and 3, the record playing
  (the turntable state through `window.__finder.state()`), lifted on leaving, no console errors, screenshots of
  each section at 1440x900 and 1366x768 into `review/archive/<timestamp>-epilogue/`). Export `playEpilogue(page)`
  for bot.game; add the chapter to bot.game after Portrait (re-read `game.browser.mjs` first).
- Tour: the LEAD writes the stops. Give stable hooks: `data-epilogue-section="turn|now|listening|future|map|line"`
  and `data-epilogue-next`.
- How it's checked row 15 (Our frame) exists: add any new check ids you record there (row source, not the
  generated section).

## Rules and checks

No em dashes anywhere (the inscription uses a spaced hyphen); every number from data or science; science pure;
bus only; stage nothing, do not commit. Others are editing Portrait files, spot/seeds, voices, the film harness:
touch only yours and re-read shared files right before editing.

**Must pass:** `npx tsc --noEmit`; `npx vitest run src/science src/game src/chapters/epilogue src/tour`;
`node tools/harness/browser-tests.mjs epilogue`. **Report:** files changed, test tails, screenshot paths, the
computed light-day time and Gliese 445 numbers, the no-deduction 'done' decision.
