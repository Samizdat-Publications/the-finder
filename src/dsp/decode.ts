// One frame of the image tape to an 8-bit grayscale picture. A faithful port of
// tools/ref-decoder/decode.py: per line (one image column, line 1 at the left), from its start:
//  1. DC restore: the median shelf level after the edge is the blanking reference (clamp).
//  2. Droop inverse of the AC-coupled chain: s(t) = y(t) - y(t0) + (1/tau) * integral_{t0}^{t} (y - baseline).
//  3. Interlace: long-pulse lines shifted by -delta/2, short-pulse lines by +delta/2, sub-sample.
//  4. Rows: the active window [w0, w1] split into nRows equal spans, each pixel the exact area average
//     (linear interpolation of the cumulative sum, so fractional positions are honoured).
//  5. Parity level profile: half the long-minus-short profile removed from each parity.
//  6. Polarity (more signal is darker: negate) and the per-frame percentile stretch to 0..255.
// Every step is a DecodeParams field, so the game can decode wrong on purpose. The API is progressive:
// prepareFrame() does the sync once, decodeLines() fills any range of lines, so a picture can be
// revealed line by line. Pure: no DOM, no randomness.

import { argmax, medianFilter1d, medianOf, percentiles, pyInt, roundHalfEven, uniformFilter1d, unwrap } from './numeric';
import { BASE_RATE, LINES_PER_FRAME, scaled, type DecodeParams } from './params';
import { lockEdges, pulseParity, refineEdge, robustLineFit, syncScore, trackFromSeed, type LineFit } from './sync';

/** Convert decoded slice samples (int16 / 32768, as decodeAudioData and soundfile give them) to tape units. */
export function toTapeUnits(samples: ArrayLike<number>, gain: number): Float64Array {
  const x = new Float64Array(samples.length);
  for (let i = 0; i < x.length; i++) x[i] = ((samples[i] as number) * 32768.0) / gain;
  return x;
}

export interface FrameSync {
  /** Detected edges, line 1 first (NaN where tracking lost a line). */
  raw: Float64Array;
  /** Edges after outlier replacement: what the reference decodes with. */
  locked: Float64Array;
  /** 1 where the line has the long sync pulse. */
  parityLong: Uint8Array;
  fit: LineFit;
  nReplaced: number;
  /** Sync score of the whole signal (kept for slant measurement). */
  box: Float64Array;
  /** Rate scale r = rate / 384000. */
  r: number;
}

/**
 * Sync for one frame (the 96 kHz path of make_slices.py): the edge nearest the seed (the first-line
 * offset from data/frames.json) refined and 512 lines tracked with the frame's period as the prior
 * (384 kHz samples), outliers replaced, pulse parity read.
 */
export function syncFrame(x: Float64Array, rate: number, seed: number, periodPrior384k: number, nLines = LINES_PER_FRAME): FrameSync {
  const r = rate / BASE_RATE;
  const box = syncScore(x, r);
  const raw = trackFromSeed(x, seed, nLines, r, periodPrior384k, box);
  const { used, fit, nReplaced } = lockEdges(raw);
  const parityLong = pulseParity(x, used, r);
  return { raw, locked: used, parityLong, fit, nReplaced, box, r };
}

export interface LinePlan {
  /** Start of each decoded line (samples of x). */
  starts: Float64Array;
  parityLong: Uint8Array;
}

/**
 * The line starts actually decoded. Sync lock on: each line's own locked edge. Off (free-running): line 1's
 * edge plus k times params.linePeriod (or the fitted period), parity alternating from line 1's, exactly
 * as decode_all.py makes its wrong decodes.
 */
export function planLines(sync: FrameSync, p: DecodeParams): LinePlan {
  if (p.syncLock) return { starts: sync.locked, parityLong: sync.parityLong };
  const n = sync.locked.length;
  const P = p.linePeriod === null ? sync.fit.P : scaled(p, p.linePeriod);
  const s0 = sync.locked[0] as number;
  const starts = new Float64Array(n);
  const par = new Uint8Array(n);
  const p0 = sync.parityLong[0] as number;
  for (let k = 0; k < n; k++) {
    starts[k] = s0 + P * k;
    par[k] = k % 2 === 0 ? p0 : 1 - p0;
  }
  return { starts, parityLong: par };
}

