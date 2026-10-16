// Decoder parameters: every step of the picture decode is a parameter, so the game can decode WRONG on
// purpose (line time, interlace, sync lock, droop, clamp smoothing, polarity, rows) and the tests can
// decode exactly like the Python reference (tools/ref-decoder/decode.py, DecodeParams).
// The reference values come from data/decoder.json, written by tools/ref-decoder/export_params.py from
// build/ref/metrics.json (every number measured on the 1977 tape; tools/ref-decoder/README.md).

import decoderData from '../../data/decoder.json';

/** The tape's header rate, Hz: all lengths below are samples at this rate (images-and-audio.md section 2). */
export const BASE_RATE = 384_000;

export type Channel = 'L' | 'R';

export interface DecodeParams {
  /** Hz: sample rate of the signal being decoded (96,000 for the browser slices). */
  rate: number;
  /** Samples at 384 kHz after the line's falling edge: first picture sample (README section 7: 258). */
  w0: number;
  /** Samples at 384 kHz after the edge: end of the picture (README section 7: 2898). */
  w1: number;
  /** Rows per picture, from the calibration circle (README section 7: 355). */
  nRows: number;
  /** Samples at 384 kHz: droop time constant (README section 4: L 448, R 246). 1e12 = no correction. */
  tau: number;
  /** Samples at 384 kHz: interlace offset, short-pulse content lags long (README section 6: 7.31). 0 = off. */
  delta: number;
  /** Samples at 384 kHz after the edge: shelf span used as the clamp level, inclusive (README section 4: 60..240). */
  clamp0: number;
  clamp1: number;
  /** Tape units: the level the droop decays to (README section 4: 0). */
  baseline: number;
  /** Lines: running median of clamp levels over same-parity lines (1 = off, the reference). */
  clampSmooth: number;
  /** Tape units per row: long-pulse minus short-pulse level profile (README "Streaks"); null = off. */
  parityProfile: readonly number[] | null;
  /** Percent: black and white points of the per-frame level stretch (README section 5: 0.5, 99.5). */
  pLo: number;
  pHi: number;
  /** 'negative' (the reference: more signal is darker, README section 5) or 'positive' (wrong). */
  polarity: 'negative' | 'positive';
  /** true: every line starts at its own detected falling edge (the reference). false: free-running. */
  syncLock: boolean;
  /**
   * Samples at 384 kHz: the line period used when syncLock is false (lines start at line 1 + k x this).
   * null: the frame's own fitted period. Ignored when syncLock is true.
   */
  linePeriod: number | null;
}

export interface DecoderData {
  meta: { baseRate: number };
  geometry: {
    w0: number;
    w1: number;
    nRows: number;
    columns: number;
    delta: number;
    clamp0: number;
    clamp1: number;
    baseline: number;
    clampSmooth: number;
    pLo: number;
    pHi: number;
  };
  channels: Record<Channel, { tau: number; parityProfile: number[] }>;
  frames: Record<string, { periodSamples384k: number }>;
  reference: {
    circle: { axisRatio: number; fit: Record<string, number> };
    freeRun: { e: number; periodUsed384k: number; slantSamplesPerLine384k: number; slantPredicted384k: number; linesMeasured: number }[];
    noInterlace: {
      evenOddShiftWithout384k: number;
      evenOddShiftWith384k: number;
      predictedWithout384k: number;
      ellipseRmsWithoutPx: number;
      ellipseRmsWithPx: number;
    };
    interlaceIqr384k: [number, number];
    slices96: { ssimMean: number; ssimMin: number; ssimWorstFrame: string };
    linePeriodMedian384k: number;
  };
}

export const DECODER_DATA = decoderData as unknown as DecoderData;

/** Lines per picture. Source: cover.md section 1c (raster label 1000000000 = 512) and the NASA cover text. */
export const LINES_PER_FRAME = 512;

/** The reference decode for one channel at `rate` Hz (the 96 kHz slices by default). */
export function referenceParams(channel: Channel, rate = 96_000, data: DecoderData = DECODER_DATA): DecodeParams {
  const g = data.geometry;
  const ch = data.channels[channel];
  return {
    rate,
    w0: g.w0,
    w1: g.w1,
    nRows: g.nRows,
    tau: ch.tau,
    delta: g.delta,
    clamp0: g.clamp0,
    clamp1: g.clamp1,
    baseline: g.baseline,
    clampSmooth: g.clampSmooth,
    parityProfile: ch.parityProfile,
    pLo: g.pLo,
    pHi: g.pHi,
    polarity: 'negative',
    syncLock: true,
    linePeriod: null,
  };
}

/** The frame's fitted line period at 384 kHz (the tracking prior, as make_slices.py uses it). */
export function periodPrior(frameId: string, data: DecoderData = DECODER_DATA): number {
  const f = data.frames[frameId];
  if (!f) throw new Error(`no period prior for frame ${frameId} in data/decoder.json`);
  return f.periodSamples384k;
}

/** A geometry value scaled from 384 kHz samples to the decode rate (DecodeParams.scaled in decode.py). */
export function scaled(p: DecodeParams, value: number): number {
  return (value * p.rate) / BASE_RATE;
}
