// The Trail's pure measurements on the shared epoch model (src/chapters/shared/epochModel.ts): which star a
// trail row belongs to, the one star the craft flies straight away from, the run-back (the craft and a star
// run back together until they meet), the ruler (a distance from the alien's own star as the alien measures
// it, with its error), the bound for a star without a radial velocity, and the stars in the map's region.
// No DOM, no three.js, no randomness of its own: every number comes from the model or the science core.

import { KM_S_TO_PC_PER_YEAR, dot, norm, scale, sub, type Vec3 } from '../../science/astro';
import { starStateAt } from '../../science/epoch';
import { minAngleNoRv, trailConsistent, type TrailEntry } from '../../science/kinematics';
import { insideRegion, regionLevel } from '../../science/triangulation';
import type { StarRecord } from '../../science/types';
import { TRAIL_MAX_DIST_PC, type EpochModel } from '../shared/epochModel';

/**
 * Radial-velocity bounds for a star without one, km/s: 100 bounds nearly every nearby disc star, 300 is
 * beyond halo speeds (kinematics.test.ts, trail.uniqueNoRv; the same two numbers).
 */
export const NO_RV_VMAX_KMS = [100, 300] as const;

/**
 * What the alien calls a star on its chart: the catalogue's proper name, else its Gliese number, else its
 * Hipparcos number, else its row in the HYG catalogue. The star the craft came from is described, not
 * named: its human name would give the deduction away (the gloss of trail.origin uses the same words).
 */
export function starName(s: StarRecord): string {
  if (s.id === 0) return 'the warm-white star';
  return s.name ?? s.gl ?? (s.hip !== null ? `HIP ${s.hip}` : `HYG ${s.id}`);
}

const byIdCache = new WeakMap<EpochModel, Map<number, StarRecord>>();

/** A catalogue star by id (near and sky lists), or undefined. */
export function starById(m: EpochModel, id: number): StarRecord | undefined {
  let map = byIdCache.get(m);
  if (!map) {
    map = new Map();
    for (const s of [...m.inputs.stars.near, ...m.inputs.stars.sky]) map.set(s.id, s);
    byIdCache.set(m, map);
  }
  return map.get(id);
}

/** The alien's own star's catalogue id. */
export function homeId(m: EpochModel): number {
  const id = m.measured.starId;
  if (id === undefined) throw new Error('the measured observer has no star id');
  return id;
}

export function rowFor(m: EpochModel, starId: number): TrailEntry | null {
  return m.trailRows().find((r) => r.star.id === starId) ?? null;
}

/**
 * True when the alien's measured angle for the star is consistent with flying straight away from it: at most
 * the 95th percentile of the angles a truly radial motion would show (kinematics.ts trailConsistent).
 */
export function consistent(row: TrailEntry): boolean {
  return trailConsistent(row);
}

/** The measured angle as a multiple of the star's 95% cut (under 1: consistent). */
export function cutRatio(row: TrailEntry): number {
  return row.nullAngle95Deg > 0 ? row.measuredAngleDeg / row.nullAngle95Deg : Infinity;
}

/** Every trail row, other than the alien's own star, consistent with the craft flying straight away from it. */
export function consistentRows(m: EpochModel): TrailEntry[] {
  const home = homeId(m);
  return m.trailRows().filter((r) => r.star.id !== home && consistent(r));
}

/**
 * The star the trail points back to: the row whose measured angle is smallest against its own 95% cut (the
 * one consistent row when the trail picks one out). For about 1 seed in 20 even the true origin's measured
 * angle lies beyond its cut (an honest 95% test; trail.originCoverage); the later tools still run back to
 * this star, while trail.origin itself judges only by the cut.
 */
export function originRow(m: EpochModel): TrailEntry {
  const home = homeId(m);
  let best: TrailEntry | null = null;
  for (const r of m.trailRows()) if (r.star.id !== home && (best === null || cutRatio(r) < cutRatio(best))) best = r;
  if (!best) throw new Error('the trail has no stars');
  return best;
}

