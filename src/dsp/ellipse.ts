// The calibration circle's shape: ring centre-line points and an algebraic ellipse fit. A port of
// tools/ref-decoder/aspect.py (ring_points, fit_ellipse), whose fit is scikit-image's EllipseModel:
// Halir and Flusser's numerically stable form of Fitzgibbon's direct least-squares ellipse fit,
// with the same normalization (subtract the mean, divide by the standard deviation of all coordinates).
// The axis ratio is horizontal extent / vertical extent of the fitted ellipse (1.00 = round).
// Pure: no DOM, no randomness.

import { percentiles, solveAugmented } from './numeric';

/** Median-filter size (px) for the card background under the ring: much wider than the ring, much smaller than the circle (aspect.py BG_SIZE). */
export const BG_SIZE = 31;
/** A pixel is ring when darker than the background by this fraction of the ring's 99.9th percentile darkness (aspect.py RING_FRAC). */
export const RING_FRAC = 0.5;
/** Runs longer than this multiple of the median run length are tangent runs and are dropped (aspect.py RUN_MAX_FACTOR). */
export const RUN_MAX_FACTOR = 3.0;
/**
 * Histogram bins for the 2-D median filter. scipy's median_filter is exact; here the image is quantized
 * to this many levels across its range so Huang's running-histogram median runs in milliseconds. The
 * background estimate is then within range / (2 x MEDIAN_BINS) of the exact median (0.012% of the range).
 */
export const MEDIAN_BINS = 4096;

/** scipy.ndimage.median_filter(img, size, mode="nearest") on a row-major image, to within the quantization above. */
export function medianFilter2d(img: ArrayLike<number>, width: number, height: number, size: number, bins = MEDIAN_BINS): Float64Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < img.length; i++) {
    const v = img[i] as number;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const scale = hi > lo ? (bins - 1) / (hi - lo) : 0;
  const q = new Int32Array(img.length);
  for (let i = 0; i < img.length; i++) q[i] = Math.round(((img[i] as number) - lo) * scale);
  const left = Math.floor(size / 2);
  const right = size - 1 - left;
  const half = Math.floor((size * size) / 2); // the median rank (size is odd here: 31)
  const out = new Float64Array(img.length);
  const hist = new Int32Array(bins);
  const cx = (c: number): number => (c < 0 ? 0 : c >= width ? width - 1 : c);
  const cy = (r: number): number => (r < 0 ? 0 : r >= height ? height - 1 : r);
  for (let r = 0; r < height; r++) {
    hist.fill(0);
    for (let dr = -left; dr <= right; dr++) {
      const row = cy(r + dr) * width;
      for (let dc = -left; dc <= right; dc++) {
        const k = q[row + cx(dc)] as number;
        hist[k] = (hist[k] as number) + 1;
      }
    }
    // median bin and the count strictly below it
    let m = 0;
    let below = 0;
    while (below + (hist[m] as number) <= half) below += hist[m++] as number;
    out[r * width] = lo + m / (scale || 1);
    for (let c = 1; c < width; c++) {
      const cOut = cx(c - 1 - left);
      const cIn = cx(c + right);
      for (let dr = -left; dr <= right; dr++) {
        const row = cy(r + dr) * width;
        const a = q[row + cOut] as number;
        const b = q[row + cIn] as number;
        hist[a] = (hist[a] as number) - 1;
        if (a < m) below--;
        hist[b] = (hist[b] as number) + 1;
        if (b < m) below++;
      }
      while (below > half) below -= hist[--m] as number;
      while (below + (hist[m] as number) <= half) below += hist[m++] as number;
      out[r * width + c] = lo + m / (scale || 1);
    }
  }
  return out;
}

export interface RingPoints {
  /** x then y for each point (pixel units, scaled). */
  xs: Float64Array;
  ys: Float64Array;
}

/** (start, end) pairs of runs of true values in mask[get(0..n)], end exclusive. */
function runs(n: number, get: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && get(i);
    if (on && s < 0) s = i;
    else if (!on && s >= 0) {
      out.push([s, i]);
      s = -1;
    }
  }
  return out;
}

