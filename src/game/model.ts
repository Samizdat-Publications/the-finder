// The bench's shared, pure model: the record's timeline and groove (no audio), the cover's numbers and the
// picture knobs with their mapping onto the decoder's parameters. No DOM, no randomness.

import coverJson from '../../data/cover.json';
import recordJson from '../../data/record.json';
import { BASE_RATE, DECODER_DATA, referenceParams, type Channel, type DecodeParams } from '../dsp/params';
import { Groove, rotationPeriodFromCover } from '../record/groove';
import { Timeline, type RecordData } from '../record/timeline';
import { binaryToSeconds } from '../science/units';

export const timeline = new Timeline(recordJson as unknown as RecordData);
/** The cover's etched rotation period, s per turn (3.59994). */
export const COVER_PERIOD_S = rotationPeriodFromCover(coverJson);
export const groove = new Groove(timeline, COVER_PERIOD_S);

/** The cover's etched duration of one picture line, ms (8.3396). */
export const COVER_LINE_MS = binaryToSeconds(coverJson.picture.lineTime.binary) * 1000;
/** The line time measured on the tape (median fitted line period at 384 kHz), ms. Real lines arrive at this rate. */
export const TAPE_LINE_MS = (DECODER_DATA.reference.linePeriodMedian384k / BASE_RATE) * 1000;
/** Rows per picture in the reference decode (the calibration circle's 355). */
export const REFERENCE_ROWS = DECODER_DATA.geometry.nRows;

export const SPEED_RANGE_S = { min: 1.8, max: 7.2 } as const;
export const LINE_MS_RANGE = { min: 7.5, max: 9.2 } as const;
export const ROWS_RANGE = { min: 300, max: 420 } as const;

/** The knobs the bench offers (the picture panel). */
export interface BenchParams {
  /** Absolute line time, ms. Used only when sync lock is off. */
  lineTimeMs: number;
  /** On: each line starts at its own sync pulse. */
  syncLock: boolean;
  /** On: the interlace offset between long and short sync lines is corrected. */
  interlace: boolean;
  /** 'negative' is the normal reading (more signal is darker); 'positive' is inverted. */
  polarity: 'negative' | 'positive';
  /** On: the droop of the AC-coupled chain is undone. */
  droop: boolean;
  rows: number;
}

export function referenceBench(): BenchParams {
  return { lineTimeMs: COVER_LINE_MS, syncLock: true, interlace: true, polarity: 'negative', droop: true, rows: REFERENCE_ROWS };
}

/** Percent the line time is off the cover's value. */
export function lineTimePercentOff(ms: number): number {
  return (ms / COVER_LINE_MS - 1) * 100;
}

/** Linear resample of a per-row profile to a new row count (the same positions, 0 to 1 across the picture). */
export function resampleProfile(profile: readonly number[], n: number): number[] {
  if (profile.length === n) return [...profile];
  const out: number[] = [];
  const m = profile.length;
  for (let j = 0; j < n; j++) {
    const pos = ((j + 0.5) / n) * m - 0.5;
    const i = Math.min(m - 1, Math.max(0, Math.floor(pos)));
    const i1 = Math.min(m - 1, i + 1);
    const f = Math.min(1, Math.max(0, pos - i));
    out.push((profile[i] as number) * (1 - f) + (profile[i1] as number) * f);
  }
  return out;
}

/** The decoder parameters for a frame's channel and the bench knobs. The reference bench gives exactly referenceParams. */
export function toDecodeParams(channel: Channel, b: BenchParams, rate = 96_000): DecodeParams {
  const ref = referenceParams(channel, rate);
  return {
    ...ref,
    nRows: b.rows,
    parityProfile: ref.parityProfile === null ? null : resampleProfile(ref.parityProfile, b.rows),
    delta: b.interlace ? ref.delta : 0,
    tau: b.droop ? ref.tau : 1e12,
    polarity: b.polarity,
    syncLock: b.syncLock,
    linePeriod: b.syncLock ? null : (b.lineTimeMs * BASE_RATE) / 1000,
  };
}

/** Item ids and radius helpers for tests and the interface. */
export function radiusAtItemStart(side: number, itemId: string, offsetS = 0): number {
  const e = timeline.entryById(itemId);
  if (e.side !== side) throw new Error(`item ${itemId} is on side ${e.side}, not ${side}`);
  return groove.radiusAtTime(side, e.startS + offsetS);
}
