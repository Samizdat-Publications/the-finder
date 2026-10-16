// Pitch for The Voices: YIN (de Cheveigne and Kawahara 2002, JASA 111(4) 1917-1930,
// doi:10.1121/1.1458024), notes and the repetition curve (the octave), spectral peaks and the comb of equal
// steps (the step), and the long tonal calls (the whale). The twin of tools/voices/vdsp.py (yin, chroma_peaks)
// and vmusic.py; src/dsp/voices.ref.test.ts checks both give the same numbers on the same samples.
// Pure: no DOM, no randomness.

import { medianOf } from './numeric';
import { FRAME_S, frameLevels, hopOf } from './segment';
import { fft, hann, ifft } from './spectrum';

/** YIN absolute threshold on the cumulative mean normalized difference (the paper's step 4 value, 0.1). */
export const YIN_THRESHOLD = 0.1;
/** Frames quieter than this (dBFS, AES17) are not tracked (vdsp.QUIET_DB): no voice or music here is that quiet. */
export const QUIET_DB = -60;

export interface TrackerSettings {
  fminHz: number;
  fmaxHz: number;
  /** Integration window, s (rounded to whole samples at the signal's rate). */
  windowS: number;
}

export interface PitchTrack {
  /** Hz per 10 ms frame (0 where no window fits or the frame is quiet). */
  f0: Float64Array;
  /** The CMND at the chosen lag (1 where untracked). Voiced: below the threshold. */
  ap: Float64Array;
}

/**
 * YIN per 10 ms frame (vdsp.yin): frame k's window starts at k hop + floor(hop/2) - floor(W/2); lags from
 * floor(sr / fmax) to ceil(sr / fmin); the difference function by FFT correlation; the CMND; the first lag
 * below the threshold, walked down to its local minimum (else the CMND's minimum); parabolic refinement of the
 * CMND there. `onProgress(done, total)` is called now and then (the Worker reports it).
 */
