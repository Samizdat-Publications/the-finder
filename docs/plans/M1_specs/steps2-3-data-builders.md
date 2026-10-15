# M1 steps 2 and 3 spec: the data builders

Subagent: `builder-opus`. Saved from the first build session (2026-10-15), where it was stopped
before finishing for a session switch. Relaunch it with the text below as the prompt (run in the
background). Check first whether anything it produced already exists.

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit). Read `CLAUDE.md`, `docs/research/README.md`, `docs/research/cover.md` (all), `docs/research/clocks.md` sections 1 to 3, `docs/research/voyager.md` sections 3 and 5, and `docs/plans/M1.md` steps 2 and 3. This is M1 steps 2 and 3: the data builders. Other agents are working in parallel on `tools/ref-decoder/` and `src/science/`; do not touch those.

## Ground rules
- Real data only (CLAUDE.md rule 1): every JSON value comes from a source file in `sources/` (fetched and checksummed by `tools/fetch-sources.mjs`, listed in `tools/sources.json`) or is computed from one, with provenance recorded. Values transcribed from a figure (the cover photo) carry their provenance string.
- Downloads (rule 9): only sources named in `docs/research/`. Raw sources already on disk: `sources/atnf/psrcat_pkg.v2.9.0.tar.gz`, `sources/jbo-glitches/gTable.html`, `sources/jbo-crab/crab2.txt`, `sources/pioneer-svg/Pioneer_plaque.svg`, `sources/hyg/hyg_v42.csv.gz`, `sources/cover-photo/GPN-2000-001978.jpg`, `sources/cover-diagram/cover-diagram-large.jpg`. For anything new (Gaia DR3 rows, JPL Horizons tables), add an entry to `tools/sources.json` (same shape as the others, `sha256: null`, `bytes: null`) and fetch it with `node tools/fetch-sources.mjs <id>` so it is checksummed and recorded. A Horizons or Gaia TAP query is fine as a source whose URL is the full GET query; one entry per query.
- Never execute downloaded content. Read the ATNF tarball with Python's `tarfile` (read `psrcat.db` into memory; never extract executables or build the C tool).
- Python 3.14 (numpy, scipy available; user site-packages). Run scripts as `python -P tools/data/<script>.py`; each script inserts its own folder into `sys.path` if it imports siblings.
- Deterministic output: sorted keys where order does not matter, fixed float formatting (enough digits to keep full precision for the science: e.g. `repr` floats), no timestamps inside the data except a `meta.built` date (use the date only, `2026-10-15` style, from the source retrieval, so rebuilds are byte-identical on the same day... simplest: put the build date in meta, it is fine if it changes).
- No em dash anywhere. Never read .env. Do not commit.

## Files you own
`tools/data/` (builders, `checks.py`, `README.md`), `data/*.json` (outputs), `data/README.md` (schemas and units), new entries in `tools/sources.json`, and new lines in `docs/CREDITS.md` (one line per source you use: what, who, licence, URL).

## Outputs and schemas (other agents code against these; keep the field names exactly)

