# Research: the Voyager record cover and its pulsar map

_Planning research, 2026-10-15. Primary sources read: Sagan, Salzman Sagan and Drake (1972); NASA's
cover page and NASA's labelled explanation diagram. Re-analyses read: Johnston, Russel, OEIS A350136,
Weisberg and Paglen (2012), the 2026 Smithsonian update. Binary strings were checked two ways: by
pixel-scanning the 2215 x 2215 NASA photo GPN-2000-001978 (record-playing and picture numbers) and by
parsing the Wikimedia Pioneer plaque SVG (all 14 pulsar lines). Modern pulsar values: ATNF v2.9.0,
queried 2026-10-15. [OWN] marks the research agent's own measurement or calculation. Source keys are
at the end. Derived data and scripts: `docs/research/data/cover/`._

**Units.** Hydrogen line f = 1,420,405,751.768 Hz [WP12, RUS]. One time unit t_H = 1/f = 0.70402418
ns, and c x t_H = 21.106 cm [OWN]. Sagan et al. converted with 1.420405752e9 per second [SSD72].
NASA rounds the unit to "0.70 billionths of a second" [NASA-cover].

**Binary notation.** A 1 is a short bar drawn perpendicular to the direction of writing; a 0 is a short
dash drawn parallel to it. NASA's diagram legend: a vertical bar "= BINARY 1", a horizontal dash
"= BINARY 0" [NASA-diagram].

## 1. Cover elements

### 1a. Hydrogen diagram (bottom right)

- **Drawn:** two circles joined by a horizontal line, with a short vertical tick (binary 1) under the
  middle of the line [NASA-cover; OWN photo]. Each circle holds two vertical "line plus dot" symbols:
  one at the centre (proton), one crossing the top of the circle (electron). NASA's diagram: these
  lines "indicate the spin moments of the proton and electron" [NASA-diagram].
  - Left atom: electron and proton symbols point opposite ways (antiparallel).
  - Right atom: both point the same way (parallel).
  - The symbol is identical on Pioneer and Voyager [OWN].
- **Designers' explanation (Pioneer):** "A transition from antiparallel nuclear and electronic spins
  to parallel nuclear and electronic spins is shown above the binary digit 1". The message "does not
  specify whether this is a unit of length (21 cm) or a unit of time [(1420 MHz)^-1]" [SSD72]. On
  Pioneer the woman's height (binary 8, so 8 x 21 cm = 168 cm) resolves it [SSD72, WP-PP].
- **Voyager usage:** the transition time is "the fundamental time scale, both for the time given on the
  cover and in the decoded pictures" [NASA-cover]. No Voyager cover element uses the 21 cm length.
  Game note: reading the cover's numbers as lengths gives absurd sizes; reading them as times works.
- **Physics caveat:** the lower hyperfine state has antiparallel spins and the upper state parallel, so
  the drawn direction (antiparallel to parallel) is absorption; 21 cm emission is the reverse. The
  period is the same either way.

### 1b. Record-playing diagrams (top left)

All three numbers verified on GPN-2000-001978 by pixel scanning [OWN]; they match two independent
transcriptions [DACK, CED].

| Element | Etched binary | Bits | Decimal (t_H) | Time |
|---|---|---|---|---|
| Around the plan view of the record, read counter-clockwise starting from the mark next to the cartridge [CED; OWN] | `100110000110010000000000000000000` | 33 | 5,113,380,864 (= 9753 x 2^19) | 3.59994 s |
| Side view, written in 5 rows (9/10/10/10/4 digits) between two tall bars | `1000010110000000000000000000000000000000000` | 43 | 4,587,025,072,128 (= 267 x 2^34) | 3229.4 s = 53.82 min |

- Rotation: NASA states 3.6 s [NASA-cover], which is 16 2/3 rpm [WP-VGR]. The etched value is 3.6 s
  (5,113,460,706.4 t_H) truncated to 16 significant bits [OWN].
- Play time: NASA says "about an hour" [NASA-cover] and "~1 hour" on its diagram [NASA-diagram];
  Wikipedia says "between 53 and 54 minutes" [WP-VGR], which the binary confirms.
- Stylus and cartridge: the cartridge sits on the outer rim in the plan view and above the right end of
  the record in the side view. NASA: "The stylus is in the correct position to play the record from
  the beginning ... played from the outside in" [NASA-cover]. The diagram adds "cartridge with
  stylus ... (furnished on spacecraft)" [NASA-diagram].
