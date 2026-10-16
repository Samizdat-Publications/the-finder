# M4 step 2 spec: the galaxy chart and the neighbourhood chart

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 1, 4, 6, 7), `docs/plans/M4.md` (what the player does in The Map and The Trail; the deduce-on-the-instrument rule), `src/world/README.md` and `encounter.ts` (the pattern to follow: a self-contained three.js module with a handle, one render loop, dt clamped, `dispose()`; a pure model file tested in Node), `src/science/pulsarEpoch.ts` (`projectCatalogue`), `triangulation.ts`, `kinematics.ts` (`trail`), `epoch.ts` (`discoveryState`, `homeObserver`, `starStateAt`), `astro.ts`, `src/science/types.ts`, `data/README.md`, `data/cover.json` (the map lines). Another helper is doing a layout pass in `src/ui/` and the chapters' CSS; stay out of those. You build two mountable 3D charts the M4 chapters will use; no chapter logic.

## Files you own
`src/world/galaxy.ts`, `src/world/galaxyModel.ts` (pure, tested), `src/world/neighbourhood.ts`, `src/world/neighbourhoodModel.ts` (pure, tested), `src/world/chartControls.ts` (shared orbit, zoom, pick), tests (`src/world/*Model.test.ts`, `tests/browser/charts.browser.mjs`), a dev page `play/charts/index.html` with `src/play/charts/main.ts` (add one input to `vite.config.ts`, re-reading it first), and new sections in `src/world/README.md`.

## The galaxy chart (`mountGalaxy(canvas, opts) => GalaxyHandle`)
- The alien's pulsar catalogue at the discovery epoch (`projectCatalogue` with the playthrough seed passed in `opts`), each pulsar a point at its 3D position from the alien's star (Galactic Cartesian, kpc), brightness by distance and a size hint by period class (old, young, millisecond); the Galactic centre marked (direction and the modern distance with its uncertainty); the alien's star at the origin; a faint disc for the Galactic plane for orientation.
- Picking: `pick(x, y)` returns the nearest pulsar under the cursor (screen-space radius) with its catalogue entry; hover highlight.
- The map overlay: `showMap(lines, transform)` draws the cover's 15 lines (`cover.json`) as rays from a chosen origin with a chosen rotation and scale, so the chapter can let the player slide and rotate the map against the chart; `setMatches(pairs)` draws a link from each map line to the pulsar the player assigned; `showRegion(ellipse)` draws the fitted origin region (from `triangulation.ts`) as a translucent ellipse in the plane.
- Camera: orbit, zoom, `frame(target)`; reduced motion; a top-down plane view and a perspective view.

## The neighbourhood chart (`mountNeighbourhood(canvas, opts) => NeighbourhoodHandle`)
- The stars within about 10 pc of the craft at the discovery epoch (`starStateAt` for each; stars without radial velocities drawn differently and labelled as uncertain in depth), the craft and its velocity vector, the alien's star; sizes and colours from absolute magnitude and B-V (reuse the encounter scene's colour mapping).
- `pick(x, y)` returns a star; `showTrail(star)` draws the craft's velocity relative to that star and the line from the star to the craft, with the angle between them (from `kinematics.ts` exactly, not recomputed differently); `showAll(entries)` can tint every star by its trail angle.
- Camera as above.

## Tests and looking
- Node: the models' positions equal `projectCatalogue` and `starStateAt` outputs (same numbers, no second implementation); the map overlay's ray angles equal `cover.json` after the transform; the trail angle drawn equals `kinematics.trail`'s for the Sun and for three other stars; determinism for a seed. Ids `chart.galaxy`, `chart.neighbourhood`.
- Browser (`tests/browser/charts.browser.mjs`): mount both on the dev page; no console errors; picking returns the expected pulsar and star at their projected screen points; frame times at 1440x900 recorded.
- Captures (1440x900): the galaxy chart with the map overlay roughly aligned and the region shown; the neighbourhood with the Sun's trail drawn and with a wrong star's trail drawn. Look at each and fix anything wrong or ugly.

## Done when
`npm run check` passes (or fails only on the other helper's in-flight files, named). Report: files, counts shown, frame times, the capture folder and what each shows.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. Files under about 400 lines.