/**
 * Ring centre-line points (aspect.py ring_points). img: row-major, larger = lighter (the reference
 * passes -V, the negated float picture; a polarity-applied 8-bit picture works the same way).
 */
export function ringPoints(img: ArrayLike<number>, width: number, height: number, xScale = 1, yScale = 1): RingPoints {
  const N = width * height;
  const bg = medianFilter2d(img, width, height, BG_SIZE);
  const dark = new Float64Array(N);
  for (let i = 0; i < N; i++) dark[i] = Math.max((bg[i] as number) - (img[i] as number), 0);
  const [peak] = percentiles(dark, [99.9]);
  const thr = RING_FRAC * (peak as number);
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = (dark[i] as number) > thr ? 1 : 0;
  // largest 8-connected region (skimage.measure.label connectivity=2), labels in raster order
  const lab = new Int32Array(N);
  let nLab = 0;
  let bestLab = 0;
  let bestSize = 0;
  const stack: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!mask[i] || lab[i]) continue;
    nLab++;
    let size = 0;
    lab[i] = nLab;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop() as number;
      size++;
      const pr = Math.floor(p / width);
      const pc = p - pr * width;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = pr + dr;
        if (rr < 0 || rr >= height) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = pc + dc;
          if (cc < 0 || cc >= width) continue;
          const q = rr * width + cc;
          if (mask[q] && !lab[q]) {
            lab[q] = nLab;
            stack.push(q);
          }
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLab = nLab;
    }
  }
  if (!nLab) throw new Error('no ring found');
  const on = (i: number): boolean => lab[i] === bestLab;
  const groups: [number, number, number][][] = [[], []];
  for (let c = 0; c < width; c++) {
    for (const [a, b] of runs(height, (r) => on(r * width + c))) {
      let sw = 0;
      let swi = 0;
      for (let i = 0; i < b - a; i++) {
        const w = dark[(a + i) * width + c] as number;
        sw += w;
        swi += w * i;
      }
      (groups[0] as [number, number, number][]).push([c, a + swi / sw, b - a]);
    }
  }
  for (let r = 0; r < height; r++) {
    for (const [a, b] of runs(width, (c) => on(r * width + c))) {
      let sw = 0;
      let swi = 0;
      for (let i = 0; i < b - a; i++) {
        const w = dark[r * width + a + i] as number;
        sw += w;
        swi += w * i;
      }
      (groups[1] as [number, number, number][]).push([a + swi / sw, r, b - a]);
    }
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const g of groups) {
    const lens = Float64Array.from(g.map((p) => p[2]));
    const [med] = percentiles(lens, [50]);
    const lim = RUN_MAX_FACTOR * (med as number);
    for (const [x, y, len] of g) {
      if (len <= lim) {
        xs.push(x * xScale);
        ys.push(y * yScale);
      }
    }
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
}

export interface EllipseFit {
  xc: number;
  yc: number;
  /** Semi-axes, a >= b, and the tilt of a from the x axis (radians, 0..pi), as skimage reports them. */
  a: number;
  b: number;
  theta: number;
  /** Half extents of the ellipse along x and y. */
  halfX: number;
  halfY: number;
  /** halfX / halfY: horizontal over vertical (1.00 = round). */
  axisRatio: number;
  /** rms shortest distance of the points to the ellipse, px. */
  rmsResidual: number;
  n: number;
}

