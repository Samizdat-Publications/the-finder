// The Spot's instrument physics: a silicon alpha detector swept over the cover's uranium spot, and the
// alpha-counting session on a sample taken from it. Pure and deterministic: no DOM, randomness only
// through a passed-in seeded Rng (rule 6).
//
// Physics and numbers: docs/research/alpha-detector.md (the detector, a documented game choice, D-A24) and
// docs/research/clocks.md 4a (the spot, its chain and the alpha lines). The spot itself: data/spot.json
// (D-A23).
//
// Model of the sweep. The spot is a uniform disc of activity (clocks.md 4a: about 0.13 micrometre of
// uranium metal, so the deposit is ultra-thin and absorbs none of its own alphas: no self-absorption).
// Each point of the disc emits isotropically; the detector, a disc of radius R parallel to the cover at a
// stand-off h, counts the alphas that reach its face (100% intrinsic efficiency for alphas that reach it,
// the usual assumption for a silicon detector's active area). The count rate at a lateral probe offset r
// from the spot's centre is the activity per area times the solid-angle fraction of the detector seen
// from each point of the disc, integrated over the disc. The measurement is made in vacuum (the craft is
// in space), so no alphas are lost on the way. Alphas from Ra-226's own daughters (Rn-222 onward) are not
// modelled (the chain stops at Ra-226, as in clocks.ts): they would add at most about 7% to the sweep
// rate at the epoch (alpha-detector.md section 4) and change nothing measured in the counting session,
// which separates uranium from thorium first.

import type { AlphaCounts, UraniumSpotState } from './clocks';
import { NUCLIDES, batemanChain, lambdaPerYear, lambdasOf, type NuclideId } from './nuclides';
import type { Rng } from './random';
import { bisectRoot } from './stats';

// ---------------------------------------------------------------------------------------------
// The detector (alpha-detector.md section 2; D-A24). A Mirion (formerly Canberra) PIPS A450-18AM:
// passivated implanted planar silicon, 450 mm^2 active area, 18 keV alpha resolution.

/** Active area, mm^2 (A450-18AM: the model number is the area; alpha-detector.md 2). */
export const DETECTOR_AREA_MM2 = 450;
/** Active radius, mm, from the area (a circular detector). */
export const DETECTOR_RADIUS_MM = Math.sqrt(DETECTOR_AREA_MM2 / Math.PI);
/** Alpha energy resolution, keV FWHM (A450-18AM; alpha-detector.md 2). */
export const DETECTOR_RESOLUTION_KEV = 18;
/** Background, counts per hour per cm^2 of active area, 3 to 8 MeV, typical (Mirion; alpha-detector.md 2). */
export const BACKGROUND_PER_HOUR_PER_CM2 = 0.05;
/** The detector's background in the alpha window, counts/s: 0.05 /h/cm^2 x 4.5 cm^2 / 3600 s/h. */
export const DETECTOR_BACKGROUND_PER_S = (BACKGROUND_PER_HOUR_PER_CM2 * (DETECTOR_AREA_MM2 / 100)) / 3600;
/** The sweep's stand-off above the cover, mm (game choice, D-A24: a close pass that clears the etched plate). */
export const SWEEP_STANDOFF_MM = 5;
/**
 * The counting session's source-to-detector spacing, mm: equal to the detector's diameter, the spacing at
 * which the datasheet's resolution is specified (alpha-detector.md 2), with the sample as a point source on
 * the axis.
 */
export const COUNTING_STANDOFF_MM = 2 * DETECTOR_RADIUS_MM;

// ---------------------------------------------------------------------------------------------
// Solid angles

/** Fraction of all directions from a point on the axis of a disc (radius R, distance h) that hit the disc: (1 - h / sqrt(h^2 + R^2)) / 2. */
export function onAxisFraction(hMm: number, radiusMm: number): number {
  return (2 * Math.PI * (1 - hMm / Math.hypot(hMm, radiusMm))) / (4 * Math.PI);
}

/**
 * Solid angle (sr) of a disc of radius R, parallel to the source plane at height h, seen from a point
 * source at lateral offset d from the disc's axis. Polar coordinates about the source's foot point: along
 * each azimuth the radial integral of h rho / (rho^2 + h^2)^(3/2) is exact, h / sqrt(rho^2 + h^2) between
 * the ray's entry and exit of the disc, leaving a 1D integral over the azimuth.
 */
