// Dating the map at the story's epoch from the alien's own pulsar measurements (PLAN.md chapters 2
// and 4; docs/research/clocks.md section 3b): one pulsar at a time with a seeded Monte Carlo, the old
// pulsars combined by a robust rule, and the alternative fit of one shared age and the observer's
// velocity. Pure and deterministic: seeded streams only.

import { KMS_PER_MASYR_PC, add, dot, norm, scale, sub, type Vec3 } from './astro';
import type { Observer } from './epoch';
import { characteristicAgeYears, elapsedFromSpin, mapPeriod, type CandidateView } from './pulsars';
import {
  MODEL_DISTANCE_LN_SIGMA, N_PRIOR_OLD, N_PRIOR_YOUNG, OLD_TAU_C_YEARS, cholesky3, drawDistanceKpc, eastNorth, timingNoiseSigma,
  type AlienPulsar,
} from './pulsarEpoch';
import { createRng } from './random';
import { weightedMean } from './stats';
import type { CoverMapLine } from './types';
import { C_KM_S, HYDROGEN_HZ, JULIAN_YEAR_S, PARSEC_KM } from './units';

const PC_PER_LIGHT_YEAR = (C_KM_S * JULIAN_YEAR_S) / PARSEC_KM;

/** The alien's catalogue entry as an identification candidate (pulsars.ts identifyLines). */
export function alienCandidateView(a: AlienPulsar): CandidateView {
  return { jname: a.jname, bname: a.bname, p: a.pObs, pdot: a.pdotMeas, lDeg: a.lDeg };
}

export interface DateOptions {
  seed: string;
  /** Monte Carlo draws (spec: at least 2,000). */
  draws: number;
  /** Move the measurements into the Sun's rest frame using this measured observer state and its covariance. */
  reframe?: Observer;
  /** Fix the braking index (tests); otherwise drawn from the old or young prior. */
  fixedN?: number;
  /** Monte Carlo over the timing noise (default true). */
  timingNoise?: boolean;
  /** Monte Carlo over the map period's one-LSB precision (default true). */
  mapPrecision?: boolean;
  /** Hydrogen frequency the alien reads the map with (default the maser value). */
  hz?: number;
}

export interface PulsarAge {
  jname: string;
  young: boolean;
  tauCYears: number;
  /** Elapsed time since the map was made, as of the observer's now, years: one value per draw, in draw order. */
  samples: Float64Array;
  median: number;
  sigma: number;
  lo: number;
  hi: number;
}

