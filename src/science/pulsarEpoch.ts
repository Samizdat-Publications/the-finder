// The pulsar sky at the story's epoch: every ATNF pulsar as the home star's observatory (Gliese 445)
// would measure it at the discovery epoch T. A simulation of the future, labelled as a projection:
// every model input below is a documented input (docs/research/clocks.md section 3b), not a tuned number.
// Pure and deterministic: randomness only from seeded streams (random.ts), forked per pulsar by name,
// so results never depend on catalogue order.

import { DEG, KMS_PER_MASYR_PC, add, dot, mjdToDecimalYear, norm, scale, sub, toGalacticCartesian, toSpherical, unitVector, type Vec3 } from './astro';
import type { Observer } from './epoch';
import { characteristicAgeYears, spinForward } from './pulsars';
import { createRng, type Rng } from './random';
import type { PulsarCatalogue, PulsarRecord } from './types';
import { C_KM_S, JULIAN_YEAR_S, PARSEC_KM } from './units';

/**
 * Timing noise (the stated model; D-A16 follow-up): a spin-down rate measured over a few years is the
 * long-term rate times (1 + s z), z standard normal. Spin-down rates switch between two states (Lyne
 * et al. 2010, Science 329, 408, Table 1, peak-to-peak dnudot/nudot); for two-state switching the rms
 * is half the peak-to-peak. Map pulsars in that table: B1642-03 2.53% (rms 1.265%) and B0950+08
 * 0.84% (rms 0.42%); no other map pulsar is listed. Every other pulsar's true amplitude is drawn per
 * realization from Lyne's 17 peak-to-peak values (rms = p-p / 2); the nominal realization uses their
 * median, 0.85% (B1818-04, the 9th of 17 sorted), so rms 0.425%. The alien monitors its pulsars over
 * decades and so measures each amplitude itself, with the log-normal error below.
 */
export const TIMING_NOISE_RMS_BY_JNAME: Readonly<Record<string, number>> = { 'J1645-0317': 0.0253 / 2, 'J0953+0755': 0.0084 / 2 };
export const TIMING_NOISE_RMS_DEFAULT = 0.0085 / 2;

/** Lyne et al. 2010 Table 1 peak-to-peak dnudot/nudot of the 17 pulsars of its Fig. 2 (B1931+24 excluded). */
export const LYNE2010_PEAK_TO_PEAK: readonly number[] = [
  0.1328, 0.068, 0.0591, 0.0328, 0.0253, 0.02, 0.0171, 0.0169, 0.0085, 0.0084, 0.0079, 0.0075, 0.0071, 0.0068, 0.0068, 0.0066, 0.0031,
];

export function timingNoiseSigma(jname: string): number {
  return TIMING_NOISE_RMS_BY_JNAME[jname] ?? TIMING_NOISE_RMS_DEFAULT;
}

/**
 * Precision of the alien's own measurement of each pulsar's noise amplitude: log-normal, sigma_ln 0.3
 * (a model input, a choice labelled as one: the precision of a multi-decade measurement like Lyne's).
 */
export const AMPLITUDE_MEAS_LN_SIGMA = 0.3;

/** Characteristic age dividing young from old pulsars, yr (spec; clocks.md 3b: n matters for tau_c below about 1 Myr). */
export const OLD_TAU_C_YEARS = 300_000;

/**
 * Measured long-term braking indices (the truth for these two):
 * Crab 2.342 averaged 1968-2013 including glitches (Lyne et al. 2015, MNRAS 446, 857; clocks.md Table 2A);
 * Vela 1.7 +/- 0.2 long-term (Espinoza et al. 2017, MNRAS 466, 147; clocks.md Table 2A).
 */
export const MEASURED_BRAKING_INDEX: Readonly<Record<string, number>> = { 'J0534+2200': 2.342, 'J0835-4510': 1.7 };

/**
 * Braking-index priors (also the truth draws for unmeasured pulsars).
 * Old: U[2, 4], a broad range around the magnetic-dipole value 3; for tau_c above 1 Myr the age
 * changes by at most about 1.1% per unit n (clocks.md 3b table).
 * Young: U[0.9, 3.2], a judgment call spanning most measured young-pulsar braking indices: 0.9 +/- 0.2
 * for PSR J1734-3333 (Espinoza et al. 2011, ApJL 741, L13) to 3.15 +/- 0.03 for PSR J1640-4631
 * (Archibald et al. 2016, ApJL 819, L16); compilation in Hamil, Stone, Urbanec and Urbancova 2015
 * (PRD 91, 063007). Lower values exist after outbursts (J1846-0258 about 0.65, Archibald et al. 2015;
 * B0540-69 near 0 after 2011), so the range is not exhaustive.
 */
