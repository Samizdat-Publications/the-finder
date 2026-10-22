// Consilience (Portrait, chapter 8): do several independent clocks tell one story? Each clock gives an estimate
// and its 95% interval (years before now). From those a Gaussian sigma is taken (half the interval over 1.96,
// using the side of the interval that faces the combined value when the interval is asymmetric), the clocks are
// combined by generalised least squares (inverse-variance weighting when they are independent; a covariance
// between two clocks can be given), and their agreement is the chi-square of the clocks about the combined
// value with n - 1 degrees of freedom, and its p value. A proposed time is accepted when it lies within the
// two-sided band of the combined sigma at a chosen level (D-A28: 99.9%, so noise never blocks the truth).
//
// Pure and deterministic: no DOM, no randomness, no iteration over hash maps. Times are in years.

import { chiSquareSf, normalQuantile } from './stats';

/** z for a two-sided 95% interval: 1.959964 (the standard normal's 97.5th percentile). */
export const Z95 = normalQuantile(0.975);

/** One clock's own result: its estimate and 95% interval, years before now (lo below hi). */
export interface ClockEstimate {
  id: string;
  estimate: number;
  lo: number;
  hi: number;
}

/**
 * A clock's Gaussian sigma from its 95% interval, years: the half of the interval on the side facing `toward`
 * over 1.96 (the upper half when `toward` is above the estimate, else the lower half). For a symmetric interval
 * both sides are the same. Infinity when that side has no end (a clock that cannot bound that direction then
 * carries no weight on it).
 */
export function sigmaFacing(c: ClockEstimate, toward: number): number {
  const half = toward > c.estimate ? c.hi - c.estimate : c.estimate - c.lo;
  if (!(half > 0)) throw new Error(`clock ${c.id}: its 95% interval does not enclose its estimate`);
  return Number.isFinite(half) ? half / Z95 : Infinity;
}

export interface GlsResult {
  /** The combined value. */
  mean: number;
  /** Its standard error, sqrt(1 / (1' C^-1 1)). */
  sigma: number;
  /** (x - m 1)' C^-1 (x - m 1). */
  chi2: number;
  /** n - 1. */
  dof: number;
  /** The chi-square's upper tail for dof degrees of freedom. */
  p: number;
  /** Each value's weight in the mean (sums to 1). */
  weights: number[];
}

/** Solve A y = b for a small symmetric positive-definite A (Cholesky). Throws when A is not positive definite. */
function solveSpd(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = (A[i] as readonly number[])[j] as number;
      for (let k = 0; k < j; k++) s -= (L[i] as number[])[k]! * (L[j] as number[])[k]!;
      if (i === j) {
        if (!(s > 0)) throw new Error('consilience: the covariance is not positive definite');
        (L[i] as number[])[i] = Math.sqrt(s);
      } else (L[i] as number[])[j] = s / (L[j] as number[])[j]!;
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i] as number;
    for (let k = 0; k < i; k++) s -= (L[i] as number[])[k]! * y[k]!;
    y[i] = s / (L[i] as number[])[i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i] as number;
    for (let k = i + 1; k < n; k++) s -= (L[k] as number[])[i]! * x[k]!;
    x[i] = s / (L[i] as number[])[i]!;
  }
  return x;
}

/**
 * Generalised least squares for one common value: m = 1'C^-1 x / 1'C^-1 1, sigma_m^2 = 1 / 1'C^-1 1, and
 * chi-square (x - m)'C^-1(x - m) with n - 1 degrees of freedom. With a diagonal C this is the inverse-variance
 * weighted mean. `cov` is the full covariance of the values (their sigmas squared on the diagonal).
 */
export function combineGls(values: readonly number[], cov: readonly (readonly number[])[]): GlsResult {
  const n = values.length;
  if (n === 0) throw new Error('consilience: nothing to combine');
  const ones = new Array<number>(n).fill(1);
  const ci1 = solveSpd(cov, ones);
  const s = ci1.reduce((a, v) => a + v, 0);
  const mean = ci1.reduce((a, v, i) => a + v * (values[i] as number), 0) / s;
  const d = values.map((v) => v - mean);
  const cid = solveSpd(cov, d);
  const chi2 = d.reduce((a, v, i) => a + v * (cid[i] as number), 0);
  const dof = n - 1;
  return { mean, sigma: 1 / Math.sqrt(s), chi2, dof, p: dof > 0 ? chiSquareSf(chi2, dof) : 1, weights: ci1.map((v) => v / s) };
}

