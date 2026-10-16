// Where was the map made? Fit the map's origin from its 14 bearings (PLAN.md chapter 2; docs/research/
// cover.md sections 1d, 2 and 3). Galactic Cartesian, in the galactic plane: unknowns the origin
// (x, y) in pc and a common rotation alpha of the map; data the map angles; residuals the wrapped
// differences between each map angle plus alpha and the bearing from the origin to the pulsar's
// in-plane position at the map epoch. The map's line lengths enter only as weak, heavy-tailed
// constraints with a free scale. Pure and deterministic: seeded streams only.

import { KMS_PER_MASYR_PC, KM_S_TO_PC_PER_YEAR, add, scale, sub, toGalacticCartesian, type Vec3 } from './astro';
import { drawDistanceKpc, eastNorth, type AlienPulsar, type DistanceModel } from './pulsarEpoch';
import { wrapDeg } from './pulsars';
import { createRng } from './random';
import { chiSquareCdf, erfc } from './stats';
import type { CoverMapLine } from './types';

const DEG = Math.PI / 180;

export interface MapPoint {
  name: string;
  /** Map angle, deg, counter-clockwise from the drawn galactic-centre line. */
  angleDeg: number;
  /** Line length over the centre-line length R0 (the map's in-plane distance). */
  rOverR0: number;
  /** The pulsar's position at the map epoch, galactic Cartesian, pc (x to the centre, z to the north pole). */
  posPc: Vec3;
  /** The catalogue distance the position was built from, kpc, and its error model (for the Monte Carlo). */
  distKpc: number;
  distance: DistanceModel;
}

/**
 * The map lines as triangulation inputs at the story epoch, in the alien's own frame: each identified
 * pulsar's position relative to the observer, moved back over the dated elapsed time by the proper
 * motion the observer measures (relative to itself), so the points are relative to where the observer
 * was at the map epoch. `entries[i]` is the pulsar assigned to `lines[i]`. Radial relative velocities
 * are unknown (up to about 110 km/s from the observer's own motion, about 5 pc along each line of sight
 * in 44,000 yr); seen from an origin a few pc away that bends a bearing to a pulsar 200 pc off by under
 * 0.05 deg, against a map sigma of about 1.5 deg.
 */
export function mapPointsAtEpoch(lines: readonly CoverMapLine[], entries: readonly AlienPulsar[], elapsedYears: number): MapPoint[] {
  return lines.map((l, i) => {
    const a = entries[i];
    if (!a || a.distKpc === null) throw new Error(`line ${l.bname}: no pulsar with a distance assigned`);
    const dPc = a.distKpc * 1000;
    let pos = scale(a.nHat, dPc);
    if (a.pmraObs !== null && a.pmdecObs !== null) {
      const [e, q] = eastNorth(a.raDeg, a.decDeg);
      const vRel = scale(add(scale(e, a.pmraObs), scale(q, a.pmdecObs)), KMS_PER_MASYR_PC * dPc);
      pos = sub(pos, scale(vRel, KM_S_TO_PC_PER_YEAR * elapsedYears));
    }
    return { name: l.bname, angleDeg: l.mapAngleDeg, rOverR0: l.rOverR0, posPc: toGalacticCartesian(pos), distKpc: a.distKpc, distance: a.distance };
  });
}

export interface FitOptions {
  /** Include the line lengths (Cauchy loss, free scale). Default true. */
  useLengths?: boolean;
  /** Fixed angle sigma, deg (Monte Carlo refits); otherwise estimated from the residuals. */
  sigmaThetaDeg?: number;
  /** Fixed length scale (Cauchy width, natural-log units); otherwise estimated from the residuals. */
  lengthScale?: number;
  /** Starting point [x, y, alphaDeg, lnScale]; otherwise a multi-start over alpha. */
  start?: [number, number, number, number];
}