/** The other star closest to passing: the smallest measured angle against its own 95% cut (how firmly every other star is ruled out). */
export function nextBest(m: EpochModel): { row: TrailEntry; cuts: number } {
  const home = homeId(m);
  const origin = originRow(m).star.id;
  const others = m.trailRows().filter((r) => r.star.id !== home && r.star.id !== origin && r.nullAngle95Deg > 0);
  let best = others[0] as TrailEntry;
  for (const r of others) if (cutRatio(r) < cutRatio(best)) best = r;
  return { row: best, cuts: cutRatio(best) };
}

/**
 * Where the numbers come from: 'measured' (the default, what the instrument shows) takes a charted star's
 * position and velocity from the alien's one measurement (its trail row; kinematics.ts WHAT THE ALIEN SEES);
 * 'catalogue' takes the catalogue's exact values (the science tests).
 */
export type Source = 'measured' | 'catalogue';

/** The craft's velocity relative to a star, and the craft's position relative to it, at the epoch (ICRS, km/s and pc). */
export function relativeState(m: EpochModel, star: StarRecord, source: Source = 'measured'): { dPc: Vec3; vKmS: Vec3 } {
  const row = source === 'measured' ? rowFor(m, star.id) : null;
  const st = row ? { posPc: row.measuredPosPc, velKmS: row.measuredVelKmS } : starStateAt(star, m.disc.decimalYear);
  return { dPc: sub(m.disc.craft.posPc, st.posPc), vKmS: sub(m.disc.craft.velKmS, st.velKmS) };
}

/** Separation of the craft from a star, pc, when both are run back yearsAgo along their straight lines. */
export function separationAt(m: EpochModel, star: StarRecord, yearsAgo: number, source: Source = 'measured'): number {
  const { dPc, vKmS } = relativeState(m, star, source);
  return norm(sub(dPc, scale(vKmS, KM_S_TO_PC_PER_YEAR * yearsAgo)));
}

/** The run-back's meeting: the time of closest approach, years ago, and the separation then, pc. */
export function meeting(m: EpochModel, star: StarRecord, source: Source = 'measured'): { yearsAgo: number; missPc: number } {
  const { dPc, vKmS } = relativeState(m, star, source);
  const v = scale(vKmS, KM_S_TO_PC_PER_YEAR);
  const t = dot(dPc, v) / dot(v, v);
  return { yearsAgo: t, missPc: norm(sub(dPc, scale(v, t))) };
}

/**
 * The ruler: the distance from the alien's own star to a star, as the alien measures it (the star's
 * catalogue position at the epoch, minus the alien's measured position), and its 1-sigma error, the
 * measured position covariance projected on the line between them, sqrt(u^T C u) (as epoch.test.ts does
 * for epoch.neighbourDistance; the alien's position error dominates: the catalogue star is exact here).
 */
export function rulerReading(m: EpochModel, star: StarRecord): { distPc: number; sigmaPc: number } {
  const st = starStateAt(star, m.disc.decimalYear);
  const d = sub(st.posPc, m.measured.posPc);
  const dist = norm(d);
  const u = scale(d, 1 / dist);
  const C = m.measured.posCov;
  let q = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) q += (u[i] as number) * (C[i]![j] as number) * (u[j] as number);
  return { distPc: dist, sigmaPc: Math.sqrt(q) };
}

/** For a star without a radial velocity: the smallest possible trail angle for |v_r| up to each bound (null: never within 10 pc). */
export function noRvBounds(m: EpochModel, star: StarRecord): { vmaxKmS: number; angleDeg: number | null; vrKmS: number | null }[] {
  return NO_RV_VMAX_KMS.map((vmax) => {
    const r = minAngleNoRv(m.disc.craft, star, m.disc.decimalYear, vmax, TRAIL_MAX_DIST_PC);
    return { vmaxKmS: vmax, angleDeg: r?.angleDeg ?? null, vrKmS: r?.vrKmS ?? null };
  });
}

/** The near catalogue's stars at the map epoch, in the map's plane (pc from the alien's star then), and whether each lies in the region. */
export function regionStars(m: EpochModel): { star: StarRecord; xy: [number, number]; inside: boolean; level: number }[] {
  const age = m.motionFit().ageYears;
  const r = m.region();
  return m.inputs.stars.near.map((star) => {
    const xy = m.starInMapPlane(star, age);
    return { star, xy, inside: insideRegion(r, xy), level: regionLevel(r, xy) };
  });
}