function quantileSorted(xs: Float64Array, q: number): number {
  const pos = q * (xs.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = xs[i] as number;
  const b = xs[Math.min(i + 1, xs.length - 1)] as number;
  return a + f * (b - a);
}

function summarise(jname: string, young: boolean, tauCYears: number, samples: Float64Array): PulsarAge {
  const sorted = Float64Array.from(samples).sort();
  let m = 0;
  for (const s of samples) m += s;
  m /= samples.length;
  let v = 0;
  for (const s of samples) v += (s - m) * (s - m);
  return {
    jname, young, tauCYears, samples,
    median: quantileSorted(sorted, 0.5),
    sigma: Math.sqrt(v / (samples.length - 1)),
    lo: quantileSorted(sorted, 0.025),
    hi: quantileSorted(sorted, 0.975),
  };
}

/** Observer states for every draw, shared by all pulsars dated with the same seed (their errors are correlated). */
function frameDraws(obs: Observer, draws: number, seed: string): { X: Vec3[]; V: Vec3[] } {
  const rng = createRng(seed).fork('frame');
  const Lx = cholesky3(obs.posCov);
  const Lv = cholesky3(obs.velCov);
  const mul = (L: number[][], z: number[]): Vec3 => [0, 1, 2].map((i) => (L[i] as number[]).reduce((a, l, k) => a + l * (z[k] as number), 0)) as unknown as Vec3;
  const X: Vec3[] = [];
  const V: Vec3[] = [];
  for (let k = 0; k < draws; k++) {
    X.push(add(obs.posPc, mul(Lx, [rng.normal(), rng.normal(), rng.normal()])));
    V.push(add(obs.velKmS, mul(Lv, [rng.normal(), rng.normal(), rng.normal()])));
  }
  return { X, V };
}

const frameCache = new Map<string, { X: Vec3[]; V: Vec3[] }>();

/**
 * Elapsed time since the map epoch for one pulsar, with a 95% interval from a seeded Monte Carlo over:
 * the braking index (old U[2, 4], young U[0.9, 3.2]; the alien does not know the Crab's or Vela's
 * long-term n), the timing noise (the long-term Pdot is Pdot_meas / (1 + s z), s per pulsar), the map period's
 * one-LSB precision (N + U[-0.5, 0.5] hydrogen periods) and, when reframing, the observer's measured
 * position and velocity (drawn from their covariance, the same draw for every pulsar), the pulsar's
 * distance (parallax error, or a factor 1.3) and proper-motion errors. The reframe inverts
 * pulsarEpoch.ts: P_ssb = P_obs gamma (1 + beta . n) / (1 + v_t . (n_obs - n_ssb) / c),
 * Pdot_ssb = Pdot - P (|v_t,rel|^2 - |v_t|^2) / (c d), and the received state belongs to the SSB epoch
 * T + (d_ssb - d_obs) / c, so the time since the map as of T is the inverted time minus that offset.
 */
export function datePulsar(entry: AlienPulsar, line: CoverMapLine, opts: DateOptions): PulsarAge {
  if (entry.pdotMeas === null || !(entry.pdotMeas > 0)) throw new Error(`datePulsar: ${entry.jname} has no spin-down`);
  const hz = opts.hz ?? HYDROGEN_HZ;
  const tau = characteristicAgeYears(entry.pObs, entry.pdotMeas);
  const young = tau < OLD_TAU_C_YEARS;
  const prior = young ? N_PRIOR_YOUNG : N_PRIOR_OLD;
  const rng = createRng(opts.seed).fork(`pulsar/${entry.jname}`);
  const obs = opts.reframe;
  let frame: { X: Vec3[]; V: Vec3[] } | null = null;
  if (obs) {
    const key = `${opts.seed}|${opts.draws}|${obs.posPc.join(',')}|${obs.velKmS.join(',')}|${JSON.stringify(obs.posCov)}|${JSON.stringify(obs.velCov)}`;
    frame = frameCache.get(key) ?? null;
    if (!frame) {
      frame = frameDraws(obs, opts.draws, opts.seed);
      if (frameCache.size > 64) frameCache.clear();
      frameCache.set(key, frame);
    }
  }
  const n = entry.nHat;
  const [pE, qN] = eastNorth(entry.raDeg, entry.decDeg);
  const hasPm = entry.pmraObs !== null && entry.pmdecObs !== null;
  const out = new Float64Array(opts.draws);
  for (let k = 0; k < opts.draws; k++) {
    const nb = opts.fixedN ?? prior[0] + (prior[1] - prior[0]) * rng.uniform();
    const z = opts.timingNoise === false ? 0 : rng.normal();
    const u = opts.mapPrecision === false ? 0 : rng.uniform() - 0.5;
    const pMap = (line.valueTH + u) / hz;
    let p = entry.pObs;
    let pdot = entry.pdotMeas / (1 + timingNoiseSigma(entry.jname) * z);
    let lt = 0;
    if (frame && obs) {
      const X = frame.X[k] as Vec3;
      const V = frame.V[k] as Vec3;
      const beta = scale(V, 1 / C_KM_S);
      const gamma = 1 / Math.sqrt(1 - dot(beta, beta));
      const doppler = 1 / (gamma * (1 + dot(beta, n)));
      let parallax = 1;
      let shk = 0;
      if (entry.distKpc !== null) {
        const dPc = drawDistanceKpc(entry.distKpc, entry.distance, rng) * 1000;
        const R = add(X, scale(n, dPc));
        const dSsb = norm(R);
        lt = (dSsb - dPc) / PC_PER_LIGHT_YEAR;
        if (hasPm) {
          const mra = (entry.pmraObs as number) + (entry.pmraErr ?? 0) * rng.normal();
          const mde = (entry.pmdecObs as number) + (entry.pmdecErr ?? 0) * rng.normal();
          const vRel = scale(add(scale(pE, mra), scale(qN, mde)), KMS_PER_MASYR_PC * dPc);
          const vPerp = add(vRel, sub(V, scale(n, dot(V, n))));
          parallax = 1 + dot(vPerp, sub(n, scale(R, 1 / dSsb))) / C_KM_S;
          shk = (dot(vRel, vRel) - dot(vPerp, vPerp)) / (C_KM_S * dPc * PARSEC_KM);
        }
      } else {
        lt = dot(X, n) / PC_PER_LIGHT_YEAR;
      }
      p = entry.pObs / (doppler * parallax);
      pdot -= p * shk;
    }
    out[k] = elapsedFromSpin(p, pdot, pMap, nb) / JULIAN_YEAR_S - lt;
  }
  return summarise(entry.jname, young, tau, out);
}

/**
 * Robust rule for combining the old pulsars (characteristic age above 300 kyr): repeatedly find the
 * pulsar whose median is furthest, in combined standard deviations, from the inverse-variance weighted
 * mean of the others, and drop it when that is more than 4 sigma (a 6e-5 two-sided chance for a
 * consistent Gaussian pulsar, so honest pulsars are almost never dropped while a wrong map period is).
 */
export const ROBUST_SIGMA = 4;

export interface CombinedAge {
  kept: PulsarAge[];
  dropped: { age: PulsarAge; z: number }[];
  weights: Map<string, number>;
  estimate: number;
  lo: number;
  hi: number;
  sigma: number;
}

export function combineAges(ages: readonly PulsarAge[], threshold = ROBUST_SIGMA): CombinedAge {
  let kept = [...ages];
  const dropped: { age: PulsarAge; z: number }[] = [];
  while (kept.length >= 3) {
    let worst = { i: -1, z: 0 };
    kept.forEach((a, i) => {
      const others = kept.filter((_, j) => j !== i);
      const wm = weightedMean(others.map((o) => o.median), others.map((o) => o.sigma));
      const z = Math.abs(a.median - wm.mean) / Math.hypot(a.sigma, wm.sigma);
      if (z > worst.z) worst = { i, z };
    });
    if (worst.z <= threshold) break;
    dropped.push({ age: kept[worst.i] as PulsarAge, z: worst.z });
    kept = kept.filter((_, j) => j !== worst.i);
  }
  const weights = new Map<string, number>();
  let sw = 0;
  for (const a of kept) sw += 1 / (a.sigma * a.sigma);
  for (const a of kept) weights.set(a.jname, 1 / (a.sigma * a.sigma) / sw);
  const draws = kept[0]?.samples.length ?? 0;
  const comb = new Float64Array(draws);
  for (let k = 0; k < draws; k++) {
    let s = 0;
    for (const a of kept) s += (weights.get(a.jname) as number) * (a.samples[k] as number);
    comb[k] = s;
  }
  const c = summarise('combined', false, 0, comb);
  return { kept, dropped, weights, estimate: c.median, lo: c.lo, hi: c.hi, sigma: c.sigma };
}

// ---------------------------------------------------------------------------------------------
// The alternative: one shared age and the observer's velocity, from the old pulsars alone

export interface AgeVelocityFit {
  ageYears: number;
  ageSigma: number;
  velKmS: Vec3;
  /** 3x3 covariance of the velocity, (km/s)^2, marginalised over the age. */
  velCov: number[][];
  used: string[];
  dropped: string[];
  chi2: number;
}

interface FitPoint { entry: AlienPulsar; line: CoverMapLine; sigma: number }

/** Model age of one pulsar (n = 3) for a trial observer velocity V relative to the map's frame. */
function modelAge(pt: FitPoint, V: Vec3, hz: number, shklovskii = true): number {
  const e = pt.entry;
  const n = e.nHat;
  const beta = scale(V, 1 / C_KM_S);
  const gamma = 1 / Math.sqrt(1 - dot(beta, beta));
  const p = e.pObs * gamma * (1 + dot(beta, n));
  let pdot = e.pdotMeas as number;
  if (shklovskii && e.distKpc !== null && e.pmraObs !== null && e.pmdecObs !== null) {
    const dPc = e.distKpc * 1000;
    const [pE, qN] = eastNorth(e.raDeg, e.decDeg);
    const vRel = scale(add(scale(pE, e.pmraObs), scale(qN, e.pmdecObs)), KMS_PER_MASYR_PC * dPc);
    const vPerp = add(vRel, sub(V, scale(n, dot(V, n))));
    pdot -= (p * (dot(vRel, vRel) - dot(vPerp, vPerp))) / (C_KM_S * dPc * PARSEC_KM);
  }
  return elapsedFromSpin(p, pdot, mapPeriod(pt.line, hz), 3) / JULIAN_YEAR_S;
}

function bump(v: Vec3, axis: number, h: number): Vec3 {
  return [v[0] + (axis === 0 ? h : 0), v[1] + (axis === 1 ? h : 0), v[2] + (axis === 2 ? h : 0)];
}

function invert(a: number[][]): number[][] {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c] as number) > Math.abs(m[piv]![c] as number)) piv = r;
    [m[c], m[piv]] = [m[piv] as number[], m[c] as number[]];
    const d = m[c]![c] as number;
    for (let j = 0; j < 2 * n; j++) m[c]![j] = (m[c]![j] as number) / d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c] as number;
      for (let j = 0; j < 2 * n; j++) m[r]![j] = (m[r]![j] as number) - f * (m[c]![j] as number);
    }
  }
  return m.map((row) => row.slice(n));
}

