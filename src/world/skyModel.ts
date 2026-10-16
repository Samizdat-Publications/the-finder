// The sky seen from the craft at the discovery epoch, computed (CLAUDE.md rule 1). Pure: no three.js,
// no DOM, no randomness; the same inputs give the same Float32Arrays in Node (Vitest) and the browser.
//
// Every star in stars.json (near) and sky.json (sky) with a distance is moved to the epoch by straight
// lines (epoch.ts starStateAt) and seen from the craft (epoch.ts discoveryState): new direction, new
// distance, apparent V from the absolute magnitude by the distance modulus (epoch.ts
// apparentMagnitude; the Sun uses SUN_ABS_MAG_V = 4.81). Stars without a catalogued distance (206 sky
// rows) keep their catalogue direction and magnitude: HYG gives them no distance because they are far
// (no measurable parallax, beyond a few hundred pc), so the craft's 0.75 pc offset and 44,000 years of
// proper motion move them by well under the 0.1 deg a point sprite resolves at this field of view.
//
// Directions are ICRS unit vectors (x to RA 0, z to the north celestial pole). The scene maps them to
// its own axes (encounter.ts icrsToWorld).

import { norm, scale, sub, unitVector, type Vec3 } from '../science/astro';
import { absMagV, apparentMagnitude, discoveryState, starStateAt } from '../science/epoch';
import type { ScenarioData, StarCatalogue } from '../science/types';

/** Naked-eye limiting magnitude used for the shown sky (the same 6.5 that selects sky.json, data/README.md). */
export const NAKED_EYE_LIMIT_MAG = 6.5;

/**
 * Colour temperature from B-V, K: Ballesteros 2012 (EPL 97, 34008, eq. 14), derived by treating stars
 * as black bodies seen through Johnson B and V. For the Sun's B-V 0.65 it gives 5,779 K.
 */
