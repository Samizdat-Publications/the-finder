# Research: pulsar spin-down and radioactive clocks

_Planning research, 2026-10-15. All ATNF values come from catalogue v2.9.0, queried 2026-10-15. "my
calc" marks the research agent's own computations; its scripts and raw outputs are in
`docs/research/data/clocks/` (`q14.txt` and `q14.json` are the raw ATNF output; `dating.py`,
`spindown.py`, `invert.py`, `final_tables.py`, `radio.py` the calculations). Source keys are at the
end._

> **Correction from the cover research (`cover.md`):** this report's original identification notes
> repeated two claims from older re-analyses, that the map's angles to B0950+08, B0823+26 and B1642-03
> are off by 11 to 18 deg and that the Crab and B0525+21 are drawn in swapped order. Both are wrong:
> the 11 to 18 deg figures compare a 3D angle with the map's flat longitude, and the swap depends on
> which catalogue distances are used. Measured as galactic longitudes, every map angle is within about
> 3 deg. They are removed below.

> **Story epoch:** the 40,055-year tables in section 3b are illustrative. The game uses Voyager 1 found
> about 44,000 years after its 1977 launch (about 44,006 years after the 1971 map epoch); the science
> core recomputes everything for the configured epoch.

## 1. ATNF Pulsar Catalogue (psrcat)

- **Version:** 2.9.0, released 2026/10/06, 4,503 pulsars (previous 2.8.1, 2026/06/18, 4,393) [ATNF-H].
- **Offline copy:** `https://www.atnf.csiro.au/research/pulsar/psrcat/downloads/psrcat_pkg.tar.gz`
  (1,249,005 bytes, Last-Modified 2026-10-07, HEAD-checked). Frozen copy of a version:
  `.../downloads/psrcat_pkg.v2.9.0.tar.gz` [ATNF-D]. It unpacks to `psrcat_tar/` with the C source and
  `psrcat.db`.
- **`psrcat.db` format:** plain ASCII, one parameter per line, `KEYWORD value [uncertainty]
  [ref-code]`; uncertainties in units of the last quoted digit; each pulsar ends with a line starting
  with `@`; lines starting with `#` are comments, the first carrying the version [PSRQPY-SRC].
  (Recommendation: parse `psrcat.db` ourselves in a small Node or Python script; no need to build the
  C tool on Windows.)
- **Machine-readable web queries:** `proc_form.php` accepts every form field as a GET parameter.
  `style=short csv without errors` (or `long csv with errors`) returns semicolon-separated text inside
  an HTML `<pre>` block. Parameter names: JName, BName, P0, P1, F0-F2, PEpoch, DM, Dist, Dist_DM,
  Dist_A, PX, GL, GB, PMRA, PMDec, PMTot, VTrans, Age, NGlt, Assoc; `condition=` takes expressions
  such as `p0 > 2 && dist > 3` [ATNF-HELP]. Tested:
  - Table: `https://www.atnf.csiro.au/research/pulsar/psrcat/proc_form.php?version=2.9.0&JName=JName&P0=P0&P1=P1&PEpoch=PEpoch&DM=DM&Dist=Dist&startUserDefined=true&pulsar_names=B0329%2B54+B0531%2B21+B0833-45&ephemeris=short&style=short+csv+without+errors&no_value=*&state=query&table_submit=Table`
  - Par file: `https://www.atnf.csiro.au/research/pulsar/psrcat/proc_form.php?version=2.9.0&startUserDefined=true&pulsar_names=B0531%2B21&ephemeris=short&state=query&ephemeris_submit=Get+Ephemeris`
- **Citation and terms:** cite Manchester, Hobbs, Teoh and Hobbs 2005, AJ 129, 1993, with the catalogue
  URL. Software GPL v3; programs and databases "remain the property of" ATNF/CSIRO [ATNF-D].
- **psrqpy** 1.3.3 (PyPI, 2026-08-26, MIT, M. Pitkin) downloads and caches the tarball and parses
  `psrcat.db`; `QueryATNF(params=['JNAME','P0','P1'], psrs=['J0534+2200']).table`; also knows the
  Jodrell Bank glitch-table URL. Cite Pitkin 2018, JOSS 3(22), 538 [PSRQPY]. (Python 3.14 here: may
  need a 3.12 venv.)

## 2. The 14 pulsars on the map

- **List source:** Sagan, Sagan and Drake 1972, Table 1, columns "Period (second) (1970/1971 epoch)" and
  "Period (units of H hyperfine transition)" [SSD72]; Johnston matched all 14 against Taylor and
  Manchester 1975 and ATNF [JOH].