/** Weighted Gauss-Newton fit of (age, Vx, Vy, Vz) to model ages; returns parameters, covariance and chi-square. */
function gaussNewton(pts: readonly FitPoint[], hz: number): { theta: number[]; cov: number[][]; chi2: number; resid: number[] } {
  let theta = [0, 0, 0, 0];
  const t0 = pts.map((pt) => modelAge(pt, [0, 0, 0], hz));
  theta[0] = t0.reduce((a, b) => a + b, 0) / t0.length;
  let cov: number[][] = [];
  let resid: number[] = [];
  for (let iter = 0; iter < 20; iter++) {
    const V: Vec3 = [theta[1] as number, theta[2] as number, theta[3] as number];
    resid = pts.map((pt) => (modelAge(pt, V, hz) - (theta[0] as number)) / pt.sigma);
    const J = pts.map((pt) => {
      const row = [-1 / pt.sigma];
      for (let a = 0; a < 3; a++) {
        // 1 km/s step: the model is linear in V to about 1e-4 over this step.
        const vp = bump(V, a, 1);
        const vm = bump(V, a, -1);
        row.push((modelAge(pt, vp, hz) - modelAge(pt, vm, hz)) / 2 / pt.sigma);
      }
      return row;
    });
    const JtJ = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => J.reduce((s, r) => s + (r[i] as number) * (r[j] as number), 0)));
    const Jtr = [0, 1, 2, 3].map((i) => J.reduce((s, r, k) => s + (r[i] as number) * (resid[k] as number), 0));
    cov = invert(JtJ);
    const step = cov.map((row) => -row.reduce((s, c, j) => s + c * (Jtr[j] as number), 0));
    theta = theta.map((x, i) => x + (step[i] as number));
    if (Math.abs(step[0] as number) < 1e-3 && Math.hypot(step[1] as number, step[2] as number, step[3] as number) < 1e-6) break;
  }
  const V: Vec3 = [theta[1] as number, theta[2] as number, theta[3] as number];
  resid = pts.map((pt) => (modelAge(pt, V, hz) - (theta[0] as number)) / pt.sigma);
  return { theta, cov, chi2: resid.reduce((s, r) => s + r * r, 0), resid };
}

