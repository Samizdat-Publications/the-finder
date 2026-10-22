// "The slow future": the real pass of Voyager 1 by Gliese 445, computed live from the scenario and the star
// catalogue (src/science/epoch.ts), and the drawing of it: the Sun, Voyager 1's path, Gliese 445's path and the
// point of closest approach. The drawing is flat, so it uses distances rather than a slice through space: across
// is how far along Voyager 1's line of flight (which runs out from the Sun), up is how far from that line. With
// that choice every distance from the Sun and every distance between Voyager 1 and the star is exactly as
// computed, at every moment; only the direction around the line is dropped. Positions are the science's, only
// the drawing's choice of axes is ours, and the page says so. Pure: no DOM.

import { dot, norm, scale, sub, unitVector, type Vec3 } from '../../science/astro';
import { craftStateAt, discoveryState, findHomeStar, starStateAt } from '../../science/epoch';
import type { ScenarioData, StarCatalogue } from '../../science/types';
import { C_KM_S, JULIAN_YEAR_S, PARSEC_KM } from '../../science/units';

/** Light-years in a parsec, from the SI speed of light and the Julian year. */
export const LY_PER_PC = PARSEC_KM / (C_KM_S * JULIAN_YEAR_S);

/** The drawn stretch of the paths: this many years either side of closest approach (a design choice: wide enough to see the star pass, tight enough to see the gap). */
export const WINDOW_YEARS = 5000;

export type Pt = [number, number];

/** Across: distance along the unit vector `u` from the Sun; up: distance from the line through the Sun along `u`. */
function unroll(p: Vec3, u: Vec3): Pt {
  const along = dot(p, u);
  return [along, norm(sub(p, scale(u, along)))];
}

export interface FutureDiagram {
  /** Closest approach, from Gaia DR3 and the Horizons state of 2026. */
  minDistPc: number;
  minDistLy: number;
  yearsAfterLaunch: number;
  /** The calendar year of closest approach (AD): the launch year plus the flight time (epoch.ts keeps it as a decimal year). */
  adYear: number;
  relSpeedKmS: number;
  /** Points as [across, up] in pc: the Sun is at [0, 0]; see the header for what across and up are. */
  sun: Pt;
  /** The decimal year of each sample of the two paths, from `adYear - WINDOW_YEARS` to `adYear + WINDOW_YEARS`. */
  years: number[];
  craftPath: Pt[];
  homePath: Pt[];
  craftAtApproach: Pt;
  homeAtApproach: Pt;
  /** The drawn bounding box, pc (it includes the Sun). */
  box: { x0: number; x1: number; y0: number; y1: number };
}

/** The drawing and the numbers beside it. */
export function futureDiagram(scenario: ScenarioData, stars: StarCatalogue, samples = 100): FutureDiagram {
  const d = discoveryState(scenario, stars);
  const home = findHomeStar(scenario, stars);
  const u = unitVector(scenario.craft.asymptote.raDeg, scenario.craft.asymptote.decDeg);
  const t0 = d.decimalYear - WINDOW_YEARS;
  const t1 = d.decimalYear + WINDOW_YEARS;
  const years: number[] = [];
  const craftPath: Pt[] = [];
  const homePath: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = t0 + ((t1 - t0) * i) / samples;
    years.push(t);
    craftPath.push(unroll(craftStateAt(scenario, t).posPc, u));
    homePath.push(unroll(starStateAt(home, t).posPc, u));
  }
  const all = [...craftPath, ...homePath, [0, 0] as Pt];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  return {
    minDistPc: d.minDistPc,
    minDistLy: d.minDistPc * LY_PER_PC,
    yearsAfterLaunch: d.yearsAfterLaunch,
    adYear: d.decimalYear,
    relSpeedKmS: d.relSpeedKmS,
    sun: [0, 0],
    years,
    craftPath,
    homePath,
    craftAtApproach: unroll(d.craft.posPc, u),
    homeAtApproach: unroll(d.home.posPc, u),
    box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) },
  };
}