export interface OriginFit {
  originPc: [number, number];
  alphaDeg: number;
  /** ln of the map's distance scale (pc per R0). */
  lnScale: number;
  sigmaThetaDeg: number;
  lengthScale: number;
  residualsDeg: number[];
  /** Plain rms of the angle residuals, deg. */
  rmsDeg: number;
  lengthResiduals: number[];
  objective: number;
}

/**
 * Huber tuning constant, in units of sigma: 1.345 gives 95% efficiency for Gaussian residuals while
 * capping the pull of any one line (Huber 1964; the standard choice).
 */
export const HUBER_K = 1.345;

/**
 * E[psi(Z)^2] for psi the Huber function at HUBER_K and Z standard normal:
 * 2 Phi(k) - 1 - 2 k phi(k) + 2 k^2 (1 - Phi(k)) (Huber 1981, Robust Statistics, section 7.7).
 */
export const HUBER_BETA = (() => {
  const k = HUBER_K;
  const phi = Math.exp(-0.5 * k * k) / Math.sqrt(2 * Math.PI);
  const Phi = 1 - 0.5 * erfc(k / Math.SQRT2);
  return 2 * Phi - 1 - 2 * k * phi + 2 * k * k * (1 - Phi);
})();

function residuals(points: readonly MapPoint[], th: readonly number[]): { ang: number[]; len: number[]; dAng: number[][]; dLen: number[][] } {
  const [x, y, a, ls] = th as [number, number, number, number];
  const ang: number[] = [];
  const len: number[] = [];
  const dAng: number[][] = [];
  const dLen: number[][] = [];
  for (const p of points) {
    const dx = (p.posPc[0] as number) - x;
    const dy = (p.posPc[1] as number) - y;
    const r2 = dx * dx + dy * dy;
    const bearing = Math.atan2(dy, dx) / DEG;
    ang.push(wrapDeg(p.angleDeg + a - bearing));
    // d bearing / dx = dy / r^2, d bearing / dy = -dx / r^2 (radians); residual = angle + alpha - bearing.
    dAng.push([-(dy / r2) / DEG, (dx / r2) / DEG, 1, 0]);
    len.push(Math.log(p.rOverR0) + ls - 0.5 * Math.log(r2));
    // d(-ln r)/dx = dx / r^2, d(-ln r)/dy = dy / r^2.
    dLen.push([dx / r2, dy / r2, 0, 1]);
  }
  return { ang, len, dAng, dLen };
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

function solve4(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] as number]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c] as number) > Math.abs(M[piv]![c] as number)) piv = r;
    [M[c], M[piv]] = [M[piv] as number[], M[c] as number[]];
    const d = M[c]![c] as number;
    if (Math.abs(d) < 1e-300) return Array.from({ length: n }, () => 0);
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = (M[r]![c] as number) / d;
      for (let j = c; j <= n; j++) M[r]![j] = (M[r]![j] as number) - f * (M[c]![j] as number);
    }
  }
  return M.map((row, i) => (row[n] as number) / (row[i] as number));
}

/**
 * One robust fit by iteratively reweighted Gauss-Newton: Huber weights on the angle residuals
 * (scale sigma_theta), Cauchy weights on the log-length residuals (scale gamma). When not given,
 * sigma_theta is re-estimated each pass by Huber's Proposal 2 (consistent for Gaussian errors, with
 * n - 3 degrees of freedom for the origin and rotation),
 * and gamma as the median absolute log-length residual (the Cauchy scale is its MAD).
 */