/** A diagonal covariance from sigmas, with optional correlations between pairs (index pairs and rho). */
export function covarianceOf(sigmas: readonly number[], correlations: readonly { a: number; b: number; rho: number }[] = []): number[][] {
  const C = sigmas.map((si, i) => sigmas.map((_, j) => (i === j ? si * si : 0)));
  for (const { a, b, rho } of correlations) {
    const v = rho * (sigmas[a] as number) * (sigmas[b] as number);
    (C[a] as number[])[b] = v;
    (C[b] as number[])[a] = v;
  }
  return C;
}

export interface Consilience extends GlsResult {
  /** The clocks that carry weight (a finite sigma on the side facing the combined value), in input order. */
  used: string[];
  /** Each clock's sigma on the side facing the combined value, years (input order; Infinity: no weight). */
  sigmas: number[];
  /** Fixed-point iterations taken to settle which side of each asymmetric interval faces the combined value. */
  iterations: number;
}

/**
 * Combine clocks into one value. An asymmetric interval is turned into a Gaussian sigma with the side that faces
 * the combined value (which side that is depends on the combined value, so the two are settled together by a
 * fixed-point iteration, started from the symmetric half-width). The side facing the combined value is also the
 * side facing any proposal the combination accepts, unless a clock's estimate lies inside the narrow acceptance
 * band itself, where the two sides are nearly equal for these clocks; choosing it once makes the combined value,
 * and so the right answer, independent of the proposal. `correlations` are between clock indices.
 */
export function combineClocks(clocks: readonly ClockEstimate[], correlations: readonly { a: number; b: number; rho: number }[] = []): Consilience {
  if (clocks.length < 2) throw new Error('consilience: need at least two clocks');
  let sigmas = clocks.map((c) => {
    const half = (c.hi - c.lo) / 2;
    return Number.isFinite(half) && half > 0 ? half / Z95 : sigmaFacing(c, c.estimate - 1);
  });
  let res: GlsResult | null = null;
  let iterations = 0;
  for (; iterations < 50; iterations++) {
    const keep = sigmas.map((s) => Number.isFinite(s));
    const idx = keep.flatMap((k, i) => (k ? [i] : []));
    if (idx.length === 0) throw new Error('consilience: no clock bounds the combined value');
    const sub = idx.map((i) => (clocks[i] as ClockEstimate).estimate);
    const subCorr = correlations.filter((r) => keep[r.a] && keep[r.b]).map((r) => ({ a: idx.indexOf(r.a), b: idx.indexOf(r.b), rho: r.rho }));
    const g = combineGls(sub, covarianceOf(idx.map((i) => sigmas[i] as number), subCorr));
    const weights = clocks.map((_, i) => (keep[i] ? (g.weights[idx.indexOf(i)] as number) : 0));
    res = { ...g, weights };
    const next = clocks.map((c) => sigmaFacing(c, g.mean));
    const same = next.every((s, i) => s === sigmas[i]);
    sigmas = next;
    if (same) break;
  }
  const r = res as GlsResult;
  return { ...r, used: clocks.filter((_, i) => Number.isFinite(sigmas[i])).map((c) => c.id), sigmas, iterations };
}

/** Half-width of the two-sided band holding `level` of a Gaussian of sigma (99.9%: 3.29 sigma; 95%: 1.96 sigma). */
export function bandHalfWidth(sigma: number, level: number): number {
  return normalQuantile(0.5 + level / 2) * sigma;
}

/** How many clocks' own 95% intervals a time falls outside. */
export function outsideCount(clocks: readonly ClockEstimate[], t: number): number {
  return clocks.filter((c) => t < c.lo || t > c.hi).length;
}
