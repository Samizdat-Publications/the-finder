# Research: the spacecraft, where it is, where it is going, and hosting limits

_Planning research, 2026-10-15. Scripts and Horizons outputs: `docs/research/data/voyager/`. Renders of
NASA's model (the record cover on the bus, six sides of the bus):
`docs/research/data/voyager/renders/nasaClose_az000.png` and `nasaRing_sheet.png`._

## Top takeaways

1. NASA's `Voyager.glb` (3.1 MB, 20,390 triangles) already contains the Golden Record cover on the bus,
   but only as a soft 222 px texture on a 20-triangle disc inside a 17,570-triangle body mesh. Build a
   dedicated record, case, cover and cartridge.
2. JPL Horizons works but sends no CORS headers. A precomputed table is accurate enough (90-day nodes:
   406 rows, 52 km max error; 30-day nodes: 1,218 rows, 1.9 km), so no proxy is needed.
3. NASA: Voyager 1 reaches one light-day from Earth on **2026-11-18 at 10:16:07 UTC** (not 15 Nov). A
   Horizons run agrees within 16 s.
4. NASA's own star-flyby figures disagree with each other. The Gaia-based Bailer-Jones numbers for
   Gliese 445 and Ross 248 hold up when redone with Gaia DR3.
5. Cloudflare allows 25 MiB per static file, and Workers Static Assets ignored `Range` in every test:
   long seekable audio must be split and fetched whole, or come from R2.

## 1. NASA 3D models

- **science.nasa.gov** (credit NASA VTAD, 2019-04-22): https://science.nasa.gov/resource/voyager-3d-model/
  - `Voyager.glb`, 3,128,204 bytes:
    https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/v/Voyager.glb ;
    `Voyager.usdz` 1,229,256 bytes (same folder). Both send `Accept-Ranges: bytes` and
    `Access-Control-Allow-Origin: *`; self-host anyway.
  - Plain glTF 2.0 (no Draco): 4 nodes/meshes, 5 materials, 20,390 triangles, 23,928 vertices, no
    animation, no named sub-parts.
  - Textures: three embedded 1024 x 1024 PNG base-colour atlases (1.47, 0.31, 0.45 MB) with baked AO; no
    normal or metal-rough maps. A 128 x 128 alpha PNG sits on a 12-triangle transparent 1 m cube named
    "clear" (looks like a leftover).
  - Y-up, metres (dish 3.81 m). Extents X -3.88..3.87, Y -2.03..9.00, Z -4.21..12.70 m; the
    magnetometer boom runs along +Z.
- **GitHub mirror** https://github.com/nasa/NASA-3D-Resources (about 5.3 GB; fetch raw files only):
  - `3D Models/Voyager Probe (A)/Voyager Probe (A).glb`: 285,936 bytes, Draco, 29,911 triangles, 16
    flat-colour materials, no textures.
  - `3D Models/Voyager Probe (B)/Voyager Probe (B).glb`: 1,720,864 bytes; the same geometry and mesh
    names as NASA's model, re-encoded with Draco plus EXT_texture_webp (needs DRACOLoader).
    `(B) (antenna).glb`: 166,352 bytes.
  - `3D Printing/Voyager/`: 15 untextured binary STLs (bus, dish, booms, arms, legs, pins, instruments,
    stand), about 2.76 MB, about 55k triangles.
  - Raw URL pattern:
    https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Voyager%20Probe%20(B)/Voyager%20Probe%20(B).glb
- **Legacy:** data.nasa.gov NASA-420 "Voyager Probe" 3DS (99,526 polygons), zip link now redirects; old
  .blend files (19.51 and 12.92 MB) appear only in a search snippet. No official FBX or OBJ.
- **Usage:** "All of these assets are free to download and use" (science.nasa.gov/3d-resources), per
  the NASA Media Usage Guidelines; the GitHub README says "free and without copyright"; acknowledge NASA,
  do not imply endorsement; the NASA insignia and logotype are not public domain.
- **The record in the models:** NASA's `Voyager.glb` (and Probe B) has a gold cover disc on one bus face:
  normal +X, centre (0.948, 0.000, -0.002) m, 0.314 m diameter, 20 triangles; the engraved diagrams are
  legible but occupy only 222 x 222 px of the atlas (U 0.010..0.227, V 0.169..0.385). No groove side, no
  cartridge mount. Probe (A) has only a featureless white disc.
