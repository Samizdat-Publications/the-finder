// Small numeric routines with the exact semantics of the numpy and scipy calls the Python reference
// decoder (tools/ref-decoder/) uses, so the TypeScript port reproduces it step for step.
// Pure: no DOM, no randomness.

/** Python's round() and numpy's np.round: round half to even ("banker's rounding"). */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Python int(x) on a float: truncation toward zero. */
export const pyInt = (x: number): number => Math.trunc(x);

/** np.median of a[lo..hi) (copy, sort, middle; mean of the two middle values for an even count). */
export function medianOf(a: ArrayLike<number>, lo = 0, hi = a.length): number {
  const n = hi - lo;
  if (n <= 0) return Number.NaN;
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = a[lo + i] as number;
  s.sort();
  const h = n >> 1;
  return n % 2 === 1 ? (s[h] as number) : ((s[h - 1] as number) + (s[h] as number)) / 2;
}

/** np.median of the values of a selected by keep[i] (NaN-free inputs assumed). */
export function medianWhere(a: ArrayLike<number>, keep: (i: number) => boolean): number {
  const tmp: number[] = [];
  for (let i = 0; i < a.length; i++) if (keep(i)) tmp.push(a[i] as number);
  return medianOf(tmp);
}

/** numpy's _lerp, used by np.percentile's linear method (two-sided form for t >= 0.5). */
function lerp(a: number, b: number, t: number): number {
  const d = b - a;
  return t >= 0.5 ? b - d * (1 - t) : a + d * t;
}

/** np.percentile(sorted, q) with the default linear method, on an ascending sorted array. */
export function percentileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const v = (n - 1) * (q / 100);
  const lo = Math.floor(v);
  const hi = Math.min(lo + 1, n - 1);
  return lerp(sorted[lo] as number, sorted[hi] as number, v - lo);
}

/** np.percentile(a, qs) (linear) for several percentiles at once. */
export function percentiles(a: ArrayLike<number>, qs: readonly number[]): number[] {
  const s = Float64Array.from(a as ArrayLike<number>);
  s.sort();
  return qs.map((q) => percentileSorted(s, q));
}

/** Window bounds scipy.ndimage uses for a centred filter of `size` (origin 0): i - left .. i + right. */
function windowSides(size: number): [number, number] {
  const left = Math.floor(size / 2);
  return [left, size - 1 - left];
}

/** scipy.ndimage.uniform_filter1d(x, size, mode="nearest"): moving mean with edge replication. */
export function uniformFilter1d(x: ArrayLike<number>, size: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const [left, right] = windowSides(size);
  const at = (i: number): number => x[i < 0 ? 0 : i >= n ? n - 1 : i] as number;
  let s = 0;
  for (let j = -left; j <= right; j++) s += at(j);
  out[0] = s / size;
  for (let i = 1; i < n; i++) {
    s += at(i + right) - at(i - 1 - left);
    out[i] = s / size;
  }
  return out;
}

/** scipy.ndimage.median_filter(x, size, mode="nearest") in one dimension. */
export function medianFilter1d(x: ArrayLike<number>, size: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  const [left, right] = windowSides(size);
  const w = new Float64Array(size);
  for (let i = 0; i < n; i++) {
    for (let j = -left; j <= right; j++) {
      const k = i + j;
      w[j + left] = x[k < 0 ? 0 : k >= n ? n - 1 : k] as number;
    }
    out[i] = medianOf(w);
  }
  return out;
}

/** Index of the first maximum of a[lo..hi) (np.argmax), relative to lo. */
export function argmax(a: ArrayLike<number>, lo = 0, hi = a.length): number {
  let best = lo;
  let bv = a[lo] as number;
  for (let i = lo + 1; i < hi; i++) {
    const v = a[i] as number;
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best - lo;
}

/** Cumulative sum with a leading zero: c[i] = sum of a[0..i). Sequential, like np.cumsum. */
export function cumsum0(a: ArrayLike<number>): Float64Array {
  const c = new Float64Array(a.length + 1);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] as number;
    c[i + 1] = s;
  }
  return c;
}

