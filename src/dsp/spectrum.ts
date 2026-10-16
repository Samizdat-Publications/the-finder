// Spectra for The Voices: a radix-2 FFT, scipy's Welch long-term spectrum, band levels, the noise crossing
// and a spectrogram for display. The twin of tools/voices/vdsp.py (welch, segment_bands, band_power) and
// analyse.py (crossing); src/dsp/voices.ref.test.ts checks both give the same numbers on the same samples.
// Pure: no DOM, no randomness.

/** In-place iterative radix-2 FFT (forward, no scaling) of re + i im; the length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error(`fft: length ${n} is not a power of two`);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  const tw = twiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const stride = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = tw.cos[k * stride]!;
        const wi = tw.sin[k * stride]!;
        const a = i + k;
        const b = a + half;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
}

const twCache = new Map<number, { cos: Float64Array; sin: Float64Array }>();
function twiddles(n: number): { cos: Float64Array; sin: Float64Array } {
  let t = twCache.get(n);
  if (!t) {
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      cos[k] = Math.cos((-2 * Math.PI * k) / n);
      sin[k] = Math.sin((-2 * Math.PI * k) / n);
    }
    t = { cos, sin };
    twCache.set(n, t);
  }
  return t;
}

/** Inverse FFT in place (scaled by 1/n). */
export function ifft(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i]!;
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] = re[i]! / n;
    im[i] = -im[i]! / n;
  }
}

/** scipy.signal.get_window('hann', n): the periodic Hann window, 0.5 - 0.5 cos(2 pi i / n). */
export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export interface WelchOptions {
  /** Samples per segment (power of two). Default 4096. */
  nperseg?: number;
}

/**
 * Each Welch segment's one-sided periodogram, as scipy.signal.welch builds them: periodic Hann, 50% overlap
 * (segments every nperseg / 2 while a whole one fits), the segment's mean removed, density scaling
 * 1 / (fs sum w^2), doubled except at 0 and Nyquist. Calls `each(psd)` once per segment (psd reused).
 */
export function forEachPeriodogram(x: ArrayLike<number>, sr: number, nperseg: number, each: (psd: Float64Array) => void): number {
  const w = hann(nperseg);
  let s2 = 0;
  for (let i = 0; i < nperseg; i++) s2 += w[i]! * w[i]!;
  const scale = 1 / (sr * s2);
  const hop = nperseg >> 1;
  const nb = nperseg / 2 + 1;
  const re = new Float64Array(nperseg);
  const im = new Float64Array(nperseg);
  const psd = new Float64Array(nb);
  let count = 0;
  for (let start = 0; start + nperseg <= x.length; start += hop) {
    let mean = 0;
    for (let i = 0; i < nperseg; i++) mean += x[start + i] as number;
    mean /= nperseg;
    for (let i = 0; i < nperseg; i++) {
      re[i] = ((x[start + i] as number) - mean) * w[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < nb; k++) {
      const p = (re[k]! * re[k]! + im[k]! * im[k]!) * scale;
      psd[k] = k === 0 || k === nb - 1 ? p : 2 * p;
    }
    each(psd);
    count++;
  }
  return count;
}

export interface Welch {
  /** Bin frequencies, Hz (k sr / nperseg). */
  freqs: Float64Array;
  /** Mean one-sided PSD, units^2 / Hz. */
  psd: Float64Array;
  segments: number;
}

/** scipy.signal.welch(x, sr, 'hann', nperseg, nperseg // 2, detrend='constant', scaling='density'). */
export function welch(x: ArrayLike<number>, sr: number, opts: WelchOptions = {}): Welch {
  const n = opts.nperseg ?? 4096;
  const nb = n / 2 + 1;
  const sum = new Float64Array(nb);
  const segments = forEachPeriodogram(x, sr, n, (p) => {
    for (let k = 0; k < nb; k++) sum[k] = sum[k]! + p[k]!;
  });
  const freqs = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    freqs[k] = (k * sr) / n;
    sum[k] = segments > 0 ? sum[k]! / segments : Number.NaN;
  }
  return { freqs, psd: sum, segments };
}

/** For each band [edges[i], edges[i+1]): which PSD bins it averages (lo <= f < hi). */
function bandBins(freqs: ArrayLike<number>, edges: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    let a = -1;
    let b = -1;
    for (let k = 0; k < freqs.length; k++) {
      const f = freqs[k] as number;
      if (f >= edges[i]! && f < edges[i + 1]!) {
        if (a < 0) a = k;
        b = k + 1;
      }
    }
    out.push([a, b]);
  }
  return out;
}