- **No arrow shows the direction of rotation** [OWN]. (Game: the groove spiral decides it.)
- The diagram is engraved on both the inner and outer surfaces of the cover, "as the outer diagram will
  be eroded in time" [GPN caption].

### 1c. Picture-reconstruction diagrams (top right)

- **Start-of-picture waveform:** a burst of 8 triangular peaks, a step down to a plateau, a drop to
  the sync level, then three picture lines [OWN count; NASA-cover].
- **Line labels** above the three lines: 1, 10, 11 in binary [NASA-cover; BARRY].
- **Line duration** under line 1, between two tall bars, in 3 rows (12/8/4 digits):
  `101101001100000000000000` = 24 bits = 11,845,632 t_H (= 723 x 2^14) = **8.3396 ms** [DACK, CED,
  BARRY; verified OWN]. NASA rounds to "about 8 milliseconds" [NASA-cover]. Barry measured about 3,200
  samples per trace at 384 kHz (about 8.3 ms) [BARRY].
- **Scan diagram** (labelled "SCAN TRIGGERING" [NASA-diagram]): a sawtooth of three slow descending
  strokes (top-to-bottom scans) and fast retraces, labelled 1, 10, 11. Each stroke carries two small
  circles; the middle stroke's circles sit lower (staggered) [OWN]. NASA: lines "drawn vertically,
  with staggered 'interlace'" [NASA-cover].
- **Raster:** a rectangle of vertical scan lines. Above the last line, a number in vertical notation
  (a horizontal bar plus 9 vertical dashes in columns of 5 and 4) reads `1000000000` = 512 [CED, DACK;
  NASA-cover "512 vertical lines"; OWN].
  - Disputed: a small two-row label above the first lines. The research agent read it as 1, 10, 11
    (lines 1 to 3); CED Magic reads `10000` = 16 and calls it "16 grey levels" [CED]. No official
    source explains it.
- **Calibration picture:** a frame with a centred circle; the circle ensures "the correct ratio of
  horizontal to vertical" [NASA-cover]. On the photo the frame is about 292.5 x 215 px (aspect about
  1.36) and the circle about 138 x 137 px [OWN]. Barry found the frame about 4:3 [BARRY].

### 1d. Pulsar map (bottom left)

From the primary source [SSD72] unless marked:
- **Lines:** fifteen from the origin (the Sun): 14 pulsars plus "one additional object which is the
  most distant" (the galactic centre).
- **Coordinates:** "(r, theta) coordinates are given in the usual polar projection". Distances were
  "obtained by us from the observed dispersion measures".
- **Line length = in-plane distance** r = d cos b [OWN: tick-derived latitudes match the true |b|, for
  example B1642-03 25.5 vs 26.1 deg, B0823+26 31.2 vs 31.7, B0525+21 6.9 vs 6.9; a true-distance
  reading would give 23.7 and 27.7 for the first two].
- **Tick marks:** "the z coordinate normal to the galactic plane, with the distances measured from the
  far end of the line", so |z| is the distance from the outer end of the solid line back to the tick.
  The ticks were meant to be asymmetric to show the sign of z, but "this convention was inadvertently
  breached": **the sign of z is not encoded.** In the vector trace each pulsar tick is the same size as
  a binary 1 (11 units); it is told apart only because it lies on the solid segment [OWN].
- **Galactic-centre line:** the long line to the right, with no period, is "the distance to the
  galactic center". Its tick is "precisely at its end" (z = 0); in the vector trace that end tick is
  about twice as long as a binary bar [OWN].
- **Broken lines:** "Those radial lines for which the earth-pulsar distance is not accurately known are
  shown with breaks." In the Pioneer trace 11 lines have a gap at about 0.024 to 0.032 R0 from the
  origin and B1451-68 one at 0.010 to 0.015. **Only the Crab line is continuous.** B0950+08 and
  B1929+10 end before that radius [OWN].
- **Orientation:** mirror ambiguity (seen from the north or south galactic pole) resolves once one
  pulsar is identified [SSD72]. The angle measured counter-clockwise from the centre line equals
  galactic longitude on both Pioneer and Voyager [OWN].
- **Periods:** binary integers of 26 to 33 bits in t_H units [OEIS], 8 to 10 decimal digits; "almost
  all ... accurate to nine significant figures". Every number starts with 1, which marks the most
  significant end: the most significant bit is nearest the origin and digits read outward. Digits begin
  just beyond the end of the solid segment [OWN; RUS]. Exception: B1240-64's digits run alongside the
  outer part of its own line, on both Pioneer and Voyager [OWN]. Trailing zeros for 1240 and 1727 mean
  "we have given a precision greater than we now have".