export const N_PRIOR_OLD: readonly [number, number] = [2, 4];
export const N_PRIOR_YOUNG: readonly [number, number] = [0.9, 3.2];

/** Nominal braking index for unmeasured pulsars: the magnetic dipole value. */
export const N_NOMINAL = 3;

/**
 * Distance uncertainty when the distance is not a significant parallax: a factor of 1.3 at one sigma
 * (log-normal, so it stays positive), the typical accuracy of YMW16 dispersion-measure distances (spec;
 * Yao, Manchester and Wang 2017, ApJ 835, 29). Also used for DIST_A values with no quoted error.
 */
export const MODEL_DISTANCE_LN_SIGMA = Math.log(1.3);

const MAS_TO_RAD = DEG / 3.6e6;

export interface AlienPulsar {
  jname: string;
  bname: string | null;
  /** Observed period at T, s. */
  pObs: number;
  /** Measured period derivative (with timing noise); null when the catalogue has no spin-down. */
  pdotMeas: number | null;
  lDeg: number;
  bDeg: number;
  raDeg: number;
  decDeg: number;
  /** Unit vector from the observer to the pulsar, ICRS. */
  nHat: Vec3;
  /** The catalogue distance (the alien's measurement), kpc; null when unknown. */
  distKpc: number | null;
  /** Proper motion as the observer measures it (relative to itself), mas/yr (pmra includes cos dec). */
  pmraObs: number | null;
  pmdecObs: number | null;
  /** The alien's measured timing-noise rms of this pulsar (fractional, on Pdot). */
  timingNoiseRmsMeas: number;
  /** The catalogue's 1-sigma proper-motion and parallax errors, carried as the alien's own measurement errors. */
  pmraErr: number | null;
  pmdecErr: number | null;
  distance: DistanceModel;
  flags: { noSpinDown: boolean; noDistance: boolean; noProperMotion: boolean; spunDown: boolean; noEpoch: boolean; binary: boolean };
  /** The simulation's truth; only tests read it. */
  truth: {
    young: boolean;
    n: number;
    /** SSB-equivalent epoch of the received spin state: T + (light-time offset), decimal year. */
    emissionYear: number;
    lightTimeYears: number;
    pSsbAtEmission: number;
    pdotSsbAtEmission: number | null;
    /** P_obs / P_ssb from the observer's own motion, 1 / (gamma (1 + beta . n_obs)). */
    dopplerFactor: number;
    /** 1 + v_t . (n_obs - n_ssb) / c. */
    parallaxFactor: number;
    /** Change of Pdot between the SSB and the observer: P (|v_t,rel|^2 - |v_t|^2) / (c d). */
    shklovskiiChange: number;
    pdotObs: number | null;
    /** True timing-noise rms. */
    timingNoiseRms: number;
    distKpc: number | null;
    pmra: number | null;
    pmdec: number | null;
    nHatSsb: Vec3;
  };
}

export interface ProjectOptions {
  seed: string;
  /** n = 3 for every unmeasured pulsar and the catalogue's distances and proper motions as the truth. */
  nominal?: boolean;
  /** Switches for tests (all default true). */
  lightTime?: boolean;
  parallax?: boolean;
  shklovskii?: boolean;
  timingNoise?: boolean;
  // Misspecification options (truth differs from the estimator's model; dating.epoch.misspecified):
  /** Truth braking-index range for old pulsars instead of N_PRIOR_OLD. */
  nOldRange?: readonly [number, number];
  /** 'twoState': the measured Pdot sits in one of two switching states, (1 +/- rms), equally likely (red noise). */
  timingNoiseModel?: 'gaussian' | 'twoState';
  /** The alien's amplitude-measurement error in the truth (default AMPLITUDE_MEAS_LN_SIGMA). */
  amplitudeMeasLnSigma?: number;
  /** Cumulative glitch spin-up per year (fractional frequency) left in the truth, by J name. */
  glitchSpinUpPerYear?: Readonly<Record<string, number>>;
}

/** How a catalogue distance was obtained, and so how uncertain it is. */
export type DistanceModel = { kind: 'parallax'; pxMas: number; pxErrMas: number } | { kind: 'model' } | { kind: 'none' };