### 1. `data/cover.json` (`build_cover.py`)
- `record.rotationPeriod`, `record.playTime`, `picture.lineTime`, `picture.rasterLines`, `picture.lineLabels[]`: each `{ "binary": "...", "bits": n, "valueTH": integer, "meaning": "...", "location": "where on the cover", "provenance": "..." }`. Strings from `docs/research/cover.md` 1b and 1c (verified by the research by pixel-scanning GPN-2000-001978 and matching Dack and CED Magic): rotation `100110000110010000000000000000000` (33), play time `1000010110000000000000000000000000000000000` (43), line time `101101001100000000000000` (24), raster `1000000000`, labels `1`, `10`, `11`. Include the disputed small raster label as a note, not a value.
- `pulsarMap.gcLine`: `{ "lengthSvg": number, "angleDeg": 0 }`, and `pulsarMap.lines[]` (14, in counter-clockwise map order as in cover.md section 2): `{ "order": 1..14, "label1972": "1642", "bname": "B1642-03", "jname": "J1645-0317", "binary": "...", "bits": n, "valueTH": integer, "mapAngleDeg": number, "rOverR0": number, "absZOverR0": number|null, "broken": bool, "breakR0": [a,b]|null, "digitsAlongOwnLine": bool, "provenance": "..." }`. Angles are measured counter-clockwise from the galactic-centre line (cover.md 1d: this equals galactic longitude). r is the solid-line length (in-plane distance), |z| the distance from the line's outer end back to its tick, both divided by the centre-line length R0.
- **Rebuild the map geometry from the raw SVG**, not from the research's intermediate. The research's `docs/research/data/cover/pioneer_svg_lines.json` and `decode_svg.py` (read them) show what it found and which segment rules it chose by inspection; your extraction from `sources/pioneer-svg/Pioneer_plaque.svg` must reproduce its line angles within 0.01 deg, its r/R0 and |z|/R0 within 0.001, and all 14 binary strings exactly (compare in `checks.py` against the strings in cover.md section 2, which match Johnston's independent transcription). Rules derived from geometry are preferred; a per-line override is acceptable with a comment citing the research. Note the SVG y axis points down: check the counter-clockwise sense against ATNF longitudes.
- `valueTH` must be the exact integer (all fit in a double below 2^53).

### 2. `data/pulsars.json` (`build_pulsars.py`)
From `psrcat.db` in the tarball (format: `docs/research/clocks.md` section 1: `KEYWORD value [uncertainty] [ref]`, records end with `@`, `#` comments, the first comment carries the version). All 4,503 pulsars:
`{ "meta": { "catalogue": "ATNF v2.9.0", "count": 4503, "citation": "...", "built": "..." }, "pulsars": [ { "jname", "bname"|null, "p0"|null (s), "p1"|null (s/s), "f0"|null (Hz), "f1"|null (Hz/s), "f2"|null (Hz/s^2), "f3"|null (Hz/s^3), "pepoch"|null (MJD), "dm"|null, "dist"|null (kpc, catalogue best), "distDm"|null (kpc, YMW16), "px"|null (mas), "ra" (deg), "dec" (deg), "gl" (deg), "gb" (deg), "pmra"|null (mas/yr, includes cos dec), "pmdec"|null (mas/yr), "nglt"|null, "assoc"|null, "binary": bool, "f0Err"|null, "f1Err"|null } ] }`.
- Fill P0 from F0 (and P1 from F1) when only one is given, and vice versa, flagging nothing; ATNF's own `DIST` derivation rules (best distance: parallax, association, or DM model) may need computing if `DIST` is not a stored keyword; read the research and the psrcat docs, and if `dist` cannot be reproduced exactly, store `dist` from the best stored keyword in this priority (DIST_A, PX-based 1/PX when PX > 3 sigma, DIST_AMN/AMX midpoint, DIST_DM) and document the rule in data/README.md. Check against the research Table 2B for the 14 pulsars.
- Compute `gl`, `gb` from RAJ/DECJ when not stored, with the IAU/Hipparcos ICRS-to-galactic matrix; check the 14 against cover.md's "true l" within 0.01 deg.
- Keep it compact (no indentation; one pulsar per line is fine). Report the file size.

### 3. `data/glitches.json` (from `gTable.html`) and `data/crab.json` (from `crab2.txt`)
- Glitches for the 14 map pulsars (by J name): `{ "meta", "pulsars": { "J0835-4510": [ { "mjd": number, "dfOverF": number (dimensionless, NOT 1e-9 units), "df1OverF1": number|null } ] } }`. Report Vela's sum of dF/F for glitches between 1971.0 and 2026.0 (the research: 25 glitches, sum about 4.0e-5; and 14 glitches summing 1.96e-5 between the map epoch and ATNF's PEPOCH of 2000.0 was used for the Vela correction).
- Crab monthly ephemeris: `{ "meta", "rows": [ { "mjd": number, "nu": number (Hz), "nuDot": number (Hz/s), ... any other columns, documented } ] }`. Read the file's header to get the columns right; report the most recent row (the research quotes 2026-07-24: nu = 29.5357554730 Hz).

