# tools/data: the data builders

Python 3.14, standard library only (no numpy needed). Run every script with `python -P` from any
folder; each inserts its own folder into `sys.path` for its siblings. Builders read only from
`sources/<id>/` (raw downloads fetched and checksummed by `tools/fetch-sources.mjs`) and write
`data/*.json`. Schemas, units and conventions: `data/README.md`.

```powershell
cd "C:\Users\stewa\Documents\Claude\Golden Record"; node tools/fetch-sources.mjs; python -P tools/data/build_all.py
```

| Script | Reads | Writes |
|---|---|---|
| `svgmap.py` | `pioneer-svg` | (library) pulsar-map geometry and binaries from the raw Pioneer plaque SVG |
| `build_cover.py` | `pioneer-svg` (and the cover-photo transcriptions in cover.md) | `cover.json` |
| `build_pulsars.py` | `atnf` (psrcat.db read from the tarball in memory) | `pulsars.json` |
| `build_timing.py` | `jbo-glitches`, `jbo-crab` | `glitches.json`, `crab.json` |
| `build_stars.py` | `hyg`, `gaia-gl445` | `stars.json`, `sky.json` |
| `build_ephemeris.py` | `horizons-*` | `ephemeris.json`, `ephemeris_spotchecks.json` |
| `build_scenario.py` | `horizons-v1-ssb-ref`, `gaia-gl445`, `data/stars.json` | `scenario.json` |
| `checks.py` | `data/*.json` | PASS/FAIL lines; exit 1 on any failure (under 1 s) |
| `build_all.py` | | runs every builder, then `checks.py` |
| `common.py` | | paths, deterministic JSON writer, `tools/sources.json` lookup and registration |

## Network sources (queries)

The Gaia and Horizons queries are sources like any other: each is one `tools/sources.json` entry whose
URL is the full GET query, downloaded by `fetch-sources.mjs` and checksummed. The builders never touch
the network. To (re)create the entries: `python -P tools/data/build_stars.py --register` and
`python -P tools/data/build_ephemeris.py --register`, then fetch the new ids (Horizons: no more than
one request every 2 seconds). A changed query must get a new id: registering a known id with a
different URL is refused, so a recorded checksum always describes the file it was taken from.

## The pulsar map extraction (svgmap.py)

The Voyager map is the Pioneer map (docs/research/cover.md 1f). From the raw SVG: all straight
strokes; the origin is the least-squares intersection of the long radial strokes; the 15 strokes leaving the origin seed the 14 pulsar lines and the galactic-centre line; each
line is walked outward from the origin (lateral tolerance 8 units, gap tolerance 60 units), strokes claimed by two lines
go to the nearer one, the axis is the median stroke azimuth beyond 60 units; a parallel first stroke
within 25 units of the inner segment's end makes the line broken; perpendicular strokes on the solid
line are z ticks; marks beyond it are binary digits (a dash is 0, a bar is 1, long dashes are runs of
zeros). B1240-64's digits are read from the parallel track beside its own line. Every tolerance and its
basis is commented in the file.

Angles are measured counter-clockwise from the drawn galactic-centre line (raw SVG azimuths are
kept as `svgAzimuthDeg`). The research's undocumented origin (868.216, 1211.581) is kept only as a
reference: run from it, the same extraction reproduces the research's raw angles to 0.01 deg (a
check). Our own origin is 0.55 units away; with it and the drawn-line zero, published angles differ
from the research's by up to 0.22 deg (B0950+08), each within its measured origin turn plus 0.099 deg
plus 0.01 deg.

`checks.py` proves the extraction against independent data: all 14 binaries equal Johnston's
transcription of the Voyager diagram, the integers equal Sagan, Salzman Sagan and Drake (1972) Table 1,
angles agree with catalogue longitudes within 3 deg, and r and |z| reproduce the research
digitization within 0.001 R0.