- **Verification [OWN]:** decoding the SVG reproduces all 14 strings exactly as Johnston transcribed
  them from the Voyager diagram in Murmurs of Earth p. 58 [JOH]; they equal the Table 1 integers
  [SSD72]. No engraving errors found.
- **Scale:** R0 is not stated. If the centre line is 10 kpc (the 1964 IAU value), the Crab sits at 1.95
  kpc, matching the then-standard 2 kpc. Inference, not documented.

### 1e. Uranium-238 spot

- NASA: ultra-pure U-238 "electroplated onto the record's cover", about 0.00026 microcurie on a
  "two-centimeter diameter area" [NASA-cover]. That is about 9.6 Bq, about 0.77 mg [OWN].
- Half-life: NASA's cover page says 4.51 Gyr [NASA-cover]; NASA's making-of page and the modern value
  say 4.468 Gyr [NASA-making].
- **The spot is not drawn, labelled or explained on the cover diagram** [NASA-diagram; OWN]. No source
  gives its position and it is not identifiable in the 1977 photo. (Game: the player finds it with
  instruments; its position is our documented choice.)
- Pioneer's designers had rejected radioactive time markers because of "interference with the Pioneer
  radiation detectors" [SSD72].

### 1f. Pioneer versus Voyager maps

- **Same:** the 14 pulsars and the same 1970/71-epoch binary periods (not updated for 1977) [JOH,
  SSD72; OWN]; the same breaks, ticks and B1240-64 digit placement; longitude counter-clockwise on both.
- **Different:** Pioneer's centre line runs behind the spacecraft and figures; Voyager's is
  unobstructed and ends near the hydrogen diagram. Pioneer puts the hydrogen symbol top left, Voyager
  bottom right.
- **Line lengths** measured on the Voyager photo against the Pioneer trace agree within 2 to 6% (B1727-47
  0.295 vs 0.301; B1240-64 0.548 vs 0.562; B1933+16 0.382 vs 0.406). Measurement error or genuinely
  different artwork: unresolved.

## 2. The 14 pulsars

Counter-clockwise map order (increasing longitude; OEIS order); Johnston's clockwise number in
brackets. Binary [JOH, verified OWN]; N [OEIS, SSD72]; P decoded = N x t_H [OWN]; P 1970/71 [SSD72
Table 1]; modern P and Pdot [ATNF v2.9.0]. Geometry from the Pioneer SVG [OWN]; r and z as fractions of
the centre-line length R0; "n.r." = tick too close to resolve. Spin-down epoch = linear back-extrapolation
[OWN].

| # (J#) | 1972 label, B1950 / J2000 | Binary (MSB nearest origin) | N (t_H) | P map (s) | P 1970/71 (s) |
|---|---|---|---|---|---|
| 1 (14) | 1642, B1642-03 / J1645-0317 | `100000110100101010001110101100` | 550,675,372 | 0.3876887793 | 0.3876887790 |
| 2 (13) | 1929, B1929+10 / J1932+1059 | `10011001011010111010010111000` | 321,746,104 | 0.2265170382 | 0.2265170380 |
| 3 (12) | 1933, B1933+16 / J1935+1616 | `11110010111110001110100011110` | 509,549,854 | 0.3587354200 | 0.3587354200 |
| 4 (11) | 2016, B2016+28 / J2018+2839 | `101111001111001110011000001101` | 792,520,205 | 0.5579533904 | 0.5579533900 |
| 5 (10) | 2217, B2217+47 / J2219+4754 | `101101100101101001000010110001` | 764,842,161 | 0.5384673781 | 0.5384673780 |
| 6 (9) | 0328, B0329+54 / J0332+5434 | `111100011111100011111000010110` | 1,014,906,390 | 0.7145186428 | 0.7145186424 |
| 7 (8) | 0525, B0525+21 / J0528+2200 | `100111101000110101000100111000100` | 5,320,116,676 | 3.7454908003 | 3.745490800 |
| 8 (7) | 0531, B0531+21 Crab / J0534+2200 | `10110011100000101010000010` | 47,057,538 | 0.0331296448 | 0.03312964500 |
| 9 (6) | 0823, B0823+26 / J0826+2637 | `101100111011010101011110001011` | 753,751,947 | 0.5306595992 | 0.5306595990 |
| 10 (5) | 0950, B0950+08 / J0953+0755 | `10101011011001101100101000011` | 359,455,043 | 0.2530650432 | 0.2530650432 |
| 11 (4) | 0833, B0833-45 Vela / J0835-4510 | `111100011011011001010100111` | 126,726,823 | 0.0892187481 | 0.08921874790 |
| 12 (3) | 1240, B1240-64 / J1243-6423 | `100000110110010110001001111000` | 551,117,432 | 0.3880000002 | 0.3880000000 |
| 13 (2) | 1451, B1451-68 / J1456-6843 | `10110010011000101011101101111` | 374,101,871 | 0.2633767644 | 0.2633767640 |
| 14 (1) | 1727, B1727-47 / J1731-4744 | `1000110001111100100011011101010` | 1,178,486,506 | 0.8296830005 | 0.8296830000 |

