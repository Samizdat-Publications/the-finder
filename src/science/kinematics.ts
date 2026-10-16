// The Trail (PLAN.md chapter 4): which star is the object flying straight away from, and for how long?
// Pure and deterministic: noise comes only from seeded streams (random.ts), one fork per star, so the
// result does not depend on the order of the catalogue.
//
// For each catalogued star near the craft with a full velocity (radial velocity known):
//   angle = angle between (craft velocity relative to the star) and (craft position minus star
//           position). Zero means the craft is moving straight away from that star.
//   distance over speed = |craft - star| / |relative velocity|: for the star it came from, the time
//           since it left.
//
// MEASUREMENT MODEL (a model, labelled as one; the sigma columns come from it):
// The alien measures every star with the precision Gaia DR3 achieved for its own star seen from the
// Sun, taken from the observer's covariances (epoch.ts homeObserver; Gaia DR3 1-sigma errors on
// parallax, proper motion and radial velocity). For each star:
//   - its position error is the Gaia position error at the catalogue epoch (measPosCov, essentially
//     the parallax error along the line of sight), scaled by (its distance from the observer / the
//     home star's catalogue distance from the Sun)^2, because parallax distance errors grow with the
//     square of distance;
//   - its velocity relative to the observer carries the observer's own velocity covariance (velCov:
//     0.15 km/s along the line of sight from the radial velocity, about 6e-4 km/s across it from the
//     proper motions), unscaled (radial-velocity errors do not grow with distance; the transverse part
//     is negligible either way);
//   - both error ellipsoids are rotated so that the line of sight Gaia used (Sun to home star) points
//     along the alien's line of sight to that star (the same instrument, aimed at that star);
//   - the craft's own state is exact: it is in the alien's hands. The observer's own star has no
//     error relative to the observer.
// Correlations between position and velocity errors are ignored (as the published Gaia
// correlations are; see epoch.ts).

import { KM_S_TO_PC_PER_YEAR, add, angleBetweenDeg, cross, dot, norm, scale, sub, unitVector, type Vec3 } from './astro';
import type { BodyState, Observer } from './epoch';
import { starStateAt } from './epoch';
import { createRng } from './random';
import { goldenMax, mean, sd } from './stats';
import type { StarCatalogue, StarRecord } from './types';

/**
 * A star is "consistent with the craft flying straight away from it" when its trail angle is at most this
 * many of its own sigma (angleDeg / angleSigmaDeg <= 2). The threshold of trail.uniqueWithErrors
 * (step4c spec; kinematics.test.ts); The Trail's checker uses the same.
 */
export const TRAIL_CONSISTENT_SIGMA = 2;

/** Step of the radial-velocity grid in minAngleNoRv, km/s (kinematics.test.ts, trail.uniqueNoRv). */
const NO_RV_GRID_KMS = 0.25;

/**
 * For a star without a measured radial velocity: the smallest angle between the craft's velocity relative
 * to the star and the direction from the star to the craft, over every radial velocity |v_r| <= vmaxKmS,
 * counting only values that put the star within maxDistPc of the craft at decimalYear. A 0.25 km/s grid,
 * then golden-section refinement around the best grid point (the search of trail.uniqueNoRv). Returns
 * null when no radial velocity in range puts the star within maxDistPc. Deterministic.
 */
export function minAngleNoRv(
  craft: BodyState,
  star: StarRecord,
  decimalYear: number,
  vmaxKmS: number,
  maxDistPc: number,
): { vrKmS: number; angleDeg: number } | null {
  const s0 = starStateAt({ ...star, rvKmS: null }, decimalYear); // v_r = 0 (starStateAt's rule for a missing v_r)
  const dir = unitVector(star.raDeg, star.decDeg);
  const span = KM_S_TO_PC_PER_YEAR * (decimalYear - star.epoch); // pc of displacement per km/s of v_r
  const at = (vr: number): { angle: number; dist: number } => {
    const p = add(s0.posPc, scale(dir, vr * span));
    const v = add(s0.velKmS, scale(dir, vr));
    const sep = sub(craft.posPc, p);
    return { angle: angleBetweenDeg(sub(craft.velKmS, v), sep), dist: norm(sep) };
  };
  let local = { vr: 0, angle: Infinity };
  for (let vr = -vmaxKmS; vr <= vmaxKmS + 1e-9; vr += NO_RV_GRID_KMS) {
    const r = at(vr);
    if (r.dist <= maxDistPc && r.angle < local.angle) local = { vr, angle: r.angle };
  }
  if (local.angle === Infinity) return null;
  const lo = Math.max(-vmaxKmS, local.vr - NO_RV_GRID_KMS);
  const hi = Math.min(vmaxKmS, local.vr + NO_RV_GRID_KMS);
  const g = goldenMax((vr) => (at(vr).dist <= maxDistPc ? -at(vr).angle : -Infinity), lo, hi);
  const refined = -g.f < local.angle ? { vr: g.x, angle: -g.f } : local;
  return { vrKmS: refined.vr, angleDeg: refined.angle };
}