/** Geometry derived once per (rate, params): the integer spans of restore_lines and sample_rows. */
interface Geometry {
  pad: number;
  length: number;
  c0: number;
  c1: number;
  t0: number;
  tau: number;
  w0: number;
  w1: number;
  span: number;
  bounds: Float64Array;
  halfDelta: number;
}

function geometry(p: DecodeParams): Geometry {
  const pad = Math.ceil(scaled(p, p.clamp0)) + 8;
  const delta = scaled(p, p.delta);
  const w0 = scaled(p, p.w0);
  const w1 = scaled(p, p.w1);
  const length = Math.ceil(w1 + Math.abs(delta) + 16) + pad;
  const c0 = roundHalfEven(scaled(p, p.clamp0));
  const c1 = roundHalfEven(scaled(p, p.clamp1));
  const n = p.nRows;
  const bounds = new Float64Array(n + 1);
  for (let j = 0; j <= n; j++) bounds[j] = w0 + ((w1 - w0) * j) / n;
  return {
    pad,
    length,
    c0,
    c1,
    t0: pad + Math.floor((c0 + c1) / 2),
    tau: scaled(p, p.tau),
    w0,
    w1,
    span: (w1 - w0) / n,
    bounds,
    halfDelta: delta / 2.0,
  };
}

/** Clamp level of every line: median of the shelf span (restore_lines), optionally same-parity median smoothed. */
export function clampLevels(x: Float64Array, plan: LinePlan, p: DecodeParams): Float64Array {
  const g = geometry(p);
  const n = plan.starts.length;
  const ref = new Float64Array(n);
  const buf = new Float64Array(g.c1 - g.c0 + 1);
  const last = x.length - 1;
  for (let k = 0; k < n; k++) {
    const base = Math.floor(plan.starts[k] as number) - g.pad;
    for (let i = 0; i < buf.length; i++) {
      const idx = base + g.pad + g.c0 + i;
      buf[i] = x[idx < 0 ? 0 : idx > last ? last : idx] as number;
    }
    ref[k] = medianOf(buf);
  }
  if (p.clampSmooth > 1) {
    for (const want of [1, 0]) {
      const ids: number[] = [];
      for (let k = 0; k < n; k++) if ((plan.parityLong[k] as number) === want) ids.push(k);
      if (!ids.length) continue;
      const sm = medianFilter1d(
        ids.map((k) => ref[k] as number),
        Math.trunc(p.clampSmooth),
      );
      ids.forEach((k, i) => (ref[k] = sm[i] as number));
    }
  }
  return ref;
}

/** Everything decodeLines needs, computed once per frame and parameter set. */
export interface FrameJob {
  x: Float64Array;
  params: DecodeParams;
  plan: LinePlan;
  clamp: Float64Array;
  nLines: number;
}

export function makeJob(x: Float64Array, sync: FrameSync, params: DecodeParams): FrameJob {
  const plan = planLines(sync, params);
  return { x, params, plan, clamp: clampLevels(x, plan, params), nLines: plan.starts.length };
}

/**
 * Decode lines k0..k1 (exclusive) into `out`, the float picture before polarity and stretch, row-major
 * (nRows x nLines, out[row * nLines + line]) like decode.py's V.T. Steps 1 to 5 above.
 */
