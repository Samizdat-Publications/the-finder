# The Voices: what the record's sound can honestly tell

Researched 2026-10-16 by the `scout` agent for M5 (`docs/plans/M5.md`), with its own measurements on the
Ozma rips already in `sources/` (`ozma-cd-02`, `ozma-cd-03`, read only; the scratch scripts were not kept
in the repo). Every number below that the game will show must be re-measured by the game's own tested
code (rule 3); these are the targets and the honest limits.

## 1. The greetings

- **Count:** NASA states "fifty-five languages", beginning with Akkadian and ending with Wu
  (https://science.nasa.gov/mission/voyager/golden-record-contents/, read 2026-10-16). Wikipedia's table
  (https://en.wikipedia.org/wiki/Contents_of_the_Voyager_Golden_Record) gives a different order (Sumerian
  first, English last, Wu at 33) and is an unsourced compilation. Which order is the flown record's is
  UNVERIFIED; the game should not depend on the order.
- **Lengths:** the Ozma greetings track (02) is 226.013 s; Wikipedia's start times run to 4:18, matching
  NASA's SoundCloud set (4:20), so they cannot be used as onsets for the Ozma file (why the lengths differ
  is UNVERIFIED). Waldheim is a separate track (Ozma 01, 43.707 s, English); the UN greetings with the
  whale song are Ozma 03 (244.09 s; internal order and delegates UNVERIFIED).
- **Segmenting by silence does not give 55.** Silent runs in Ozma 02 (10 ms RMS frames) by threshold and
  minimum gap:

  | Threshold | min gap 0.15 s | 0.25 s | 0.4 s |
  |---|---|---|---|
  | -50 dBFS | 66 | 34 | 7 |
  | -45 dBFS | 105 | 72 | 31 |
  | -40 dBFS | 115 | 93 | 51 |
  | -35 dBFS | 130 | 100 | 66 |

  Gaps between greetings are typically 0.2 to 0.5 s; several greetings hold internal pauses of 0.4 to
  1.4 s; the track ends with a 3.2 s tail. **Consequence for the game:** the honest deduction is "many
  separate voices, a few dozen at least" (a count with a computed range over reasonable settings), not
  "exactly 55". An exact count needs a hand-made onset list per file as test ground truth, with a
  tolerance.

## 2. The Sounds of Earth

Wikipedia lists 21 items (Ozma track 04 is 12:19): Music of the Spheres (Laurie Spiegel's realization of
Kepler's Harmonices Mundi); volcanoes, earthquake, thunder; mud pots; wind, rain, surf; crickets, frogs;
birds, hyena, elephant, whale; chimpanzee; wind; wild dog; heartbeat, footsteps, laughter; the first
tools; tame dog; herding sheep, blacksmith, sawing; tractor, riveter; Morse code, ship's horn; horse and
cart; train; tractor, bus, automobile; F-111 flyby, Saturn V; kiss, mother and child; life signs, pulsar.
The arc: the planets' motion, the young Earth (geology, weather), animals, people and their tools,
machines, and a human close. NASA's sounds page has no list. The Murmurs of Earth wording of the intended
arc is UNVERIFIED (the book is lending-only). Wikipedia reports the Morse code reads "per aspera ad astra"
(cite as Wikipedia).

## 3. The band of the recorded sound

- The record was cut at 16 2/3 rpm (NASA contents page). No published audio bandwidth for the record or
  the reissue was found (UNVERIFIED, including the "20 Hz to 15 kHz" in an earlier draft of M5.md).
- Measured (long-term Welch spectrum over 13 Ozma tracks, level relative to the 0.5 to 1.5 kHz band):
  5 to 8 kHz -17 to -39 dB; 10 to 12 kHz -29 to -57 dB; 13 to 15 kHz -31 to -57 dB; 17 to 20 kHz -41 to
  -61 dB; 20 to 22 kHz -51 to -63 dB. A slow, smooth decay, no brick wall; the floor is vinyl and tape
  noise.
- **Honest inference:** most of the energy of their speech and music lies below about 8 kHz and the
  sound is detectable to well over 10 kHz, so they make and care about sounds up to at least several kHz.
  The alien cannot claim the senders' hearing limit: the band is capped by the medium (half-speed cut,
  groove, noise) and by what was chosen. The game states a computed level (for example the frequency
  where the long-term spectrum falls 50 dB below its peak band) as a lower bound.

## 4. Their music and its intervals

- **Steady, near-monophonic material for a pitch tracker:** the Queen of the Night aria (solo soprano, a
  high F6 near 1397 Hz in equal temperament), Bhairavi (voice over a drone; just-intonation fifths), the
  Navajo night chant, Mugam, Liu Shui.
- **Polyphonic pieces** (the Brandenburg Concerto, Gould's Well-Tempered Clavier, the Beethoven Cavatina,
  the Gavotte): a monophonic tracker fails; use a pitch-class histogram (chroma) against 12-tone equal
  temperament lines instead.
- **Methods:** YIN (de Cheveigne and Kawahara 2002, JASA 111(4), 1917-1930, doi:10.1121/1.1458024);
  pYIN (Mauch and Dixon, ICASSP 2014, 659-663, https://qmro.qmul.ac.uk/xmlui/handle/123456789/6040); an
  independent 2019 comparison on singing (arXiv:1912.12609) found YIN lowest in fine pitch error. No
  published cents accuracy is quoted: the game measures its own tracker's error on synthetic tones of
  known pitch (rule 3).
- **Interval targets:** octave 2:1 = 1200 cents; fifth 3:2 = 701.96 cents; equal-tempered step 2^(1/12) =
  100 cents. Scale-step claims hold for the Western pieces only (the Javanese, Indian and Chinese pieces
  use other tunings), so the deduction names its pieces. No tracker has yet been run on the record's
  music: UNVERIFIED until the game's own test does.
- The 1992 CDs run about 2% long (slow dubs); the Ozma transfers are closer to NASA's lengths but still a
  few seconds longer.

## Sources

- NASA, Golden Record contents: https://science.nasa.gov/mission/voyager/golden-record-contents/ and
  /sounds/ (read 2026-10-16).
- Wikipedia, Contents of the Voyager Golden Record (read 2026-10-16; partly truncated; an unsourced
  compilation, used only where marked).
- de Cheveigne and Kawahara 2002 (YIN); Mauch and Dixon 2014 (pYIN); arXiv:1912.12609.