export interface TrailEntry {
  star: StarRecord;
  distPc: number;
  angleDeg: number;
  angleSigmaDeg: number;
  distOverSpeedYears: number;
  distOverSpeedSigmaYears: number;
  /** 2.5th and 97.5th percentiles of the simulated distance-over-speed measurements, years. */
  distOverSpeedInterval95?: [number, number];
}

type Mat3 = [Vec3, Vec3, Vec3];

/** Lower Cholesky factor of a symmetric positive semi-definite 3x3 matrix (zero pivots allowed). */
export function choleskyPsd(A: readonly (readonly number[])[]): Mat3 {
  const L = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const a = (i: number, j: number): number => A[i]![j] as number;
  const tr = Math.abs(a(0, 0)) + Math.abs(a(1, 1)) + Math.abs(a(2, 2));
  for (let j = 0; j < 3; j++) {
    let d = a(j, j);
    for (let k = 0; k < j; k++) d -= L[j]![k]! * L[j]![k]!;
    // Pivots at rounding level of the trace are zero directions (a rank-deficient covariance).
    const ljj = d > 1e-14 * tr ? Math.sqrt(d) : 0;
    L[j]![j] = ljj;
    for (let i = j + 1; i < 3; i++) {
      let s = a(i, j);
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      L[i]![j] = ljj > 0 ? s / ljj : 0;
    }
  }
  return L.map((r) => [r[0]!, r[1]!, r[2]!] as Vec3) as Mat3;
}

