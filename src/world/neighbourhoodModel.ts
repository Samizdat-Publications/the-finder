// The neighbourhood chart's model: the catalogued stars within about 10 pc of the craft at the discovery
// epoch, the craft and its velocity, the alien's star, and the trail geometry for any star. Pure: no
// three.js, no DOM, no randomness (the trail's error bars come from kinematics.trail with its own seed).
// Tested in neighbourhoodModel.test.ts.
//
// Frame: Galactic Cartesian axes (x toward the Galactic centre, z toward the north Galactic pole),
// origin at the craft at the discovery epoch, unit pc. Every position is epoch.ts starStateAt for that
// star minus the craft's position (discoveryState), rotated into Galactic axes; nothing is recomputed.
// Stars without a radial velocity are placed with v_r = 0 (starStateAt's rule) and flagged: over the
// 44,000 years since their catalogue epoch an unknown v_r moves them along their old line of sight from
// the Sun by about 0.045 pc per km/s, so their depth is uncertain.

import { KM_S_TO_PC_PER_YEAR, angleBetweenDeg, cross, norm, scale, sub, toGalacticCartesian, type Vec3 } from '../science/astro';
import { absMagV, apparentMagnitude, discoveryState, findHomeStar, starStateAt, type DiscoveryState } from '../science/epoch';
import { trailCensus, type TrailEntry } from '../science/kinematics';
import type { ScenarioData, StarCatalogue, StarRecord } from '../science/types';
import { bvToSrgb } from './skyModel';

/** The Trail's catalogue radius around the craft, pc (PLAN.md chapter 4; kinematics.test.ts uses the same 10 pc). */
export const NEIGHBOURHOOD_RADIUS_PC = 10;

/**
 * Point size from absolute V magnitude, CSS px (a display choice): linear in magnitude (so in log
 * luminosity), 1.6 px at M = 16 and fainter, 0.45 px brighter per magnitude, capped at 10 px. The Sun
 * (M 4.81) is 6.6 px, a typical red dwarf (M 12) 3.4 px. Monotonic: brighter is never smaller.
 */
export function absMagToRadiusPx(absMag: number): number {
  return Math.min(10, Math.max(1.6, 1.6 + 0.45 * (16 - absMag)));
}

/**
 * Point size from apparent V magnitude as the craft sees the star, CSS px (a display choice, M5 step 0c): the
 * brighter in the craft's sky, the bigger, 1.9 px at magnitude 12.5 and fainter, 0.45 px more per magnitude
 * brighter, capped at 9.5 px (the Sun at -0.8 is 8.0 px, a magnitude-6 star 4.8 px). Monotonic: brighter is
 * never smaller. The encounter scene sizes its sprites from the same apparent magnitudes (skyModel.magToSprite)
 * on a naked-eye scale; a chart stretches the range so the faint neighbours stay visible.
 */
export function appMagToRadiusPx(appMag: number): number {
  return Math.min(9.5, Math.max(1.9, 1.9 + 0.45 * (12.5 - appMag)));
}

export interface ChartStar {
  star: StarRecord;
  label: string;
  /** Position relative to the craft, Galactic Cartesian, pc. */
  posPc: Vec3;
  /** starStateAt's output for the epoch, unchanged (ICRS, SSB frame). */
  icrsPosPc: Vec3;
  icrsVelKmS: Vec3;
  distFromCraftPc: number;
  /** false: no radial velocity, so the position along the old line of sight is uncertain. */
  fullVelocity: boolean;
  /** pc of depth shift per km/s of unknown radial velocity (elapsed years since the catalogue epoch times 1 km/s). */
  depthPcPerKmS: number;
  isSun: boolean;
  isHome: boolean;
  /** sRGB from B-V exactly as the encounter scene colours its stars (skyModel.bvToSrgb, D-A21). */
  colour: [number, number, number];
  /** Apparent V magnitude as seen from the craft (epoch.apparentMagnitude). */
  appMag: number;
  radiusPx: number;
}

export interface NeighbourhoodModel {
  decimalYear: number;
  disc: DiscoveryState;
  /** Craft velocity relative to the Sun, Galactic axes, km/s. */
  craftVelGal: Vec3;
  stars: ChartStar[];
  /** kinematics.trailCensus for the same radius (the chart must show the same stars the trail table counts). */
  census: { within: number; fullVelocity: number; noRadialVelocity: number };
  sunIndex: number;
  homeIndex: number;
}

export function starLabel(s: StarRecord): string {
  if (s.id === 0) return 'Sun';
  return s.name ?? s.gl ?? (s.hip !== null ? `HIP ${s.hip}` : `HYG ${s.id}`);
}