/** Real eigenvalues of a 3x3 matrix: roots of the characteristic cubic, polished by Newton steps. */
function eigenvalues3(M: number[][]): number[] {
  const m = (i: number, j: number): number => (M[i] as number[])[j] as number;
  const tr = m(0, 0) + m(1, 1) + m(2, 2);
  const minors = m(0, 0) * m(1, 1) - m(0, 1) * m(1, 0) + m(0, 0) * m(2, 2) - m(0, 2) * m(2, 0) + m(1, 1) * m(2, 2) - m(1, 2) * m(2, 1);
  const det =
    m(0, 0) * (m(1, 1) * m(2, 2) - m(1, 2) * m(2, 1)) -
    m(0, 1) * (m(1, 0) * m(2, 2) - m(1, 2) * m(2, 0)) +
    m(0, 2) * (m(1, 0) * m(2, 1) - m(1, 1) * m(2, 0));
  // l^3 - tr l^2 + minors l - det = 0; depressed with l = t + tr/3
  const a = -tr;
  const b = minors;
  const c = -det;
  const p = b - (a * a) / 3;
  const q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
  const roots: number[] = [];
  const disc = (q * q) / 4 + (p * p * p) / 27;
  if (disc > 0) {
    const s = Math.sqrt(disc);
    roots.push(Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) - a / 3);
  } else {
    const rr = Math.sqrt(Math.max(-p / 3, 0));
    const phi = rr > 0 ? Math.acos(Math.max(-1, Math.min(1, -q / (2 * rr * rr * rr)))) : 0;
    for (let k = 0; k < 3; k++) roots.push(2 * rr * Math.cos((phi - 2 * Math.PI * k) / 3) - a / 3);
  }
  return roots.map((l0) => {
    let l = l0;
    for (let it = 0; it < 4; it++) {
      const f = ((l + a) * l + b) * l + c;
      const df = (3 * l + 2 * a) * l + b;
      if (df === 0) break;
      const nl = l - f / df;
      if (!Number.isFinite(nl)) break;
      l = nl;
    }
    return l;
  });
}

/** Unit eigenvector of M for eigenvalue l: the largest cross product of two rows of M - l I. */
function eigenvector3(M: number[][], l: number): [number, number, number] {
  const R = M.map((row, i) => row.map((v, j) => (i === j ? v - l : v)));
  const cross = (u: number[], v: number[]): [number, number, number] => [
    (u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number),
    (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number),
    (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number),
  ];
  const cands = [cross(R[0] as number[], R[1] as number[]), cross(R[0] as number[], R[2] as number[]), cross(R[1] as number[], R[2] as number[])];
  let best = cands[0] as [number, number, number];
  let bn = 0;
  for (const v of cands) {
    const n = Math.hypot(...v);
    if (n > bn) {
      bn = n;
      best = v;
    }
  }
  return [best[0] / bn, best[1] / bn, best[2] / bn];
}

function inv3(A: number[][]): number[][] {
  const out: number[][] = [];
  for (let col = 0; col < 3; col++) {
    const aug = A.map((row, i) => Float64Array.from([...row, i === col ? 1 : 0]));
    const sol = solveAugmented(aug);
    out.push(sol);
  }
  // out holds columns; transpose to rows
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (out[j] as number[])[i] as number));
}

const mul3 = (A: number[][], B: number[][]): number[][] =>
  [0, 1, 2].map((i) => [0, 1, 2].map((j) => (A[i] as number[]).reduce((s, v, k) => s + v * ((B[k] as number[])[j] as number), 0)));

/** Shortest distance from (u, v) to the axis-aligned ellipse with semi-axes a, b (Newton on the angle). */
function ellipseDistance(u: number, v: number, a: number, b: number): number {
  let t = Math.atan2(a * v, b * u);
  for (let it = 0; it < 30; it++) {
    const ct = Math.cos(t);
    const st = Math.sin(t);
    // f(t) = d/dt of half the squared distance
    const f = (a * a - b * b) * st * ct - u * a * st + v * b * ct;
    const df = (a * a - b * b) * (ct * ct - st * st) - u * a * ct - v * b * st;
    if (df === 0) break;
    const dt = f / df;
    t -= dt;
    if (Math.abs(dt) < 1e-12) break;
  }
  return Math.hypot(a * Math.cos(t) - u, b * Math.sin(t) - v);
}