/**
 * scipy.signal.find_peaks(x, height=hmin, distance=dist): local maxima (flat tops resolved to their
 * middle sample, as scipy's _local_maxima_1d), at least hmin high, then thinned so no two peaks are
 * closer than dist samples, keeping higher peaks first (scipy's _select_by_peak_distance).
 */
export function findPeaks(x: ArrayLike<number>, hmin: number, dist: number): number[] {
  const n = x.length;
  const peaks: number[] = [];
  let i = 1;
  const iMax = n - 1;
  while (i < iMax) {
    if ((x[i - 1] as number) < (x[i] as number)) {
      let ahead = i + 1;
      while (ahead < iMax && x[ahead] === x[i]) ahead++;
      if ((x[ahead] as number) < (x[i] as number)) {
        peaks.push(Math.floor((i + ahead - 1) / 2));
        i = ahead;
      }
    }
    i++;
  }
  const high = peaks.filter((p) => (x[p] as number) >= hmin);
  const d = Math.ceil(dist);
  const keep = high.map(() => true);
  const order = high.map((_, k) => k).sort((a, b) => (x[high[a] as number] as number) - (x[high[b] as number] as number) || a - b);
  for (let r = order.length - 1; r >= 0; r--) {
    const j = order[r] as number;
    if (!keep[j]) continue;
    for (let k = j - 1; k >= 0 && (high[j] as number) - (high[k] as number) < d; k--) keep[k] = false;
    for (let k = j + 1; k < high.length && (high[k] as number) - (high[j] as number) < d; k++) keep[k] = false;
  }
  return high.filter((_, k) => keep[k]);
}

/**
 * np.unwrap(p, period=P): remove jumps larger than P/2 between consecutive values by adding
 * multiples of P (numpy's algorithm, including its tie rule at exactly -P/2).
 */
export function unwrap(p: ArrayLike<number>, period: number): Float64Array {
  const n = p.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const half = period / 2;
  out[0] = p[0] as number;
  let corr = 0;
  for (let i = 1; i < n; i++) {
    const d = (p[i] as number) - (p[i - 1] as number);
    // numpy: ddmod = mod(d + half, period) - half, with Python's floored modulo
    let m = (d + half) % period;
    if (m !== 0 && m < 0) m += period;
    let dd = m - half;
    if (dd === -half && d > 0) dd = half;
    let pc = dd - d;
    if (Math.abs(d) < half) pc = 0;
    corr += pc;
    out[i] = (p[i] as number) + corr;
  }
  return out;
}

/** Least squares for a few columns via the normal equations (Gaussian elimination, partial pivoting). */
export function leastSquares(cols: Float64Array[], y: ArrayLike<number>, rows: number[]): number[] {
  const m = cols.length;
  const A = Array.from({ length: m }, () => new Float64Array(m + 1));
  for (const r of rows) {
    for (let i = 0; i < m; i++) {
      const ci = (cols[i] as Float64Array)[r] as number;
      const Ai = A[i] as Float64Array;
      for (let j = 0; j < m; j++) Ai[j] = (Ai[j] as number) + ci * ((cols[j] as Float64Array)[r] as number);
      Ai[m] = (Ai[m] as number) + ci * (y[r] as number);
    }
  }
  return solveAugmented(A);
}

/** Solve the m x (m+1) augmented system in place (partial pivoting). */
export function solveAugmented(A: Float64Array[]): number[] {
  const m = A.length;
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs((A[r] as Float64Array)[c] as number) > Math.abs((A[p] as Float64Array)[c] as number)) p = r;
    if (p !== c) [A[c], A[p]] = [A[p] as Float64Array, A[c] as Float64Array];
    const Ac = A[c] as Float64Array;
    const piv = Ac[c] as number;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const Ar = A[r] as Float64Array;
      const f = (Ar[c] as number) / piv;
      if (f === 0) continue;
      for (let j = c; j <= m; j++) Ar[j] = (Ar[j] as number) - f * (Ac[j] as number);
    }
  }
  return A.map((row, i) => (row[m] as number) / (row[i] as number));
}