- **The Voyager map is the Pioneer map** [NASA-GRC]; Johnston's transcription of the Voyager binary
  (from Murmurs of Earth) decodes exactly to Sagan's 1972 numbers (my calc). The 15th line is the Sun
  to galactic-centre distance [SSD72].

### Table 2A: spin parameters (ATNF 2.9.0)

| # | 1972 ID | PSR (B / J) | P0 (s) | Pdot | PEPOCH (MJD, yr) | DM | tau_c (yr) | Long-term braking index | Glitches (ATNF / JBO) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1727 | B1727-47 / J1731-4744 | 0.82994561219 | 1.636354e-13 | 59400 (2021.5) | 123.056 | 8.04e4 | not measured | 9 / 6, including dnu/nu = 3.15e-6 in 2017 |
| 2 | 1451 | B1451-68 / J1456-6843 | 0.2633769266537 | 9.895e-17 | 59400 | 8.635 | 4.22e7 | not measured | none |
| 3 | 1240 | B1240-64 / J1243-6423 | 0.3884851271101 | 4.49499e-15 | 57600 (2016.6) | 297.019 | 1.37e6 | not measured | none |
| 4 | 0833 | Vela B0833-45 / J0835-4510 | 0.089328385024 | 1.25008e-13 | 51559.3 (2000.0) | 67.771 | 1.13e4 | 1.4 +/- 0.2 (Lyne 1996); 1.6 +/- 0.1 (Dodson 2007); 1.7 +/- 0.2 [ESP17]; 2.81 +/- 0.12 [AKB17]; about 40 between glitches | 23 / 26, dnu/nu about 1e-6 to 3.5e-6 |
| 5 | 0950 | B0950+08 / J0953+0755 | 0.2530654277593 | 2.29759e-16 | 59400 | 2.96927 | 1.75e7 | not measured | none |
| 6 | 0823 | B0823+26 / J0826+2637 | 0.53066051169 | 1.70932e-15 | 46450 (1986.0) | 19.47633 | 4.92e6 | not measured | none |
| 7 | 0531 | Crab B0531+21 / J0534+2200 | 0.0333924123 | 4.20972e-13 | 48442.5 (1991.5) | 56.7712 | 1.26e3 | 2.342(1) averaged 1968-2013 including glitches; about 2.5 between glitches [LYNE15] | 40 / 32 |
| 8 | 0525 | B0525+21 / J0528+2200 | 3.74553925030 | 4.00530e-14 | 54200 (2007.3) | 50.8695 | 1.48e6 | not measured | 4 / 4, all <= 2.3e-9 |
| 9 | 0328 | B0329+54 / J0332+5434 | 0.714519699726 | 2.048265e-15 | 46473 (1986.1) | 26.7641 | 5.53e6 | not measured | none |
| 10 | 2217 | B2217+47 / J2219+4754 | 0.5384688219194 | 2.765209e-15 | 46599 (1986.4) | 43.4975 | 3.09e6 | not measured | 1 / 1 (2011, 1.2e-9) |
| 11 | 2016 | B2016+28 / J2018+2839 | 0.5579534804225 | 1.481058e-16 | 46384 (1985.8) | 14.1977 | 5.97e7 | not measured | none |
| 12 | 1933 | B1933+16 / J1935+1616 | 0.35874514019893 | 6.0027489e-15 | 59400 | 158.6394 | 9.47e5 | not measured | 0 / 1 (2024, 0.7e-9) |
| 13 | 1929 | B1929+10 / J1932+1059 | 0.22651892659397 | 1.156828e-15 | 59400 | 3.18321 | 3.10e6 | not measured | none |
| 14 | 1642 | B1642-03 / J1645-0317 | 0.3876916862626 | 1.780450e-15 | 59400 | 35.7555 | 3.45e6 | not measured | 7 tiny (0.9e-9 to 2.6e-9, Shabanova 2009) / 0 |

Spin values and DM [ATNF-Q]; glitches [ATNF-G], [JBO-G]; Lyne 1996 and Dodson 2007 Vela values as
cited in [ESP17]. ATNF's F2 values for the older pulsars imply "braking indices" from -10,509
(B1929+10) to +38,485 (B2016+28) (my calc): that is timing noise, not physics [HLK10].

### Table 2B: position, distance and motion (ATNF 2.9.0)