/** Algebraic ellipse fit (skimage EllipseModel.estimate, Halir and Flusser 1998). */
export function fitEllipse(xs: ArrayLike<number>, ys: ArrayLike<number>): EllipseFit {
  const n = xs.length;
  if (n < 5) throw new Error('need at least 5 points to fit an ellipse');
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i] as number;
    my += ys[i] as number;
  }
  mx /= n;
  my /= n;
  // data.std() over both coordinates of the centred points
  let ss = 0;
  for (let i = 0; i < n; i++) ss += ((xs[i] as number) - mx) ** 2 + ((ys[i] as number) - my) ** 2;
  const scale = Math.sqrt(ss / (2 * n));
  const S1 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const S2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const S3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const x = ((xs[i] as number) - mx) / scale;
    const y = ((ys[i] as number) - my) / scale;
    const d1 = [x * x, x * y, y * y];
    const d2 = [x, y, 1];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        (S1[r] as number[])[c] = ((S1[r] as number[])[c] as number) + (d1[r] as number) * (d1[c] as number);
        (S2[r] as number[])[c] = ((S2[r] as number[])[c] as number) + (d1[r] as number) * (d2[c] as number);
        (S3[r] as number[])[c] = ((S3[r] as number[])[c] as number) + (d2[r] as number) * (d2[c] as number);
      }
  }
  const S3i = inv3(S3);
  const S2T = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (S2[j] as number[])[i] as number));
  const T = mul3(mul3(S2, S3i), S2T);
  const red = S1.map((row, i) => row.map((v, j) => v - ((T[i] as number[])[j] as number)));
  // inv(C1) for C1 = [[0,0,2],[0,-1,0],[2,0,0]] is [[0,0,1/2],[0,-1,0],[1/2,0,0]]
  const C1i = [[0, 0, 0.5], [0, -1, 0], [0.5, 0, 0]];
  const M = mul3(C1i, red);
  let a1: [number, number, number] | null = null;
  for (const l of eigenvalues3(M)) {
    const v = eigenvector3(M, l);
    if (4 * v[0] * v[2] - v[1] * v[1] > 0) {
      a1 = v;
      break;
    }
  }
  if (!a1) throw new Error('ellipse fit: eigenvector constraint not met');
  const a2 = mul3(S3i, S2T).map((row) => -row.reduce((s, v, k) => s + v * (a1[k] as number), 0));
  // a x^2 + 2 b xy + c y^2 + 2 d x + 2 f y + g = 0 (skimage's naming)
  const A = a1[0];
  const B = a1[1] / 2;
  const C = a1[2];
  const D = (a2[0] as number) / 2;
  const F = (a2[1] as number) / 2;
  const G = a2[2] as number;
  const x0 = (C * D - B * F) / (B * B - A * C);
  const y0 = (A * F - B * D) / (B * B - A * C);
  const num = A * F * F + C * D * D + G * B * B - 2 * B * D * F - A * C * G;
  const term = Math.sqrt((A - C) ** 2 + 4 * B * B);
  let width = Math.sqrt((2 * num) / ((B * B - A * C) * (term - (A + C))));
  let height = Math.sqrt((2 * num) / ((B * B - A * C) * (-term - (A + C))));
  let phi = 0.5 * Math.atan((2.0 * B) / (A - C));
  if (A > C) phi += 0.5 * Math.PI;
  if (width < height) {
    [width, height] = [height, width];
    phi += Math.PI / 2;
  }
  phi = ((phi % Math.PI) + Math.PI) % Math.PI;
  const xc = x0 * scale + mx;
  const yc = y0 * scale + my;
  const sa = width * scale;
  const sb = height * scale;
  const halfX = Math.sqrt((sa * Math.cos(phi)) ** 2 + (sb * Math.sin(phi)) ** 2);
  const halfY = Math.sqrt((sa * Math.sin(phi)) ** 2 + (sb * Math.cos(phi)) ** 2);
  let r2 = 0;
  const ct = Math.cos(phi);
  const st = Math.sin(phi);
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - xc;
    const dy = (ys[i] as number) - yc;
    const u = dx * ct + dy * st;
    const v = -dx * st + dy * ct;
    r2 += ellipseDistance(u, v, sa, sb) ** 2;
  }
  return { xc, yc, a: sa, b: sb, theta: phi, halfX, halfY, axisRatio: halfX / halfY, rmsResidual: Math.sqrt(r2 / n), n };
}