export function decodeLines(job: FrameJob, k0: number, k1: number, out: Float64Array): void {
  const { x, params: p, plan, clamp } = job;
  const g = geometry(p);
  const nL = job.nLines;
  const nR = p.nRows;
  const last = x.length - 1;
  const Z = new Float64Array(g.length);
  const S = new Float64Array(g.length + 1);
  const Sv = new Float64Array(nR + 1);
  const prof = p.parityProfile;
  if (prof !== null && prof.length !== nR) throw new Error('parityProfile length must equal nRows');
  const zMax = g.length - 1.000001;
  for (let k = k0; k < k1; k++) {
    const e = plan.starts[k] as number;
    const base = Math.floor(e) - g.pad;
    const ref = clamp[k] as number;
    // 1-2: clamp and droop inverse; cum is the running sum of (M - baseline)
    let cum = 0;
    let cumT0 = 0;
    for (let i = 0; i < g.length; i++) {
      const idx = base + i;
      const m = x[idx < 0 ? 0 : idx > last ? last : idx] as number;
      cum += m - p.baseline;
      Z[i] = m;
      if (i === g.t0) cumT0 = cum;
      S[i] = cum; // scratch: the running sum, used below once cum at t0 is known
    }
    for (let i = 0; i < g.length; i++) {
      // Z = M - ref + (cum - cum[t0]) / tau, the same operation order as decode.py restore_lines
      Z[i] = (Z[i] as number) - ref + ((S[i] as number) - cumT0) / g.tau;
    }
    // 4: area average over each row span, from the cumulative sum of Z with a leading zero
    let s = 0;
    S[0] = 0;
    for (let i = 0; i < g.length; i++) {
      s += Z[i] as number;
      S[i + 1] = s;
    }
    const shift = (plan.parityLong[k] as number) ? -g.halfDelta : g.halfDelta;
    const off = e + shift - base;
    for (let j = 0; j <= nR; j++) {
      let pos = off + (g.bounds[j] as number);
      if (pos < 0) pos = 0;
      else if (pos > zMax) pos = zMax;
      const i = Math.floor(pos);
      const f = pos - i;
      Sv[j] = (S[i] as number) * (1 - f) + (S[i + 1] as number) * f;
    }
    const sign = (plan.parityLong[k] as number) ? 0.5 : -0.5;
    for (let j = 0; j < nR; j++) {
      let v = ((Sv[j + 1] as number) - (Sv[j] as number)) / g.span;
      if (prof !== null) v = v - sign * (prof[j] as number);
      out[j * nL + k] = v;
    }
  }
}

/** Black and white points of the level stretch: percentiles of the polarity-applied values (to_gray). */
export function frameLevels(values: Float64Array, p: DecodeParams): [number, number] {
  const w = p.polarity === 'negative' ? values.map((v) => -v) : values;
  const [lo, hi] = percentiles(w, [p.pLo, p.pHi]);
  return [lo as number, hi as number];
}

/** Polarity and stretch to 8-bit, for the columns k0..k1 of a row-major float picture (to_gray). */
export function toGray(values: Float64Array, nLines: number, p: DecodeParams, levels: readonly [number, number], out: Uint8Array, k0 = 0, k1 = nLines): void {
  const [lo, hi] = levels;
  const den = Math.max(hi - lo, 1e-9);
  const neg = p.polarity === 'negative';
  for (let j = 0; j < p.nRows; j++) {
    for (let k = k0; k < k1; k++) {
      const v = values[j * nLines + k] as number;
      let g = (((neg ? -v : v) - lo) / den) * 255.0;
      if (g < 0) g = 0;
      else if (g > 255) g = 255;
      out[j * nLines + k] = roundHalfEven(g);
    }
  }
}

export interface DecodedFrame {
  width: number;
  height: number;
  /** 8-bit grayscale, row-major (height x width), column k is line k + 1. */
  gray: Uint8Array;
  /** The float picture before polarity and stretch (row-major, same layout). */
  values: Float64Array;
  levels: [number, number];
}

/** The whole frame (decode.py decode_frame). */
export function decodeFrame(x: Float64Array, sync: FrameSync, params: DecodeParams): DecodedFrame {
  const job = makeJob(x, sync, params);
  const values = new Float64Array(params.nRows * job.nLines);
  decodeLines(job, 0, job.nLines, values);
  const levels = frameLevels(values, params);
  const gray = new Uint8Array(values.length);
  toGray(values, job.nLines, params, levels, gray);
  return { width: job.nLines, height: params.nRows, gray, values, levels };
}

/**
 * Drift of the real sync edge relative to the line starts actually used, samples per line at the
 * decode rate (decode.py measure_slant): for each used start the strongest sync within half a line is
 * refined, the offsets are unwrapped with period pTrue and fitted robustly against the line number
 * (with a parity term). Only lines whose search window ends before the frame's last real edge count.
 */
