// Line sync (the falling edge), the start-of-picture comb, line 1, per-line edges, the robust line
// fit and outlier replacement. A faithful port of tools/ref-decoder/sync.py: same constants, same
// rounding (Python's round half to even, int() truncation), same windows. Every length is written in
// samples at the 384 kHz header rate and scaled by r = rate / 384000 exactly as sync.py does, so the
// 96 kHz slices are handled by the same code (r = 0.25).
// Pure: no DOM, no randomness.

import {
  argmax,
  cumsum0,
  findPeaks,
  leastSquares,
  medianFilter1d,
  medianOf,
  pyInt,
  roundHalfEven as pr,
  uniformFilter1d,
} from './numeric';

// ---- constants (samples at 384 kHz unless stated); sources as in sync.py ----
/** Nominal line period at 384 kHz: a search prior only (images-and-audio.md section 1: 3197.4 on the master). */
export const NOMINAL_PERIOD = 3197.4;
/** Box matched filter: blanking plateau before the edge and shelf after it (measured on L000's averaged sync). */
export const PLATEAU: readonly [number, number] = [-300, -8];
export const SHELF: readonly [number, number] = [12, 250];
/** Sub-sample edge refinement: level spans before and after the coarse edge (measured: fall 6 samples, ringing 25). */
export const PRE_LEVEL: readonly [number, number] = [-14, -5];
export const POST_LEVEL: readonly [number, number] = [25, 60];
/** Start-of-picture comb pulse period, samples at 384 kHz (spectral peak 196.6 to 197.0; README section 1). */
export const COMB_PERIOD = 197;
/** Tracking: search +/- TRACK_SEARCH around the prediction, accept within TRACK_ACCEPT (same-parity errors are a few samples). */
export const TRACK_SEARCH = 40;
export const TRACK_ACCEPT = 25;
/** Comb presence: window length, high-passed rms and lag-197 autocorrelation thresholds (measured on L000-L010). */
export const COMB_WIN = 4 * COMB_PERIOD;
export const COMB_RMS_FINE = 0.03;
export const COMB_AC = 0.5;
/** Comb pulse: high-passed peak above PULSE_MIN (tape units) with a predecessor one period earlier within PULSE_TOL samples. */
export const PULSE_MIN = 0.04;
export const PULSE_TOL = 10;
/** Edge outlier test: running median over LOCK_WIN lines, LOCK_CLIP robust sigmas, never under LOCK_MIN samples (README section 3). */
export const LOCK_WIN = 15;
export const LOCK_CLIP = 5.0;
export const LOCK_MIN = 4.0;
/** Lines tracked per frame beyond the 512 of the picture (README "Known limits"). */
export const EXTRA_LINES = 40;

/** Plateau mean minus shelf mean at every sample (zero at the borders): sync.py _box_score. */
function boxScore(x: Float64Array, r: number): Float64Array {
  const c = cumsum0(x);
  const n = x.length;
  const s = new Float64Array(n);
  const a0 = pr(PLATEAU[0] * r);
  const a1 = pr(PLATEAU[1] * r);
  const b0 = pr(SHELF[0] * r);
  const b1 = pr(SHELF[1] * r);
  const lo = -a0;
  const hi = n - b1;
  for (let i = lo; i < hi; i++) {
    const pre = ((c[i + a1] as number) - (c[i + a0] as number)) / (a1 - a0);
    const post = ((c[i + b1] as number) - (c[i + b0] as number)) / (b1 - b0);
    s[i] = pre - post;
  }
  return s;
}

/** Sharp sync detector: the box score plus the drop over about 8 samples at 384 kHz (sync.py sync_score). */
export function syncScore(x: Float64Array, r: number): Float64Array {
  const h = Math.max(1, pr(4 * r));
  const s = boxScore(x, r);
  for (let i = h; i < x.length - h; i++) s[i] = (s[i] as number) + ((x[i - h] as number) - (x[i + h] as number));
  return s;
}