function matVec(M: Mat3, v: Vec3): Vec3 {
  return [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
}

/**
 * Rotation taking unit vector a onto unit vector b or onto -b, whichever is closer (Rodrigues). A
 * covariance is unchanged by flipping the sign of the axis, so this avoids the 180 deg singularity.
 */
function rotationOnto(a: Vec3, bIn: Vec3): Mat3 {
  const b = dot(a, bIn) >= 0 ? bIn : scale(bIn, -1);
  const v = cross(a, b);
  const c = dot(a, b);
  const k = 1 / (1 + c);
  const [x, y, z] = v;
  return [
    [1 - k * (y * y + z * z), -z + k * x * y, y + k * x * z],
    [z + k * x * y, 1 - k * (x * x + z * z), -x + k * y * z],
    [-y + k * x * z, x + k * y * z, 1 - k * (x * x + y * y)],
  ];
}

function quantile(sorted: readonly number[], q: number): number {
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return (sorted[lo] as number) + (pos - lo) * ((sorted[hi] as number) - (sorted[lo] as number));
}

/** Stars within maxDistPc of the craft (both lists, distance known), sorted by id. */
function starsNear(craft: BodyState, stars: StarCatalogue, maxDistPc: number): { star: StarRecord; posPc: Vec3; velKmS: Vec3; full: boolean }[] {
  const out: { star: StarRecord; posPc: Vec3; velKmS: Vec3; full: boolean }[] = [];
  for (const star of [...stars.near, ...stars.sky]) {
    if (star.distPc === null) continue;
    const st = starStateAt(star, craft.decimalYear);
    if (norm(sub(craft.posPc, st.posPc)) <= maxDistPc) out.push({ star, posPc: st.posPc, velKmS: st.velKmS, full: st.fullVelocity });
  }
  return out.sort((a, b) => a.star.id - b.star.id);
}

/** How many catalogued stars lie within maxDistPc of the craft, and how many of those lack a radial velocity. */
export function trailCensus(craft: BodyState, stars: StarCatalogue, maxDistPc: number): { within: number; fullVelocity: number; noRadialVelocity: number } {
  const near = starsNear(craft, stars, maxDistPc);
  const full = near.filter((s) => s.full).length;
  return { within: near.length, fullVelocity: full, noRadialVelocity: near.length - full };
}

/**
 * For every star within maxDistPc of the craft with a full velocity: the angle between the craft's
 * velocity relative to the star and the direction from the star to the craft, and distance over
 * relative speed. Exact columns from catalogue values; sigma columns from `draws` seeded simulated
 * measurements (see the measurement model above). Sorted by exact angle, then id.
 *
 * angleSigmaDeg is the larger of (a) the spread of the simulated angles and (b) the per-axis spread
 * of the simulated direction about the exact one, sqrt((mean(a_i^2) - a_0^2) / 2). Near zero the angle
 * cannot go negative, so its own spread understates the error (a 2D Gaussian's radius has spread 0.66
 * sigma); (b) is the right scale there, and taking the larger keeps the test for other stars honest.
 */
export function trail(
  craft: BodyState,
  stars: StarCatalogue,
  observer: Observer,
  opts: { maxDistPc: number; draws: number; seed: string },
): TrailEntry[] {
  const measPosCov = observer.measPosCov ?? observer.posCov;
  const measDist = observer.measDistPc ?? norm(observer.posPc);
  const Lp = choleskyPsd(measPosCov);
  const Lv = choleskyPsd(observer.velCov);
  // Gaia's line of sight: the principal axis of the parallax-only position covariance (Sun to home star).
  const losAxis = principalAxis(measPosCov);
  const root = createRng(opts.seed);
  const k = KM_S_TO_PC_PER_YEAR;
  const out: TrailEntry[] = [];
  for (const s of starsNear(craft, stars, opts.maxDistPc)) {
    if (!s.full) continue;
    const d0 = sub(craft.posPc, s.posPc);
    const v0 = sub(craft.velKmS, s.velKmS);
    const angle0 = angleBetweenDeg(v0, d0);
    const dos0 = norm(d0) / (norm(v0) * k);
    const fromObs = sub(s.posPc, observer.posPc);
    const distObs = norm(fromObs);
    const isObserver = s.star.id === observer.starId || distObs < 1e-9;
    const angles: number[] = [];
    const doss: number[] = [];
    if (!isObserver && opts.draws > 1) {
      const R = rotationOnto(losAxis, scale(fromObs, 1 / distObs));
      const ps = distObs / measDist;
      const posScale = ps * ps;
      const rng = root.fork(`star-${s.star.id}`);
      for (let i = 0; i < opts.draws; i++) {
        const zp: Vec3 = [rng.normal(), rng.normal(), rng.normal()];
        const zv: Vec3 = [rng.normal(), rng.normal(), rng.normal()];
        const p = add(s.posPc, scale(matVec(R, matVec(Lp, zp)), posScale));
        const v = add(s.velKmS, matVec(R, matVec(Lv, zv)));
        const d = sub(craft.posPc, p);
        const vr = sub(craft.velKmS, v);
        angles.push(angleBetweenDeg(vr, d));
        doss.push(norm(d) / (norm(vr) * k));
      }
    }
    let angleSigma = 0;
    let dosSigma = 0;
    let interval: [number, number] = [dos0, dos0];
    if (angles.length > 1) {
      const perAxis = Math.sqrt(Math.max(0, (mean(angles.map((a) => a * a)) - angle0 * angle0) / 2));
      angleSigma = Math.max(sd(angles), perAxis);
      dosSigma = sd(doss);
      const sorted = doss.slice().sort((a, b) => a - b);
      interval = [quantile(sorted, 0.025), quantile(sorted, 0.975)];
    }
    out.push({
      star: s.star,
      distPc: norm(d0),
      angleDeg: angle0,
      angleSigmaDeg: angleSigma,
      distOverSpeedYears: dos0,
      distOverSpeedSigmaYears: dosSigma,
      distOverSpeedInterval95: interval,
    });
  }
  return out.sort((a, b) => a.angleDeg - b.angleDeg || a.star.id - b.star.id);
}

/** Unit eigenvector of the largest eigenvalue of a symmetric PSD 3x3 matrix (power iteration). */
function principalAxis(A: readonly (readonly number[])[]): Vec3 {
  const M: Mat3 = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i]![j] as number) as unknown as Vec3) as Mat3;
  let v: Vec3 = [1, 1, 1];
  for (let i = 0; i < 200; i++) {
    const w = matVec(M, v);
    const n = norm(w);
    if (n === 0) return [1, 0, 0];
    v = scale(w, 1 / n);
  }
  return v;
}