function fitOnce(points: readonly MapPoint[], start: number[], opts: FitOptions): OriginFit {
  const useL = opts.useLengths !== false;
  let th = [...start];
  if (useL && opts.start === undefined) {
    const r0 = residuals(points, th);
    th[3] = (th[3] as number) - median(r0.len);
  }
  let sig = opts.sigmaThetaDeg ?? 1.5;
  let gam = opts.lengthScale ?? 0.7;
  for (let iter = 0; iter < 200; iter++) {
    const r = residuals(points, th);
    const wA = r.ang.map((v) => Math.min(1, (HUBER_K * sig) / Math.max(Math.abs(v), 1e-12)));
    if (opts.sigmaThetaDeg === undefined) {
      // Huber's Proposal 2: sigma^2 = sum psi(r / sigma)^2 sigma^2 / ((n - 3) beta), psi(u) = clip(u, -k, k),
      // beta = E[psi(Z)^2] for a standard normal Z, which makes the scale consistent for Gaussian errors.
      const psi2 = r.ang.reduce((acc, v) => acc + Math.min((v / sig) ** 2, HUBER_K * HUBER_K), 0);
      sig = Math.max(1e-3, sig * Math.sqrt(psi2 / (Math.max(r.ang.length - 3, 1) * HUBER_BETA)));
    }
    if (useL && opts.lengthScale === undefined) gam = Math.max(1e-3, median(r.len.map((v) => Math.abs(v - median(r.len)))));
    const wL = r.len.map((v) => 1 / (1 + (v / gam) ** 2));
    const np = useL ? 4 : 3;
    const A = Array.from({ length: np }, () => Array.from({ length: np }, () => 0));
    const g = Array.from({ length: np }, () => 0);
    const add = (row: number[], res: number, w: number): void => {
      for (let i = 0; i < np; i++) {
        g[i] = (g[i] as number) + w * (row[i] as number) * res;
        for (let j = 0; j < np; j++) A[i]![j] = (A[i]![j] as number) + w * (row[i] as number) * (row[j] as number);
      }
    };
    r.ang.forEach((v, i) => add(r.dAng[i] as number[], v, (wA[i] as number) / (sig * sig)));
    if (useL) r.len.forEach((v, i) => add(r.dLen[i] as number[], v, (wL[i] as number) / (gam * gam)));
    const step = solve4(A, g.map((x) => -x));
    // Limit the origin step to 200 pc per pass (bearings are strongly nonlinear near the pulsars).
    const s = Math.hypot(step[0] as number, step[1] as number);
    const f = s > 200 ? 200 / s : 1;
    th = th.map((x, i) => x + (i < np ? f * (step[i] as number) : 0));
    if (s * f < 1e-6 && Math.abs(step[2] as number) < 1e-9) break;
  }
  const r = residuals(points, th);
  const huber = (u: number): number => (Math.abs(u) <= HUBER_K ? 0.5 * u * u : HUBER_K * (Math.abs(u) - 0.5 * HUBER_K));
  const objective = r.ang.reduce((s, v) => s + huber(v / sig), 0) + (useL ? r.len.reduce((s, v) => s + 0.5 * Math.log1p((v / gam) ** 2), 0) : 0);
  return {
    originPc: [th[0] as number, th[1] as number],
    alphaDeg: wrapDeg(th[2] as number),
    lnScale: th[3] as number,
    sigmaThetaDeg: sig,
    lengthScale: gam,
    residualsDeg: r.ang,
    rmsDeg: Math.sqrt(r.ang.reduce((s, v) => s + v * v, 0) / r.ang.length),
    lengthResiduals: r.len,
    objective,
  };
}

/** Robust fit of the map's origin; a multi-start over alpha (every 30 deg) from the frame origin unless a start is given. */
export function fitMapOrigin(points: readonly MapPoint[], opts: FitOptions = {}): OriginFit {
  if (opts.start) return fitOnce(points, opts.start, opts);
  let best: OriginFit | null = null;
  for (let a = 0; a < 360; a += 30) {
    const f = fitOnce(points, [0, 0, a, 0], opts);
    // Compare by the angle rms (the sigma scales differ between starts).
    if (!best || f.rmsDeg < best.rmsDeg) best = f;
  }
  return best as OriginFit;
}