/**
 * The catalogue distance is parallax-like when a significant parallax exists (PX above 3 sigma) and the
 * distance agrees with 1/PX within 3 sigma of the parallax. Many such distances are DIST_A values from
 * VLBI parallaxes (psrcat prefers DIST_A, data/README.md "dist rule"), so the distance itself is kept
 * and only its relative error, sigma_PX / PX, is taken from the parallax. Otherwise the factor 1.3.
 */
export function distanceModel(r: PulsarRecord): DistanceModel {
  if (r.dist === null) return { kind: 'none' };
  const px = r.px;
  const e = r.pxErr ?? null;
  if (px !== null && e !== null && e > 0 && px > 3 * e && Math.abs(r.dist * px - 1) <= (3 * e) / px) return { kind: 'parallax', pxMas: px, pxErrMas: e };
  return { kind: 'model' };
}

/** One draw of a distance, kpc, from its measurement model (parallax: d PX / (PX + sigma z), kept positive). */
export function drawDistanceKpc(distKpc: number, model: DistanceModel, rng: Rng): number {
  if (model.kind === 'parallax') {
    for (;;) {
      const px = model.pxMas + model.pxErrMas * rng.normal();
      if (px > 0) return (distKpc * model.pxMas) / px;
    }
  }
  return distKpc * Math.exp(MODEL_DISTANCE_LN_SIGMA * rng.normal());
}

/** Local east (p) and north (q) unit vectors at a sky position, ICRS. */
export function eastNorth(raDeg: number, decDeg: number): [Vec3, Vec3] {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [[-Math.sin(a), Math.cos(a), 0], [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)]];
}

const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));
const perp = (v: Vec3, n: Vec3): Vec3 => sub(v, scale(n, dot(v, n)));
/** Parsecs travelled by light in a year: c (km/s) x year (s) / parsec (km). */
const PC_PER_LIGHT_YEAR = (C_KM_S * JULIAN_YEAR_S) / PARSEC_KM;

/**
 * Project one pulsar. The physics, step by step:
 * - Position: the catalogue direction moved by proper motion over T minus the position epoch (taken
 *   as PEPOCH, psrcat's default when POSEPOCH is absent; 2000.0 when there is no PEPOCH, flagged).
 *   The tangent-plane step n + mu dt, normalised, is the direction of straight-line motion with zero
 *   radial velocity at any distance. Distances stay as catalogued: radial velocities of pulsars are
 *   unknown; they change distances by v_r t (a few pc at most here) and bearings only at second order.
 * - Light time: the observer at X receives at T what the SSB would receive at T + (d_ssb - d_obs) / c
 *   (= X . n / c to first order; up to about 3.5 yr at 1.06 pc).
 * - Spin: from P0 and P1 at PEPOCH forward to that SSB epoch with braking index n (pulsars.ts).
 * - Doppler: P_obs / P_ssb = (1 + v_p . n_obs / c) / (1 + v_p . n_ssb / c) / (gamma (1 + beta . n_obs)),
 *   with v_p the pulsar's velocity and beta = V_obs / c. The first factor is the parallax term,
 *   1 + v_t . (n_obs - n_ssb) / c: n_obs - n_ssb is perpendicular to n to first order, so the unknown
 *   radial velocity drops out and the transverse velocity (proper motion times distance) remains.
 * - Pdot is unchanged by a constant Doppler factor D = P_obs / P_ssb: pulses are conserved, so the
 *   observer's clock runs dt_obs = D dt_ssb per pulse interval and dP_obs / dt_obs = D dP / (D dt_ssb)
 *   = Pdot (exactly, for constant D).
 * - Shklovskii: the catalogue Pdot contains P v_t^2 / (c d) for the SSB's transverse velocity; the
 *   observer sees P |v_t,rel|^2 / (c d) instead, v_t,rel the pulsar's velocity relative to the
 *   observer, perpendicular to the observer's line of sight.
 * - Timing noise: Pdot_meas = Pdot_obs (1 + s z), s the pulsar's true rms (see timingNoiseSigma). The period itself is measured to about 1e-12 of
 *   P in a year of timing, against the 1e-6 effects modelled here, so it is exact.
 */