export function yin(x: ArrayLike<number>, sr: number, s: TrackerSettings, threshold = YIN_THRESHOLD, onProgress?: (done: number, total: number) => void): PitchTrack {
  const hop = hopOf(sr);
  const n = Math.floor(x.length / hop);
  const tmin = Math.floor(sr / s.fmaxHz);
  const tmax = Math.ceil(sr / s.fminHz);
  const W = Math.round(s.windowS * sr);
  const L = W + tmax + 1;
  const N = 2 ** Math.ceil(Math.log2(L + W));
  const f0 = new Float64Array(n);
  const ap = new Float64Array(n).fill(1);
  const lv = frameLevels(x, sr);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const pr = new Float64Array(N);
  const pi = new Float64Array(N);
  const cs = new Float64Array(L + 1);
  const d = new Float64Array(tmax + 1);
  const dn = new Float64Array(tmax + 1);
  const half = Math.floor(hop / 2) - Math.floor(W / 2);
  for (let k = 0; k < n; k++) {
    if (onProgress && k % 2000 === 0) onProgress(k, n);
    const start = k * hop + half;
    if (start < 0 || start + L > x.length || lv[k]! < QUIET_DB) continue;
    re.fill(0);
    im.fill(0);
    cs[0] = 0;
    for (let i = 0; i < L; i++) {
      const v = x[start + i] as number;
      if (i < W) re[i] = v;
      im[i] = v;
      cs[i + 1] = cs[i]! + v * v;
    }
    // One FFT of a + i b gives both spectra; r = IFFT(conj(A) B).
    fft(re, im);
    for (let q = 0; q < N; q++) {
      const m = (N - q) % N;
      const ar = (re[q]! + re[m]!) / 2;
      const ai = (im[q]! - im[m]!) / 2;
      const br = (im[q]! + im[m]!) / 2;
      const bi = (re[m]! - re[q]!) / 2;
      pr[q] = ar * br + ai * bi;
      pi[q] = ar * bi - ai * br;
    }
    ifft(pr, pi);
    const ea = cs[W]!;
    d[0] = 0;
    for (let t = 1; t <= tmax; t++) d[t] = Math.max(0, ea + (cs[t + W]! - cs[t]!) - 2 * pr[t]!);
    dn[0] = 1;
    let cm = 0;
    for (let t = 1; t <= tmax; t++) {
      cm += d[t]!;
      dn[t] = cm > 0 ? (d[t]! * t) / cm : 1;
    }
    let tau = -1;
    for (let t = tmin; t <= tmax; t++) {
      if (dn[t]! < threshold) {
        while (t + 1 <= tmax && dn[t + 1]! < dn[t]!) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      tau = tmin;
      for (let t = tmin + 1; t <= tmax; t++) if (dn[t]! < dn[tau]!) tau = t;
    }
    ap[k] = dn[tau]!;
    let shift = 0;
    if (tau > tmin && tau < tmax) {
      const y0 = dn[tau - 1]!;
      const y1 = dn[tau]!;
      const y2 = dn[tau + 1]!;
      const den = y0 - 2 * y1 + y2;
      if (den > 0) shift = (0.5 * (y0 - y2)) / den;
    }
    f0[k] = sr / (tau + shift);
  }
  onProgress?.(n, n);
  return { f0, ap };
}

/** Cents re 440 Hz. */
export const cents = (hz: number): number => 1200 * Math.log2((hz > 0 ? hz : 1) / 440);

/** Maximal runs of voiced frames whose pitch moves less than maxStep cents per frame: [start, end). vmusic.runs. */
export function pitchRuns(voiced: (k: number) => boolean, c: ArrayLike<number>, maxStep: number): [number, number][] {
  const out: [number, number][] = [];
  const n = c.length;
  let i = 0;
  while (i < n) {
    if (voiced(i)) {
      let j = i;
      while (j + 1 < n && voiced(j + 1) && Math.abs((c[j + 1] as number) - (c[j] as number)) < maxStep) j++;
      out.push([i, j + 1]);
      i = j + 1;
    } else i++;
  }
  return out;
}

/** A note: voiced frames moving less than half a tempered step per frame, at least 60 ms (vmusic.NOTE_*). */
export const NOTE_STEP_CENTS = 50;
export const NOTE_MIN_FRAMES = 6;

export interface Note {
  start: number;
  frames: number;
  cents: number;
}

/** Every note of a pitch track (vmusic.notes). */
export function notes(t: PitchTrack, threshold = YIN_THRESHOLD): Note[] {
  const c = Float64Array.from(t.f0, cents);
  return pitchRuns((k) => t.ap[k]! < threshold, c, NOTE_STEP_CENTS)
    .filter(([a, b]) => b - a >= NOTE_MIN_FRAMES)
    .map(([a, b]) => ({ start: a, frames: b - a, cents: medianOf(c, a, b) }));
}

/** Histograms of note pitches: cents per bin, over +/- three octaves of 440 Hz. */
export const HIST_BIN = 10;
export const HIST_SPAN = 3600;

/** Notes per HIST_BIN-cent bin over [-HIST_SPAN, HIST_SPAN). vmusic.histogram. */
export function noteHistogram(nc: readonly number[]): Float64Array {
  const nb = Math.round((2 * HIST_SPAN) / HIST_BIN);
  const h = new Float64Array(nb);
  for (const c of nc) {
    const k = Math.floor((c + HIST_SPAN) / HIST_BIN);
    if (k >= 0 && k < nb) h[k] = h[k]! + 1;
  }
  return h;
}

/** How alike the note pattern is to itself moved up by each lag (normalised correlation; 1 at lag 0). */
export function repetitionCurve(h: ArrayLike<number>, maxLagBins: number): Float64Array {
  const out = new Float64Array(maxLagBins + 1);
  for (let k = 0; k <= maxLagBins; k++) {
    let ab = 0;
    let aa = 0;
    let bb = 0;
    for (let i = 0; i + k < h.length; i++) {
      const a = h[i] as number;
      const b = h[i + k] as number;
      ab += a * b;
      aa += a * a;
      bb += b * b;
    }
    const den = Math.sqrt(aa * bb);
    out[k] = den > 0 ? ab / den : 0;
  }
  return out;
}

/** Parabolic refinement of a local maximum at index k (index units). */
export function refinePeak(y: ArrayLike<number>, k: number): number {
  if (k > 0 && k < y.length - 1) {
    const y0 = y[k - 1] as number;
    const y1 = y[k] as number;
    const y2 = y[k + 1] as number;
    const den = y0 - 2 * y1 + y2;
    if (den < 0) return k + (0.5 * (y0 - y2)) / den;
  }
  return k;
}

/** The highest local maximum within +/- halfWidth bins of centreBin, refined; null if none (vmusic.peak_near). */
export function peakNear(y: ArrayLike<number>, centreBin: number, halfWidth: number): number | null {
  const lo = Math.max(1, Math.floor(centreBin - halfWidth));
  const hi = Math.min(y.length - 2, Math.ceil(centreBin + halfWidth));
  let best = -1;
  for (let k = lo; k <= hi; k++) {
    const v = y[k] as number;
    if (v >= (y[k - 1] as number) && v > (y[k + 1] as number) && (best < 0 || v > (y[best] as number))) best = k;
  }
  return best < 0 ? null : refinePeak(y, best);
}

/** The octave on the notes: the repetition curve's peak within one tempered step of a doubling, cents (analyse.octave_of). */
export function octaveOf(nc: readonly number[]): number | null {
  const curve = repetitionCurve(noteHistogram(nc), Math.round(2400 / HIST_BIN));
  const pk = peakNear(curve, 1200 / HIST_BIN, Math.round(100 / HIST_BIN));
  return pk === null ? null : pk * HIST_BIN;
}

/** Spectral peaks for a pitch-class histogram of polyphonic music (vdsp.CHROMA). */
export const CHROMA = { nperseg: 8192, hop: 2048, fminHz: 80, fmaxHz: 2000, relMin: 0.1 } as const;

export interface ChromaPeaks {
  cents: Float64Array;
  weights: Float64Array;
  frames: Int32Array;
}

/** Every spectral peak's cents (parabolic on the log magnitude), magnitude and frame (vdsp.chroma_peaks). */
export function chromaPeaks(x: ArrayLike<number>, sr: number, onProgress?: (done: number, total: number) => void): ChromaPeaks {
  const n = CHROMA.nperseg;
  const w = hann(n);
  const lo = Math.floor((CHROMA.fminHz * n) / sr);
  const hi = Math.ceil((CHROMA.fmaxHz * n) / sr);
  const nf = x.length >= n ? 1 + Math.floor((x.length - n) / CHROMA.hop) : 0;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const a = new Float64Array(hi + 2);
  const cs: number[] = [];
  const ws: number[] = [];
  const fs: number[] = [];
  for (let j = 0; j < nf; j++) {
    if (onProgress && j % 500 === 0) onProgress(j, nf);
    for (let i = 0; i < n; i++) {
      re[i] = (x[j * CHROMA.hop + i] as number) * w[i]!;
      im[i] = 0;
    }
    fft(re, im);
    let mx = 0;
    for (let k = lo - 1; k <= hi + 1; k++) a[k] = Math.hypot(re[k]!, im[k]!);
    for (let k = lo; k <= hi; k++) mx = Math.max(mx, a[k]!);
    if (!(mx > 0)) continue;
    for (let q = lo; q <= hi; q++) {
      if (a[q]! > a[q - 1]! && a[q]! >= a[q + 1]! && a[q]! >= CHROMA.relMin * mx) {
        const y0 = Math.log(a[q - 1]! + 1e-300);
        const y1 = Math.log(a[q]!);
        const y2 = Math.log(a[q + 1]! + 1e-300);
        const den = y0 - 2 * y1 + y2;
        const dq = den < 0 ? (0.5 * (y0 - y2)) / den : 0;
        cs.push(1200 * Math.log2((((q + dq) * sr) / n) / 440));
        ws.push(a[q]!);
        fs.push(j);
      }
    }
  }
  onProgress?.(nf, nf);
  return { cents: Float64Array.from(cs), weights: Float64Array.from(ws), frames: Int32Array.from(fs) };
}

/** The spectral-peak histogram, cents per bin (unfolded). */
export const CHROMA_BIN = 5;

/** Peak magnitude per CHROMA_BIN-cent bin over [-HIST_SPAN, HIST_SPAN), summing to 1 (vmusic.chroma_histogram). */
export function chromaHistogram(p: Pick<ChromaPeaks, 'cents' | 'weights'>): Float64Array {
  const nb = Math.round((2 * HIST_SPAN) / CHROMA_BIN);
  const h = new Float64Array(nb);
  let tot = 0;
  for (let i = 0; i < p.cents.length; i++) {
    const k = Math.floor((p.cents[i]! + HIST_SPAN) / CHROMA_BIN);
    if (k >= 0 && k < nb) {
      h[k] = h[k]! + p.weights[i]!;
      tot += p.weights[i]!;
    }
  }
  for (let k = 0; k < nb; k++) h[k] = h[k]! / tot;
  return h;
}

/** The centre of each histogram bin, cents. */
export function binCentres(nb: number, width: number): Float64Array {
  return Float64Array.from({ length: nb }, (_, i) => -HIST_SPAN + (i + 0.5) * width);
}

export interface GridFit {
  /** Mean log density ratio against no grid (0: no grid; higher: a better grid). */
  score: number;
  offset: number;
  sd: number;
  background: number;
}

const fmod = (a: number, m: number): number => ((a % m) + m) % m;

/**
 * How well weighted pitches sit on a grid of the given step (vmusic.grid_fit): a normal spread about the
 * nearest tooth mixed with a uniform background, by EM from the weighted circular mean, sd step/6 and
 * background 0.5; sd kept between 1 cent and step/4; 80 iterations.
 */
export function gridFit(c: ArrayLike<number>, wIn: ArrayLike<number>, step: number, iters = 80): GridFit {
  const n = c.length;
  let tot = 0;
  for (let i = 0; i < n; i++) tot += wIn[i] as number;
  const w = Float64Array.from({ length: n }, (_, i) => (wIn[i] as number) / tot);
  let sr = 0;
  let si = 0;
  for (let i = 0; i < n; i++) {
    const ph = (2 * Math.PI * (c[i] as number)) / step;
    sr += w[i]! * Math.cos(ph);
    si += w[i]! * Math.sin(ph);
  }
  let off = (Math.atan2(si, sr) / (2 * Math.PI)) * step;
  let sd = step / 6;
  let eps = 0.5;
  const r = new Float64Array(n);
  const g = new Float64Array(n);
  const dens = (): void => {
    const k = step / (sd * Math.sqrt(2 * Math.PI));
    for (let i = 0; i < n; i++) {
      r[i] = fmod((c[i] as number) - off + step / 2, step) - step / 2;
      g[i] = k * Math.exp(-0.5 * (r[i]! / sd) ** 2);
    }
  };
  for (let it = 0; it < iters; it++) {
    dens();
    let sw = 0;
    let swr = 0;
    let swr2 = 0;
    for (let i = 0; i < n; i++) {
      const post = (((1 - eps) * g[i]!) / ((1 - eps) * g[i]! + eps)) * w[i]!;
      sw += post;
      swr += post * r[i]!;
      swr2 += post * r[i]! * r[i]!;
    }
    if (sw <= 0) break;
    off += swr / sw;
    // The new sd uses the residuals about the old offset, as the reference does.
    sd = Math.min(step / 4, Math.max(1, Math.sqrt(swr2 / sw)));
    eps = Math.min(0.999, Math.max(0, 1 - sw));
  }
  dens();
  let score = 0;
  for (let i = 0; i < n; i++) if (w[i]! > 0) score += w[i]! * Math.log((1 - eps) * g[i]! + eps);
  return { score, offset: off, sd, background: eps };
}

/** Equal divisions of the octave the comb tries (vmusic.COMB_K): halves to 36 parts. */
export const COMB_K = [2, 36] as const;

/** gridFit's score for every comb of k = COMB_K[0]..COMB_K[1] equal steps per octave. */
export function combScores(c: ArrayLike<number>, w: ArrayLike<number>, octaveCents: number): number[] {
  const out: number[] = [];
  for (let k = COMB_K[0]; k <= COMB_K[1]; k++) out.push(gridFit(c, w, octaveCents / k).score);
  return out;
}

/** A call: voiced frames moving less than one tempered step per frame, held at least 0.2 s (vmusic.CALL_*). */
export const CALL_STEP_CENTS = 100;
export const CALL_MIN_S = 0.2;

export interface Call {
  start: number;
  frames: number;
  medianHz: number;
  glideCents: number;
}

/** Every pitch run held at least CALL_MIN_S (vmusic.runs with CALL_STEP_CENTS). */
function heldRuns(t: PitchTrack, threshold: number): [number, number][] {
  const c = Float64Array.from(t.f0, cents);
  const need = Math.round(CALL_MIN_S / FRAME_S);
  return pitchRuns((k) => t.ap[k]! < threshold, c, CALL_STEP_CENTS).filter(([a, b]) => b - a >= need);
}

/** Long tonal calls whose median pitch is above minHz (vmusic.calls). */
export function calls(t: PitchTrack, minHz: number, threshold = YIN_THRESHOLD): Call[] {
  const out: Call[] = [];
  for (const [a, b] of heldRuns(t, threshold)) {
    const med = medianOf(t.f0, a, b);
    if (!(med > minHz)) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = a; k < b; k++) {
      const c = cents(t.f0[k]!);
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
    out.push({ start: a, frames: b - a, medianHz: med, glideCents: hi - lo });
  }
  return out;
}

/** The highest median pitch of any run held CALL_MIN_S: the speakers' ceiling (vmusic.longest_run_pitch). */
export function heldRunCeiling(t: PitchTrack, threshold = YIN_THRESHOLD): number {
  let best = 0;
  for (const [a, b] of heldRuns(t, threshold)) best = Math.max(best, medianOf(t.f0, a, b));
  return best;
}