/** The stars within radiusPc of the craft at the discovery epoch, sorted by id. */
export function computeNeighbourhood(scenario: ScenarioData, cat: StarCatalogue, radiusPc = NEIGHBOURHOOD_RADIUS_PC): NeighbourhoodModel {
  const disc = discoveryState(scenario, cat);
  const t = disc.decimalYear;
  const craft = disc.craft.posPc;
  const homeId = findHomeStar(scenario, cat).id;
  const stars: ChartStar[] = [];
  for (const star of [...cat.near, ...cat.sky]) {
    if (star.distPc === null) continue;
    const st = starStateAt(star, t);
    const rel = sub(st.posPc, craft);
    const d = norm(rel);
    if (d > radiusPc) continue;
    const appMag = apparentMagnitude(absMagV(star), d);
    stars.push({
      star,
      label: starLabel(star),
      posPc: toGalacticCartesian(rel),
      icrsPosPc: st.posPc,
      icrsVelKmS: st.velKmS,
      distFromCraftPc: d,
      fullVelocity: st.fullVelocity,
      depthPcPerKmS: KM_S_TO_PC_PER_YEAR * Math.abs(t - star.epoch),
      isSun: star.id === 0,
      isHome: star.id === homeId,
      colour: bvToSrgb(star.ci),
      appMag,
      radiusPx: appMagToRadiusPx(appMag),
    });
  }
  stars.sort((a, b) => a.star.id - b.star.id);
  return {
    decimalYear: t,
    disc,
    craftVelGal: toGalacticCartesian(disc.craft.velKmS),
    stars,
    census: trailCensus(disc.craft, cat, radiusPc),
    sunIndex: stars.findIndex((s) => s.isSun),
    homeIndex: stars.findIndex((s) => s.isHome),
  };
}

export interface TrailGeometry {
  starIndex: number;
  /** The star's position (chart frame, pc); the craft is at the origin. */
  starPosPc: Vec3;
  /** Unit vector of the craft's velocity relative to the star (Galactic axes), and its speed, km/s. */
  relVelDir: Vec3;
  relSpeedKmS: number;
  /** Unit vector from the star to the craft (Galactic axes). */
  awayDir: Vec3;
  /** kinematics.trail's numbers, unchanged (the drawn vectors are the catalogue's; the label shows the measurement). */
  angleDeg: number;
  /** The alien's measured angle and its 95% cut (kinematics.ts, WHAT THE ALIEN SEES), deg. */
  measuredAngleDeg: number;
  nullAngle95Deg: number;
  angleSigmaDeg: number;
  distOverSpeedYears: number;
  /** Points of the arc between awayDir and relVelDir at the craft, radius arcPc (pc). */
  arc: Vec3[];
}

const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));

/**
 * The trail drawing for one kinematics.trail row: the craft's velocity relative to that star (from the
 * same starStateAt velocity) and the line from the star to the craft, with the arc between them. The
 * angle shown is the row's own angleDeg; neighbourhoodModel.test.ts checks the drawn vectors make it.
 */
export function trailGeometry(model: NeighbourhoodModel, entry: TrailEntry, arcPc = 0.8, arcPoints = 32): TrailGeometry | null {
  const starIndex = model.stars.findIndex((s) => s.star.id === entry.star.id);
  const s = model.stars[starIndex];
  if (!s) return null;
  const relVel = toGalacticCartesian(sub(model.disc.craft.velKmS, s.icrsVelKmS));
  const relVelDir = unit(relVel);
  const awayDir = unit(scale(s.posPc, -1));
  // Slerp from awayDir to relVelDir (angle between them from the same vectors).
  const om = (angleBetweenDeg(awayDir, relVelDir) * Math.PI) / 180;
  const arc: Vec3[] = [];
  const axis = cross(awayDir, relVelDir);
  if (om > 1e-6 && norm(axis) > 1e-12) {
    for (let i = 0; i <= arcPoints; i++) {
      const f = i / arcPoints;
      const a = Math.sin((1 - f) * om) / Math.sin(om);
      const b = Math.sin(f * om) / Math.sin(om);
      arc.push(scale([a * awayDir[0] + b * relVelDir[0], a * awayDir[1] + b * relVelDir[1], a * awayDir[2] + b * relVelDir[2]], arcPc));
    }
  }
  return {
    starIndex,
    starPosPc: s.posPc,
    relVelDir,
    relSpeedKmS: norm(relVel),
    awayDir,
    angleDeg: entry.angleDeg,
    measuredAngleDeg: entry.measuredAngleDeg,
    nullAngle95Deg: entry.nullAngle95Deg,
    angleSigmaDeg: entry.angleSigmaDeg,
    distOverSpeedYears: entry.distOverSpeedYears,
    arc,
  };
}

/**
 * Tint by trail angle (a display choice): 0 deg (flying straight away) bright warm gold, through pale
 * grey at 90 deg, to dim blue-grey at 180 deg (flying straight toward). sRGB 0..1. The angle sets the
 * colour monotonically: warmth (red minus blue) falls as the angle grows.
 */
export function angleTint(angleDeg: number): [number, number, number] {
  const f = Math.min(1, Math.max(0, angleDeg / 180));
  const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;
  if (f <= 0.5) {
    const x = f / 0.5;
    return [lerp(1.0, 0.75, x), lerp(0.82, 0.75, x), lerp(0.3, 0.75, x)];
  }
  const x = (f - 0.5) / 0.5;
  return [lerp(0.75, 0.32, x), lerp(0.75, 0.4, x), lerp(0.75, 0.55, x)];
}