export interface OriginRegion {
  fit: OriginFit;
  /** Centre (the best fit) and covariance of the origin, pc and pc^2. */
  centerPc: [number, number];
  cov: [[number, number], [number, number]];
  /** 95% ellipse semi-axes, pc, and the major axis's direction, deg of galactic longitude. */
  semiAxesPc: [number, number];
  majorAxisDeg: number;
  draws: [number, number][];
}

/** Squared radius of the 95% ellipse for 2 degrees of freedom: -2 ln(0.05) = 5.991. */
export const CHI2_2DOF_95 = -2 * Math.log(0.05);

/**
 * The 95% region by Monte Carlo: each draw adds Gaussian noise of sigma_theta (the fit's own estimate)
 * to the map angles and redraws every pulsar's distance from its error model (parallax error when the
 * distance is a parallax, a factor 1.3 otherwise), then refits; the region is the ellipse of the draws'
 * covariance around the best fit, scaled to 95% for two dimensions.
 */
export function originRegion(points: readonly MapPoint[], opts: { draws: number; seed: string; useLengths?: boolean }): OriginRegion {
  const fit = fitMapOrigin(points, { useLengths: opts.useLengths });
  const rng = createRng(opts.seed);
  const draws: [number, number][] = [];
  const start: [number, number, number, number] = [fit.originPc[0], fit.originPc[1], fit.alphaDeg, fit.lnScale];
  for (let k = 0; k < opts.draws; k++) {
    const pts = points.map((p) => {
      const d = drawDistanceKpc(p.distKpc, p.distance, rng);
      const f = d / p.distKpc;
      return { ...p, angleDeg: p.angleDeg + fit.sigmaThetaDeg * rng.normal(), posPc: [p.posPc[0] * f, p.posPc[1] * f, p.posPc[2] * f] as Vec3 };
    });
    const f = fitMapOrigin(pts, { useLengths: opts.useLengths, start, sigmaThetaDeg: fit.sigmaThetaDeg, lengthScale: fit.lengthScale });
    draws.push(f.originPc);
  }
  const mx = draws.reduce((s, d) => s + d[0], 0) / draws.length;
  const my = draws.reduce((s, d) => s + d[1], 0) / draws.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const d of draws) {
    sxx += (d[0] - mx) ** 2;
    syy += (d[1] - my) ** 2;
    sxy += (d[0] - mx) * (d[1] - my);
  }
  const n1 = draws.length - 1;
  const cov: [[number, number], [number, number]] = [[sxx / n1, sxy / n1], [sxy / n1, syy / n1]];
  const tr = cov[0][0] + cov[1][1];
  const det = cov[0][0] * cov[1][1] - cov[0][1] * cov[0][1];
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l2 = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const majorAxisDeg = (0.5 * Math.atan2(2 * cov[0][1], cov[0][0] - cov[1][1])) / DEG;
  return {
    fit,
    centerPc: fit.originPc,
    cov,
    semiAxesPc: [Math.sqrt(CHI2_2DOF_95 * l1), Math.sqrt(CHI2_2DOF_95 * Math.max(l2, 0))],
    majorAxisDeg: ((majorAxisDeg % 360) + 360) % 360,
    draws,
  };
}

/** Squared Mahalanobis distance of an in-plane point from the region's centre. */
export function regionMahalanobis2(region: OriginRegion, xy: readonly [number, number]): number {
  const [[a, b], [, d]] = region.cov;
  const det = a * d - b * b;
  const dx = xy[0] - region.centerPc[0];
  const dy = xy[1] - region.centerPc[1];
  return (d * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
}

export function insideRegion(region: OriginRegion, xy: readonly [number, number]): boolean {
  return regionMahalanobis2(region, xy) <= CHI2_2DOF_95;
}

/** Probability content of the ellipse through a point (for reports). */
export function regionLevel(region: OriginRegion, xy: readonly [number, number]): number {
  return chiSquareCdf(regionMahalanobis2(region, xy), 2);
}