| # | Pulsar | Map angle / true l (deg) | r/R0 (kpc if R0 = 10) | z/R0 from tick | b from tick / true \|b\| (deg) | Modern P0 (s) at epoch; Pdot | Spin-down epoch | Modern dist (kpc) |
|---|---|---|---|---|---|---|---|---|
| 1 | B1642-03 | 14.1 / 14.1 | 0.0785 (0.79) | 0.0374 | 25.5 / 26.1 | 0.3876916863 @2021.5; 1.78e-15 | 1969.8 | 4.0 (DM model 1.3) |
| 2 | B1929+10 | 48.0 / 47.4 | 0.0101 (0.10) | n.r. | - / 3.9 | 0.2265189266 @2021.5; 1.16e-15 | 1969.8 | 0.31 |
| 3 | B1933+16 | 52.9 / 52.4 | 0.4060 (4.06) | 0.0143 | 2.0 / 2.1 | 0.3587451402 @2021.5; 6.00e-15 | 1970.2 | 3.7 |
| 4 | B2016+28 | 68.8 / 68.1 | 0.0377 (0.38) | 0.0052 (doubtful) | 7.9 / 4.0 | 0.5579534804 @1985.9; 1.48e-16 | 1966.6 | 0.98 |
| 5 | B2217+47 | 98.1 / 98.4 | 0.1108 (1.11) | 0.0130 | 6.7 / 7.6 | 0.5384688219 @1986.5; 2.77e-15 | 1969.9 | 2.38 |
| 6 | B0329+54 | 144.8 / 145.0 | 0.0681 (0.68) | 0.0020 | 1.7 / 1.2 | 0.7145196997 @1986.1; 2.05e-15 | 1969.8 | 1.68 |
| 7 | B0525+21 | 182.5 / 183.9 | 0.1240 (1.24) | 0.0150 | 6.9 / 6.9 | 3.7455392503 @2007.3; 4.01e-14 | 1968.9 | 1.22 |
| 8 | Crab (unbroken line) | 185.5 / 184.6 | 0.1948 (1.95) | 0.0191 | 5.6 / 5.8 | 0.0333924123 @1991.5; 4.21e-13 | 1971.7 | 2.0 |
| 9 | B0823+26 | 198.3 / 197.0 | 0.0410 (0.41) | 0.0248 | 31.2 / 31.7 | 0.5306605117 @1986.1; 1.71e-15 | 1969.1 | 0.50 |
| 10 | B0950+08 | 230.8 / 228.9 | 0.0078 (0.08) | n.r. | - / 43.7 | 0.2530654278 @2021.5; 2.30e-16 | 1968.5 | 0.26 |
| 11 | Vela | 264.8 / 263.6 | 0.1629 (1.63) | 0.0103 | 3.6 / 2.8 | 0.0893283850 @2000.0; 1.25e-13 | 1972.2 (glitches) | 0.28 |
| 12 | B1240-64 | 301.6 / 302.1 | 0.5622 (5.62) | 0.0092 | 0.9 / 1.5 | 0.3884851271 @2016.6; 4.49e-15 | -1403 | 2.0 (DM model 9.4) |
| 13 | B1451-68 | 311.2 / 313.9 | 0.0206 (0.21) | 0.0025 | 6.9 / 8.5 | 0.2633769267 @2021.5; 9.9e-17 | 1969.5 | 0.43 |
| 14 | B1727-47 | 342.8 / 342.6 | 0.3010 (3.01) | 0.0343 | 6.5 / 7.7 | 0.8299456122 @2021.5; 1.64e-13 | 1970.7 | 0.7 (DM model 5.5) |

