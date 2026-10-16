# The Finder

You are not human. About 44,000 years from now, a cold, tiny machine falls past your star: Voyager 1.
Starting from nothing but the object, you work out what it is, how old it is, how to play the gold
record it carries, where it came from, when it left, and who sent it. Every answer is the real one: the
pulsar map, the hydrogen key, the radioactive clocks, and the pictures decoded line by line from the
record's real 1977 image tape, right in your browser.

**Live preview:** https://the-finder.stewartgregerson.workers.dev/play/

## Where it stands (2026-10-16)

- **What you can play now:** seven chapters, 31 deductions, start to finish of the first two thirds of
  the story. Arrival (what the machine is and how old its fuel is), The Key (the cover's binary and its
  hydrogen unit), The Player (the record played at the right speed, the right way round), The Pictures
  (the 1977 picture signal decoded live until the calibration circle comes out round and the first
  pictures develop), The Map (the 14 pulsars, the map's age, where it was drawn), The Spot (a hidden
  speck of uranium dated by counting its alphas) and The Trail (the star the machine came from, how long
  ago it left, and when the map was made). Best in desktop Chrome or Edge, with headphones.
- **How it plays:** you work on the instruments (drag a map line onto a pulsar, sweep a detector, pick a
  star) and every answer is judged by the real science; a wrong answer shows what it would really mean.
  Hints come in three steps, only when you ask.
- **Next:** all 156 pictures in colour and the right way up, the senders' numerals, units, planets and
  height read from their teaching pictures, and The Voices (greetings, sounds and music); then the
  portrait of the senders and the epilogue. See `PROGRESS.md` for exactly where the build is and
  `PLAN.md` for the roadmap.

## How it's checked

Every deduction has an automated test against independent data, and the results page is generated
from those tests, so it cannot drift from the code: https://the-finder.stewartgregerson.workers.dev/checked/
(the same text is in `docs/HOW_ITS_CHECKED.md`). What was decided and why is in `docs/DECISIONS.md`;
every source and credit is in `docs/CREDITS.md`.

## On this PC

- `Play The Finder.bat`: builds the site and opens it in your browser.
- `Run Checks.bat`: runs every check and opens the report (PASS everywhere means nothing is broken).

Folder: `C:\Users\stewa\Documents\Claude\Golden Record`. Private repository:
https://github.com/Samizdat-Publications/the-finder