export function projectPulsar(r: PulsarRecord, observer: Observer, opts: ProjectOptions): AlienPulsar | null {
  if (r.p0 === null) return null;
  const rng = createRng(opts.seed);
  const truthRng = rng.fork(`truth/${r.jname}`);
  const measRng = rng.fork(`measure/${r.jname}`);
  const T = observer.decimalYear;
  const X = observer.posPc;
  const V = observer.velKmS;

  const noEpoch = r.pepoch === null;
  const tPe = r.pepoch === null ? 2000 : mjdToDecimalYear(r.pepoch);
  const hasPm = r.pmra !== null && r.pmdec !== null;
  const model = distanceModel(r);
  // Truth astrometry: the catalogue values are measurements; the truth is drawn around them.
  const nominal = opts.nominal === true;
  const dTrueKpc = r.dist === null ? null : nominal ? r.dist : drawDistanceKpc(r.dist, model, truthRng.fork('distance'));
  const pmRng = truthRng.fork('pm');
  const pmra = hasPm ? (r.pmra as number) + (nominal ? 0 : (r.pmraErr ?? 0) * pmRng.normal()) : null;
  const pmdec = hasPm ? (r.pmdec as number) + (nominal ? 0 : (r.pmdecErr ?? 0) * pmRng.normal()) : null;

  const n0 = unitVector(r.ra, r.dec);
  const [pE, qN] = eastNorth(r.ra, r.dec);
  const muRad: Vec3 = hasPm ? add(scale(pE, (pmra as number) * MAS_TO_RAD), scale(qN, (pmdec as number) * MAS_TO_RAD)) : [0, 0, 0];
  const nSsb = unit(add(n0, scale(muRad, T - tPe)));
  const dPc = dTrueKpc === null ? null : dTrueKpc * 1000;
  const vt: Vec3 | null = hasPm && dPc !== null ? scale(add(scale(pE, pmra as number), scale(qN, pmdec as number)), KMS_PER_MASYR_PC * dPc) : null;

  const useParallax = opts.parallax !== false && dPc !== null;
  const R = dPc === null ? null : scale(nSsb, dPc);
  const nObs = useParallax && R ? unit(sub(R, X)) : nSsb;
  const lightTimeYears = opts.lightTime === false ? 0 : R && dPc !== null ? (dPc - norm(sub(R, X))) / PC_PER_LIGHT_YEAR : dot(X, nSsb) / PC_PER_LIGHT_YEAR;
  const emissionYear = T + lightTimeYears;

  // Spin, SSB frame.
  const tau = r.p1 !== null && r.p1 > 0 ? characteristicAgeYears(r.p0, r.p1) : Infinity;
  const young = tau < OLD_TAU_C_YEARS;
  const measured = MEASURED_BRAKING_INDEX[r.jname];
  const prior = young ? N_PRIOR_YOUNG : (opts.nOldRange ?? N_PRIOR_OLD);
  const n = measured ?? (nominal ? N_NOMINAL : prior[0] + (prior[1] - prior[0]) * truthRng.fork('n').uniform());
  const tS = (emissionYear - tPe) * JULIAN_YEAR_S;
  let pSsb: number;
  let pdotSsb: number | null;
  if (r.p1 === null) {
    pSsb = r.p0;
    pdotSsb = null;
  } else if (r.p1 <= 0) {
    // Negative Pdot: acceleration in a cluster potential, not spin-down; carried linearly.
    pSsb = r.p0 + r.p1 * tS;
    pdotSsb = r.p1;
  } else {
    const s = spinForward(r.p0, r.p1, n, tS);
    // Optional glitches left in the truth: the cumulative spin-up shortens the period.
    pSsb = s.p / (1 + (opts.glitchSpinUpPerYear?.[r.jname] ?? 0) * (emissionYear - tPe));
    pdotSsb = s.pdot;
  }
  const spunDown = !Number.isFinite(pSsb);

  // Doppler from the observer's motion and the parallax term.
  const beta = scale(V, 1 / C_KM_S);
  const gamma = 1 / Math.sqrt(1 - dot(beta, beta));
  const dopplerFactor = 1 / (gamma * (1 + dot(beta, nObs)));
  const parallaxFactor = vt && useParallax ? 1 + dot(vt, sub(nObs, nSsb)) / C_KM_S : 1;
  const pObs = pSsb * dopplerFactor * parallaxFactor;

  // Shklovskii change (needs the transverse velocity and the distance).
  let shk = 0;
  if (opts.shklovskii !== false && vt && dPc !== null && Number.isFinite(pSsb)) {
    const vtRel = perp(sub(vt, V), nObs);
    shk = (pSsb * (dot(vtRel, vtRel) - dot(vt, vt))) / (C_KM_S * dPc * PARSEC_KM);
  }
  const pdotObs = pdotSsb === null ? null : pdotSsb + shk;
  const tnRng = measRng.fork('timingNoise');
  const z = opts.timingNoise === false ? 0 : opts.timingNoiseModel === 'twoState' ? (tnRng.uniform() < 0.5 ? -1 : 1) : tnRng.normal();
  const listed = TIMING_NOISE_RMS_BY_JNAME[r.jname];
  const amp = listed ?? (nominal ? TIMING_NOISE_RMS_DEFAULT
    : (LYNE2010_PEAK_TO_PEAK[Math.floor(truthRng.fork('noiseAmplitude').uniform() * LYNE2010_PEAK_TO_PEAK.length)] as number) / 2);
  const ampMeas = amp * Math.exp((opts.amplitudeMeasLnSigma ?? AMPLITUDE_MEAS_LN_SIGMA) * measRng.fork('noiseAmplitude').normal());
  const pdotMeas = pdotObs === null ? null : pdotObs * (1 + amp * z);

  // What the observer measures on the sky.
  const sph = toSpherical(nObs);
  const gal = toSpherical(toGalacticCartesian(nObs));
  let pmraObs: number | null = null;
  let pmdecObs: number | null = null;
  if (vt && dPc !== null) {
    const [pE2, qN2] = eastNorth(sph.lonDeg, sph.latDeg);
    const vRel = perp(sub(vt, V), nObs);
    const k = KMS_PER_MASYR_PC * norm(sub(scale(nSsb, dPc), X));
    pmraObs = dot(vRel, pE2) / k;
    pmdecObs = dot(vRel, qN2) / k;
  }

  return {
    jname: r.jname,
    bname: r.bname,
    pObs,
    pdotMeas,
    lDeg: gal.lonDeg,
    bDeg: gal.latDeg,
    raDeg: sph.lonDeg,
    decDeg: sph.latDeg,
    nHat: nObs,
    distKpc: r.dist,
    pmraObs,
    pmdecObs,
    timingNoiseRmsMeas: ampMeas,
    pmraErr: r.pmraErr ?? null,
    pmdecErr: r.pmdecErr ?? null,
    distance: model,
    flags: { noSpinDown: r.p1 === null, noDistance: r.dist === null, noProperMotion: !hasPm, spunDown, noEpoch, binary: r.binary },
    truth: {
      young, n, emissionYear, lightTimeYears, pSsbAtEmission: pSsb, pdotSsbAtEmission: pdotSsb, dopplerFactor, parallaxFactor,
      shklovskiiChange: shk, pdotObs, timingNoiseRms: amp, distKpc: dTrueKpc, pmra, pmdec, nHatSsb: nSsb,
    },
  };
}