**Directions are good, distances are not.** Every map angle is within about 0.2 to 2.7 deg of true
galactic longitude. Map distances disagree badly with modern ones (Vela 1.63 kpc on the map vs 0.28
now; B1727-47 3.0 vs 0.7). Johnston: "direction information is somewhat helpful, but the distance
information is not" [JOH].

### Errors and disputes

- **No identification is disputed.** Johnston matched all 14 against Taylor and Manchester (1975) and
  the 2002 ATNF catalogue [JOH]. In one or two cases period alone was ambiguous and direction decided
  it (B1240-64's 0.388 s sits close to B1642-03's 0.3877 s).
- **The real error: B1240-64.** Its period was "known to only three significant decimal digits: 0.388
  second" but is written to 30 bits [WP-PP, SSD72], 1233 ppm off the 1975 value [JOH], so its spin-down
  epoch is absurd [OWN].
- **Other mismatches against Taylor and Manchester 1975** [JOH]: Crab 969 ppm, Vela 106 ppm, B1727-47
  19 ppm, all others at most 0.4 ppm.
- **Errors in the re-analyses** [OWN]:
  - Johnston's text discards J1645-0317 as discordant, but his Table 5 swaps rows 3 and 14: the
    discordant pulsar is really J1243-6423 (OEIS noted the swap) [OEIS].
  - Johnston's distance column (centre line = 100) matches origin-to-tick (r - |z|), not line length.
  - **Johnston's "ATNF angle" column is the 3D angle from the galactic-centre direction, not
    longitude.** This is why a later summary reported angle errors of 11 to 18 deg for the
    high-latitude pulsars B0950+08, B0823+26 and B1642-03. Measured as longitudes, the map's angles
    are good to about 3 deg (table above).
  - Russel says pulsars 7 and 8 are "reversed" [RUS]; that depends on the catalogue distance used. With
    ATNF 2.9.0 (B0525+21 at 1.22 kpc, Crab at 2.0) the map's order is consistent, and in longitude the
    order is correct.
  - National Geographic's "out to 12 digits" [NG17] is wrong: the numbers are 26 to 33 bits.

## 3. Digitizations, triangulation and dating (prior work)

- **Sagan et al. 1972 (design claims):** if either nearby pulsar (B0950+08 or B1929+10) is identified,
  the Sun is placed to about 20 pc, "1 in 10^3 stars"; the epoch is recoverable "to the equivalent of
  the year 1971" with pulsar records, or "to the nearest century or millennium" without glitch records
  [SSD72].
- **Johnston (2003, updated 2007):** angles and lengths read from Murmurs of Earth p. 58. Spin-down
  dating 1969.7 plus or minus 1.2 from 13 pulsars. Location "within tens of light years or less" if
  pulsar motion and light-travel time are modelled [JOH].
- **Russel (Deep Space Exploration Society, about 2019-2020):** scaled distance errors exceed 220%,
  though three pulsars came within 3%; with angles only, the Sun's galactic Y position comes out within
  4% [RUS].
- **This research [OWN]:** full digitization from the Pioneer vector SVG (tables above;
  `data/cover/pioneer_svg_lines.json`). Spin-down with ATNF 2.9.0, excluding B1240-64: mean 1969.75,
  s.d. 1.41, median 1969.8. Crab alone 1971.7. **An alien dating the Voyager cover gets about 1970 (the
  measurement epoch of the Pioneer data), not 1977.**
- **Andrew Johnston (Adler, formerly the Smithsonian), 2026:** recomputed the binary periods for a 2026
  epoch for the Air and Space Museum floor map; positions unchanged [NASM].
- **Related designs:** Ransom and Drake (2020) proposed a millisecond-pulsar replacement [NG20];
  Weisberg and Paglen (2012, AJ 144, 118) used 13 millisecond pulsars on EchoStar XVI with periods
  truncated to their significant bits and gave the dating equation [WP12]; an updated map with Matlab
  code by Reddit user hayburg [KOB].

## 4. Image sources for the cover

