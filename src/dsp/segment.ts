// Speech segments for The Voices: 10 ms frame levels, silent runs, the stretches of sound between them, each
// segment's pitch, and how many voices the pitches need at least. The twin of tools/voices/vdsp.py
// (frame_levels, silent_runs, segments) and vmusic.py (segment_pitches, voices_by_pitch). Both parameters of
// the segmenter (threshold and minimum gap) are exposed: the player sets them. Pure: no DOM, no randomness.

import { medianOf, percentiles } from './numeric';

/** Frame length for levels and pitch, s (voices.md section 1 measured with 10 ms RMS frames). */
export const FRAME_S = 0.01;
/** AES17: the RMS of a full-scale sine reads 0 dBFS, so 20 log10(rms sqrt 2) (+3.01 dB on plain RMS). */
export const SINE_DB = 20 * Math.log10(Math.SQRT2);
/** Level written for digital silence, dBFS (a stand-in for minus infinity). */
export const FLOOR_DB = -200;

export const hopOf = (sr: number): number => Math.round(FRAME_S * sr);

/** dBFS (AES17) of each whole 10 ms frame (the last partial frame is dropped). vdsp.frame_levels. */
export function frameLevels(x: ArrayLike<number>, sr: number): Float64Array {
  const hop = hopOf(sr);
  const n = Math.floor(x.length / hop);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = k * hop; i < (k + 1) * hop; i++) {
      const v = x[i] as number;
      s += v * v;
    }
    const ms = s / hop;
    out[k] = ms > 0 ? Math.max(FLOOR_DB, 10 * Math.log10(ms) + SINE_DB) : FLOOR_DB;
  }
  return out;
}

/** Runs of frames below the threshold lasting at least minGapS: [start, end) frame indices. vdsp.silent_runs. */
export function silentRuns(levels: ArrayLike<number>, thresholdDb: number, minGapS: number): [number, number][] {
  const need = Math.round(minGapS / FRAME_S);
  const out: [number, number][] = [];
  let i = 0;
  const n = levels.length;
  while (i < n) {
    if ((levels[i] as number) < thresholdDb) {
      let j = i;
      while (j < n && (levels[j] as number) < thresholdDb) j++;
      if (j - i >= need) out.push([i, j]);
      i = j;
    } else i++;
  }
  return out;
}

/** Stretches of sound between qualifying silent runs, trimmed to their first and last loud frame. vdsp.segments. */
export function segments(levels: ArrayLike<number>, thresholdDb: number, minGapS: number): [number, number][] {
  const cuts = [0];
  for (const [a, b] of silentRuns(levels, thresholdDb, minGapS)) cuts.push(a, b);
  cuts.push(levels.length);
  const out: [number, number][] = [];
  for (let i = 0; i < cuts.length; i += 2) {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    let first = -1;
    let last = -1;
    for (let k = a; k < b; k++) {
      if ((levels[k] as number) >= thresholdDb) {
        if (first < 0) first = k;
        last = k;
      }
    }
    if (first >= 0) out.push([first, last + 1]);
  }
  return out;
}

/** A segment's pitch is the median of its voiced frames, given at least 10 (0.1 s). vmusic.SEG_MIN_VOICED. */
export const SEG_MIN_VOICED = 10;

/** Median pitch (Hz) of each segment with at least SEG_MIN_VOICED voiced frames (f0 > 0). vmusic.segment_pitches. */
export function segmentPitches(levels: ArrayLike<number>, f0: ArrayLike<number>, thresholdDb: number, gapS: number): number[] {
  const out: number[] = [];
  for (const [a, b] of segments(levels, thresholdDb, gapS)) {
    const v: number[] = [];
    for (let k = a; k < b; k++) if ((f0[k] as number) > 0) v.push(f0[k] as number);
    if (v.length >= SEG_MIN_VOICED) out.push(medianOf(v));
  }
  return out;
}

/** The two-sided 95% normal point, for one speaker's 95% pitch range (2 x 1.96 sd). */
const Z975 = 1.959963984540054;

/** Sample standard deviation (ddof 1) of log2 pitches, in semitones. */
export function sdSemitones(pitchesHz: readonly number[]): number {
  const st = pitchesHz.map((f) => 12 * Math.log2(f));
  const m = st.reduce((a, b) => a + b, 0) / st.length;
  return Math.sqrt(st.reduce((a, b) => a + (b - m) ** 2, 0) / (st.length - 1));
}

/** The central 95% (2.5th to 97.5th percentile) of the pitches, semitones. */
export function pitchSpan95(pitchesHz: readonly number[]): number {
  const [lo, hi] = percentiles(pitchesHz.map((f) => 12 * Math.log2(f)), [2.5, 97.5]);
  return hi! - lo!;
}

/**
 * How many voices' worth of pitch the segments span: their central 95% span over one speaker's 95% range
 * (2 x 1.96 x that speaker's sd), rounded to the nearest whole number (one speaker's own pitches give about 1).
 * At 2 or more, one voice could not have said them all. vmusic.voices_by_pitch.
 */
export function voicesByPitch(pitchesHz: readonly number[], sdOneSemitones: number): number {
  if (pitchesHz.length < 2) return pitchesHz.length;
  return Math.floor(pitchSpan95(pitchesHz) / (2 * Z975 * sdOneSemitones) + 0.5);
}

/**
 * Every stretch quieter than thresholdDb (and not digital silence, below -100 dBFS) long enough for one Welch
 * segment of nperseg samples: the transfer's own noise between voices (analyse.quiet_stretches).
 */
export function quietStretches(x: Float64Array | Float32Array, sr: number, thresholdDb: number, nperseg: number): (Float64Array | Float32Array)[] {
  const lv = frameLevels(x, sr);
  const hop = hopOf(sr);
  const out: (Float64Array | Float32Array)[] = [];
  let i = 0;
  while (i < lv.length) {
    const quiet = (k: number): boolean => lv[k]! < thresholdDb && lv[k]! > -100;
    if (quiet(i)) {
      let j = i;
      while (j < lv.length && quiet(j)) j++;
      if ((j - i) * hop >= nperseg) out.push(x.subarray(i * hop, j * hop));
      i = j;
    } else i++;
  }
  return out;
}
