// voices.octave: where a melody's notes come back. The twin of tools/voices/vfold.py (the Node tests check both give
// the same numbers on the same notes; every rule is stated there in full).
//
// Fold the note pitches (cents) modulo a trial interval P and ask how much closer than chance notes from different
// repeats land. For a pair whose pitches differ by d, the closeness is a Gaussian kernel (sd FOLD_SIGMA) summed
// over every whole repeat k P with k not 0. Its sum over all k is the fold's Fourier series (Poisson summation,
// all harmonics): P sum_k phi(d - kP) = 1 + 2 sum_h exp(-2 pi^2 sigma^2 h^2 / P^2) cos(2 pi h d / P); the k = 0
// term P phi(d) is removed (a note beside one of the same pitch says nothing about repeats). Chance for the rest is
// the share of pairs at least P / 2 apart, so the score S(P) is 1 for no repeat and higher the tighter notes a
// repeat apart coincide. Pairs are distinct notes, weighted w_i w_j (a bootstrap resample's multiplicities).
// Pure: no DOM.

import type { Rng } from '../science/random';

/** Kernel sd, cents (vfold.SIGMA: a quarter of a tempered step). */
export const FOLD_SIGMA = 25;
/** Trial intervals, cents: the octave chart's span (ratio 1.02 to 4). */
export const FOLD_RANGE = [30, 2400] as const;
/** Harmonics are summed while their weight is at least this (vfold.G_MIN). */
const G_MIN = 1e-12;
/** A candidate's own peak: the highest score within a quarter tone of it (vfold.LOCAL_CENTS). */
export const FOLD_LOCAL_CENTS = 25;
/** The repeat's coarse search step and its refinement half-width, cents (vfold.COARSE, vfold.FINE_HALF). */
export const FOLD_COARSE = 5;
const FINE_HALF = 5;
/** Peaks below four kernel widths are not compared (vfold.MIN_CANDIDATE). */
export const FOLD_MIN_CANDIDATE = 4 * FOLD_SIGMA;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/** How many harmonics a fold of P cents sums (vfold.harmonics). */
export function foldHarmonics(p: number): number {
  return Math.max(1, Math.floor((p / (Math.PI * FOLD_SIGMA * Math.SQRT2)) * Math.sqrt(-Math.log(G_MIN))));
}

interface Stats {
  den: number;
  s2: number;
  /** Cumulative pair weight in order of distance. */
  cum: Float64Array;
  tot: number;
  /** The pairs' weighted mean of the unfolded kernel phi(d). */
  pwPhi: number;
}

/** Note pitches with the pair tables every score needs (vfold.Notes). */
export class FoldNotes {
  readonly c: Float64Array;
  private readonly pi: Int32Array;
  private readonly pj: Int32Array;
  /** Pair distances, ascending. */
  readonly d: Float64Array;
  private readonly phi0: Float64Array;
  private unit: Stats | null = null;

  constructor(cents: ArrayLike<number>) {
    this.c = Float64Array.from(cents as ArrayLike<number>);
    const n = this.c.length;
    const m = (n * (n - 1)) / 2;
    const dd = new Float64Array(m);
    const ii = new Int32Array(m);
    const jj = new Int32Array(m);
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        dd[k] = Math.abs(this.c[i]! - this.c[j]!);
        ii[k] = i;
        jj[k] = j;
        k++;
      }
    }
    const order = Array.from({ length: m }, (_, t) => t).sort((a, b) => dd[a]! - dd[b]! || a - b);
    this.d = Float64Array.from(order, (t) => dd[t]!);
    this.pi = Int32Array.from(order, (t) => ii[t]!);
    this.pj = Int32Array.from(order, (t) => jj[t]!);
    this.phi0 = this.d.map((x) => Math.exp(-0.5 * (x / FOLD_SIGMA) ** 2) * (INV_SQRT_2PI / FOLD_SIGMA));
  }

  private stats(w?: ArrayLike<number>): Stats {
    if (!w && this.unit) return this.unit;
    const n = this.c.length;
    const wt = (i: number): number => (w ? (w[i] as number) : 1);
    let sw = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      sw += wt(i);
      s2 += wt(i) * wt(i);
    }
    const cum = new Float64Array(this.d.length);
    let tot = 0;
    let phi = 0;
    for (let k = 0; k < this.d.length; k++) {
      const pw = wt(this.pi[k]!) * wt(this.pj[k]!);
      tot += pw;
      phi += pw * this.phi0[k]!;
      cum[k] = tot;
    }
    const st = { den: sw * sw - s2, s2, cum, tot, pwPhi: phi / tot };
    if (!w) this.unit = st;
    return st;
  }

  /** The score S(P) for the notes (weights w, default all 1). */
  score(p: number, w?: ArrayLike<number>): number {
    return this.scoreWith(p, this.stats(w), w);
  }

  /** S over a grid of trial intervals. */
  curve(grid: ArrayLike<number>, w?: ArrayLike<number>): Float64Array {
    const st = this.stats(w);
    return Float64Array.from({ length: grid.length }, (_, m) => this.scoreWith(grid[m] as number, st, w));
  }

  private scoreWith(p: number, st: Stats, w?: ArrayLike<number>): number {
    const n = this.c.length;
    const hmax = foldHarmonics(p);
    // z_h = sum_i w_i exp(2 pi i h c_i / P) by the recurrence e_h = e_{h-1} e_1, for every h at once.
    const zr = new Float64Array(hmax);
    const zi = new Float64Array(hmax);
    for (let i = 0; i < n; i++) {
      const wi = w ? (w[i] as number) : 1;
      if (wi === 0) continue;
      const a = (2 * Math.PI * this.c[i]!) / p;
      const cr = Math.cos(a);
      const ci = Math.sin(a);
      let er = cr;
      let ei = ci;
      for (let h = 0; h < hmax; h++) {
        zr[h] = zr[h]! + wi * er;
        zi[h] = zi[h]! + wi * ei;
        const t = er * cr - ei * ci;
        ei = er * ci + ei * cr;
        er = t;
      }
    }
    let sum = 0;
    const k2 = (-2 * Math.PI * Math.PI * FOLD_SIGMA * FOLD_SIGMA) / (p * p);
    for (let h = 1; h <= hmax; h++) sum += Math.exp(k2 * h * h) * (zr[h - 1]! ** 2 + zi[h - 1]! ** 2 - st.s2);
    const wrapped = 1 + (2 * sum) / st.den;
    const r = wrapped - p * st.pwPhi;
    // Pairs at most P / 2 apart (numpy searchsorted side "right"): the first index with d > P / 2.
    let lo = 0;
    let hi = this.d.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.d[mid]! <= p / 2) lo = mid + 1;
      else hi = mid;
    }
    const q = 1 - (lo > 0 ? st.cum[lo - 1]! : 0) / st.tot;
    return q > 0 ? r / q : 0;
  }
}

