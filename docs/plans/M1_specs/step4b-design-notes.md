# M1 step 4 part 2: design notes for the next two science specs

Written by the lead at the end of build session 1 (2026-10-15), before these specs were sent. Turn
them into two `builder-opus` specs (same shape as the other files in this folder) once the data files
from `steps2-3-data-builders.md` exist. Both depend on `src/science/astro.ts`, `random.ts` and
`stats.ts` from `step4a-science-units-clocks.md`.

## Spec S2a: `epoch.ts`, `kinematics.ts`, `ephemeris.ts`

- **Frame:** solar-system barycentre (SSB), ICRS Cartesian, pc and km/s. The Sun sits at the origin
  with zero velocity in this frame.
- **Stars:** linear motion from `data/stars.json` (HYG positions at J2000; Gaia DR3 at J2016.0 for
  Gliese 445: propagate each from its own epoch). Stars without a radial velocity are flagged and
  excluded from anything needing a full velocity (report how many).
- **Craft:** position = the Horizons SSB state at 2026-10-15 (`scenario.json` stateRef) plus the
  asymptotic velocity (BJF19 asymptote, 16.6048 km/s) times elapsed time. Report the angle between the
  2026 position vector and the asymptote (expected small).
- **Discovery epoch** = closest approach to Gliese 445. Test against BJF19 (44.0 kyr, 0.575 pc, 116.0
  km/s) and the research's DR3 recheck (44.1 kyr, 0.573 pc, 115.9 km/s): about +/- 0.2 kyr, 0.01 pc,
  0.5 km/s.
- **Neighbour twist:** at that epoch, list Gliese 445's ten nearest stars and the brightest stars in
  its sky (apparent magnitude from absmag and the new distance; include the `sky` list for distant
  bright stars such as Canopus, with proper motion applied). Check the claims "the Sun is among its
  nearest neighbours, about 1.06 pc" and "one of the brightest stars in your sky". Rough lead estimate:
  Sun about mag 0 from Gliese 445 (M_V 4.83 at about 1.06 pc), about -0.8 from the craft (0.75 pc);
  Sirius about -0.9. If a claim fails, log a decision and change the story text, never the data.
- **The Trail (kinematics):** at the epoch, for every star within 10 pc of the craft with a full
  velocity: angle between (craft velocity relative to the star) and (craft position minus star
  position). Exactly one star (the Sun) under 0.1 deg; report the next smallest and which star.
  Distance over speed for the Sun versus the true elapsed time since launch (expect agreement within
  about a year, because 172 AU / 16.6 km/s is about 49 years, the age today).
- **Ephemeris:** cubic Hermite interpolation of `data/ephemeris.json`; test against
  `data/ephemeris_spotchecks.json` within 100 km (research: 1.9 km max at 30-day nodes).

## Spec S2b: `pulsars.ts`, `triangulation.ts` (plus the cover-map tests)

- **Dating today (reproduce the research exactly):** read `docs/research/data/clocks/dating.py` and
  `spindown.py`. Solve nu(t) = 1/P_map with the ATNF ephemeris F0, F1, F2 (F3 for the Crab) using
  Sagan's unit 1.420405752e9 Hz for P_map. Vela: add back the glitches between the map epoch and
  PEPOCH from `data/glitches.json`. Tests: Crab 1971.76, glitch-corrected Vela 1971.77 (+/- 0.05 yr);
  mean of the 13 usable 1969.7 (+/- 0.3), s.d. about 1.4; B1240-64 flagged unusable (implied epoch
  near -1400, its period known to 3 figures).
- **Truth at the story epoch (`epoch` of pulsars):** spin forward from the catalogue state with a
  braking index: Crab 2.342 (Lyne 2015, long-term including glitches), Vela 1.7 +/- 0.2 (Espinoza
  2017), every other pulsar 3 (unmeasured; magnetic dipole). Seeded timing noise: the measured Pdot at
  the epoch scatters by about 1% (Lyne 2010). Positions move by proper motion (up to 1.8 deg for
  B1727-47 over 44 kyr); distances unchanged; pulsars without P1 keep P and are flagged.