/**
 * Sub-sample falling edge near integer index c (sync.py refine_edge): the steepest drop within
 * +/- search samples, then the crossing of the mid level between the plateau level just before and
 * the shelf level just after, linearly interpolated. Returns [edge, amplitude] or [NaN, 0].
 */
export function refineEdge(x: Float64Array, c: number, r: number, search = 12): [number, number] {
  const n = x.length;
  const h = Math.max(1, pr(2 * r));
  const lo = c - pyInt(search * r);
  const hi = c + pyInt(search * r) + 1;
  if (lo - h < 0 || hi + h >= n) return [Number.NaN, 0];
  // d[i] = seg[i] - seg[i + 2h] with seg = x[lo - h .. hi + h): the drop centred on lo + i
  let j = lo;
  let best = -Infinity;
  for (let i = 0; i < hi - lo; i++) {
    const d = (x[lo - h + i] as number) - (x[lo + h + i] as number);
    if (d > best) {
      best = d;
      j = lo + i;
    }
  }
  const p0 = pr(PRE_LEVEL[0] * r);
  const p1 = pr(PRE_LEVEL[1] * r);
  const q0 = pr(POST_LEVEL[0] * r);
  const q1 = pr(POST_LEVEL[1] * r);
  if (j + p0 < 0 || j + q1 >= n) return [Number.NaN, 0];
  const pre = medianOf(x, j + p0, j + p1 + 1);
  const post = medianOf(x, j + q0, j + q1 + 1);
  const amp = pre - post;
  if (amp <= 0) return [Number.NaN, 0];
  const mid = 0.5 * (pre + post);
  const w0 = j - pyInt(6 * r) - 1;
  const w1 = j + pyInt(6 * r) + 1;
  for (let i = w0; i < w1; i++) {
    const a = x[i] as number;
    const b = x[i + 1] as number;
    if (a > mid && !(b > mid)) return [i + (a - mid) / (a - b), amp];
  }
  return [j, amp];
}

/**
 * Follow the sync train from edge e0 for nLines lines (sync.py track_lines). Each prediction uses the
 * last found edge of the same parity (so the alternating stagger is predicted exactly) and the running
 * line period (median half-difference of same-parity pairs over the last 40 lines). NaN where no
 * acceptable edge was found.
 */
export function trackLines(
  x: Float64Array,
  box: Float64Array,
  e0: number,
  nLines: number,
  P0: number,
  r: number,
  direction: 1 | -1 = 1,
): Float64Array {
  const edges = new Float64Array(nLines).fill(Number.NaN);
  edges[0] = e0;
  let P = P0;
  const ok = (j: number): boolean => Number.isFinite(edges[j] as number);
  for (let k = 1; k < nLines; k++) {
    let ref = -1;
    for (let j = k - 2; j > Math.max(k - 9, -1); j -= 2) {
      if (ok(j)) {
        ref = j;
        break;
      }
    }
    if (ref < 0) {
      for (let j = k - 1; j > Math.max(k - 9, -1); j--) {
        if (ok(j)) {
          ref = j;
          break;
        }
      }
    }
    if (ref < 0) break;
    const pred = (edges[ref] as number) + direction * (k - ref) * P;
    const c = pr(pred);
    const lo = c - pyInt(TRACK_SEARCH * r);
    const hi = c + pyInt(TRACK_SEARCH * r) + 1;
    if (lo < 0 || hi >= x.length) break;
    const cc = lo + argmax(box, lo, hi);
    const [e] = refineEdge(x, cc, r);
    if (Number.isFinite(e) && Math.abs(e - pred) <= TRACK_ACCEPT * r) {
      edges[k] = e;
      if (k >= 2 && ok(k - 2)) {
        const recent: number[] = [];
        for (let j = k; j > Math.max(k - 40, 1); j--) {
          if (ok(j) && ok(j - 2)) recent.push(Math.abs((edges[j] as number) - (edges[j - 2] as number)) / 2);
        }
        if (recent.length) P = medianOf(recent);
      }
    }
  }
  return edges;
}