/** The trial intervals at a step, cents (vfold.grid_of). */
export function foldGrid(step: number): Float64Array {
  const n = Math.floor((FOLD_RANGE[1] - FOLD_RANGE[0]) / step + 1e-9) + 1;
  return Float64Array.from({ length: n }, (_, k) => FOLD_RANGE[0] + k * step);
}

/** Parabolic refinement of a local maximum at index k (index units; vfold.refine). */
function refine(y: ArrayLike<number>, k: number): number {
  if (k > 0 && k < y.length - 1) {
    const y0 = y[k - 1] as number;
    const y1 = y[k] as number;
    const y2 = y[k + 1] as number;
    const den = y0 - 2 * y1 + y2;
    if (den < 0) return k + (0.5 * (y0 - y2)) / den;
  }
  return k;
}

export interface FoldPeak {
  cents: number;
  score: number;
}

/** Every local maximum of a score curve over an evenly spaced grid (vfold.peaks). */
export function foldPeaks(grid: ArrayLike<number>, y: ArrayLike<number>): FoldPeak[] {
  const step = (grid[1] as number) - (grid[0] as number);
  const out: FoldPeak[] = [];
  for (let k = 1; k < y.length - 1; k++) {
    if ((y[k] as number) >= (y[k - 1] as number) && (y[k] as number) > (y[k + 1] as number)) out.push({ cents: (grid[0] as number) + refine(y, k) * step, score: y[k] as number });
  }
  return out;
}

/** The highest score within +/- FOLD_LOCAL_CENTS of centre (vfold.local_peak). */
export function localFoldPeak(notes: FoldNotes, centre: number, w?: ArrayLike<number>, step = 1): FoldPeak {
  const n = Math.floor((2 * (FOLD_LOCAL_CENTS + step)) / step + 1e-9) + 1;
  const g = Float64Array.from({ length: n }, (_, k) => centre - FOLD_LOCAL_CENTS - step + k * step);
  const y = notes.curve(g, w);
  let k = 1;
  for (let t = 2; t < y.length - 1; t++) if (y[t]! > y[k]!) k = t;
  return { cents: g[0]! + refine(y, k) * step, score: y[k]! };
}

/** The repeat: the highest score over FOLD_RANGE, coarse then fine (vfold.best). */
export function bestFold(notes: FoldNotes, w?: ArrayLike<number>): FoldPeak {
  const g = foldGrid(FOLD_COARSE);
  const y = notes.curve(g, w);
  const loc: number[] = [];
  for (let k = 1; k < y.length - 1; k++) if (y[k]! >= y[k - 1]! && y[k]! > y[k + 1]!) loc.push(k);
  loc.sort((a, b) => y[b]! - y[a]! || a - b);
  const top = loc.length ? loc.slice(0, 3) : [y.indexOf(Math.max(...y))];
  let out: FoldPeak = { cents: g[0]!, score: Number.NEGATIVE_INFINITY };
  for (const k of top) {
    const m = Math.floor((2 * FINE_HALF) / 1 + 1e-9) + 1;
    const f = Float64Array.from({ length: m }, (_, t) => g[k]! - FINE_HALF + t);
    const yf = notes.curve(f, w);
    let j = 0;
    for (let t = 1; t < yf.length; t++) if (yf[t]! > yf[j]!) j = t;
    if (yf[j]! > out.score) out = { cents: f[0]! + refine(yf, j), score: yf[j]! };
  }
  return out;
}

/** A bootstrap resample of n notes as multiplicities, from a seeded stream. */
export function resampleWeights(n: number, rng: Rng): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.min(n - 1, Math.floor(rng.uniform() * n));
    w[k] = w[k]! + 1;
  }
  return w;
}
