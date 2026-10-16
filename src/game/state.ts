// The bench's state, in Preact signals. Only the command bus handlers (bus.ts and the two services it
// calls) and engine events write here; the interface only reads (rule 5, one command bus).

import { signal } from '@preact/signals';
import type { Direction } from '../record/groove';
import type { NeedleState } from '../record/engine';
import { COVER_PERIOD_S, referenceBench, type BenchParams } from './model';

export type TurntableStatus = 'idle' | 'loading' | 'ready' | 'error';
export type DecoderStatus = 'idle' | 'loading' | 'decoding' | 'revealing' | 'done' | 'error';

/** A finished decode: the whole picture and how it was made. */
export interface Picture {
  frame: string;
  width: number;
  height: number;
  /** 8-bit grey, row-major (height x width). */
  gray: Uint8Array;
  levels: [number, number];
  timings: { syncMs: number; decodeMs: number; grayMs: number; totalMs: number };
  /** Samples (at the slice rate) between the line starts the decode used. */
  lineStepSamples: number;
  /** The bench knobs used. */
  bench: BenchParams;
}

export interface SyncInfo {
  /** Fitted line period, samples at the slice rate. */
  periodSamples: number;
  /** Line 1's falling edge, samples from the slice start. */
  firstEdgeSamples: number;
  rmsResidual: number;
  nReplaced: number;
}

export interface ColourPicture {
  image: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Shift applied to G and B to line up with R, pixels (rows, columns), and the correlation peak. */
  shiftG: { shift: [number, number]; peak: number };
  shiftB: { shift: [number, number]; peak: number };
  frames: [string, string, string];
}

export const turntable = {
  side: signal<number | null>(null),
  secondsPerTurn: signal(COVER_PERIOD_S),
  direction: signal<Direction>('cw'),
  volume: signal(0.8),
  needle: signal<NeedleState | null>(null),
  status: signal<TurntableStatus>('idle'),
  error: signal<string | null>(null),
  /** Bytes of the files this drop needs (the item under the needle and the next one). */
  load: signal({ loaded: 0, total: 0 }),
};

export const decoder = {
  frame: signal('L000'),
  bench: signal<BenchParams>(referenceBench()),
  status: signal<DecoderStatus>('idle'),
  error: signal<string | null>(null),
  /** Lines shown so far (columns, left to right). */
  revealed: signal(0),
  picture: signal<Picture | null>(null),
  colour: signal<ColourPicture | null>(null),
  sync: signal<SyncInfo | null>(null),
};

/** A plain copy of the whole state (the harness API; tests read this, never the signals). */
export function snapshot() {
  const n = turntable.needle.value;
  const p = decoder.picture.value;
  const c = decoder.colour.value;
  return {
    turntable: {
      side: turntable.side.value,
      status: turntable.status.value,
      error: turntable.error.value,
      secondsPerTurn: turntable.secondsPerTurn.value,
      direction: turntable.direction.value,
      volume: turntable.volume.value,
      load: { ...turntable.load.value },
      /** Speed over the true speed; before the engine exists, from the slider alone. */
      speedRatio: n?.speedRatio ?? COVER_PERIOD_S / turntable.secondsPerTurn.value,
      needle: n ? { ...n } : null,
    },
    decoder: {
      frame: decoder.frame.value,
      status: decoder.status.value,
      error: decoder.error.value,
      bench: { ...decoder.bench.value },
      revealed: decoder.revealed.value,
      sync: decoder.sync.value ? { ...decoder.sync.value } : null,
      picture: p ? { frame: p.frame, width: p.width, height: p.height, levels: p.levels, timings: p.timings, bench: p.bench } : null,
      colour: c ? { image: c.image, width: c.width, height: c.height, shiftG: c.shiftG, shiftB: c.shiftB, frames: c.frames } : null,
    },
  };
}

export type Snapshot = ReturnType<typeof snapshot>;
