// Colour composites: three consecutive frames are the R, G and B separations of one picture (an
// inference, README section 9). G and B are registered to R by normalized cross-correlation of their
// gradient magnitude (edges, not brightness, which legitimately differs between colours) over integer
// shifts up to REG_MAX pixels, refined to a fraction of a pixel with a parabola, then shifted by linear
// interpolation and stacked. A port of decode_all.py register() and its composite step.
// Pure: no DOM, no randomness.

import { roundHalfEven } from './numeric';

/** Largest registration shift searched, pixels (decode_all.py REG_MAX: frames are each locked to their own syncs). */
export const REG_MAX = 6;

export interface Gray {
  width: number;
  height: number;
  /** Row-major values (8-bit pictures or floats). */
  data: ArrayLike<number>;
}

/** scipy.ndimage 'reflect' boundary (d c b a | a b c d | d c b a) for an index into [0, n). */
function reflect(i: number, n: number): number {
  if (n === 1) return 0;
  const p = 2 * n;
  let k = ((i % p) + p) % p;
  if (k >= n) k = p - 1 - k;
  return k;
}

/** hypot(sobel(a, axis 0), sobel(a, axis 1)) as scipy.ndimage.sobel (mode 'reflect'). */
export function gradientMagnitude(img: Gray): Float64Array {
  const { width: W, height: H, data } = img;
  const at = (r: number, c: number): number => data[reflect(r, H) * W + reflect(c, W)] as number;
  const out = new Float64Array(W * H);
  // interior: direct indexing (the same sums as below, without the boundary function)
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      const i = r * W + c;
      const ul = data[i - W - 1] as number;
      const u = data[i - W] as number;
      const ur = data[i - W + 1] as number;
      const l = data[i - 1] as number;
      const rt = data[i + 1] as number;
      const dl = data[i + W - 1] as number;
      const d = data[i + W] as number;
      const dr = data[i + W + 1] as number;
      out[i] = Math.hypot(dl + 2 * d + dr - (ul + 2 * u + ur), ur + 2 * rt + dr - (ul + 2 * l + dl));
    }
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (r > 0 && r < H - 1 && c > 0 && c < W - 1) continue;
      // derivative [-1, 0, 1] along one axis, smoothing [1, 2, 1] along the other
      const gr =
        at(r + 1, c - 1) + 2 * at(r + 1, c) + at(r + 1, c + 1) - (at(r - 1, c - 1) + 2 * at(r - 1, c) + at(r - 1, c + 1));
      const gc =
        at(r - 1, c + 1) + 2 * at(r, c + 1) + at(r + 1, c + 1) - (at(r - 1, c - 1) + 2 * at(r, c - 1) + at(r + 1, c - 1));
      out[r * W + c] = Math.hypot(gr, gc);
    }
  }
  return out;
}

export interface Registration {
  /** Shift to apply to the moving separation, pixels (rows, columns). */
  shift: [number, number];
  /** Normalized correlation at the best integer shift. */
  peak: number;
}