export function discSolidAngle(dMm: number, hMm: number, radiusMm: number): number {
  const R = radiusMm;
  const h = hMm;
  const d = Math.abs(dMm);
  const g = (rho: number): number => h / Math.hypot(rho, h);
  if (d <= R) {
    // Inside the disc's shadow: every azimuth leaves the disc once, at rho2 = -d cos(phi) + sqrt(R^2 - d^2 sin^2(phi)).
    // Periodic and smooth in phi, so the trapezoid rule converges fast; the integrand sharpens as d nears R, hence many points.
    const n = d > 0.9 * R ? 8192 : 2048;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const phi = ((i + 0.5) / n) * 2 * Math.PI;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const rho2 = -d * c + Math.sqrt(Math.max(0, R * R - d * d * sn * sn));
      s += 1 - g(rho2);
    }
    return (s * 2 * Math.PI) / n;
  }
  // Outside: only azimuths within asin(R/d) of the direction to the centre cross the disc, entering at rho1 and
  // leaving at rho2 = d cos(a) -/+ sqrt(R^2 - d^2 sin^2(a)). The substitution a = amax sin(theta) removes the
  // square-root endpoint singularity; midpoint rule in theta.
  const amax = Math.asin(R / d);
  const n = d < R + 10 * h ? 2048 : 256;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const th = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI;
    const a = amax * Math.sin(th);
    const w = amax * Math.cos(th);
    const root = Math.sqrt(Math.max(0, R * R - d * d * Math.sin(a) ** 2));
    const ca = d * Math.cos(a);
    s += w * (g(ca - root) - g(ca + root));
  }
  return (s * Math.PI) / n;
}

// ---------------------------------------------------------------------------------------------
// The sweep

/** Gauss-Legendre nodes and weights on [-1, 1] (Newton iteration on the Legendre polynomial). */
function gaussLegendre(n: number): { x: number[]; w: number[] } {
  const x: number[] = [];
  const w: number[] = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 1;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * dp * dp));
  }
  return { x, w };
}

export interface SweepGeometry {
  /** Spot radius, mm (data/spot.json diameter / 2). */
  spotRadiusMm: number;
  standoffMm: number;
  detectorRadiusMm: number;
}

export interface SweepModel extends SweepGeometry {
  /** Total alpha activity of the spot, Bq (the four chain members). */
  totalBq: number;
  /** Table step and range, mm. */
  stepMm: number;
  maxMm: number;
  /** Source count rate (no background) at offsets 0, step, 2 step, ..., counts/s. */
  table: Float64Array;
  backgroundPerS: number;
}

/** Total alpha activity of the spot, Bq: U-238, U-234, Th-230 and Ra-226 (each decays once by alpha). */
export function spotAlphaBq(state: UraniumSpotState): number {
  const a = state.activityBq;
  return a.U238 + a.U234 + a.Th230 + a.Ra226;
}

/**
 * Count rate (counts/s, no background) at lateral offsets r from a uniform disc source, built once as a
 * table: a polar Gauss-Legendre grid over the source disc, each point weighted by its area and by the
 * detector's solid-angle fraction from there (interpolated from a fine table of discSolidAngle).
 */
export function buildSweepModel(totalBq: number, geo: SweepGeometry, opts: { stepMm?: number; maxMm?: number } = {}): SweepModel {
  const stepMm = opts.stepMm ?? 0.5;
  const maxMm = opts.maxMm ?? 450; // the cover is 304.8 mm across: every probe point is within 450 mm of the spot
  const { spotRadiusMm: Rs, standoffMm: h, detectorRadiusMm: Rd } = geo;
  // Fine solid-angle table, 0.05 mm steps (the fraction varies on the scale of h, 5 mm; linear interpolation error < 1e-5 relative).
  const dStep = 0.05;
  const dMax = maxMm + Rs + 1;
  const nD = Math.ceil(dMax / dStep) + 2;
  const omega = new Float64Array(nD);
  for (let i = 0; i < nD; i++) omega[i] = discSolidAngle(i * dStep, h, Rd) / (4 * Math.PI);
  const frac = (d: number): number => {
    const u = d / dStep;
    const i = Math.min(nD - 2, Math.floor(u));
    const f = u - i;
    return (omega[i] as number) * (1 - f) + (omega[i + 1] as number) * f;
  };
  // Source grid: 32 radial Gauss-Legendre nodes (weight rho) x 96 azimuths.
  const gl = gaussLegendre(32);
  const nA = 96;
  const pts: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i < gl.x.length; i++) {
    const rho = (Rs * ((gl.x[i] as number) + 1)) / 2;
    const wr = ((gl.w[i] as number) * Rs) / 2;
    for (let j = 0; j < nA; j++) {
      const a = ((j + 0.5) / nA) * 2 * Math.PI;
      pts.push({ x: rho * Math.cos(a), y: rho * Math.sin(a), w: (wr * rho * 2 * Math.PI) / nA });
    }
  }
  const perArea = totalBq / (Math.PI * Rs * Rs);
  const n = Math.round(maxMm / stepMm) + 1;
  const table = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const r = k * stepMm;
    let s = 0;
    for (const p of pts) s += p.w * frac(Math.hypot(r - p.x, p.y));
    table[k] = perArea * s;
  }
  return { ...geo, totalBq, stepMm, maxMm, table, backgroundPerS: DETECTOR_BACKGROUND_PER_S };
}