export function bvToTemperatureK(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/**
 * CIE 1931 xy chromaticity of a black body at T kelvin: the cubic-spline fit to the Planckian locus of
 * Kim, Kang, Kim, Choi, Kim and Kim 2002 (US patent 7,024,034, eqs. for 1667 K to 25,000 K; the form
 * Wikipedia "Planckian locus" reproduces). T is clamped to that range.
 */
export function planckianXy(tK: number): { x: number; y: number } {
  const T = Math.min(25000, Math.max(1667, tK));
  const t = 1e3 / T;
  const x =
    T <= 4000
      ? -0.2661239 * t ** 3 - 0.2343589 * t ** 2 + 0.8776956 * t + 0.17991
      : -3.0258469 * t ** 3 + 2.1070379 * t ** 2 + 0.2226347 * t + 0.24039;
  let y: number;
  if (T <= 2222) y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683;
  else if (T <= 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  else y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return { x, y };
}

/** sRGB transfer function (IEC 61966-2-1). */
function srgbEncode(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/**
 * Display saturation applied to every star's chromaticity (dimensionless; a rendering choice, not
 * physics). Real stellar colours are pale; 1.8 keeps their order (blue-white to orange-red, from B-V)
 * while letting the eye see them on a monitor, as planetarium software does. 1 = true chromaticity.
 */
export const STAR_SATURATION = 1.8;

/**
 * sRGB colour (0..1, gamma-encoded, brightest channel 1) of a black body seen as a star. Path:
 * B-V to T (Ballesteros 2012), T to xy (Kim et al. 2002), xyY (Y = 1) to XYZ to linear sRGB (IEC
 * 61966-2-1 matrix, D65 white), saturation STAR_SATURATION about the luminance, normalised to the
 * brightest channel, then sRGB-encoded. B-V null (no colour index in HYG) gives white.
 */
export function bvToSrgb(bv: number | null, saturation = STAR_SATURATION): [number, number, number] {
  if (bv === null || !Number.isFinite(bv)) return [1, 1, 1];
  const { x, y } = planckianXy(bvToTemperatureK(bv));
  const X = x / y;
  const Z = (1 - x - y) / y;
  const lin: [number, number, number] = [
    3.2406 * X - 1.5372 - 0.4986 * Z,
    -0.9689 * X + 1.8758 + 0.0415 * Z,
    0.0557 * X - 0.204 + 1.057 * Z,
  ];
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const sat = lin.map((c) => Math.max(0, L + saturation * (c - L)));
  const m = Math.max(...sat);
  return [srgbEncode(sat[0]! / m), srgbEncode(sat[1]! / m), srgbEncode(sat[2]! / m)];
}

/**
 * Point sprite from apparent magnitude: a documented monotonic mapping (a display choice). Relative
 * flux to the limit, I = 10^(-0.4 (m - 6.5)), sets the sprite's core radius (r = 1.1 px I^0.22, capped
 * at 9 px: mag 6.5 is 1.1 px, mag 0 is 4.0 px, the Sun at -0.8 is 4.8 px) and its peak alpha
 * (a = 0.32 I^0.4, capped at 1: mag 6.5 is faint but visible at 0.32, brighter than about mag 4.0 is
 * full). Both are non-decreasing as m falls, and their product (the sprite's light) strictly increases.
 * Sizes are CSS pixels; the scene multiplies by the device pixel ratio.
 */
export function magToSprite(mag: number, limit = NAKED_EYE_LIMIT_MAG): { radiusPx: number; alpha: number } {
  const I = 10 ** (-0.4 * (mag - limit));
  return { radiusPx: Math.min(9, 1.1 * I ** 0.22), alpha: Math.min(1, 0.32 * I ** 0.4) };
}

export interface SkyStar {
  id: number;
  name: string | null;
  /** ICRS unit vector from the craft. */
  dir: Vec3;
  appMag: number;
  /** Distance from the craft, pc; null for stars without a catalogued distance. */
  distPc: number | null;
}

export interface ComputedSky {
  decimalYear: number;
  craftPosPc: Vec3;
  /** Star counts: near (stars.json), sky (sky.json), and shown (apparent mag <= limit, the Sun included). */
  counts: { near: number; sky: number; noDistance: number; shown: number };
  /** Shown stars, brightest first (ties by id). */
  stars: SkyStar[];
  /** Packed for the GPU: xyz direction, sRGB colour, radius px, alpha (shown stars, same order). */
  dirs: Float32Array;
  colours: Float32Array;
  radii: Float32Array;
  alphas: Float32Array;
  sun: { dir: Vec3; distPc: number; appMag: number };
}

/** The sky from the craft at the discovery epoch. */
export function computeSky(scenario: ScenarioData, cat: StarCatalogue, limit = NAKED_EYE_LIMIT_MAG): ComputedSky {
  const disc = discoveryState(scenario, cat);
  const t = disc.decimalYear;
  const obs = disc.craft.posPc;
  const all: { star: (typeof cat.near)[number]; dir: Vec3; appMag: number; distPc: number | null }[] = [];
  let noDistance = 0;
  for (const star of [...cat.near, ...cat.sky]) {
    if (star.distPc === null) {
      noDistance++;
      all.push({ star, dir: unitVector(star.raDeg, star.decDeg), appMag: star.mag, distPc: null });
      continue;
    }
    const rel = sub(starStateAt(star, t).posPc, obs);
    const d = norm(rel);
    all.push({ star, dir: scale(rel, 1 / d), appMag: apparentMagnitude(absMagV(star), d), distPc: d });
  }
  const sunRow = all.find((s) => s.star.id === 0);
  if (!sunRow || sunRow.distPc === null) throw new Error('computeSky: the Sun (id 0) is missing from stars.json');
  const shown = all.filter((s) => s.appMag <= limit).sort((a, b) => a.appMag - b.appMag || a.star.id - b.star.id);
  const n = shown.length;
  const dirs = new Float32Array(3 * n);
  const colours = new Float32Array(3 * n);
  const radii = new Float32Array(n);
  const alphas = new Float32Array(n);
  shown.forEach((s, i) => {
    dirs.set(s.dir, 3 * i);
    colours.set(bvToSrgb(s.star.ci), 3 * i);
    const sp = magToSprite(s.appMag, limit);
    radii[i] = sp.radiusPx;
    alphas[i] = sp.alpha;
  });
  return {
    decimalYear: t,
    craftPosPc: obs,
    counts: { near: cat.near.length, sky: cat.sky.length, noDistance, shown: n },
    stars: shown.map((s) => ({ id: s.star.id, name: s.star.name, dir: s.dir, appMag: s.appMag, distPc: s.distPc })),
    dirs,
    colours,
    radii,
    alphas,
    sun: { dir: sunRow.dir, distPc: sunRow.distPc, appMag: sunRow.appMag },
  };
}
