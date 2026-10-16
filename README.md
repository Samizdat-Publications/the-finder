# The Finder

You are not human. About 44,000 years from now, a cold, tiny machine falls past your star: Voyager 1.
Starting from nothing but the object, you work out what it is, how old it is, how to play the gold
record it carries, where it came from, when it left, and who sent it. Every answer is the real one: the
pulsar map, the hydrogen key, the radioactive clocks, and the pictures decoded line by line from the
record's real 1977 image tape, right in your browser.

**Live preview:** https://the-finder.stewartgregerson.workers.dev/play/

## Where it stands (2026-10-16)

- **What you can try now:** the instrument bench (an early preview, not the game yet). Drop a needle on
  the real record (the Ozma 2017 remaster from the master tapes), at the right speed or a wrong one, and
  decode any of the 156 picture frames live from the 1977 image master tape. Turn the decoder's knobs to
  see what a wrong setting does to the picture. Best in desktop Chrome or Edge, with headphones.
- **What is finished underneath:** the real picture signal decoded and checked frame by frame; every
  etched number on the cover transcribed and verified; the science of every "when" and "where"
  deduction (pulsar dating and triangulation, the radioactive clocks, the craft's trail back to the
  Sun, the stars as they will be 44,100 years from now), each with honest error bars.
- **Next:** the first playable chapters (the arrival, the key, the record player, the pictures), then the
  rest of the story. See `PROGRESS.md` for exactly where the build is and `PLAN.md` for the roadmap.

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
