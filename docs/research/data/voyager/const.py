import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "pylibs"))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import astropy.units as u
from astropy.coordinates import SkyCoord, get_constellation
pts = {
  "V1 asymptote (BJ&F 2019)": (262.8760, 12.3199),
  "V2 asymptote (BJ&F 2019)": (316.2717, -67.5491),
  "V1 velocity dir today (Horizons)": (262.81, 12.31),
  "V2 velocity dir today (Horizons)": (315.94, -67.47),
  "V1 position dir today (Horizons)": (258.97, 12.22),
  "V2 position dir today (Horizons)": (303.16, -59.59),
  "Gl 445 (AC+79 3888), Gaia DR3": (176.93941, 78.6933),
  "Ross 248, Gaia DR3": (355.48002, 44.17038),
  "Rasalhague (alpha Oph)": (263.7336, 12.5600),
}
for k, (ra, dec) in pts.items():
    c = SkyCoord(ra * u.deg, dec * u.deg, frame="icrs")
    print("%-36s RA=%8.4f Dec=%+8.4f -> %s" % (k, ra, dec, get_constellation(c)))
c1 = SkyCoord(262.8760 * u.deg, 12.3199 * u.deg); r = SkyCoord(263.7336 * u.deg, 12.5600 * u.deg)
print("V1 asymptote to Rasalhague separation: %.2f deg" % c1.separation(r).deg)
