# Credits

Every external asset and data source, one line each (source, licence or terms, URL, date added). The
sources below are planned; each gets its final line (with checksum and date) when it is actually used.

## Record content
- Image signal: the 1977 Colorado Video image master tape for the Voyager Golden Record, transferred by
  Ozma Records (2016); file `384kHzStereo.wav` via the Internet Archive (`voyager.decode`), shared by
  David Pescovitz and Ron Barry. Fetched 2026-10-15 (MD5 f543349efdcc258e56c9af3baa9d33c8 verified; SHA-256 in tools/sources.json).
- Record audio: "Voyager Golden Record" 40th anniversary edition, Ozma Records (2017), remastered from the
  original analog tapes. Planned.
- The Voyager Golden Record was produced for NASA by a committee chaired by Carl Sagan, with Frank Drake,
  Ann Druyan, Timothy Ferris, Jon Lomberg and Linda Salzman Sagan.

## Science data
- ATNF Pulsar Catalogue v2.9.0: Manchester, R. N., Hobbs, G. B., Teoh, A. and Hobbs, M. (2005), AJ 129,
  1993; https://www.atnf.csiro.au/research/pulsar/psrcat/ (psrcat_pkg.v2.9.0.tar.gz). Fetched 2026-10-15.
- Jodrell Bank Centre for Astrophysics pulsar glitch catalogue (https://www.jb.man.ac.uk/pulsar/glitches/gTable.html) and Crab Pulsar Monthly Ephemeris (https://www.jb.man.ac.uk/~pulsar/crab/crab2.txt). Fetched 2026-10-15.
- HYG Stellar Database v4.2 by David Nash (astronexus), CC BY-SA 4.0, https://codeberg.org/astronexus/hyg (hyg_v42.csv.gz). Fetched 2026-10-15.
- Gaia DR3 (ESA/Gaia/DPAC). Planned.
- JPL Horizons (NASA/JPL Solar System Dynamics). Planned.
- Bailer-Jones, C. A. L. and Farnocchia, D. (2019), "Future stellar flybys of the Voyager and Pioneer
  spacecraft", RNAAS 3, 59. Planned.
- Sagan, C., Salzman Sagan, L. and Drake, F. (1972), "A Message from Earth", Science 175, 881.
- LNHB nuclear data (half-lives). Planned.

## Images and models
- Voyager 3D model: NASA Visualization Technology Applications and Development (VTAD), science.nasa.gov
  (free to use under NASA's media guidelines; no endorsement implied). Planned.
- The Golden Record cover photo: NASA/JPL, GPN-2000-001978 (public domain), via Wikimedia Commons. Fetched 2026-10-15.
- NASA/JPL "Explanation of Recording Cover Diagram" (science.nasa.gov). Fetched 2026-10-15.
- Pioneer plaque vector drawing by Mysid (2006), public domain, via Wikimedia Commons (Pioneer_plaque.svg). Fetched 2026-10-15.
- Gaia EDR3 all-sky colour map: ESA/Gaia/DPAC, CC BY-SA 3.0 IGO (acknowledgement: A. Moitinho). Planned.

## Prior work we learned from (no code copied)
- Ron Barry's decoder and frame tables (2017; foodini/voyager voyager.cpp fetched 2026-10-15 as reference data only); aizquier/voyagerimb; Malte Gruber; Marc Baeuerle;
  gourneau/golden-record-images; Trammell Hudson; Robert Johnston's pulsar-map analysis; OEIS A350136.