| PSR | l, b (deg) | DIST best (kpc) | DIST_DM, YMW16 (kpc) | Parallax (mas), 1/PX (kpc) | PM total (mas/yr) [mu_a*, mu_d] | V_t (km/s) |
|---|---|---|---|---|---|---|
| B1727-47 | 342.565, -7.669 | 0.70 (0.4-0.7, via SNR RCW 114) | 5.52 | - | 146 +/- 12 [73, -127] | 486 |
| B1451-68 | 313.868, -8.543 | 0.43 | 0.437 | 2.2 +/- 0.3, 0.45 | 41.4 [-39.5, -12.3] | 84 |
| B1240-64 | 302.051, -1.532 | 2.0 (0-4) | 9.40 | - | - | - |
| Vela | 263.552, -2.787 | 0.28 | 0.328 | 3.5 +/- 0.2, 0.29 | 58.0 [-49.68, 29.90] | 77 |
| B0950+08 | 228.908, 43.697 | 0.261 | 0.187 | 3.82 +/- 0.07, 0.262 | 29.5 [-2.09, 29.46] | 37 |
| B0823+26 | 196.964, 31.743 | 0.50 | 0.315 | 2.010 +/- 0.010, 0.498 | 115.5 [63.0, -96.75] | 274 |
| Crab | 184.557, -5.784 | 2.0 | 1.311 | 0.53 +/- 0.06, 1.9 | 11.65 [-11.34, 2.65] | 110 |
| B0525+21 | 183.856, -6.896 | 1.215 (from DM) | 1.215 | - | 21 +/- 19 [-20, 7] | 122 |
| B0329+54 | 144.995, -1.221 | 1.68 | 1.183 | 0.59 +/- 0.02, 1.69 | 19.9 [16.97, -10.37] | 158 |
| B2217+47 | 98.385, -7.598 | 2.383 (from DM) | 2.383 | - | 32 +/- 7 [-12, -30] | 365 |
| B2016+28 | 68.099, -3.983 | 0.98 | 0.959 | 1.03 +/- 0.10, 0.97 | 6.7 [-2.6, -6.2] | 31 |
| B1933+16 | 52.436, -2.093 | 3.7 (2.9-5.0) | 4.316 | 0.22 +/- 0.12, about 4.5 (weak) | 16.1 [1.13, -16.09] | 283 |
| B1929+10 | 47.382, -3.885 | 0.31 (0.25-0.40) | 0.229 | 2.77 +/- 0.07, 0.361 | 103.5 [94.09, 42.99] | 152 |
| B1642-03 | 14.114, 26.062 | 4.0 +/- 0.4 | 1.326 | 0.26 +/- 0.02, 3.8 | 20.5 [-1.03, 20.5] | 389 |

### Identification notes

- No identity is seriously disputed; all 14 are unambiguous once direction is used with period [JOH].
- **B1240-64 has the wrong period.** Known only to 3 significant figures (0.388 s), the binary encodes
  0.3880000002 s; the true value is 0.38848 s, 1,233 ppm off [WP-PP][JOH]. Sagan et al. say the
  trailing zeros on 1240 and 1727 mean "a precision greater than we now have" [SSD72]; in binary that
  warning disappears.
- **B1727-47** is precise to only about 6 significant figures [SSD72].
- **Distances** are 1970 dispersion-measure values, off by up to several times [JOH]; the z tick-mark
  convention was "inadvertently breached" [SSD72]. (Directions: see the correction at the top.)
- **Johnston's dating table has an error:** he gives -1399.8 for #14 (B1642-03) and 1969.1 for #3
  (1240); the recomputation says the opposite (B1642-03 1969.77; 1240 meaningless).
- The Smithsonian recalculated the binary periods for a 2026 floor map but does not list them [NASM].

## 3. Spin-down dating

### 3a. Map epoch and the change from 1971 to 2026