/** Source count rate at offset r, counts/s (linear interpolation in the table; beyond it, the last value). */
export function sweepRate(m: SweepModel, rMm: number): number {
  const u = Math.abs(rMm) / m.stepMm;
  const i = Math.floor(u);
  if (i >= m.table.length - 1) return m.table[m.table.length - 1] as number;
  const f = u - i;
  return (m.table[i] as number) * (1 - f) + (m.table[i + 1] as number) * f;
}

export interface SweepSampler {
  /** Counts in a dwell at offset r: Poisson((rate(r) + background) x dwell), the next draw of the stream. */
  sample(rMm: number, dwellS: number): number;
}

/** The sweep's counts: one stream (the seed's spot/sweep), advanced per sample, so the same path gives the same counts. */
export function sweepSampler(m: SweepModel, rng: Rng): SweepSampler {
  return { sample: (rMm, dwellS) => rng.poisson((sweepRate(m, rMm) + m.backgroundPerS) * dwellS) };
}

// ---------------------------------------------------------------------------------------------
// The counting session

/** Geometric efficiency of the counting session: a point source on the detector's axis at COUNTING_STANDOFF_MM. */
export function countingEfficiency(): number {
  return onAxisFraction(COUNTING_STANDOFF_MM, DETECTOR_RADIUS_MM);
}

/** Counting time per quantum, s: one hour (the spec's example; any value gives the same statistics). */
export const COUNT_QUANTUM_S = 3600;
/** The longest count the instrument allows, s: 400 days. */
export const MAX_COUNT_S = 400 * 86_400;

export interface CountingSession {
  efficiency: number;
  quantumS: number;
  /** The three line counts after `totalSeconds` of counting: the same however the player got there; never decreasing. */
  countsAt(totalSeconds: number): AlphaCounts;
}

const LINES = ['U238', 'U234', 'Th230'] as const;

/**
 * Alpha counts on a sample of the spot, with uranium and thorium separated first (clocks.md 4a). Counting
 * time runs in quanta: quantum k's three line counts are Poisson draws, made in order (U-238, U-234, Th-230)
 * from the stream `rng` (the seed's spot/count), quantum by quantum. A count that ends inside a quantum keeps
 * each of that quantum's alphas whose arrival time (uniform within the quantum, from the sub-stream
 * `q<k>`) falls before the end: the exact Poisson process, so counting longer only ever adds counts.
 */