- **Sketchfab** (licence labels from the public API): NASA "Voyager (3D printable)" CC BY-NC 4.0;
  Sidharth1 "Voyager 1" CC BY (NASA geometry); Sheikh Miah "Voyager 1&2" CC BY; illidroid "Voyager-1" CC
  BY (description claims the record; unverified); Kami Rapacz "Voyager Golden Record" (315,377 faces,
  cover included, not downloadable). No CC0 Voyager models.

## 2. Spacecraft facts

Sources: NSSDC https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-084A ; PDS
https://pds-rings.seti.org/voyager/uvs/vg1host.html

- **Bus:** decagonal, 47 cm high, 1.78 m flat to flat (NSSDC); PDS says about 2 m across and 60 cm
  deep. Bays numbered 1 to 10 clockwise as seen from Earth. HGA boresight -z, science boom toward +y
  (bay 3), RTG boom toward -y (bay 8) (PDS).
- **High-gain antenna:** 3.66 m (NSSDC); NASA writes "3.7 meter".
- **Booms:** magnetometer boom 13 m; science boom about 2.5 m carrying the scan platform; two 10 m whip
  antennas at right angles (PWS/PRA). RTGs mounted end to end on a deployable boom (length not stated).
- **Mass:** 721.9 kg (NSSDC), 815 kg (PDS), about 825 kg after solid-motor jettison.
- **Record:** a 12-inch gold-plated copper disk
  (https://science.nasa.gov/mission/voyager/voyager-golden-record-overview/). The aluminium cover is
  etched with the playback diagrams and shields against micrometeorites
  (https://www.nasa.gov/image-detail/the-sounds-of-earth-record-cover). Ultra-pure U-238, about 0.00026
  microcurie, a 2 cm spot (https://science.nasa.gov/mission/voyager/golden-record-cover/).
- **Mounting:** on the outside of the bus on a spider mount that also holds the stylus cartridge, cover
  outward, image side facing the spacecraft (secondary: http://cedmagic.com/featured/voyager/voyager-record.html).
  NASA's own model shows the cover outward on a bus face, mid-height, between louvred bays.
- **RTGs (3 x MHW):** each 24 pressed PuO2 spheres, about 4.5 kg Pu-238 (about 13.5 kg total; the
  clocks research derives 4.25 kg and 12.8 kg from the 80 at.% design basis), 37.7 kg, about 2,400 W
  thermal and 157 W electrical at launch, 312 SiGe couples (https://en.wikipedia.org/wiki/MHW-RTG);
  NSSDC: 40.6 cm diameter x 50.8 cm long, 39 kg, beryllium case. Per spacecraft at launch about 470 W
  (NSSDC) or 475 W from 7,000 W of heat (PDS).
- **Power now:** NASA "225 We" as of 2023 and about 4 W lost per year
  (https://science.nasa.gov/blogs/voyager/2026/04/17/nasa-shuts-off-instrument-on-voyager-1-to-keep-spacecraft-operating/);
  about 213 W now by extrapolation (not a NASA figure).

## 3. JPL Horizons

- Endpoint https://ssd.jpl.nasa.gov/api/horizons.api (docs https://ssd-api.jpl.nasa.gov/doc/horizons.html);
  IDs -31 and -32 (https://ssd.jpl.nasa.gov/api/horizons_lookup.api?sstr=voyager). Tested query (Sun
  centre; use `500@399` for Earth):
  `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='-31'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='VECTORS'&CENTER='500@10'&START_TIME='2026-10-15'&STOP_TIME='2026-10-16'&STEP_SIZE='1 d'&VEC_TABLE='3'&OUT_UNITS='KM-S'&CSV_FORMAT='YES'`
  CSV columns JDTDB, date, X, Y, Z, VX, VY, VZ, LT, RG, RR between `$$SOE` and `$$EOE`.
- **2026-10-15 19:00 TDB:**

| | From Sun | From Earth (geocentre) | One-way light time | Speed vs Sun |
|---|---|---|---|---|
| Voyager 1 | 2.5740e10 km (172.061 AU) | 2.5811e10 km (172.535 AU) | 23.915 h | 16.918 km/s |
| Voyager 2 | 2.1574e10 km (144.214 AU) | 2.1577e10 km (144.236 AU) | 19.993 h | 15.263 km/s |

- Velocities (ecliptic J2000, km/s): V1 (-2.0698, -13.6113, 9.8318); V2 (4.2034, -9.3403, -11.3166).
- Coverage ends at A.D. 2100-JAN-01 TDB.
- **CORS: none** (GET with an Origin header returns no CORS headers; OPTIONS returns 405). Not tested in a
  live browser.
- **Recommendation:** ship a precomputed table: cubic Hermite interpolation of position plus velocity
  nodes, tested against 5-day truth over 2000-2100 for V1: 90-day nodes (406 rows) max error 52 km;
  30-day nodes (1,218 rows) 1.9 km; 180-day nodes (203 rows) 402 km. About 20 to 40 KB of JSON. Earth
  can be analytic. A Worker proxy (CORS header plus Cache API) only if live refreshes are ever wanted;
  calling Horizons from Workers was not tested and no rate limit is documented. (The 3I/ATLAS console
  already uses this pattern: `C:\Users\stewa\Documents\Claude\3I ATLAS Anomaly Console\tools\fetch_ephemeris.py`.)

## 4. Mission status (as of 2026-10-15)

- **One light-day:** NASA: "On Wednesday, Nov. 18, 2026, at 2:16:07 a.m. PST" Voyager 1 is 16.094
  billion miles (25.902 billion km) from Earth, one light-day
  (https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/), 10:16:07 UTC. The
  geometric Horizons crossing is 2026-11-18 10:17:00 TDB (about 10:15:51 UTC). Today V1 is at 0.9965
  light-days. Earlier press dates (13 and 15 Nov) were early estimates.
- **Instruments** (https://science.nasa.gov/mission/voyager/instruments/):

| | Voyager 1 | Voyager 2 |
|---|---|---|
| Running | MAG, PWS (2) | CRS, MAG, PWS (3) |
| CRS | off 2025-02-25 | on |
| LECP | off 2026-04-17 (0.5 W scan motor left on) | off 2025-03-24 |
| PLS | off 2007-02-01 | off 2024-09-26 |

- The instruments page says V2's CRS is "scheduled to be turned off ... in 2026", but the 2026-08-04
  post says all three V2 instruments continue for at least another year.
- **Events** (feed https://science.nasa.gov/blogs/voyager/feed/): 2025-03-05 CRS (V1) and LECP (V2)
  shutdowns ("only a few more months of power" otherwise); 2025-05-14 V1's primary roll thrusters, dead
  since 2004, revived before DSS-43 went offline for upgrades; 2026-02-27 unexpected V1 power drop during
  a roll, then the LECP shutdown 2026-04-17 (about a year of margin expected); 2026-08-04 the "Big Bang"
  power swap succeeded on V2
  (https://science.nasa.gov/blogs/voyager/2026/08/04/nasa-engineers-help-prolong-voyager-2s-science-mission/),
  V1 to follow "in the coming months" (no report yet).
- **End of mission:** enough power for at least one instrument "into the 2030s", with caveats
  (https://science.nasa.gov/blogs/voyager/2025/03/05/nasa-turns-off-2-voyager-science-instruments-to-extend-mission/).
  Launches: V2 1977-08-20, V1 1977-09-05.
- The epilogue must say "as of" its data date, and the build should re-check the status feed before
  shipping (M7).

## 5. Future stellar encounters

- **NASA wording (inconsistent):**
  - Older JPL page (Wayback 2023-12-25,
    https://web.archive.org/web/20231225023834/https://voyager.jpl.nasa.gov/mission/interstellar-mission/):
    V1 within **1.6 ly** of AC+79 3888 in about 40,000 yr (Camelopardalis); V2 **1.7 ly** from Ross 248
    in about 40,000 yr; V2 **4.3 ly** from Sirius in **296,000 yr**.
  - Current FAQ (https://science.nasa.gov/mission/voyager/frequently-asked-questions/): V1 within **1.7
    ly** in **year 40,272 AD** (calls the star Ursa Minor; IAU boundaries say Camelopardalis); V2 about
    1.7 ly from Ross 248 in about 40,000 yr; no Sirius.
  - PIA17461: V1 will be "closer to this star than our own sun" in about 40,000 years
    (https://science.nasa.gov/photojournal/heading-toward-gliese-445/).
- **Bailer-Jones and Farnocchia 2019** (RNAAS 3, 59, Gaia DR2; Table 1 in
  https://www.mpia-hd.mpg.de/~calj/voyager_gdr2/voyager_gdr2.pdf ; extended https://arxiv.org/abs/1912.03503):

| Craft | Star | Time | Min distance | Relative speed |
|---|---|---|---|---|
| V1 | Proxima Cen (first) | 16.7 kyr | 1.072 pc | 43.2 km/s |
| V1 | **Gl 445 (= AC+79 3888; earliest within 1 pc)** | **44.0 kyr (44.0-44.1)** | **0.575 pc (1.88 ly)** | **116.0 km/s** |
| V1 | TYC 3135-52-1 (formal closest) | 302.7 kyr | 0.296 pc | 46.5 km/s |
| V2 | Proxima Cen (first) | 20.3 kyr | 0.878 pc | 46.3 km/s |
| V2 | Ross 248 (closest) | 42.0 kyr (41.9-42.2) | 0.529 pc (1.73 ly) | 72.3 km/s |

  - TYC 3135-52-1 may be a binary with unreliable astrometry; Sirius and Alpha Cen are not in Gaia DR2.
  - **Asymptotes** (barycentric ICRF): V1 RA 262.8760, Dec +12.3199, 16.6048 km/s; V2 RA 316.2717, Dec
    -67.5491, 14.8550 km/s. V1 points into Ophiuchus (0.87 deg from Rasalhague), V2 into Pavo. NASA:
    V1 about 35 deg north of the ecliptic at about 3.5 AU/yr; V2 about 48 deg south at about 3.1 AU/yr.
    Horizons today: 16.918 km/s (3.57 AU/yr) and 15.263 km/s (3.22 AU/yr); Sun-only asymptotic speeds
    16.610 and 14.855 km/s match the paper.
- **Gaia DR3 recheck** (linear motion, no Galactic potential, the paper's asymptotes): Gl 445 44.1 kyr,
  0.573 pc, 115.9 km/s (DR3 parallax 190.33 mas, RV -111.50 km/s); Ross 248 42.3 kyr, 0.533 pc, 71.9
  km/s; TYC 3135-52-1 (RUWE 2.20, RV -19.06 +/- 5.42) moves to about 439 kyr, 0.46 pc (soft). No
  published Voyager-specific DR3 update was found.
- **The neighbour twist (from separate searches, to be confirmed in M1 with the star model):** Ross 248
  comes within 0.934 pc of the Sun in about 36 kyr (Gaia DR3 encounter paper, Bailer-Jones 2022,
  https://arxiv.org/abs/2207.06258) and is the Sun's nearest star for about 9,000 years; Gliese 445 is
  about 1.06 pc (3.45 ly) from the Sun when Voyager 1 passes it, roughly tied with Ross 248 as the
  Sun's nearest star (https://en.wikipedia.org/wiki/Gliese_445).

## 6. Cloudflare hosting

- **Workers Static Assets:** 25 MiB per file on Free and Paid; 20,000 files per Worker version on Free,
  100,000 on Paid with Wrangler 4.34.0 or later
  (https://developers.cloudflare.com/workers/platform/limits/ ,
  https://developers.cloudflare.com/changelog/post/2025-09-02-increased-static-asset-limits/).
- **Pages:** 25 MiB per asset; 20,000 files on Free, 100,000 on paid plans
  (https://developers.cloudflare.com/pages/platform/limits/).
- **R2 free tier:** 10 GB-month, 1M Class A and 10M Class B operations per month, free egress; `r2.dev`
  is throttled and dev-only, so use a custom domain (https://developers.cloudflare.com/r2/pricing/).
  The current wrangler login has no R2 scope.
- **Range requests on Static Assets: not supported in tests.** `Range: bytes=0-99` returned HTTP 200 with
  the full body and no `Accept-Ranges` or `Content-Range` on antikythera.stewartgregerson.workers.dev
  (an MP3 and an HDR), cut-and-fill.stewartgregerson.workers.dev (a JS bundle) and a developers.cloudflare.com
  PNG. The open-source asset worker has no range logic. Ranges do work from R2 through a Worker
  (`range: request.headers`), from the CDN cache, and via Workers Caching.
- **Why it matters:** Safari and iOS rely on range requests for seeking. Audio fetched whole (then a Blob
  URL, or `decodeAudioData` for short clips) needs no ranges.
- **Sizing:** 25 MiB holds 54.6 min at 64 kbps, 27.3 min at 128 kbps, 18.2 min at 192 kbps. Split
  tracks below that.

## Could not confirm

- Which bus bay holds the record, and NASA text (not just images) saying the cover faces outward.
- RTG boom length.
- Official launch mass (721.9, 815, about 825 kg all appear).
- A NASA-stated 2026 RTG wattage.
- Whether Pages static assets honour Range; Static Assets behaviour on files over 1.7 MB.
- Calling Horizons from a Worker.
- The old nasa3d .blend files.
- The Gaia DR3 flyby numbers are a linear recalculation, not a published result; the Sirius figure
  exists only on NASA's older pages.