Method (my calc): P_map = N / 1.420405752e9 Hz (Sagan's unit) [SSD72]. The implied epoch is the date
when the ATNF ephemeris nu(t) = F0 + F1 dt + F2 dt^2/2 (plus F3 dt^3/6 for the Crab) equals 1/P_map.
One least significant bit (LSB) is one hydrogen period, 0.704 ns. "Stated precision" = 9 significant
figures (3 for 1240, about 6 for 1727). dt = (half an LSB, or half the last digit) / Pdot.

| PSR | Bits | LSB / P | dP 1971.0 to 2026.0 (s) | dP / P | dt from LSB | dt from stated digits | Implied epoch |
|---|---|---|---|---|---|---|---|
| Crab | 26 | 2.1e-8 | 7.30e-4 | 2.2e-2 | 0.01 d | 2 min | 1971.76 |
| Vela | 27 | 7.9e-9 | 2.17e-4 | 2.4e-3 | 0.03 d | 7 min | 1972.21 raw; 1971.77 after adding back 14 glitches (sum dnu/nu = 1.96e-5) |
| B1727-47 | 31 | 8.5e-10 | 2.84e-4 | 3.4e-4 | 0.02 d | 0.10 yr | 1970.64 raw; 1970.09 glitch-corrected |
| B0525+21 | 33 | 1.9e-10 | 6.95e-5 | 1.9e-5 | 0.1 d | 1.4 d | 1968.94 |
| B1933+16 | 29 | 2.0e-9 | 1.04e-5 | 2.9e-5 | 0.7 d | 1.0 d | 1970.19 |
| B1240-64 | 30 | 1.8e-9 | 7.80e-6 | 2.0e-5 | 0.9 d | 3,500 yr | -1408 (unusable) |
| B2217+47 | 30 | 1.3e-9 | 4.80e-6 | 8.9e-6 | 1.5 d | 2.1 d | 1969.91 |
| B0329+54 | 30 | 9.9e-10 | 3.56e-6 | 5.0e-6 | 2.0 d | 2.8 d | 1969.76 |
| B1642-03 | 30 | 1.8e-9 | 3.09e-6 | 8.0e-6 | 2.3 d | 3.3 d | 1969.77 |
| B0823+26 | 30 | 1.3e-9 | 2.97e-6 | 5.6e-6 | 2.4 d | 3.4 d | 1969.14 |
| B1929+10 | 29 | 3.1e-9 | 2.01e-6 | 8.9e-6 | 3.5 d | 5.0 d | 1969.78 |
| B0950+08 | 29 | 2.8e-9 | 3.99e-7 | 1.6e-6 | 18 d | 25 d | 1968.47 |
| B2016+28 | 30 | 1.3e-9 | 2.57e-7 | 4.6e-7 | 27 d | 39 d (1.1 yr if only 8 figures) | 1966.60 |
| B1451-68 | 29 | 2.7e-9 | 1.72e-7 | 6.5e-7 | 41 d | 58 d | 1969.52 |

Glitch data for the Vela and B1727-47 corrections: [JBO-G].

- **Crab worked example:** P_map = 47,057,538 / 1,420,405,752 Hz = 0.0331296448 s. Jodrell Bank,
  2026-07-24: nu = 29.5357554730 Hz, so P = 0.0338572684 s [JBO-C]. dP = 7.276e-4 s, 2.20%, about 1e6
  LSBs.
- **Conclusions:** the source table says "1970/1971 epoch", and Sagan says the map should date "the
  epoch of launch to the equivalent of the year 1971" [SSD72]. Recomputed epochs run from 1966.6 to
  1972.2; across 13 pulsars (excluding 1240) the mean is 1969.7, s.d. 1.4 yr (Johnston: 1969.7 +/- 1.2).
  The two most sensitive clocks agree: Crab 1971.76, glitch-corrected Vela 1971.77 (about October
  1971). The slow pulsars cluster at 1969-1970, each probably carrying the epoch of its own 1968-1970
  measurement. **Voyager launched in 1977 carrying a roughly 1971 map: a correct decoding dates it about
  6 years before launch.**
- **Which pulsars can date the map:** all except 1240. Formal errors from the digits range from
  minutes (Crab, Vela) to weeks (B1451-68). Real limits: not knowing when each input period was
  measured, and extrapolating 50 years through glitches and timing noise: about +/- 1 yr for the
  ensemble, about +/- 0.1 yr from the Crab and Vela together.

### 3b. Found about 40,000 years from now (40,055 yr after the 1971 map epoch)

Formulas:
- Forward: P^(n-1) = P0^(n-1) + (n-1) P0^(n-2) Pdot0 t.
- First order: dP ~ Pdot0 t [1 + (2-n) t / (4 tau_c)], with tau_c = P / (2 Pdot).
- Inversion using only measurements at discovery, exact for constant n: t = (P^(n-1) - P_map^(n-1)) /
  ((n-1) P^(n-2) Pdot). For n = 3: t = (P^2 - P_map^2) / (2 P Pdot).

Worked example, B0329+54: t = 1.2640e12 s; P^2 = 0.7145186^2 + 2(0.7145186)(2.04827e-15)(1.2640e12)
= 0.510537 + 0.003700, so P = 0.717103 s and dP = 2.584e-3 s. Inverting with the Pdot measured then
(2.04088e-15) gives back 40,056 yr.

| PSR | n used | P_map (s) | P after 40,055 yr (s) | dP / P | dP if n = 3 (s) | Age error per unit change in n | Age error per 1 km/s of uncorrected observer velocity |
|---|---|---|---|---|---|---|---|
| Crab | 2.342 | 0.03313 | 0.338 | 9.2 | 0.158 (vs 0.305) | nonlinear | 0.19 yr |
| Vela | 1.7 | 0.08922 | 0.282 | 2.2 | 0.101 (vs 0.193) | nonlinear | 0.17 yr |
| B1727-47 | 3 | 0.82968 | 1.016 | 0.22 | - | about 10% | 0.8 yr |
| B0525+21 | 3 | 3.74549 | 3.7958 | 0.013 | - | 0.7% | 10 yr |
| B1933+16 | 3 | 0.35874 | 0.36624 | 0.021 | - | 1.1% | 6.6 yr |
| B1240-64 | 3 | 0.38800 (wrong) | 0.3941 (true) | 0.015 | - | 0.7% | 9.4 yr |
| B2217+47 | 3 | 0.53847 | 0.54195 | 0.0065 | - | 0.32% | 21 yr |
| B0329+54 | 3 | 0.71452 | 0.71710 | 0.0036 | - | 0.18% | 37 yr |
| B1642-03 | 3 | 0.38769 | 0.38993 | 0.0058 | - | 0.29% | 23 yr |
| B0823+26 | 3 | 0.53066 | 0.53282 | 0.0041 | - | 0.20% | 33 yr |
| B1929+10 | 3 | 0.22652 | 0.22798 | 0.0064 | - | 0.32% | 21 yr |
| B0950+08 | 3 | 0.25307 | 0.25336 | 0.0011 | - | 0.06% | 117 yr |
| B2016+28 | 3 | 0.55795 | 0.55814 | 0.00034 | - | 0.02% | 398 yr |
| B1451-68 | 3 | 0.26338 | 0.26350 | 0.00047 | - | 0.02% | 282 yr |

Inversion tests (simulate with the true n, invert with an assumed n): Crab, true 2.342: assuming 2.5
gives 36,345 yr (-9.3%), assuming 3 gives 27,851 yr (-30%). Vela, true 1.7: assuming 1.4 gives +16.7%,
assuming 2.81 gives -38.8%. B1727-47: n of 2 vs 3 changes the age by +/- 10%. B0329+54: n = 2 or 5 gives
+0.18% or -0.36%. B2016+28: n = 2 gives +0.02%.

**What limits an alien's estimate of elapsed time:**
1. **Braking index:** dominates for the Crab, Vela and B1727-47; negligible for tau_c >= 1 Myr.
2. **Glitches:** Vela's 25 glitches 1971-2026 (sum dnu/nu = 4.0e-5) undid 1.65% of its spin-down over
   that period (JBO); the Crab's glitches pull its long-term n from about 2.5 to 2.342 [LYNE15]; the
   older pulsars have only tiny glitches (<= 2.6e-9).
3. **Timing noise:** spin-down rates switch between discrete values; peak-to-peak dnudot/nudot is 2.53%
   for B1642-03 and 0.84% for B0950+08, typically "about 1% of the mean value" [LYNE10]. If the finder
   measures Pdot over only a few years, each pulsar carries about +/- 170 to 500 yr; averaging about 10
   old pulsars gives about +/- 100 to 200 yr (an estimate, not a published figure).
4. **Observer motion (easy to overlook, matters a lot):** the finder's velocity Doppler-shifts every
   period by v_r/c, equivalent to an age error dt = 2 tau_c (dv/c) = 6.67e-6 tau_c per km/s (last
   column: 0.19 yr per km/s for the Crab, 398 yr per km/s for B2016+28). The finder must convert to the
   Sun's rest frame (Voyager itself moves at 16.6 km/s [BJF19]; Gliese 445 moves about 110 km/s
   relative to the Sun). Alternative: fit one shared velocity vector across all pulsars; ageing scales
   with Pdot while the Doppler shift scales with P cos(theta), so the two separate cleanly.