/** Every pulsar of the catalogue as the observer measures it at observer.decimalYear (pulsars with no period are skipped). */
export function projectCatalogue(cat: PulsarCatalogue, observer: Observer, opts: ProjectOptions): AlienPulsar[] {
  const out: AlienPulsar[] = [];
  for (const r of cat.pulsars) {
    const a = projectPulsar(r, observer, opts);
    if (a) out.push(a);
  }
  return out;
}

/** A measured observer state: the truth plus one draw from its covariance (the alien's Sun-relative state). */
export function drawObserver(truth: Observer, rng: Rng): Observer {
  return { ...truth, posPc: add(truth.posPc, mvnDraw(truth.posCov, rng)), velKmS: add(truth.velKmS, mvnDraw(truth.velCov, rng)) };
}

/** Lower Cholesky factor of a symmetric positive semi-definite 3x3 matrix (zero pivots tolerated). */
export function cholesky3(c: readonly (readonly number[])[]): number[][] {
  const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j <= i; j++) {
      let s = c[i]?.[j] ?? 0;
      for (let k = 0; k < j; k++) s -= (L[i]![k] as number) * (L[j]![k] as number);
      if (i === j) L[i]![j] = Math.sqrt(Math.max(s, 0));
      else L[i]![j] = (L[j]![j] as number) > 0 ? s / (L[j]![j] as number) : 0;
    }
  }
  return L;
}

/** One zero-mean draw from a 3x3 covariance. */
export function mvnDraw(cov: readonly (readonly number[])[], rng: Rng): Vec3 {
  const L = cholesky3(cov);
  const z = [rng.normal(), rng.normal(), rng.normal()];
  const row = (i: number): number => (L[i] as number[]).reduce((a, l, k) => a + l * (z[k] as number), 0);
  return [row(0), row(1), row(2)];
}