/** The sync edge nearest `seed` refined, then nLines tracked forward (sync.py track_from_seed). P0 at 384 kHz. */
export function trackFromSeed(x: Float64Array, seed: number, nLines: number, r: number, P0 = NOMINAL_PERIOD, box?: Float64Array): Float64Array {
  const P = P0 * r;
  const b = box ?? syncScore(x, r);
  const lo = pyInt(seed - TRACK_SEARCH * r);
  const hi = pyInt(seed + TRACK_SEARCH * r) + 1;
  const c = lo + argmax(b, lo, hi);
  const [e0] = refineEdge(x, c, r);
  if (!Number.isFinite(e0)) throw new Error('no sync edge at the seed');
  return trackLines(x, b, e0, nLines, P, r, 1);
}

export interface LineFit {
  a: number;
  P: number;
  b: number;
  inliers: Uint8Array;
  residuals: Float64Array;
  rms: number;
  model: Float64Array;
}

/**
 * Robust fit e_k = a + P k (+ b (-1)^k) by iterative sigma clipping with a MAD scale (sync.py
 * robust_line_fit; numpy's lstsq replaced by the normal equations, the same least-squares solution).
 */
export function robustLineFit(k: ArrayLike<number>, e: ArrayLike<number>, useParity = true, nIter = 6, clip = 4.0): LineFit {
  const n = e.length;
  const ones = new Float64Array(n).fill(1);
  const kk = Float64Array.from(k);
  const cols = [ones, kk];
  if (useParity) cols.push(kk.map((v) => (Math.trunc(v) % 2 === 0 ? 1 : -1)));
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) ok[i] = Number.isFinite(e[i] as number) ? 1 : 0;
  let m = Uint8Array.from(ok);
  let coef: number[] = [];
  const evalModel = (i: number): number => cols.reduce((s, col, j) => s + (coef[j] as number) * (col[i] as number), 0);
  const res = new Float64Array(n);
  for (let it = 0; it < nIter; it++) {
    const rows: number[] = [];
    for (let i = 0; i < n; i++) if (m[i]) rows.push(i);
    coef = leastSquares(cols, e, rows);
    for (let i = 0; i < n; i++) res[i] = ok[i] ? (e[i] as number) - evalModel(i) : Number.NaN;
    const rin = rows.map((i) => res[i] as number);
    const med = medianOf(rin);
    const mad = medianOf(rin.map((v) => Math.abs(v - med)));
    const sig = Math.max(1.4826 * mad, 0.5);
    const mNew = new Uint8Array(n);
    let same = true;
    for (let i = 0; i < n; i++) {
      mNew[i] = ok[i] && Math.abs(res[i] as number) <= clip * sig ? 1 : 0;
      if (mNew[i] !== m[i]) same = false;
    }
    if (same) break;
    m = mNew;
  }
  for (let i = 0; i < n; i++) res[i] = ok[i] ? (e[i] as number) - evalModel(i) : Number.NaN;
  const model = new Float64Array(n);
  for (let i = 0; i < n; i++) model[i] = evalModel(i);
  let ss = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++)
    if (m[i]) {
      ss += (res[i] as number) ** 2;
      cnt++;
    }
  return {
    a: coef[0] as number,
    P: coef[1] as number,
    b: useParity ? (coef[2] as number) : 0,
    inliers: m,
    residuals: res,
    rms: Math.sqrt(ss / cnt),
    model,
  };
}

export interface LockedEdges {
  /** The edges used for decoding: detected, with isolated outliers replaced by fit + running median. */
  used: Float64Array;
  fit: LineFit;
  nReplaced: number;
}