export function measureSlant(x: Float64Array, box: Float64Array, starts: ArrayLike<number>, pTrue: number, lastEdge: number, r: number): { slope: number; nUsed: number; rms: number } {
  const half = pTrue / 2.0;
  const ks: number[] = [];
  const offs: number[] = [];
  for (let k = 0; k < starts.length; k++) {
    const u = starts[k] as number;
    if (u + half > lastEdge + 30 * r) break;
    const lo = pyInt(u - half);
    const hi = pyInt(u + half);
    if (lo < 0 || hi >= x.length) continue;
    const c = lo + argmax(box, lo, hi);
    const [e] = refineEdge(x, c, r);
    if (Number.isFinite(e)) {
      ks.push(k);
      offs.push(e - u);
    }
  }
  const fit = robustLineFit(ks, unwrap(offs, pTrue), true);
  return { slope: fit.P, nUsed: ks.length, rms: fit.rms };
}

/**
 * Content shift between every pair of adjacent columns of a row-major float picture, in rows, sub-row
 * by a parabola through the cross-correlation peak (decode.py pair_lags). lag[k] > 0: column k + 1
 * shows the same content lag rows later. Columns are high-passed (minus an `hp`-row moving average).
 * NaN where a column is featureless or the peak is at the search edge.
 */
export function pairLags(V: Float64Array, nRows: number, nCols: number, maxLag = 30, hp = 61): { lags: Float64Array; peaks: Float64Array } {
  const H = new Float64Array(nRows * nCols);
  const col = new Float64Array(nRows);
  for (let c = 0; c < nCols; c++) {
    for (let r = 0; r < nRows; r++) col[r] = V[r * nCols + c] as number;
    const u = uniformFilter1d(col, hp);
    for (let r = 0; r < nRows; r++) H[c * nRows + r] = (col[r] as number) - (u[r] as number); // column-major
  }
  const m = maxLag;
  const n = nRows - 2 * m;
  const lags = new Float64Array(nCols - 1).fill(Number.NaN);
  const peaks = new Float64Array(nCols - 1).fill(Number.NaN);
  const cc = new Float64Array(2 * m + 1);
  for (let k = 0; k < nCols - 1; k++) {
    const a0 = k * nRows + m;
    const b0 = (k + 1) * nRows + m;
    let na = 0;
    for (let i = 0; i < n; i++) na += (H[a0 + i] as number) ** 2;
    na = Math.sqrt(na);
    for (let L = -m; L <= m; L++) {
      let s = 0;
      let nb = 0;
      for (let i = 0; i < n; i++) {
        const bv = H[b0 + L + i] as number;
        s += (H[a0 + i] as number) * bv;
        nb += bv * bv;
      }
      cc[L + m] = s / Math.max(na * Math.sqrt(nb), 1e-12);
    }
    const j = argmax(cc);
    if (na < 1e-6 || j === 0 || j === 2 * m) continue;
    const y0 = cc[j - 1] as number;
    const y1 = cc[j] as number;
    const y2 = cc[j + 1] as number;
    const den = y0 - 2 * y1 + y2;
    const d = den < 0 ? (0.5 * (y0 - y2)) / den : 0;
    lags[k] = j - m + d;
    peaks[k] = y1;
  }
  return { lags, peaks };
}

/**
 * Offset of short-pulse lines relative to long-pulse lines, in rows (decode.py measure_interlace):
 * long-to-short pairs give offset + slope, short-to-long give -offset + slope, so genuinely slanted
 * content cancels in (median_ls - median_sl) / 2. Only pairs with a correlation peak above minPeak.
 */
export function measureInterlace(V: Float64Array, nRows: number, parityLong: ArrayLike<number>, maxLag = 30, minPeak = 0.5): { offset: number; nLs: number; nSl: number } {
  const nCols = parityLong.length;
  const { lags, peaks } = pairLags(V, nRows, nCols, maxLag);
  const ls: number[] = [];
  const sl: number[] = [];
  for (let k = 0; k < nCols - 1; k++) {
    const v = lags[k] as number;
    if (!Number.isFinite(v) || !((peaks[k] as number) > minPeak)) continue;
    const a = (parityLong[k] as number) !== 0;
    const b = (parityLong[k + 1] as number) !== 0;
    if (a && !b) ls.push(v);
    else if (!a && b) sl.push(v);
  }
  if (ls.length < 5 || sl.length < 5) return { offset: Number.NaN, nLs: ls.length, nSl: sl.length };
  return { offset: (medianOf(ls) - medianOf(sl)) / 2, nLs: ls.length, nSl: sl.length };
}