5. **Light-travel time:** an observer a distance D from the Sun sees each pulsar at an emission epoch
   shifted by D cos(theta)/c; at Voyager's distance after 40,000 yr (about 0.68 pc) at most about 2.2 yr.
6. **Errors in the map:** the wrong 1240 period adds about 3,400 yr (43,400 instead of 40,055, +8%).
7. **Visibility:** pulsar beams mean "not all pulsars are visible at all view angles" [SSD72]; proper
   motion shifts positions by at most 1.6 deg in 40 kyr (B1727-47).

### 3c. Found about 1 million years from now (brief)

- Young pulsars are useless: the Crab's period depends heavily on n (0.94 s for n = 3, 2.37 s for 2.5,
  3.60 s for 2.342); Vela 0.84 s for n = 3, 12.5 s for 1.7, 134 s for 1.4.
- Old pulsars still work: B2016+28 +0.83%, B1451-68 +1.2%, B0950+08 +2.8%, B0329+54 +8.7%; n
  sensitivity grows to 0.4 to 4.5% per unit of n.
- Geometry degrades badly: proper motions move pulsars by 29 to 41 deg (B1929+10, B0823+26, B1727-47).

## 4. Radioactive clocks

### 4a. Uranium-238 on the record cover

- **NASA:** "an ultra-pure source of uranium-238 (with a radioactivity of about 0.00026 microcuries)"
  on a 2 cm diameter area; the finder measures "the amount of daughter elements to the remaining
  uranium-238" as "a check on the epoch of launch" [NASA-GRC]. Half-life: 4.51e9 yr on one NASA page
  [NASA-GRC], 4.468e9 on another [NASA-MGR]; recommended value 4.468(5)e9 yr [LNHB].