/** Shift that aligns `mov` with `ref` (decode_all.py register). */
export function register(ref: Gray, mov: Gray, maxShift = REG_MAX): Registration {
  const W = ref.width;
  const H = ref.height;
  if (mov.width !== W || mov.height !== H) throw new Error('separations must be the same size');
  const A = gradientMagnitude(ref);
  const B = gradientMagnitude(mov);
  const m = maxShift;
  const h = H - 2 * m;
  const w = W - 2 * m;
  const N = h * w;
  const norm = (src: Float64Array, r0: number, c0: number): Float64Array => {
    const o = new Float64Array(N);
    let s = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) s += o[r * w + c] = src[(r0 + r) * W + c0 + c] as number;
    const mean = s / N;
    let v = 0;
    for (let i = 0; i < N; i++) v += ((o[i] as number) - mean) ** 2;
    const sd = Math.sqrt(v / N) + 1e-12;
    for (let i = 0; i < N; i++) o[i] = ((o[i] as number) - mean) / sd;
    return o;
  };
  const Ac = norm(A, m, m);
  let sumA = 0;
  for (let k = 0; k < N; k++) sumA += Ac[k] as number;
  // window sums of B and B^2 from integral images, so each shift's mean and std cost O(1);
  // mean(Ac * (Bw - mean) / sd) = (sum(Ac * Bw) - mean * sum(Ac)) / (sd * N), the same quantity
  const W1 = W + 1;
  const IB = new Float64Array(W1 * (H + 1));
  const IB2 = new Float64Array(W1 * (H + 1));
  for (let r = 0; r < H; r++) {
    let s1 = 0;
    let s2 = 0;
    for (let c = 0; c < W; c++) {
      const v = B[r * W + c] as number;
      s1 += v;
      s2 += v * v;
      IB[(r + 1) * W1 + c + 1] = (IB[r * W1 + c + 1] as number) + s1;
      IB2[(r + 1) * W1 + c + 1] = (IB2[r * W1 + c + 1] as number) + s2;
    }
  }
  const rect = (I: Float64Array, r0: number, c0: number): number =>
    (I[(r0 + h) * W1 + c0 + w] as number) - (I[r0 * W1 + c0 + w] as number) - (I[(r0 + h) * W1 + c0] as number) + (I[r0 * W1 + c0] as number);
  const n = 2 * m + 1;
  const cc = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const dr = i - m;
    for (let j = 0; j < n; j++) {
      const dc = j - m;
      const r0 = m - dr;
      const c0 = m - dc;
      const mean = rect(IB, r0, c0) / N;
      const sd = Math.sqrt(Math.max(rect(IB2, r0, c0) / N - mean * mean, 0)) + 1e-12;
      let s = 0;
      for (let r = 0; r < h; r++) {
        const ao = r * w;
        const bo = (r0 + r) * W + c0;
        for (let c = 0; c < w; c++) s += (Ac[ao + c] as number) * (B[bo + c] as number);
      }
      cc[i * n + j] = (s - mean * sumA) / (sd * N);
    }
  }
  let bi = 0;
  for (let k = 1; k < cc.length; k++) if ((cc[k] as number) > (cc[bi] as number)) bi = k;
  const i = Math.floor(bi / n);
  const j = bi - i * n;
  const para = (y0: number, y1: number, y2: number): number => {
    const den = y0 - 2 * y1 + y2;
    return den < 0 ? (0.5 * (y0 - y2)) / den : 0;
  };
  const at = (a: number, b: number): number => cc[a * n + b] as number;
  const fr = i > 0 && i < 2 * m ? para(at(i - 1, j), at(i, j), at(i + 1, j)) : 0;
  const fc = j > 0 && j < 2 * m ? para(at(i, j - 1), at(i, j), at(i, j + 1)) : 0;
  // cc[i, j] compares ref(p) with mov(p - (dr, dc)), so mov is moved by +(dr, dc)
  return { shift: [i - m + fr, j - m + fc], peak: at(i, j) };
}

/** scipy.ndimage.shift(img, (dr, dc), order=1, mode="nearest"): out(p) = img(p - shift), bilinear, edges extended. */
export function shiftImage(img: Gray, shift: readonly [number, number]): Float64Array {
  const { width: W, height: H, data } = img;
  const out = new Float64Array(W * H);
  const clampR = (r: number): number => (r < 0 ? 0 : r > H - 1 ? H - 1 : r);
  const clampC = (c: number): number => (c < 0 ? 0 : c > W - 1 ? W - 1 : c);
  for (let r = 0; r < H; r++) {
    const y = clampR(r - shift[0]);
    const y0 = Math.floor(y);
    const y1 = Math.min(y0 + 1, H - 1);
    const fy = y - y0;
    for (let c = 0; c < W; c++) {
      const x = clampC(c - shift[1]);
      const x0 = Math.floor(x);
      const x1 = Math.min(x0 + 1, W - 1);
      const fx = x - x0;
      const v00 = data[y0 * W + x0] as number;
      const v01 = data[y0 * W + x1] as number;
      const v10 = data[y1 * W + x0] as number;
      const v11 = data[y1 * W + x1] as number;
      out[r * W + c] = (1 - fy) * ((1 - fx) * v00 + fx * v01) + fy * ((1 - fx) * v10 + fx * v11);
    }
  }
  return out;
}

export interface Composite {
  width: number;
  height: number;
  /** RGBA bytes, row-major (ready for ImageData). */
  rgba: Uint8ClampedArray;
  shiftG: Registration;
  shiftB: Registration;
}

/** Register G and B to R and compose an RGB picture (decode_all.py colour composites). */
export function compose(r: Gray, g: Gray, b: Gray): Composite {
  const shiftG = register(r, g);
  const shiftB = register(r, b);
  const G = shiftImage(g, shiftG.shift);
  const B = shiftImage(b, shiftB.shift);
  const N = r.width * r.height;
  const rgba = new Uint8ClampedArray(N * 4);
  const to8 = (v: number): number => Math.min(255, Math.max(0, roundHalfEven(v)));
  for (let i = 0; i < N; i++) {
    rgba[4 * i] = to8(r.data[i] as number);
    rgba[4 * i + 1] = to8(G[i] as number);
    rgba[4 * i + 2] = to8(B[i] as number);
    rgba[4 * i + 3] = 255;
  }
  return { width: r.width, height: r.height, rgba, shiftG, shiftB };
}
