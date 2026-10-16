# The galaxy chart's constants

Checked on 2026-10-15 by the `scout` agent against the papers (read in their arXiv / ar5iv full texts unless
noted), for `src/world/galaxyModel.ts`. The chart is a display: none of these values enters a deduction's
checker, but the chart shows them, so they are sourced like everything else (rule 1).

## 1. Distance to the Galactic centre: 8.275 +/- 0.009 (stat) +/- 0.033 (sys) kpc

- **Value:** R0 = 8275 +/- 9 (stat) +/- 33 (sys) pc (Eq. 38; Table 2 gives 8274.9 +/- 9.3 pc).
- **Source:** GRAVITY Collaboration 2021, "Improved GRAVITY astrometric accuracy from modeling optical
  aberrations", A&A 647, A59, arXiv:2101.12098, https://doi.org/10.1051/0004-6361/202040208
  (read at https://ar5iv.labs.arxiv.org/html/2101.12098). The distance is a result of that paper, which is
  about the instrument's optical aberrations; it supersedes the 2019 value of 8178 +/- 13 +/- 22 pc
  (A&A 625, L10).
- **Consistent update:** GRAVITY Collaboration 2022, A&A 657, L12 (arXiv:2112.07478): 8277 +/- 9 pc
  (statistical only; it defers to the 2021 paper for a systematic of about 30 pc). No newer GRAVITY R0
  from 2023 to 2026 was found (a shallow search: unconfirmed).
- **Use:** 8.275 kpc with the two errors in quadrature, 0.034 kpc. Verdict: matches the code.

## 2. Direction of the Galactic centre: Sgr A* at 17h45m40.0409s, -29d00m28.118s (J2000)

- **Source:** Reid and Brunthaler 2004, ApJ 616, 872 (arXiv:astro-ph/0408107), the table note "J2000
  positions for Sgr A*" (read at https://ar5iv.labs.arxiv.org/html/astro-ph/0408107). VLBA astrometry
  tied to extragalactic calibrators; the paper names the ICRF only for the calibrator catalogue, so the
  position is labelled "J2000 (VLBA)", not "ICRS".
- **Newer value:** Gordon et al. 2023 (ICRF3 VLBI, arXiv:2212.00632, epoch 2015.0): 17h45m40.034047s,
  -29d00m28.21601s, about 0.007 s in RA and 0.1 arcsec in Dec from the 2004 value: far below anything the
  chart can show. The 2004 value stays.
- **Use:** the chart draws the centre in this direction (galactic l = 359.944, b = -0.046 deg) rather
  than assuming l = b = 0. Verdict: matches; comment corrected from "ICRS" to "J2000 (VLBA)".

## 3. Millisecond pulsars: P < 30 ms (a display class)

- **Convention, not a single standard.** A 30 ms boundary is common: D. R. Lorimer, "Binary and
  Millisecond Pulsars", Living Reviews in Relativity (the 2008 edition describes millisecond pulsars as
  roughly 1.4 ms to 30 ms; the scout's link was the review's arXiv record,
  https://arxiv.org/abs/astro-ph/9801177, and the 2008 wording came from a search snippet), and Galactic MSP compilations built on Lorimer's
  list use P < 30 ms. Other cuts exist: P < 20 ms in some survey papers (for example Lorimer et al. 2015,
  Parkes multibeam survey VII), and Bhattacharyya et al. 2023, "Defining Millisecond Pulsars"
  (arXiv:2310.06230), argue statistically for about 16 ms.
- **Not confirmed:** the wording of Lorimer and Kramer 2005 (Handbook of Pulsar Astronomy), which the
  code comment cited; its text was not accessible. The comment now cites the Living Review instead.
- **Use:** 0.03 s, labelled a common convention. It only sets a point's size and colour on the chart
  (no deduction depends on it). Verdict: keep, cite as a convention.

Notes: the 2019 GRAVITY value, the Lorimer 2008 range and the 20 ms usage came from search-result
snippets, not full texts; everything else above was read in the papers.