- **Observer frame (the subtle part):** the alien's catalogue is barycentred to Gliese 445, which
  moves about 110 km/s relative to the Sun. Observed period P_obs = P_SSB / (1 + v.n/c), with v the
  observer velocity relative to the SSB and n the unit vector to the pulsar. The map's 1970 periods
  were barycentred to the SSB. Light time: an observer offset D from the Sun sees each pulsar's state
  shifted by about D.n/c (at most about 3.5 yr at 1.06 pc).
- **Dating at the epoch:** t = (P^(n-1) - P_map^(n-1)) / ((n-1) P^(n-2) Pdot) per pulsar, with an
  honest per-pulsar interval (timing noise on Pdot, braking index range for the old ones, the map's
  digit precision, each period's own 1966 to 1972 measurement epoch, light time). Without the reframe
  the old pulsars scatter by 2 tau_c (v.n)/c (thousands of years: about 400 yr per km/s for B2016+28);
  test that the scatter matches that prediction within about 10%. With the reframe (the Sun's velocity
  relative to Gliese 445 from the star catalogue) a robust combination of the old pulsars lands within
  its 95% interval of the truth; over about 200 seeds the coverage is near 95%. Young pulsars (Crab,
  Vela, B1727-47) get honest, wide intervals dominated by the braking index. B1240-64 must show up as
  an outlier (about +3,400 yr).
- **Identification uniqueness** (today and at the epoch): a catalogue pulsar matches a map line if its
  longitude is within a documented direction tolerance (map error up to 2.7 deg, plus proper motion up
  to 1.8 deg, plus parallax from the observer offset up to about 0.2 deg: use about 5 deg) and its
  period is consistent with spin-down from P_map (longer than P_map, implied elapsed time between 0
  and a generous bound such as 1 Myr, Doppler allowance about 1e-3 fractional). Each of the 14 lines
  must have exactly one match among all 4,503. Tolerances come from these documented reasons, never
  tuned to pass.
- **Triangulation:** in the galactic plane, SSB frame, unknowns origin (x, y) and a common rotation
  alpha (the map's GC-line orientation); residuals are angle differences; sigma_theta estimated from
  the fit residuals; pulsar positions back-projected by proper motion over the elapsed time (radial
  motion unknown, second order for bearings from near the Sun); distance uncertainties included in a
  Monte Carlo over angles and distances; the map's line lengths as weak, heavy-tailed constraints with
  a free scale. Tests: the region contains the Sun, today and at the epoch; report its 95% size (Sagan's
  design claim: about 20 pc, "1 in 10^3 stars") and the number of stars inside it from `stars.json`.
  Wrong-answer tests: the mirrored reading (clockwise) fits far worse; a deliberately wrong
  identification makes the lines fail to converge (fit residuals far above the map's 3 deg).
- **Cover-map tests:** the 14 decoded periods equal Sagan, Sagan and Drake 1972 Table 1 within 1e-9 s
  (values typed in the test with the citation: they are the independent truth); map angles within 3
  deg of the catalogue longitudes.

## Science notes the story must absorb (log as decisions when acted on)

- **"No plutonium" is wrong as written in PLAN.md chapter 0.** Only Pu-238 is gone at 44 kyr. If the
  fuel was 80 at.% Pu-238, the rest (mostly Pu-239, half-life 24,110 y) is still about 28% present,
  and Pu-242 (373,500 y) is nearly all there. The arrival deduction should read "no plutonium-238;
  uranium-234 with almost no uranium-238". The clocks spec (step 4a) computes the real inventory;
  update the chapter text from its numbers.
- The Pu-242 to U-238 branch makes U-238 non-zero but tiny (U-238/U-234 atom ratio about 1e-4, against
  natural uranium's 1.8e4): the "it was made, not mined" deduction still holds.
- The alien measures pulsars in Gliese 445's frame: the reframe to the Sun's frame happens only after
  The Trail identifies the Sun. That ordering is the planned "ages snap together" moment.