/**
 * Fit one shared elapsed time and the observer's 3D velocity relative to the map's frame from the old
 * pulsars alone (no star catalogue; clocks.md 3b point 4: ageing scales with Pdot, the Doppler shift
 * with P cos theta, so the two separate). Each pulsar's model age uses n = 3 and the Shklovskii change
 * implied by the trial velocity and the measured relative proper motion. Its sigma combines the timing
 * noise (timingNoiseSigma of the age), the braking-index prior U[2, 4] (the spread of ages over n, divided by
 * sqrt(12)) and the distance uncertainty of the Shklovskii term. Light time (up to 3.5 yr) and the
 * parallax term (tens of years at most) need the observer's position, unknown here, and are left out.
 * Outliers are removed by leave-one-out prediction: the pulsar whose age is furthest from the fit of
 * the others, in combined sigmas, is dropped while that exceeds 4.
 */
export function fitAgeAndVelocity(entries: readonly { entry: AlienPulsar; line: CoverMapLine }[], opts: { hz?: number } = {}): AgeVelocityFit {
  const hz = opts.hz ?? HYDROGEN_HZ;
  // Sigma per pulsar; the distance term needs a velocity, so it is set from a first fit.
  const sigmaOf = (pt: FitPoint, V: Vec3): number => {
    const { entry, line } = pt;
    const t = modelAge(pt, V, hz);
    const pm = mapPeriod(line, hz);
    const tn = (n: number): number => elapsedFromSpin(entry.pObs, entry.pdotMeas as number, pm, n) / JULIAN_YEAR_S;
    const sN = Math.abs(tn(N_PRIOR_OLD[1]) - tn(N_PRIOR_OLD[0])) / Math.sqrt(12);
    const sTn = timingNoiseSigma(entry.jname) * t;
    // The Shklovskii term scales as 1/d: its age effect times the relative distance error.
    const rel = entry.distance.kind === 'parallax' ? entry.distance.pxErrMas / entry.distance.pxMas : MODEL_DISTANCE_LN_SIGMA;
    const sD = Math.abs(t - modelAge(pt, V, hz, false)) * rel;
    return Math.hypot(sTn, sN, sD);
  };
  let pts: FitPoint[] = entries.map(({ entry, line }) => ({ entry, line, sigma: 1 }));
  for (const pt of pts) pt.sigma = sigmaOf(pt, [0, 0, 0]);
  {
    const first = gaussNewton(pts, hz);
    const V: Vec3 = [first.theta[1] as number, first.theta[2] as number, first.theta[3] as number];
    for (const pt of pts) pt.sigma = sigmaOf(pt, V);
  }
  const dropped: string[] = [];
  for (;;) {
    if (pts.length <= 5) break;
    let worst = { i: -1, z: 0 };
    pts.forEach((pt, i) => {
      const rest = pts.filter((_, j) => j !== i);
      const f = gaussNewton(rest, hz);
      const V: Vec3 = [f.theta[1] as number, f.theta[2] as number, f.theta[3] as number];
      const pred = modelAge(pt, V, hz) - (f.theta[0] as number);
      // Prediction variance from the rest's covariance, through the gradient (-1, d age / d V).
      const g = [-1];
      for (let a = 0; a < 3; a++) {
        const vp = bump(V, a, 1);
        g.push(modelAge(pt, vp, hz) - modelAge(pt, V, hz));
      }
      // cov is in units where residuals were divided by sigma, i.e. the plain parameter covariance.
      const pv = g.reduce((s, gi, i2) => s + gi * g.reduce((s2, gj, j2) => s2 + (f.cov[i2]![j2] as number) * gj, 0), 0);
      const z = Math.abs(pred) / Math.sqrt(pt.sigma * pt.sigma + pv);
      if (z > worst.z) worst = { i, z };
    });
    if (worst.z <= ROBUST_SIGMA) break;
    dropped.push(pts[worst.i]?.entry.jname as string);
    pts = pts.filter((_, j) => j !== worst.i);
  }
  const f = gaussNewton(pts, hz);
  return {
    ageYears: f.theta[0] as number,
    ageSigma: Math.sqrt(f.cov[0]![0] as number),
    velKmS: [f.theta[1] as number, f.theta[2] as number, f.theta[3] as number],
    velCov: [1, 2, 3].map((i) => [1, 2, 3].map((j) => f.cov[i]![j] as number)),
    used: pts.map((p) => p.entry.jname),
    dropped,
    chi2: f.chi2,
  };
}

/** Squared Mahalanobis distance of v from the fit's velocity under its covariance. */
export function velocityMahalanobis2(fit: AgeVelocityFit, v: Vec3): number {
  const inv = invert(fit.velCov);
  const d = sub(v, fit.velKmS);
  return [0, 1, 2].reduce((s, i) => s + (d[i] as number) * [0, 1, 2].reduce((s2, j) => s2 + (inv[i]![j] as number) * (d[j] as number), 0), 0);
}
