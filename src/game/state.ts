// The bench's state, in Preact signals. Only the command bus handlers (bus.ts and the two services it
// calls) and engine events write here; the interface only reads (rule 5, one command bus).

import { computed, signal } from '@preact/signals';
import type { Direction } from '../record/groove';
import type { NeedleState } from '../record/engine';
import { DEFAULT_SEED, chapterStatus, type Attempt, type ChapterStatus } from './deductions';
import { CHAPTERS, NODES, type ChapterView } from './graph';
import { COVER_PERIOD_S, referenceBench, type BenchParams } from './model';
import { defaultSettings, type Settings } from './settings';

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


/** What the game remembers about one deduction. A node with no record is untouched. */
export interface NodeRecord {
  confirmed: boolean;
  attempts: Attempt[];
  /** Hint tiers revealed so far: 0 none, 1 nudge, 2 method, 3 answer. */
  hints: number;
}

/** The game's state (the shell, the deduction graph, the settings). Only gameService.ts and save.ts write here. */
export const game = {
  records: signal<Record<string, NodeRecord>>({}),
  chapter: signal<ChapterView>('hub'),
  settings: signal<Settings>(defaultSettings()),
  /** The playthrough's seed: every simulated measurement draws from it (rule 6). Saved; a new one on Start over. */
  seed: signal<string>(DEFAULT_SEED),
  codexOpen: signal(false),
  /** The codex entry to show first (a deduction id), when it was opened for one. */
  codexFocus: signal<string | null>(null),
  settingsOpen: signal(false),
  /** The last refused command's reason, for the interface to show. */
  error: signal<string | null>(null),
};

export const confirmedSet = computed<ReadonlySet<string>>(
  () => new Set(Object.entries(game.records.value).filter(([, r]) => r.confirmed).map(([id]) => id)),
);

export const hintsUsed = computed(() => Object.values(game.records.value).reduce((n, r) => n + r.hints, 0));

function gameSnapshot() {
  const recs = game.records.value;
  const confirmed = confirmedSet.value;
  return {
    chapter: game.chapter.value,
    settings: { ...game.settings.value },
    seed: game.seed.value,
    codexOpen: game.codexOpen.value,
    codexFocus: game.codexFocus.value,
    settingsOpen: game.settingsOpen.value,
    error: game.error.value,
    confirmed: [...confirmed],
    hintsUsed: hintsUsed.value,
    nodes: Object.fromEntries(
      NODES.map((n) => {
        const r = recs[n.id];
        return [n.id, { confirmed: confirmed.has(n.id), attempts: r ? r.attempts.map((a) => ({ ...a })) : [], hints: r?.hints ?? 0 }];
      }),
    ) as Record<string, { confirmed: boolean; attempts: Attempt[]; hints: number }>,
    chapterStatus: Object.fromEntries(CHAPTERS.map((c) => [c.id, chapterStatus(c.id, confirmed)])) as Record<string, ChapterStatus>,
  };
}

/** A plain copy of the whole state (the harness API; tests read this, never the signals). */
export function snapshot() {
  const n = turntable.needle.value;
  const p = decoder.picture.value;
  const c = decoder.colour.value;
  return {
    game: gameSnapshot(),
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
