// Statistics helpers: special functions, distributions, intervals, root finding.
// Pure and deterministic. Algorithms named with their published sources.

const LANCZOS_G = 7;
// Lanczos coefficients for g = 7, n = 9 (Godfrey's set, as used in Numerical Recipes 3rd ed. and
// many libraries); relative accuracy about 1e-15 for positive arguments.
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** Natural log of the gamma function for x > 0 (Lanczos approximation, reflection below 0.5). */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0] as number;
  const t = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS.length; i++) a += (LANCZOS[i] as number) / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const EPS = 1e-16;
const TINY = 1e-300;

/** Regularized lower incomplete gamma P(a, x) and upper Q(a, x) (Numerical Recipes 6.2: series / Lentz CF). */
function incGamma(a: number, x: number): { p: number; q: number } {
  if (x <= 0) return { p: 0, q: 1 };
  const lnPre = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 10_000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    const p = sum * Math.exp(lnPre);
    return { p, q: 1 - p };
  }
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  const q = Math.exp(lnPre) * h;
  return { p: 1 - q, q };
}

/** Complementary error function, via erfc(x) = Q(1/2, x^2) for x >= 0. */
export function erfc(x: number): number {
  if (x >= 0) return incGamma(0.5, x * x).q;
  return 2 - incGamma(0.5, x * x).q;
}

/** Standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/**
 * Standard normal quantile: Acklam's rational approximation (relative error 1.15e-9), then one Halley
 * step against the incomplete-gamma erfc, which brings it to near machine precision.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new Error(`normalQuantile: p must be in (0, 1), got ${p}`);
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const A = (i: number): number => a[i] as number;
  const B = (i: number): number => b[i] as number;
  const Cc = (i: number): number => c[i] as number;
  const Dd = (i: number): number => d[i] as number;
  const plow = 0.02425;
  let x: number;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((Cc(0) * q + Cc(1)) * q + Cc(2)) * q + Cc(3)) * q + Cc(4)) * q + Cc(5)) / ((((Dd(0) * q + Dd(1)) * q + Dd(2)) * q + Dd(3)) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((A(0) * r + A(1)) * r + A(2)) * r + A(3)) * r + A(4)) * r + A(5)) * q) / (((((B(0) * r + B(1)) * r + B(2)) * r + B(3)) * r + B(4)) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((Cc(0) * q + Cc(1)) * q + Cc(2)) * q + Cc(3)) * q + Cc(4)) * q + Cc(5)) / ((((Dd(0) * q + Dd(1)) * q + Dd(2)) * q + Dd(3)) * q + 1);
  }
  // Halley refinement (Acklam's note).
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Chi-square CDF with k degrees of freedom: P(k/2, x/2). */
export function chiSquareCdf(x: number, k: number): number {
  return incGamma(k / 2, x / 2).p;
}

/** Chi-square upper tail (survival) Q(k/2, x/2), accurate for tiny p-values. */
export function chiSquareSf(x: number, k: number): number {
  return incGamma(k / 2, x / 2).q;
}

/** Continued fraction for the incomplete beta (Numerical Recipes 6.4, betacf, modified Lentz). */
function betacf(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10_000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lnFront) * betacf(a, b, x)) / a;
  return 1 - (Math.exp(lnFront) * betacf(b, a, 1 - x)) / b;
}

/**
 * Brent's method (Brent 1973, "Algorithms for Minimization without Derivatives", ch. 4): a root of f in
 * [lo, hi] where f(lo) and f(hi) differ in sign. Guaranteed convergence (falls back to bisection).
 */
export function brentRoot(f: (x: number) => number, lo: number, hi: number, tol = 1e-12, maxIter = 300): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new Error(`brentRoot: root not bracketed on [${lo}, ${hi}] (f = ${fa}, ${fb})`);
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
    if (!Number.isFinite(fb)) throw new Error('brentRoot: non-finite function value');
  }
  return b;
}

/** Bisection for monotone or non-smooth functions (tolerates infinite values); maxIter halvings. */
export function bisectRoot(f: (x: number) => number, lo: number, hi: number, maxIter = 200, tol = 0): number {
  let a = lo;
  let b = hi;
  const sa = Math.sign(f(a));
  if (sa === Math.sign(f(b))) throw new Error('bisectRoot: root not bracketed');
  for (let i = 0; i < maxIter && b - a > tol; i++) {
    const m = 0.5 * (a + b);
    if (m <= a || m >= b) break;
    if (Math.sign(f(m)) === sa) a = m;
    else b = m;
  }
  return 0.5 * (a + b);
}

/** Wilson score interval for a binomial proportion (Wilson 1927; Newcombe 1998 method 3). */
export function wilsonInterval(k: number, n: number, conf = 0.95): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const z = normalQuantile(1 - (1 - conf) / 2);
  const p = k / n;
  const z2n = (z * z) / n;
  const centre = (p + z2n / 2) / (1 + z2n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + z2n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Clopper-Pearson exact interval (Clopper and Pearson 1934) via inverse regularized incomplete beta. */
export function clopperPearson(k: number, n: number, conf = 0.95): { lo: number; hi: number } {
  const alpha = 1 - conf;
  const lo = k === 0 ? 0 : brentRoot((x) => incompleteBeta(x, k, n - k + 1) - alpha / 2, 0, 1, 1e-15);
  const hi = k === n ? 1 : brentRoot((x) => incompleteBeta(x, k + 1, n - k) - (1 - alpha / 2), 0, 1, 1e-15);
  return { lo, hi };
}

export function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n - 1 denominator). */
export function sd(xs: readonly number[]): number {
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** Inverse-variance weighted mean and its standard error. */
export function weightedMean(values: readonly number[], sigmas: readonly number[]): { mean: number; sigma: number } {
  let sw = 0;
  let swx = 0;
  values.forEach((v, i) => {
    const s = sigmas[i] as number;
    const w = 1 / (s * s);
    sw += w;
    swx += w * v;
  });
  return { mean: swx / sw, sigma: 1 / Math.sqrt(sw) };
}

/** Golden-section maximum of f on [a, b]. */
export function goldenMax(f: (x: number) => number, a: number, b: number, iters = 80): { x: number; f: number } {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a);
  let x2 = a + g * (b - a);
  let f1 = f(x1);
  let f2 = f(x2);
  for (let i = 0; i < iters; i++) {
    if (f1 < f2) {
      a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2);
    } else {
      b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1);
    }
  }
  return f1 > f2 ? { x: x1, f: f1 } : { x: x2, f: f2 };
}

/** Maximise over a log-spaced grid of x, then refine between the neighbours of the best point. */
export function gridMax(f: (x: number) => number, grid: readonly number[]): { x: number; f: number } {
  let bi = 0;
  let bf = -Infinity;
  grid.forEach((x, i) => {
    const v = f(x);
    if (v > bf) { bf = v; bi = i; }
  });
  const lo = Math.log(grid[Math.max(0, bi - 1)] as number);
  const hi = Math.log(grid[Math.min(grid.length - 1, bi + 1)] as number);
  const r = goldenMax((u) => f(Math.exp(u)), lo, hi);
  return r.f > bf ? { x: Math.exp(r.x), f: r.f } : { x: grid[bi] as number, f: bf };
}

export function logGrid(lo: number, hi: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)));
}