export function countingSession(state: UraniumSpotState, rng: Rng, efficiency = countingEfficiency(), quantumS = COUNT_QUANTUM_S): CountingSession {
  const rates = LINES.map((id) => state.activityBq[id] * efficiency * quantumS);
  const per: number[][] = []; // counts in quantum k
  const cum: number[][] = [[0, 0, 0]]; // counts before quantum k
  const ensure = (k: number): void => {
    while (per.length <= k) {
      const c = rates.map((r) => rng.poisson(r));
      per.push(c);
      const prev = cum[cum.length - 1] as number[];
      cum.push(prev.map((x, i) => x + (c[i] as number)));
    }
  };
  const partial = (k: number, f: number): number[] => {
    if (f <= 0) return [0, 0, 0];
    const sub = rng.fork(`q${k}`);
    return (per[k] as number[]).map((n) => {
      let kept = 0;
      for (let i = 0; i < n; i++) if (sub.uniform() < f) kept++;
      return kept;
    });
  };
  return {
    efficiency,
    quantumS,
    countsAt(totalSeconds: number): AlphaCounts {
      const t = Math.min(MAX_COUNT_S, Math.max(0, totalSeconds));
      const k = Math.floor(t / quantumS);
      ensure(k);
      const f = t / quantumS - k;
      const p = partial(k, f);
      const base = cum[k] as number[];
      return {
        u238: (base[0] as number) + (p[0] as number),
        u234: (base[1] as number) + (p[1] as number),
        th230: (base[2] as number) + (p[2] as number),
        countingTimeS: t,
        efficiency,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The clocks the counter shows

/**
 * Energy of a nuclide's main alpha line (its ground-state to ground-state branch), MeV: the decay's Q value
 * shared by momentum conservation, E = Q (A - 4) / A (non-relativistic; mass numbers stand in for masses,
 * good to about 0.1 keV here). Q values from nuclides.ts (NNDC).
 */
export function alphaLineMeV(id: NuclideId): number {
  const A = Number(id.replace(/^\D+/, ''));
  return (NUCLIDES[id].qMeV * (A - 4)) / A;
}

/**
 * Natural uranium's starting activity ratio A234/A238: secular equilibrium, atoms in proportion to the
 * half-lives (N234 / N238 = T234 / T238, as in src/chapters/arrival/chains.ts), so the activity ratio is
 * (lambda234 N234) / (lambda238 N238), which is 1.
 */
export function naturalStartRatio(): number {
  const atoms234per238 = NUCLIDES.U234.halfLifeYears / NUCLIDES.U238.halfLifeYears;
  return (lambdaPerYear('U234') * atoms234per238) / lambdaPerYear('U238');
}

/** A234/A238 at age t from a pure U-238 start: the two-member Bateman ratio ageFromU234 inverts. */
export function u234RatioAt(tYears: number): number {
  const l1 = lambdaPerYear('U238');
  const l2 = lambdaPerYear('U234');
  return (l2 / (l2 - l1)) * -Math.expm1(-(l2 - l1) * tYears);
}

/** Line activities (U-238, U-234, Th-230) per unit U-238 activity at t, for a start A234/A238 = r0. */
export function lineRatiosAt(tYears: number, r0: number): { a234: number; a230: number } {
  const lam = lambdasOf(['U238', 'U234', 'Th230', 'Ra226']);
  const l1 = lam[0] as number;
  const l2 = lam[1] as number;
  const l3 = lam[2] as number;
  const N = batemanChain(lam, [1 / l1, r0 / l2, 0, 0], tYears);
  const a238 = (N[0] as number) * l1;
  return { a234: ((N[1] as number) * l2) / a238, a230: ((N[2] as number) * l3) / a238 };
}

const T_LO = 1e-2;
const T_HI = 1e7;

/** Age (years) at which an increasing ratio f(t) reaches the target, on [0.01, 1e7] y; null when it never does. */
function solveAge(f: (t: number) => number, target: number): number | null {
  const g = (u: number): number => f(Math.exp(u)) - target;
  const a = g(Math.log(T_LO));
  const b = g(Math.log(T_HI));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a * b > 0) return null;
  return Math.exp(bisectRoot(g, Math.log(T_LO), Math.log(T_HI), 200));
}

/**
 * The two clocks' ages for an assumed start r0 = A234/A238 at t = 0: the U-234 clock (the measured
 * A234/A238) and the Th-230 clock (the measured A230/A238), each on its own; null where the clock's curve
 * never reaches the measured ratio. Efficiency is the same for all lines, so count ratios are activity ratios.
 */
export function clockAges(counts: AlphaCounts, r0: number): { u234Years: number | null; th230Years: number | null } {
  if (counts.u238 <= 0) return { u234Years: null, th230Years: null };
  const r234 = counts.u234 / counts.u238;
  const r230 = counts.th230 / counts.u238;
  // A234/A238 runs monotonically from r0 toward lambda234 / (lambda234 - lambda238); solve on the side it moves.
  const rise = r0 < u234RatioAt(T_HI);
  const u = solveAge((t) => (rise ? 1 : -1) * lineRatiosAt(t, r0).a234, (rise ? 1 : -1) * r234);
  const th = solveAge((t) => lineRatiosAt(t, r0).a230, r230);
  return { u234Years: u, th230Years: th };
}
