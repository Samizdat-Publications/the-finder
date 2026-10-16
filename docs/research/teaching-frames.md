# The teaching frames: what the senders wrote, and how to read it

Researched 2026-10-16 for M5 (`docs/plans/M5.md`). The values below are **primary readings of our own
decode of the 1977 tape** (`build/ref/frames/`, the reference decoder of M1; the lead looked at L039 and
L005 and confirms the readings there). No published table of these values was found; Murmurs of Earth
(1978) is lending-only and was not read, so nothing is quoted from Sagan et al. or Lomberg. Every value
the game shows must be read by the game's own tested code from the decoded frame, or checked against
these readings in a test (rule 1, rule 3).

## The frames

**L002, Mathematical definitions (image 3).** A column of dots, one to six, each with its binary form and
"= decimal": binary is most significant bit first, a vertical bar is 1 and a horizontal dash is 0 (the
cover's own convention): 2 = `|-`, 4 = `|--`, 5 = `|-|`, 6 = `||-`, 7 = `|||`, 8 = `|---`, 9 = `|--|`,
10 = `|-|-`. Larger numbers: 12, 24, 100 = 10^2, 1000 = 10^3. Then sums and products: 2 + 3 = 5,
8 + 17 = 25, 1/2 + 1/3 = 5/6, 1/3 + 1/5 = 8/15, 5 + 2/3 = 5 2/3, 2 x 3 = 6, 13 x 28 = 364. Symbols: plus,
equals, times, stacked fractions with a bar, superscript powers. **The senders' own numerals are the
ordinary digits 0 to 9**, taught through dots and the cover's binary.

**L003, Physical unit definitions (image 4).** A spinning-atom picture labelled 1 M (one hydrogen atom's
mass) and a spin-flip picture labelled 1 t (one period of the transition, the cover's unit). Then
1 42/100 x 10^9 t = 1 s (the 1420 MHz line); 86400 s = 1 d; 365 d = 1 y; 6 x 10^23 M = 1 g;
1000 g = 1 kg; 6 x 10^27 g = 1 e (Earth's mass). A sine wave labelled 1 L (the 21 cm line): 1/21 L = 1 cm;
1 L = 21 x 10^8 Angstrom; 10^2 cm = 1 m; 1000 m = 1 km. t, L and M are hydrogen-defined; s, d, y, g,
kg, e, cm, m and km are built from them.

**L004 and L005, Solar System parameters (images 5 and 6).** Rows: the planet drawn as a circle;
diameter (km); distance from the Sun (km); mass (in e); a time in days (d), which by its values is the
rotation period (Earth 1 d, Venus 243 d, Jupiter 41/100 d: an inference, not a published statement).

| Column | Diameter | Distance | Mass (e) | Time (d) |
|---|---|---|---|---|
| Sun | 139 x 10^4 | | 333000 | 25 |
| Mercury | 4840 | 58 x 10^6 | 1/19 | 57 |
| Venus | 12400 | 108 | 82/100 | 243 |
| Earth | 12760 | 150 | 1 | 1 |
| Mars | 6800 | 228 | 11/100 | 1 3/100 |
| Jupiter | 142 x 10^3 | 778 x 10^6 | 318 | 41/100 |
| Saturn | 121 x 10^3 | 1428 | 95 | 43/100 |
| Uranus | 47600 | 2872 | 14 6/10 | 45/100 |
| Neptune | 44600 | 4498 | 17 2/10 | 65/100 |
| Pluto | 1400... (cut) | 591... (cut) | 9/10 | 7/10 |

Distances after the first column of each frame omit the x 10^6. **Earth's column is the column of ones:
the third world is home.** The values are 1977's (Uranus, Neptune and Pluto from the estimates of the
time). **The right edge of our decode cuts the last column** (Pluto's diameter and distance visibly run
off the frame; Mars's 6800 sits at the edge of L004): whether the tape itself carries the rest is
UNVERIFIED and is the first task of M5 step 1's follow-up (register L004 and L005 against NASA's clean
images, tests only, and check the decoder's horizontal extent).

**L001 (image 2):** the pulsar map again, with binary period ticks along each line, beside a photograph
of the Andromeda galaxy.

**L019, Chemical definitions (image 14):** electron-shell atoms for carbon (6), nitrogen (7), oxygen (8),
phosphorus (15) and hydrogen (1), and the T-A and C-G base pairs. NASA's alt text says "sulfur", but the
frame shows 15 electrons: phosphorus. A length bar under hydrogen has an unreadable label (UNVERIFIED).

**L039, Diagram of male and female (image 32):** two silhouettes, both marked 20 y, with scale bars:
**female 155 cm, male 160 cm** (1.55 and 1.60 m; in the hydrogen length unit 7.38 L and 7.62 L). The
lead read these directly from the decoded frame. (An earlier draft of M5.md said 1.7 to 1.8 m: wrong.)

**L050, Diagram of family ages (image 37):** four silhouettes with age and mass: 4 y, 22 1/2 kg;
12 y, 38 1/2 kg; 30 y, 54 1/2 kg; 80 y, 42 1/2 kg. No heights.

Attribution of the drawings (Frank Drake for images 3 to 5; Jon Lomberg for the diagrams generally) is
not settled by the sources found (UNVERIFIED which drew which).

## How a reader with only the cover's key bootstraps the notation

1. The cover: binary with bar = 1 and dash = 0; the hydrogen time unit.
2. L002: match dots to binary to digits for 1 to 10, then read sums, fractions and powers.
3. L003: 1 t is the cover's hydrogen period; the cover's 0.704 ns gives 1.42 x 10^9 t = 1 s, so t checks.
4. The 21 cm line gives L, then cm, m and km; the hydrogen mass gives g and kg; then d and y.
5. L004 and L005: read the planets with those units; the column of ones is home.
6. L039 and L050: heights and masses in cm, kg and y.

## Colour order

Documented only in outline: Wikipedia (quoting cover text NASA no longer shows) says colour pictures are
"three images in sequence, one each for red, green, and blue", with a solar-spectrum colour image as
calibration. That implies, but does not state, red then green then blue. Barry's `voyager.cpp`
hard-codes R, G, B without saying why; amazing-rando's README says B, G, R (disputed). Our solar spectrum
frame (L008) is nearly featureless, as gourneau also found. Outsider evidence from mean brightness of
the unnormalised decoded triples fits R, G, B (autumn leaves 141/120/118 and sunset 94/67/77 brightest
first; underwater 83/98/109 and fish 69/95/104 brightest third), but per-frame gain is not normalised,
so it is weak. The game shows the order as "probable" (D-A08) and should derive its evidence in code.

## Orientation

Ron Barry's table is a hand-made array `orientation[2][78]` in `voyager.cpp`
(github.com/foodini/voyager, 2017) with no stated method; from our reading of his code (`barry.py`):
0 unchanged, 1 the native frame turned 90 degrees clockwise, 2 turned 90 degrees anticlockwise (his
comments contradict each other; use the code). The record does not encode "up"; gourneau found a blind
detector recovered only 1 of 66 turned frames, and 14 published reproductions are mirrored. For L039
(value 1) the clockwise turn puts "20 y" upright and runs "155 cm" along the figure's height. The game's
"down" deduction is a judgement by the player (people stand, water lies flat) checked against this table.

## Sources

- Our decode: `build/ref/frames/` (M1 reference decoder; `docs/research/images-and-audio.md`).
- NASA, Images on the Golden Record (alt texts): https://science.nasa.gov/gallery/images-on-the-golden-record/
  and https://science.nasa.gov/image-detail/physical-unit-definitions-30554003853-o (updated 2024-04-10).
- Wikipedia: Contents of the Voyager Golden Record; Voyager Golden Record (read 2026-10-16).
- Barry: https://raw.githubusercontent.com/foodini/voyager/master/voyager.cpp ; gourneau:
  https://github.com/gourneau/golden-record-images (ALIENS.md); https://basv53.uni.lu/projects/07_voyager_decoder.html ;
  Frontiers in Human Dynamics 2021, doi:10.3389/fhumd.2021.714616.