/** Line fit and replacement of isolated outliers, keeping slow wow and flutter (sync.py lock_edges). */
export function lockEdges(edges: Float64Array): LockedEdges {
  const n = edges.length;
  const k = Float64Array.from({ length: n }, (_, i) => i);
  const fit = robustLineFit(k, edges, true);
  const res = fit.residuals;
  const filled = res.map((v) => (Number.isFinite(v) ? v : 0));
  const smooth = medianFilter1d(filled, LOCK_WIN);
  const dev = new Float64Array(n);
  const absOk: number[] = [];
  for (let i = 0; i < n; i++) {
    dev[i] = (res[i] as number) - (smooth[i] as number);
    if (Number.isFinite(dev[i] as number)) absOk.push(Math.abs(dev[i] as number));
  }
  const sig = absOk.length ? 1.4826 * medianOf(absOk) : 0;
  const lim = Math.max(LOCK_CLIP * sig, LOCK_MIN);
  const used = new Float64Array(n);
  let nReplaced = 0;
  for (let i = 0; i < n; i++) {
    const d = dev[i] as number;
    const bad = !Number.isFinite(d) || Math.abs(d) > lim;
    used[i] = bad ? (fit.model[i] as number) + (smooth[i] as number) : (edges[i] as number);
    if (bad) nReplaced++;
  }
  return { used, fit, nReplaced };
}

/**
 * True where the line's sync spike is the long one (about 150 samples before the edge at 384 kHz)
 * rather than the short one (about 45); the split point 100 lies midway (decode.py pulse_parity,
 * measured on L000's averaged sync waveform).
 */
export function pulseParity(x: Float64Array, edges: ArrayLike<number>, r: number): Uint8Array {
  const out = new Uint8Array(edges.length);
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k] as number;
    const a = pyInt(e - 200 * r);
    const b = pyInt(e - 20 * r);
    if (a < 0) continue;
    const j = a + argmax(x, a, b);
    out[k] = e - j > 100 * r ? 1 : 0;
  }
  return out;
}

/** Boolean per-sample mask of the start-of-picture comb, window ending at each sample (sync.py comb_mask). */
export function combMask(x: Float64Array, r: number): Uint8Array {
  const L = pr(COMB_PERIOD * r);
  const W = pr(COMB_WIN * r);
  const n = x.length;
  const m = new Uint8Array(n);
  if (n <= W + L) return m;
  const u = uniformFilter1d(x, L);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = (x[i] as number) - (u[i] as number);
  const yy = new Float64Array(n);
  const yl = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    yy[i] = (y[i] as number) * (y[i] as number);
    if (i < n - L) yl[i] = (y[i] as number) * (y[i + L] as number);
  }
  const cy = cumsum0(yy);
  const cl = cumsum0(yl);
  for (let a = 0; a < n - W - L; a++) {
    const e = (cy[a + W] as number) - (cy[a] as number);
    const ac = ((cl[a + W] as number) - (cl[a] as number)) / Math.max(e, 1e-12);
    const rms = Math.sqrt(e / W);
    m[a + W + L] = rms > COMB_RMS_FINE && ac > COMB_AC ? 1 : 0;
  }
  return m;
}

/** Index of the last pulse of the comb train, searched back from roughEnd (sync.py last_comb_pulse). */
export function lastCombPulse(x: Float64Array, roughEnd: number, r: number): number {
  const L = COMB_PERIOD * r;
  const a = Math.max(pyInt(roughEnd - COMB_WIN * r - 3 * L), 0);
  const b = Math.min(pyInt(roughEnd + 2), x.length);
  const seg = x.subarray(a, b);
  const u = uniformFilter1d(seg, Math.max(3, pr(L)));
  const y = new Float64Array(seg.length);
  for (let i = 0; i < seg.length; i++) y[i] = (seg[i] as number) - (u[i] as number);
  const pk = findPeaks(y, PULSE_MIN, Math.max(1, pyInt(L / 2)));
  const good = pk.filter((p) => pk.some((q) => Math.abs(p - q - L) <= PULSE_TOL * r));
  if (!good.length) return pyInt(roughEnd);
  return a + (good[good.length - 1] as number);
}

