# src/world: the encounter scene

Voyager 1 under the real sky of the discovery epoch (AD 46,078), lit by the alien vessel's lamps. The
Arrival chapter mounts it; `/play/scene/` is a dev page for looking at it (`?reduced=1` turns the drift
off, `?clean=1` hides the buttons).

```ts
import { mountEncounter } from '../world/encounter';
const h = mountEncounter(canvas, { reducedMotion });   // scenario and stars load on demand if not passed
const info = await h.ready;          // { decimalYear, craftPosPc, sun: { dirIcrs, appMag, distPc }, counts }
h.project('record');                 // { x, y, onScreen, occluded, visible, distance } in canvas CSS pixels
await h.frame('rtg2');               // eases the camera to a hotspot ('overview' goes back)
h.dispose();
```

## Files

| File | What |
|---|---|
| `skyModel.ts` | Pure (no three.js): the sky from the craft. Every star of `stars.json` and `sky.json` moved to the epoch (`starStateAt`), seen from `discoveryState(...).craft.posPc`, apparent V by the distance modulus (the Sun: `SUN_ABS_MAG_V` 4.81); colour from B-V; magnitude to sprite size and alpha. Tested in `skyModel.test.ts`. |
| `sky.ts` | three.js: star points and the Milky Way sphere (shader maps each view direction to galactic l, b with the Hipparcos matrix from `astro.ts`). |
| `lights.ts` | Three cool-white lamps riding with the camera, sweeping slowly; a faint starlight term; nothing else. |
| `hotspots.ts` | Anchor points in model coordinates and the projection with an occlusion test. |
| `rig.ts` | Orbit camera in the craft's frame: drift, drag, wheel zoom (0.6 to 90 m), eased framing. |
| `encounter.ts` | `mountEncounter`: renderer, one render loop (dt clamped to 0.1 s), pixel ratio capped at 2, resize, input, `dispose()`. |

## The sky, computed

- Observer: the craft at the discovery epoch, 0.749 pc from the Sun. The Sun is magnitude -0.82 there,
  at RA 82.87, Dec -12.32 (in Orion, opposite the craft's escape direction).
- Stars: near 3,934 (`stars.json`), sky 8,338 (`sky.json`, 206 of them without a distance), shown
  8,829 (apparent magnitude 6.5 or brighter from the craft, the Sun included). Stars without a
  distance keep their catalogue direction and magnitude: HYG lists no distance because they are far, so
  0.75 pc of displacement moves them well under 0.1 deg.
- Colour: B-V to temperature (Ballesteros 2012, EPL 97, 34008), temperature to CIE xy (Kim et al. 2002
  Planckian-locus fit), xy to sRGB (IEC 61966-2-1, D65 white). A display saturation of 1.8 is applied
  to every star alike (stars are pale; the hue order is the physics). The Sun therefore reads warm
  white, not yellow: a 5,780 K black body is nearly white on a D65 display, and no black body is
  "yellow" in sRGB. Stars with no B-V in HYG are white.
- Size and brightness: relative flux to the limit `I = 10^(-0.4 (m - 6.5))`; radius `1.1 px I^0.22`
  (cap 9 px), alpha `0.32 I^0.4` (cap 1). Monotonic (tested); mag 6.5 is faint but visible.
- Milky Way: ESA's Gaia EDR3 all-sky colour map, equirectangular (ESA/Gaia/DPAC, CC BY-SA 3.0 IGO;
  acknowledgement A. Moitinho), `tools/sources.json` id `gaia-sky-colour`, 4000 x 2000 PNG (18.1 MB)
  converted by `tools/sky/build-sky.mjs` to `public/media/sky/gaia-sky.webp` (1.24 MB, Gaussian
  sigma 0.8 px to tame the map's star-count grain, quality 88). The build checks the orientation on the
  map's own pixels (the Magellanic Clouds), the browser test checks the shader (Galactic centre and four
  bright stars within 0.01 deg). Display levels: black point 8/255 (the map's median above |b| = 60),
  gain 0.55. From 0.75 pc the Milky Way looks as it does from Earth (it is kiloparsecs away).

## Choices that are not physics (say so in How it's checked)

- The craft's attitude: not computable (any residual spin turns it many times over 44,000 years); the
  dish faces the Sun, as Voyager held it toward Earth in service. Roll: the minimal rotation from the
  model's +Y.
- Lamp brightness does not fall off with distance (an auto-exposed camera); pools of light 12 m and 7 m
  across (wider when far), sweeping at 0.1 to 0.2 rad/s.
- The record cover is a plain warm gold for now (gold's reflectance as an sRGB colour, roughness 0.5);
  the game swaps in the real cover. Only metals see the sky as an environment map.
- NASA's model's dish is 3.81 m across; the real one is 3.66 m. The model is shown as NASA built it.

## Hotspots (model coordinates, m: Y up through the dish, magnetometer boom toward +Z)

Measured by `node tools/world/measure-hotspots.mjs`: the middle of each part's vertex bounding box. The
browser test checks every point is within its part radius of a model vertex.

| Id | Part | Position (x, y, z) | Frame distance | Radius |
|---|---|---|---|---|
| `dish` | High-gain antenna (dish centre) | (-0.003, 1.508, 0.000) | 10 | 1.9 |
| `magnetometer` | Magnetometer boom, halfway from base (0, 0.865, 2.037) to tip sensor (0, 8.284, 11.859) | (0.000, 4.575, 6.948) | 24 | 0.4 |
| `scienceBoom` | Science boom | (-0.003, 0.837, -2.223) | 6 | 0.5 |
| `scanPlatform` | Scan platform (cameras) | (0.014, 0.348, -3.861) | 3.5 | 0.45 |
| `rtgBoom` | RTG boom | (-0.004, 0.116, 1.885) | 5.5 | 0.35 |
| `rtg1` | RTG nearest the bus (z 2.70 to 3.30) | (-0.004, -0.110, 3.000) | 2.2 | 0.37 |
| `rtg2` | Middle RTG (z 3.30 to 3.87) | (-0.004, -0.110, 3.574) | 2.2 | 0.37 |
| `rtg3` | Outer RTG (z 3.87 to 4.50) | (-0.004, -0.110, 4.185) | 2.2 | 0.37 |
| `record` | The record cover (`voyager.json` recordDisc, normal +X, radius 0.157) | (0.9485, -0.0002, -0.0021) | 1.6 | 0.02 |

The RTG axis height is the bottom of the finned cylinder plus its half-width (RTG 1: -0.334 + 0.224;
RTG 3: -0.479 + 0.362); RTG 2's box reaches lower because its support struts hang below it. The three
RTGs are 0.58 m apart, the length of one MHW-RTG.

## Checked by

`tests/browser/encounter.browser.mjs` (ids `scene.encounter`, `scene.encounter.sun`,
`scene.encounter.milkyway`) and `src/world/skyModel.test.ts`.
