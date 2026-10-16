# Research index

Planning research from 2026-10-15 (four parallel research agents, then cross-checked). Build on it;
do not redo it. Anything marked "could not confirm" is open and may need a `scout` before it is used.

| File | What it settles |
|---|---|
| `cover.md` | Every element of the cover: binary notation, the hydrogen key, the record-playing numbers (3.6 s, 53.8 min), the picture diagrams (8.34 ms, 512 lines, staggered interlace, calibration circle), the pulsar map's encoding (polar projection, in-plane distances, z ticks without sign, broken lines, longitude counter-clockwise), all 14 binary strings, the map's real errors, prior triangulation and dating work, image sources for rebuilding the cover |
| `clocks.md` | ATNF catalogue access; spin and position tables for the 14 pulsars; spin-down dating today (about 1971) and at 40,000 years, with what limits it (braking index, glitches, timing noise, observer motion, light time); the uranium-238 and RTG decay clocks with formulas and numbers; the hydrogen constant |
| `images-and-audio.md` | How the pictures are encoded on the tape; the one genuine image-tape transfer and its provenance; existing decoders and their artifacts; the record audio sources, programme order and durations; the side layout; the 116 images, colour list, and discrepancies; a malware warning |
| `voyager.md` | NASA's 3D models and what they contain; spacecraft facts; JPL Horizons usage and a precomputed-table recommendation; mission status as of October 2026 and the one-light-day date; future stellar encounters (Gaia-based); Cloudflare hosting limits including the Range finding |
| `key-physics.md` | The Key's physics, each value checked against its source on 2026-10-16: CODATA 2022 constants (Rydberg, electron-proton mass ratio, fine-structure), NIST ASD vacuum wavelengths of Lyman-alpha, H-alpha, Paschen-alpha and the ionization limit, annealed copper C11000 (CDA) and the rotating-disc burst speed (Timoshenko and Goodier) |
| `galaxy-constants.md` | The galaxy chart's display constants, checked on 2026-10-15: the distance to the Galactic centre (GRAVITY 2021, 8.275 kpc), the direction of Sgr A* (Reid and Brunthaler 2004, J2000), and the 30 ms millisecond-pulsar convention |
| `data/` | The agents' derived data and calculation scripts (reference only; scripts may point at old scratch paths) |

## Cross-report corrections (read these)

- **Map directions are good** (within about 3 deg of galactic longitude). Older re-analyses that report
  11 to 18 deg errors compared a 3D angle with the map's flat longitude; the "Crab and B0525+21
  swapped" claim depends on the catalogue distances used. Source: `cover.md` section 2.
- **Map distances are poor** (off by up to about 6 times): use directions, treat distances as weak.
- **The map's periods are the 1970/71 measurements,** not updated for 1977: a correct decoding dates
  the map about six years before launch.
- **Play time per side is 53.8 minutes** by the cover's binary (NASA rounds it to "about an hour").
- **Pu-238 per spacecraft:** 12.8 kg (derived from the 80 at.% design basis) versus about 13.5 kg
  (Wikipedia's 4.5 kg per RTG). Use the derived figure with its basis stated.
- **The uranium spot is not on the cover diagram;** its position is a documented game choice.
- **The story epoch** is Voyager 1 at Gliese 445, about 44,000 years after launch (PLAN.md). Tables
  computed at 40,000 or 40,055 years are illustrative; the science core recomputes at the configured
  epoch.