export interface Line1 {
  /** Tracked edges from line 1 (NaN where lost). */
  edges: Float64Array;
  /** Sample index of the comb's last pulse. */
  combEnd: number;
  box: Float64Array;
}

/**
 * Line 1 of the picture after a comb burst, and its sync train (sync.py locate_frame2): the comb's
 * last pulse is found near the burst end, a seed sync is locked three lines later with a three-line
 * matched sum, the train is tracked back, and line 1 is the first sync edge after the last comb pulse.
 */
export function locateFrame(
  x: Float64Array,
  burstEndLocal: number,
  r: number,
  P0 = NOMINAL_PERIOD,
  nLines = 512 + EXTRA_LINES,
  box?: Float64Array,
): Line1 {
  const P = P0 * r;
  const lo = pyInt(Math.max(burstEndLocal - 3 * P, 0));
  const hi = pyInt(Math.min(burstEndLocal + 3 * P, x.length));
  const m = combMask(x.subarray(lo, hi), r);
  let last = -1;
  for (let i = m.length - 1; i >= 0; i--)
    if (m[i]) {
      last = i;
      break;
    }
  if (last < 0) throw new Error('no comb pulses near the burst end');
  const combEnd = lastCombPulse(x, lo + last, r);
  const b = box ?? syncScore(x, r);
  const a = pyInt(combEnd + 2 * P);
  const bb = pyInt(combEnd + 3 * P);
  const i1 = pr(P);
  const i2 = pr(2 * P);
  let n0 = a;
  let best = -Infinity;
  for (let i = a; i < bb; i++) {
    const t = (b[i] as number) + (b[i + i1] as number) + (b[i + i2] as number);
    if (t > best) {
      best = t;
      n0 = i;
    }
  }
  const [seed] = refineEdge(x, n0, r);
  if (!Number.isFinite(seed)) throw new Error('no sync at the seed');
  const back = trackLines(x, b, seed, 5, P, r, -1).reverse();
  const after = Array.from(back).filter((v) => Number.isFinite(v) && v > combEnd);
  if (!after.length) throw new Error('no sync edge after the comb');
  const first = after[0] as number;
  if (first - combEnd > 1.2 * P) throw new Error('gap between comb end and first tracked sync exceeds a line');
  return { edges: trackLines(x, b, first, nLines, P, r, 1), combEnd, box: b };
}

/**
 * Line 1 found from the signal alone inside a picture slice: the end of the comb is the last sample of
 * the comb mask in the slice's lead-in (the slices start 0.05 s, about 6 lines, before line 1 and the
 * comb ends 0.01 to 1.06 lines before it; README sections 1 and "Browser slices"), then locateFrame.
 * `searchLines` bounds the lead-in searched, in lines.
 */
export function findLine1(x: Float64Array, r: number, P0 = NOMINAL_PERIOD, searchLines = 12, box?: Float64Array): Line1 {
  const P = P0 * r;
  const hi = Math.min(x.length, pyInt(searchLines * P));
  const m = combMask(x.subarray(0, hi), r);
  let last = -1;
  for (let i = m.length - 1; i >= 0; i--)
    if (m[i]) {
      last = i;
      break;
    }
  if (last < 0) throw new Error('no start-of-picture comb in the slice lead-in');
  return locateFrame(x, last, r, P0, 512, box);
}

/** Short-term edge jitter (samples rms) from same-parity second differences (sync.py same_parity_jitter). */
export function sameParityJitter(edges: Float64Array): number {
  const d2: number[] = [];
  for (let i = 4; i < edges.length; i++) {
    const v = (edges[i] as number) - 2 * (edges[i - 2] as number) + (edges[i - 4] as number);
    if (Number.isFinite(v)) d2.push(v);
  }
  const med = medianOf(d2);
  const mad = 1.4826 * medianOf(d2.map((v) => Math.abs(v - med)));
  return mad / Math.sqrt(6);
}