- **Amount (my calc):** 0.00026 microcurie x 37,000 = 9.62 Bq = 831,000 decays/day. U-238 specific
  activity 12,440 Bq/g gives 0.774 mg (1.96e18 atoms); over 3.14 cm2 that is 0.25 mg/cm2, about 0.13
  micrometre of metal.
- **What "ultra-pure" must mean:** NASA does not define it. Chemical purification removes thorium,
  radium and other elements but cannot remove U-234 (same element). The U-234 ingrowth clock works only
  if the uranium was isotopically separated; if it was chemically purified natural uranium, U-234
  starts in equilibrium and only Th-230 ingrowth is useful. **Measuring both U-234 and Th-230 settles
  which, and the age, together** (two unknowns, two measurements). The game assumes isotopically pure
  (NASA's wording) and says so in How it's checked.
- **Half-lives:** U-234 2.455(6)e5 yr [LNHB] (245,620 +/- 260 [CHENG13]); Th-230 7.538(30)e4 yr
  [LNHB][NNDC] (75,584 +/- 110 [CHENG13]); Ra-226 1,600(7) yr [LNHB].
- **Formulas (pure U-238 at t = 0;** Th-234 and Pa-234m reach equilibrium within months; lambda =
  ln2 / half-life):
  - A234/A238 = lambda234/(lambda234 - lambda238) [1 - e^-(lambda234 - lambda238) t] ~ 1 - e^(-lambda234 t) ~ lambda234 t
  - A230/A238 ~ 1 - [lambda230 e^(-lambda234 t) - lambda234 e^(-lambda230 t)] / (lambda230 - lambda234) ~ lambda234 lambda230 t^2 / 2

| Quantity (LNHB half-lives) | t = 49 yr | t = 40,000 yr |
|---|---|---|
| A234/A238 | 1.383e-4 | 0.1068 |
| A230/A238 | 3.12e-8 | 0.0177 |
| A226/A238 | 2.2e-10 | 0.0159 |
| Atom ratio 234/238 | 7.60e-9 | 5.87e-6 |
| Atom ratio 230/238 | 5.3e-13 | 2.99e-7 |
| U-234 decays/day | 115 | 88,760 |
| Th-230 decays/day | 0.026 | 14,750 |
| Counting time for 10% / 1% on U-234, 30% detector efficiency | 2.9 d / 290 d | 5.4 min / 9.0 h |
| Same at 100% efficiency | 0.87 d / 87 d | 1.6 min / 2.7 h |
| Age error for a 1% ratio measurement | +/- 0.49 yr | +/- 423 yr (+/- 100 yr more from half-life uncertainty) |

(At 44,000 years: A234/A238 is about 0.117.)

- **Alpha spectrometry:** efficiency above 25% (up to about 40%), resolution 16-18 keV FWHM,
  background below 0.05 counts/h/cm2 [MIRION]. Alpha energies: U-238 4.198 and 4.151 MeV; U-234 4.775
  and 4.722; Th-230 4.687 and 4.621; Ra-226 4.784 [LNHB][NNDC]. At 40,000 yr Ra-226's line sits under
  U-234's, so separate chemically first or use mass spectrometry. At 49 yr Th-230 is effectively
  unmeasurable by counting (one decay every 39 days). If the source was chemically purified natural
  uranium: A230/A238 = 1 - e^(-lambda230 t) = 4.5e-4 at 49 yr (374 decays/day) and 0.308 at 40,000 yr.

### 4b. Voyager RTGs

- **Hardware:** three MHW-RTGs per spacecraft, each over 156 We (average 158 We), 37.69 kg
  [NTRS-RPS]; about 470 We per spacecraft at launch [WIKI-MHW]. Each heat source holds 24 PuO2 spheres
  (1.465 in, 100 Wt each, 2,400 Wt per RTG; each sphere 251.5 g; Pu-238 "80 at.%" of the plutonium;
  iridium shells vented for helium) [LA5202]. About 6.0 kg PuO2 and 4.25 kg Pu-238 per RTG (Wikipedia:
  "about 4.5 kg"), about 18 kg PuO2 and 12.8 kg Pu-238 per spacecraft. Pu-238 half-life 87.74(3) yr
  [LNHB]; specific power 0.5675 W/g (my calc, Q = 5.593 MeV).
- **Power in 2026:** decay heat 2,400 x 2^(-49.1/87.74) = 1,628 Wt per RTG, about 4.9 kWt per
  spacecraft (my calc). Electrical: in 2019 "about 40% less than at launch" (about 280 W), falling
  "about 4 fewer watts ... each year" [JPL19][NASA-FAQ]; about 250 W in 2026 by extrapolation (estimate).
- **Decay chain:** Pu-238 to U-234 (245,500 yr) to Th-230 (75,380 yr) to Ra-226.
- **Dating at 49 years:** U-234/Pu-238 = e^(lambda t) - 1 = 0.474 at 49.1 yr; a 1% measurement gives
  +/- 0.41 yr (0.1% gives +/- 15 days). This dates the plutonium's last chemical purification, not the
  launch. Nuclear forensics routinely uses U-234/Pu-238, U-235/Pu-239, U-236/Pu-240 and Am-241/Pu-241
  together; one 38-year-old reference material's separation date was pinned "within two weeks" [JRC].
  Heat output alone cannot date the fuel without knowing the starting power.
- **Dating at 40,000 years (my calc):** Pu-238 left: 1e-137 (none). Per spacecraft: about 11.2 kg
  U-234, 1.1 kg Th-230, 22 g Ra-226. Th-230/U-234 activity ratio R = lambda230/(lambda230 - lambda234)
  [1 - e^-(lambda230 - lambda234) t] = 0.324 (atom ratio 0.099); 1% measurement gives +/- 456 yr, 0.1%
  gives +/- 46 yr; switching LNHB and Cheng half-life sets moves it by 103 yr. Minor isotopes give
  independent clocks (Pu-239 to U-235: ratio 2.16, +/- 238 yr per 1%; Pu-240 to U-236: ratio 67, +/- 93
  yr per 1%; isotopic mix illustrative, from Cassini fuel [CASSINI]). Leftover heat about 8 W per
  spacecraft, assuming radon is retained (estimate). Helium is vented by design [LA5202], so it is not a
  clock. (At 44,000 years: R is about 0.35.)

### 4c. Other sourced clocks

- **Kinematics:** Voyager 1 and 2 leave the Sun at 16.6 and 14.9 km/s; Voyager 2's closest stellar
  approach comes "much sooner (40 kyr)" at about 0.5 pc [BJF19]. Distance over speed gives the time
  since leaving the Sun.
- **Cosmogenic nuclides:** cosmic-ray exposure ages are standard for meteorites [EUG06]; Na-22 from
  cosmic-ray activation of spacecraft aluminium was measured on LDEF [LDEF]; no production rates for
  interstellar space were found.
- **Particle tracks:** measured in Surveyor 3 glass [SURV3]; no interstellar rate.
- **Micrometeoroid pitting:** about 1 Angstrom/yr inside the solar system; in interstellar space
  "largely unknown, but very likely less efficient" [SSD72]. Not a calibrated clock.

## 5. Hydrogen 21 cm constant

nu = 1,420,405,751.768(2) Hz (hydrogen maser) [ASACUSA][HELLWIG]; period 1/nu = 0.70402418376(1) ns;
wavelength c/nu = 21.106114054 cm. Sagan used 1.420405752e9 Hz [SSD72]; the difference (1.6e-10
fractional) is negligible here.

## Sources

- ATNF-H: https://www.atnf.csiro.au/research/pulsar/psrcat/catalogueHistory.html
- ATNF-D: https://www.atnf.csiro.au/research/pulsar/psrcat/download.html
- ATNF-HELP: https://www.atnf.csiro.au/research/pulsar/psrcat/psrcat_help.html
- ATNF-Q: the proc_form.php table URL in section 1 (version 2.9.0)
- ATNF-G: https://www.atnf.csiro.au/research/pulsar/psrcat/glitchTbl.html
- JBO-G: https://www.jb.man.ac.uk/pulsar/glitches/gTable.html
- JBO-C: https://www.jb.man.ac.uk/~pulsar/crab/crab2.txt
- PSRQPY: https://pypi.org/project/psrqpy/ and https://psrqpy.readthedocs.io/
- PSRQPY-SRC: https://github.com/mattpitkin/psrqpy (psrqpy/utils.py, psrqpy/config.py)
- SSD72: https://astro.swarthmore.edu/astro61_spring2014/papers/sagan_science_1972.pdf (Sagan, Sagan and Drake 1972, Science 175, 881)
- JOH: https://www.johnstonsarchive.net/astro/pulsarmap.html
- WIKI-PP: https://en.wikipedia.org/wiki/Pioneer_plaque
- RUS: https://dses.science/wp-content/uploads/2020/04/18-Galactic-Navigation-using-the-Pioneer-Spacecraft-Pulsar-Map.pdf
- NASM: https://airandspace.si.edu/stories/editorial/recalculating-pulsar-map-21st-century
- NASA-GRC: https://science.nasa.gov/mission/voyager/golden-record-cover/
- NASA-MGR: https://science.nasa.gov/mission/voyager/making-of-the-golden-record/
- NASA-FAQ: https://science.nasa.gov/mission/voyager/frequently-asked-questions/
- LYNE15: https://arxiv.org/abs/1410.0886
- ESP17: https://arxiv.org/abs/1611.08314
- AKB17: https://arxiv.org/abs/1612.03805
- LYNE10: https://arxiv.org/abs/1006.5184
- HLK10: https://arxiv.org/abs/0912.4537
- LNHB: http://www.lnhb.fr/nuclides/U-238_tables.pdf (also U-234, Pu-238, Ra-226, Pu-239, Pu-240)
- NNDC: https://www.nndc.bnl.gov/nudat3/decaysearchdirect.jsp?nuc=230TH&unc=nds
- CHENG13: https://www.bco-dmo.org/publication/813334 (doi:10.1016/j.epsl.2013.04.006)
- MIRION: https://vocab.nerc.ac.uk/collection/L22/current/TOOL2183/ and https://mirion.com/discover/knowledge-hub/product-literature/technical-papers/considerations-for-choosing-an-alpha-spectroscopy-pips-detector
- NTRS-RPS: https://ntrs.nasa.gov/api/citations/20120000731/downloads/20120000731.pdf
- LA5202: https://www.osti.gov/servlets/purl/4486293
- WIKI-MHW: https://en.wikipedia.org/wiki/MHW-RTG
- JPL19: https://www.jpl.nasa.gov/news/a-new-plan-for-keeping-nasas-oldest-explorers-going/
- CASSINI: https://fti.neep.wisc.edu/fti.neep.wisc.edu/neep602/SPRING00/lecture6.pdf
- JRC: https://publications.jrc.ec.europa.eu/repository/handle/JRC108978 and https://link.springer.com/10.1007/s10967-015-4418-5
- BJF19: https://arxiv.org/abs/1912.03503
- LDEF: https://ntrs.nasa.gov/citations/19930020439
- SURV3: https://ntrs.nasa.gov/citations/19710042958
- EUG06: https://boris.unibe.ch/20755
- ASACUSA: https://arxiv.org/abs/1610.06392
- HELLWIG: Hellwig et al. 1970, IEEE Trans. Instrum. Meas. IM-19, 200 (cited via ASACUSA)

## Could not confirm

1. What "ultra-pure" U-238 means (isotopic or chemical), and who prepared and plated it.
2. The Voyager fuel's actual isotopic composition and purification date (only a design basis of 80
   at.% Pu-238).
3. A primary-source figure for Voyager's electrical power in 2026.
4. When each of the map's input periods was measured.
5. A long-term braking index for any of the 12 older pulsars, including B1727-47.
6. Interstellar erosion of the cover, and cosmogenic production rates in aluminium.
7. The Smithsonian's recalculated 2026 binary values.
8. Glitch counts disagree between ATNF and Jodrell Bank (Crab 40 vs 32, Vela 23 vs 26, B1727-47 9 vs 6,
   B1642-03 7 vs 0).
9. Johnston's dating rows for #3 and #14 (not reproduced; see above).
