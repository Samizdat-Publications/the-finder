# The record and the turntable (`src/record/`)

The record as a physical object, and a turntable that plays the real record the way a real one would,
including every meaningful wrong result. Chapter 5 of the plan ("The Player"); How it's checked item 9.

| File | What it does, in plain words |
|---|---|
| `timeline.ts` | Pure. Reads `data/record.json` and lays each side's tracks end to end: what plays at any moment of a side, and how long each side lasts (side 1 3,684.31 s, side 2 3,467.41 s). |
| `groove.ts` | Pure. The groove as a spiral: needle radius to moment and back. One turn every 3.59994 s (the cover's etched number, read through `src/science/units.ts`), played from the outside in, music between 146.05 mm and 60.3 mm. Outside that: a short silent lead-in, the smooth rim, and the locked run-out groove. |
| `engine.ts` | Browser (Web Audio). `Turntable`: `load(side, onProgress)`, `dropNeedle(radiusMm)`, `setSpeed(turnsPerSecond)`, `setDirection('cw' or 'ccw')`, `lift()`, `state()`, and the events `position`, `itemchange`, `runout`. `startVoice` is its node-graph builder. Holds no game state; the command bus calls it. |
| `sounds.ts` | Browser. Synthesized stylus sounds from seeded random streams: the drop (thump and click), a light surface crackle (one turn long, so it repeats every turn), the run-out click. |
| `../media/audio.ts` | Browser. Fetches each track whole (the host ignores Range requests) with progress, checks its SHA-256 against `record.json`, decodes it in the page's AudioContext, caches decoded and reversed copies within a memory budget. |

## The model

- **Speed.** The true speed is one turn per T = 3.59994 s (16 2/3 rpm). A turntable set to s turns per
  second plays at k = s x T. The buffer source's `playbackRate` is k, which scales tempo and pitch
  together, exactly like a real disc.
- **Direction.** Clockwise seen from above plays the record: the groove is cut so a clockwise disc
  carries the stylus inward along the spiral, the standard for every record. The cover has no arrow;
  the player reads it from the spiral under the microscope. Counter-clockwise drags the stylus back out
  and plays the music backward, from a reversed copy of the buffer at the mirrored offset (negative
  `playbackRate` is not supported by browsers).
- **Where the needle lands.** Music band: radius maps linearly to time. Lead-in (3 turns at 1 mm per
  turn outside 146.05 mm): silent groove, then the music starts on time. Outside that, the smooth rim:
  nothing. Inside 60.3 mm: the locked run-out groove, one click every turn (every T / k seconds),
  the first one turn after the needle locks.
- **Timing.** All audio is scheduled on the AudioContext clock; crossing a track boundary starts the next
  track's buffer at the exact boundary time. A 50 ms interval (live pages only) reports the position
  and keeps about 4 s of audio scheduled ahead; it never times audio itself.

## Numbers that come out of it

| Side | Music | Turns | Groove pitch |
|---|---|---|---|
| 1 | 3,684.31 s (61.4 min) | 1,023.44 | 83.79 um |
| 2 | 3,467.41 s (57.8 min) | 963.19 | 89.03 um |

## Assumptions (record these in How it's checked)

- **Groove radii are standard values, not Voyager's.** 146.05 mm and 60.3 mm are the 12-inch disc
  recording standard (IEC 60098 / RIAA). The Voyager record's real radii are not documented, so the
  pitch is a model, not a measurement.
- **Both sides run longer than the cover's 53.8 minutes** (the real files plus the inferred side break,
  D-A17), so the groove pitch is fitted to each side's real duration.
- **Lead-in length and pitch, stylus sound shapes and levels** are modelling or taste choices.

## How the tests prove it

- `record.test.ts` (Node): each side lasts exactly the sum of its tracks; every track starts where it
  should; radius and time invert each other within 1e-9; the music spans exactly 146.05 to 60.3 mm;
  turns per side equal side duration / T. Ids `record.timeline`, `record.groove`.
- `tests/browser/turntable.browser.mjs` (real Chrome, `OfflineAudioContext`, the engine itself):
  a 1,000 Hz tone at speed ratios 0.5 to 2 comes out at 1,000 x k Hz within 0.1% and lasts 2 s / k
  within one 128-frame render quantum (`turntable.pitch`); a rising chirp played counter-clockwise
  matches the time-reversed chirp across a track boundary (`turntable.direction`); the needle dropped at
  Johnny B. Goode's radius plays the decoded track file from its start, at k = 1 and 1.03
  (`turntable.record`); a needle inside 60.3 mm clicks every T / k (`turntable.runout`).