| Item | Resolution / type | URL |
|---|---|---|
| Cover photo, JPL "p24652b", NASA GPN-2000-001978 (1977) | 2215 x 2215 JPG, public domain | https://commons.wikimedia.org/wiki/File:The_Sounds_of_Earth_Record_Cover_-_GPN-2000-001978.jpg |
| Same photo, NASA on The Commons scan | 2384 x 2992 JPG | https://commons.wikimedia.org/wiki/File:The_Sounds_of_Earth_Record_Cover_(9460968490).jpg |
| NASA cover photo | 2389 x 2389 JPG | https://science.nasa.gov/wp-content/uploads/2024/03/voyager-record-cover-446eb9.jpg |
| NASA "Explanation of Recording Cover Diagram" | 2000 x 1533 JPG | https://science.nasa.gov/wp-content/uploads/2024/04/cover-diagram-large.jpg |
| Vector explanation diagram (NASA/JPL) | SVG | https://commons.wikimedia.org/wiki/File:Voyager_Golden_Record_Cover_Explanation.svg |
| Vector traces of the cover (Gonzalez Montofre 2009, 2024 derivatives); accuracy unverified | SVG | https://commons.wikimedia.org/wiki/File:Voyager_plaque.svg (also Voyager_golden_plaque.svg, Voyager_plaque_transparent.svg) |
| Pioneer plaque vector (Mysid 2006), used for the digitization | SVG 3063 x 2427 | https://commons.wikimedia.org/wiki/File:Pioneer_plaque.svg |
| Cover etching photos, 28 Jul 1977 | about 2335 x 2170 JPG | https://commons.wikimedia.org/wiki/File:Voyager-golden-record-etching-7-28-77_30548567140_o.jpg |
| PIA21741 "Preparing the Golden Record" | 1760 x 2227 | https://images.nasa.gov/details/PIA21741 |

GPN-2000-001976 is the record disc itself, not the cover.

**Plan for the in-game cover and the print plate:** rebuild an exact SVG from GPN-2000-001978 (layout,
record and picture diagrams, hydrogen) plus the Pioneer vector map geometry (same pulsars and periods),
with every binary string generated from `cover.json` and checked against the tables above.

## Sources

- [NASA-cover] https://science.nasa.gov/mission/voyager/golden-record-cover/
- [NASA-diagram] https://science.nasa.gov/wp-content/uploads/2024/04/cover-diagram-large.jpg
- [NASA-making] https://science.nasa.gov/mission/voyager/making-of-the-golden-record/
- [SSD72] https://doi.org/10.1126/science.175.4024.881 (scan: https://astro.swarthmore.edu/astro61_spring2014/papers/sagan_science_1972.pdf)
- [JOH] https://www.johnstonsarchive.net/astro/pulsarmap.html (archive: https://web.archive.org/web/20260413143708/https://www.johnstonsarchive.net/astro/pulsarmap.html)
- [OEIS] https://oeis.org/A350136
- [RUS] https://dses.science/wp-content/uploads/2020/04/18-Galactic-Navigation-using-the-Pioneer-Spacecraft-Pulsar-Map.pdf
- [WP-PP] https://en.wikipedia.org/wiki/Pioneer_plaque
- [WP-VGR] https://en.wikipedia.org/wiki/Voyager_Golden_Record
- [DACK] https://carterdack.com/Voyager/Voyager1Decoding.html
- [CED] http://cedmagic.com/featured/voyager/voyager-record.html
- [BARRY] https://boingboing.net/2017/09/05/how-to-decode-the-images-on-th.html
- [ATNF] https://www.atnf.csiro.au/research/pulsar/psrcat/ (v2.9.0, queried 2026-10-15)
- [NASM] https://airandspace.si.edu/stories/editorial/recalculating-pulsar-map-21st-century
- [NG20] https://www.nationalgeographic.com/magazine/article/nasa-sent-a-map-to-space-to-help-aliens-find-earth-now-it-needs-an-update
- [NG17] https://www.nationalgeographic.com/science/article/map-aliens-find-earth-voyager-40-pulsars-space-science
- [WP12] https://arxiv.org/abs/1208.4637
- [KOB] https://briankoberlein.com/post/you-are-here/
- [GPN] the Commons GPN-2000-001978 page above

## Could not confirm

1. Where the uranium-238 spot sits on the cover (no source; not visible in the 1977 photo).
2. Murmurs of Earth (1978) text: Archive.org's copy is lending-only.
3. The galactic-centre distance Drake used (10 kpc inferred from the Crab line).
4. The small raster label (1/10/11 or 10000 = 16).
5. Whether the Voyager map artwork is an exact copy of Pioneer's (line ratios differ by 2 to 6% in
   photo measurements).
6. Breaks and z-ticks per line on Voyager come from the Pioneer trace only; B2016+28's tick looks like a
   trace artifact.
7. Rotation sense: no arrow found.
8. NASA's 0.00026 microcurie figure has no engineering primary source.