### 4. `data/stars.json` (`build_stars.py`)
From HYG v4.2 (`hyg_v42.csv.gz`, CSV; columns documented at https://codeberg.org/astronexus/hyg ; units: ra in hours, dist in pc, pm in mas/yr, rv in km/s; 100000 pc means unknown distance): `{ "meta", "near": [ ...stars with 0 < dist <= 30 pc plus the Sun ], "sky": [ ...stars with mag <= 6.5 and dist > 30 pc ] }`; each star `{ "id": HYG id, "name": proper|null, "gl": string|null, "hip": number|null, "hd": number|null, "raDeg", "decDeg", "distPc", "pmraMasYr" (HYG's pmra: confirm whether it includes cos dec and document), "pmdecMasYr", "rvKmS"|null (null when HYG has 0 and no source; document how you decide), "mag", "absmag", "spect"|null, "ci"|null, "astrometrySource": "hyg"|"gaia-dr3" }`. The Sun: `"id": 0, "name": "Sol"`, position 0, velocity 0 (the frame is the solar-system barycentre).
- **Gliese 445 from Gaia DR3:** query the Gaia archive (TAP sync at `https://gea.esac.esa.int/tap-server/tap/sync`, ADQL, CSV) for the DR3 row of Gliese 445 (find its source_id by a cone search near its position; research: DR3 parallax 190.33 mas, RV -111.50 km/s), record the query in `tools/sources.json` as `gaia-gl445`, and use its ra, dec, parallax, pmra, pmdec, radial_velocity at the Gaia epoch (J2016.0; record the epoch per star; HYG positions are J2000) to override the HYG row. Put the Gaia source_id in `data/scenario.json`.
- Report: how many near stars, how many have a radial velocity, and the 15 nearest with whether they have RVs.

### 5. `data/ephemeris.json` and `data/ephemeris_spotchecks.json` (`build_ephemeris.py`)
JPL Horizons API (`docs/research/voyager.md` section 3 has a tested query; reuse the pattern in `C:\Users\stewa\Documents\Claude\3I ATLAS Anomaly Console\tools\fetch_ephemeris.py`, read-only). Vectors with `REF_PLANE='FRAME'` (ICRF equatorial), `OUT_UNITS='KM-S'`, centre the Sun `500@10`:
- Voyager 1 (`-31`) and Voyager 2 (`-32`): 2000-01-01 to 2100-01-01 TDB at 30-day nodes (about 1,218 rows each; Horizons coverage ends 2100-JAN-01, so stop at the last node inside it). Earth (`399`): 2020-01-01 to 2040-01-01 at 10-day nodes.
- Schema: `{ "meta": { "source": "JPL Horizons", "queries": [...], "retrieved": "...", "frame": "ICRF, Sun-centred", "units": "km, km/s, TDB JD" }, "bodies": { "-31": { "jd0": number, "stepDays": 30, "rows": [[x,y,z,vx,vy,vz], ...] }, "-32": {...}, "399": { ..., "stepDays": 10 } } }`.
- Spot checks: 24 deterministic epochs (for example every 4.17 years from 2001.3, at odd hours) for -31 and -32, fetched separately at those exact times: `{ "checks": [ { "body": "-31", "jd": number, "x","y","z" (km) } ] }`. In `checks.py`, cubic Hermite interpolation of the 30-day table must match every spot check within 100 km (the research found 1.9 km max).
- Also store, from Horizons, the Voyager 1 state at 2026-10-15 19:00 TDB relative to the solar-system barycentre (`500@0`) for the scenario.
- Each distinct query URL is a `tools/sources.json` entry fetched by `fetch-sources.mjs` (the Horizons API returns JSON; that is the stored raw file), so it is checksummed. Respect Horizons: no more than one request every 2 seconds.

### 6. `data/scenario.json` (`build_scenario.py`)
`{ "id": "v1-gl445", "craft": { "name": "Voyager 1", "horizonsId": "-31", "launchUtc": "1977-09-05T12:56:00Z", "asymptote": { "raDeg": 262.8760, "decDeg": 12.3199, "speedKmS": 16.6048, "frame": "ICRS, barycentric, asymptotic", "source": "Bailer-Jones and Farnocchia 2019, RNAAS 3, 59" }, "stateRef": { "jdTdb": ..., "posKm": [...], "velKmS": [...], "center": "solar-system barycentre", "frame": "ICRF", "source": "JPL Horizons" } }, "homeStar": { "name": "Gliese 445", "otherNames": ["AC+79 3888", ...], "gaiaDr3SourceId": "...", "hygId": ... }, "discoveryRule": "closest approach of the craft to the home star, linear motion", "alternative": { "craft": "Voyager 2", "horizonsId": "-32", "asymptote": { "raDeg": 316.2717, "decDeg": -67.5491, "speedKmS": 14.8550 }, "homeStar": "Ross 248" } }`. Do NOT compute or store the discovery epoch here: the science core computes it.

### 7. `tools/data/checks.py`
Fast (under 30 s), one PASS/FAIL line per check, non-zero exit on failure: 4,503 pulsars; the 14 map pulsars present with the expected J names; cover binaries equal the cover.md section 2 strings (these strings are the independent transcription, typed in checks.py with a citation comment) and decode to the documented decimal N values; map angles within 3 deg of each pulsar's catalogue `gl` (cover.md: within about 0.2 to 2.7 deg); Hermite ephemeris vs spot checks within 100 km; stars.json contains the Sun and Gliese 445 with Gaia astrometry; every data file under 2 MB.

### 8. `data/README.md` and `tools/data/README.md`
Schemas, units, provenance, how to rebuild (`python -P tools/data/build_all.py` running every builder then checks).

## Report back (short)
Files created; file sizes; the checks output; Vela glitch sum; the latest Crab nu; star and RV counts and the 15 nearest; anything that differs from the research numbers and why; anything you could not meet.
