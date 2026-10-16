# The alpha detector (The Spot)

Written 2026-10-16 for M4 step 4 (The Spot). The detector the player sweeps over the cover and counts
with is a documented game choice (D-A24): a real commercial alpha-spectroscopy silicon detector, with its
published numbers. Used by `src/science/spot.ts`.

## 1. What is needed

Three numbers: the active area (how much of the spot's alpha flux the detector catches), the energy
resolution (whether the three alpha lines separate), and the background in the alpha window (what the
detector counts with no source). Plus two geometries: the sweep's stand-off over the cover and the
counting session's source-to-detector spacing.

## 2. The detector: Mirion (formerly Canberra) PIPS A450-18AM

Passivated implanted planar silicon (PIPS), the standard alpha-spectroscopy detector.

| Quantity | Value | Source (read 2026-10-16) |
|---|---|---|
| Active area | 450 mm^2 (circular: radius 11.97 mm) | Model name A450-18AM (area 450 mm^2, 18 keV); a laboratory use of the same model gives "detector size 450 mm2" (RSC supplementary data, https://www.rsc.org/suppdata/d1/ay/d1ay01862k/d1ay01862k1.pdf) |
| Resolution | 18 keV FWHM (at a source spacing equal to the detector's diameter); Mirion says 16 keV or better is routine for 450 mm^2 | NERC SeaVoX device catalogue entry TOOL2183, "Based on use with a 450-18AM PIPS detector and a good quality Americium-241 point source" (https://vocab.nerc.ac.uk/collection/L22/current/TOOL2183/); Mirion, "Considerations for Choosing an Alpha Spectroscopy PIPS Detector" (https://mirion.com/discover/knowledge-hub/product-literature/technical-papers/considerations-for-choosing-an-alpha-spectroscopy-pips-detector, search snippet; the page refused a direct fetch) |
| Background | below 0.05 counts per hour per cm^2 of active area, 3 to 8 MeV, typical ("routinely achieved") | Mirion PIPS literature (search snippets of the technical paper above and the Mirion alpha PIPS detector sheet, https://assets-mirion.mirion.com/prod-20220822/cms4_mirion/files/alpha-pips-detectors-c39168_V1RM7DW.pdf); also docs/research/clocks.md 4a [MIRION]. The NERC system-level entry quotes "< 1 count/hr above 3 MeV" for a whole spectrometer |
| Efficiency | above 25% for a point source closer than 1 mm | NERC TOOL2183 (above) |

**Confirmed:** the area and the 18 keV resolution (model name and two independent pages), and the
background as a typical figure per cm^2 (two Mirion snippets agree with clocks.md 4a). **Not confirmed
from a Mirion datasheet page directly:** the PDF's text could not be extracted in this session, so the
background is a typical value, not a guaranteed specification. It barely matters (section 4).

Derived: the detector's background in the alpha window is 0.05 x 4.5 cm^2 = 0.225 counts per hour,
6.25e-5 counts/s.

**Where the background applies (M4 science audit finding 8; D-A24).** The figure is a shielded-laboratory
one. The Finder sweeps and counts in its own shielded laboratory, with the record brought aboard (it is
played on a turntable in The Player), in a vacuum chamber as alpha spectrometry always is, so the
laboratory figure applies. An unshielded detector in interstellar space would see galactic cosmic-ray
heavy nuclei depositing alpha-like energies: the auditor's order-of-magnitude estimate is about 1e-2
counts per second in the alpha window, about 160 times the laboratory figure. **Unverified** (an estimate,
not a measurement or a cited flux calculation); it is the reason the laboratory setting is stated.

## 3. Geometries (game choices, D-A24)

- **Sweep:** the detector face parallel to the cover at a 5 mm stand-off, a close pass that clears the
  etched plate. Measured in vacuum (the craft is in space), so no alphas are lost on the way.
- **Counting session:** a sample of the spot, uranium and thorium separated first (clocks.md 4a, so
  Ra-226's 4.784 MeV line cannot sit under U-234's 4.775 MeV), redeposited as a small source on the axis
  at a spacing equal to the detector's diameter (23.9 mm), the geometry the 18 keV resolution is quoted
  for. Geometric efficiency, computed (never typed): (1 - h / sqrt(h^2 + R^2)) / 2 = (1 - 2 / sqrt 5) / 2 =
  0.0528. The whole deposit is counted (it is 0.13 micrometre of metal, clocks.md 4a).

## 4. The numbers at the epoch (computed by spot.ts; check ids in How it's checked row 8)

- Spot alpha activity 44,100 years after launch: U-238 9.62 Bq, U-234 1.13, Th-230 0.204, Ra-226 0.185:
  11.1 Bq in all.
- Sweep (5 mm stand-off): 2.9 counts/s with the probe centred on the spot, 1.85 at its edge, 0.10 at
  30 mm, 0.002 at 100 mm, about 1e-4 at the far side of the plate. The background (6.25e-5 /s) is 1 part
  in 46,000 of the peak: it decides nothing except at the far edge of the plate.
- Not modelled in the sweep: Ra-226's daughters (Rn-222, Po-218, Po-214, and Po-210 through Pb-210, each
  in equilibrium with Ra-226 after 44,000 years; NNDC half-lives of days to decades) would add at most
  4 x 0.185 = 0.74 Bq, about 7% of the sweep rate, if the radon stayed in the deposit. This changes how
  bright the spot reads, not where it is.
- Counting session: 1,830 U-238, 214 U-234 and 39 Th-230 counts per hour. Background in a line window
  (plus or minus 2 FWHM, 72 keV of the 5 MeV window): 0.078 counts per day against about 930 Th-230 counts
  per day, under 1e-4: ignored, and the test says so.
- Alpha energies are derived from the NNDC Q values in nuclides.ts by momentum sharing,
  E = Q (A - 4) / A: 4.198, 4.775 and 4.687 MeV, matching clocks.md 4a to 1 keV.