/** Mean PSD of the bins in each band (NaN for a band holding no bin). vdsp.band_power. */
export function bandPower(freqs: ArrayLike<number>, psd: ArrayLike<number>, edges: readonly number[]): Float64Array {
  const bins = bandBins(freqs, edges);
  const out = new Float64Array(bins.length);
  bins.forEach(([a, b], i) => {
    if (a < 0) {
      out[i] = Number.NaN;
      return;
    }
    let s = 0;
    for (let k = a; k < b; k++) s += psd[k] as number;
    out[i] = s / (b - a);
  });
  return out;
}

/** Band powers of every Welch segment (rows: segments). vdsp.segment_bands. */
export function segmentBands(x: ArrayLike<number>, sr: number, nperseg: number, edges: readonly number[]): Float64Array[] {
  const freqs = new Float64Array(nperseg / 2 + 1);
  for (let k = 0; k < freqs.length; k++) freqs[k] = (k * sr) / nperseg;
  const out: Float64Array[] = [];
  forEachPeriodogram(x, sr, nperseg, (p) => out.push(bandPower(freqs, p, edges)));
  return out;
}

/** The mean of rows, column by column. */
export function meanRows(rows: readonly Float64Array[], width: number): Float64Array {
  const m = new Float64Array(width);
  for (const r of rows) for (let i = 0; i < width; i++) m[i] = m[i]! + r[i]!;
  for (let i = 0; i < width; i++) m[i] = m[i]! / rows.length;
  return m;
}

/** 10 log10 of each value. */
export function toDb(p: ArrayLike<number>): Float64Array {
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = 10 * Math.log10(p[i] as number);
  return out;
}

/** Where the sound falls into the noise: twice the noise power, 3.01 dB (analyse.py SNR_EDGE_DB). */
export const SNR_EDGE_DB = 10 * Math.log10(2);

/** Bands are judged only up to 20 kHz: Opus codes at most 20 kHz (fullband, RFC 6716 section 2). analyse.TOP_HZ. */
export const CROSSING_TOP_HZ = 20_000;

/**
 * analyse.crossing: the frequency above which the signal-to-noise ratio (dB, per band, bands up to topHz)
 * stays at or below SNR_EDGE_DB, linearly interpolated between band centres; the last band's top edge if it is
 * still above it.
 */
export function crossing(snrDb: ArrayLike<number>, edges: readonly number[], topHz = CROSSING_TOP_HZ): number {
  let n = 0;
  while (n < snrDb.length && edges[n + 1]! <= topHz) n++;
  const centre = (i: number): number => (edges[i]! + edges[i + 1]!) / 2;
  let k = -1;
  for (let i = 0; i < n; i++) if ((snrDb[i] as number) > SNR_EDGE_DB) k = i;
  if (k < 0) return centre(0);
  if (k === n - 1) return edges[n]!;
  const s0 = snrDb[k] as number;
  const s1 = snrDb[k + 1] as number;
  return centre(k) + ((s0 - SNR_EDGE_DB) / (s0 - s1)) * (centre(k + 1) - centre(k));
}

export interface Spectrogram {
  /** Columns (time frames) of rows (frequency bins 0 .. bins-1), each a level 0..255 (dB mapped). */
  data: Uint8Array;
  frames: number;
  bins: number;
  /** Seconds between columns. */
  hopS: number;
  /** Hz per row. */
  binHz: number;
  /** The dB mapped to 0 and 255. */
  floorDb: number;
  topDb: number;
}

/**
 * A spectrogram for display: Hann frames of n samples every hop, magnitude in dB re full scale, rows up to
 * maxHz, mapped linearly from floorDb (0) to topDb (255). Display only: nothing is measured from it.
 */
export function spectrogram(x: ArrayLike<number>, sr: number, n = 1024, hop = 512, maxHz = 8000, floorDb = -100, topDb = -20): Spectrogram {
  const w = hann(n);
  let ws = 0;
  for (let i = 0; i < n; i++) ws += w[i]!;
  const bins = Math.min(n / 2, Math.ceil((maxHz * n) / sr));
  const frames = x.length >= n ? 1 + Math.floor((x.length - n) / hop) : 0;
  const data = new Uint8Array(frames * bins);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let j = 0; j < frames; j++) {
    for (let i = 0; i < n; i++) {
      re[i] = (x[j * hop + i] as number) * w[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      const mag = (2 * Math.hypot(re[k]!, im[k]!)) / ws;
      const db = 20 * Math.log10(mag + 1e-12);
      data[j * bins + k] = Math.max(0, Math.min(255, Math.round(((db - floorDb) / (topDb - floorDb)) * 255)));
    }
  }
  return { data, frames, bins, hopS: hop / sr, binHz: sr / n, floorDb, topDb };
}
