// Which game-state change makes which sound. One subscription to the game's signals (rule 5: the interface
// and the bots change the state through the same commands, so a bot hears and logs exactly what a player
// does). This file is logic only: it turns state changes into cue events, rate-limits them, keeps the cue
// log and the caption, and hands the events to a sink (the real Web Audio sink in start.tsx, a fake in tests).

import { effect, signal } from '@preact/signals';
import { nodeDef, type ChapterId, type ChapterView } from '../game/graph';
import { confirmedSet, game, turntable } from '../game/state';

export type CueKind = 'pluck' | 'cadence' | 'tick' | 'breath' | 'swell' | 'hush' | 'chapter' | 'duck';

export interface CueEvent {
  kind: CueKind;
  /** The chapter whose key the cue is in (pluck, cadence, swell), or the one entered (chapter). */
  chapter: ChapterView;
  /** The deduction that caused it, when one did. */
  nodeId?: string;
  /** For duck: true while the record plays. */
  on?: boolean;
}

export interface SoundSink {
  cue(event: CueEvent): void;
}

export interface CueLogEntry {
  n: number;
  at: number;
  kind: CueKind;
  chapter: ChapterView;
  nodeId?: string;
  /** The caption line for the cue, or null for the ones that are not captioned (ticks, ducking). */
  caption: string | null;
}

/** Minimum gap between two cues of the same kind, ms. A burst inside the gap makes one cue. */
export const MIN_GAP_MS: Record<CueKind, number> = {
  pluck: 150,
  cadence: 400,
  tick: 70,
  breath: 500,
  swell: 3000,
  hush: 3000,
  chapter: 0,
  duck: 0,
};

const CAPTIONS: Record<CueKind, string | null> = {
  pluck: 'a soft pluck',
  cadence: 'two low notes, falling',
  tick: null,
  breath: 'a slow breath of air',
  swell: 'a chord rising out of many tones',
  hush: 'the instruments hush',
  chapter: 'the hum changes key',
  duck: null,
};

export function captionFor(kind: CueKind): string | null {
  return CAPTIONS[kind];
}

/** The deduction ids with a cue of their own. A pluck would crowd them, so they replace it. */
export const SWELL_NODE = 'pictures.circle';
export const HUSH_NODE = 'player.firstSound';

const LOG_CAP = 300;
const log: CueLogEntry[] = [];
let counter = 0;

/** The latest captioned cue, for the caption strip. A new object for every cue, so the same text re-shows. */
export const lastCaption = signal<{ n: number; text: string } | null>(null);

export function cueLog(): readonly CueLogEntry[] {
  return log;
}

export function clearCueLog(): void {
  log.length = 0;
  counter = 0;
  lastCaption.value = null;
}

export interface CuesOptions {
  sink: SoundSink;
  /** Milliseconds clock for the rate limits (default performance.now). */
  now?: () => number;
}

export interface Cues {
  /** Fire a cue directly (the DOM tick uses this). Returns false if the rate limit dropped it. */
  fire(event: CueEvent): boolean;
  /** Stop listening. */
  dispose(): void;
}

/**
 * Start the subscription. The first run only records the current state as the baseline, so loading a save
 * does not play a cue for every deduction already confirmed.
 */
export function startCues(opts: CuesOptions): Cues {
  const now = opts.now ?? ((): number => performance.now());
  const lastAt = new Map<CueKind, number>();

  const fire = (event: CueEvent): boolean => {
    const t = now();
    const prev = lastAt.get(event.kind);
    if (prev !== undefined && t - prev < MIN_GAP_MS[event.kind]) return false;
    lastAt.set(event.kind, t);
    const caption = CAPTIONS[event.kind];
    const entry: CueLogEntry = { n: ++counter, at: t, kind: event.kind, chapter: event.chapter, caption };
    if (event.nodeId !== undefined) entry.nodeId = event.nodeId;
    log.push(entry);
    if (log.length > LOG_CAP) log.shift();
    if (caption) lastCaption.value = { n: entry.n, text: caption };
    opts.sink.cue(event);
    return true;
  };

  const chapterOf = (id: string): ChapterId | null => nodeDef(id)?.chapter ?? null;

  // ---- confirmations ----
  let seenConfirmed: ReadonlySet<string> | null = null;
  const stopConfirm = effect(() => {
    const now_ = confirmedSet.value;
    const prev = seenConfirmed;
    seenConfirmed = now_;
    if (!prev) return;
    const added = [...now_].filter((id) => !prev.has(id));
    if (added.length === 0) return;
    // One cue per state change: the moments first (swell, then hush), else a pluck in the first node's key.
    const swell = added.find((id) => id === SWELL_NODE);
    const hush = added.find((id) => id === HUSH_NODE);
    if (swell) fire({ kind: 'swell', chapter: 'pictures', nodeId: swell });
    else if (hush) fire({ kind: 'hush', chapter: 'player', nodeId: hush });
    else {
      const first = added[0] as string;
      fire({ kind: 'pluck', chapter: chapterOf(first) ?? 'hub', nodeId: first });
    }
  });

  // ---- rejected answers: an attempt was added and it was not ok ----
  let seenAttempts: Record<string, number> | null = null;
  const stopReject = effect(() => {
    const recs = game.records.value;
    const counts: Record<string, number> = {};
    let rejectedId: string | null = null;
    for (const [id, r] of Object.entries(recs)) {
      counts[id] = r.attempts.length;
      const before = seenAttempts?.[id] ?? 0;
      const last = r.attempts[r.attempts.length - 1];
      if (seenAttempts && r.attempts.length > before && last && !last.ok && rejectedId === null) rejectedId = id;
    }
    seenAttempts = counts;
    if (rejectedId !== null) fire({ kind: 'cadence', chapter: chapterOf(rejectedId) ?? 'hub', nodeId: rejectedId });
  });

  // ---- the codex opening ----
  let codexWas: boolean | null = null;
  const stopCodex = effect(() => {
    const open = game.codexOpen.value;
    const was = codexWas;
    codexWas = open;
    if (was === false && open) fire({ kind: 'breath', chapter: game.chapter.peek() });
  });

  // ---- the chapter (the hum changes key) ----
  let chapterWas: ChapterView | null = null;
  const stopChapter = effect(() => {
    const view = game.chapter.value;
    const was = chapterWas;
    chapterWas = view;
    // The very first value starts the hum without a caption of its own: sink.cue still gets it.
    if (was === null) opts.sink.cue({ kind: 'chapter', chapter: view });
    else if (was !== view) fire({ kind: 'chapter', chapter: view });
  });

  // ---- the record playing (needle down and the disc turning): the ambience ducks ----
  let playingWas: boolean | null = null;
  const stopPlaying = effect(() => {
    const n = turntable.needle.value;
    const playing = Boolean(n && n.down && n.speed > 0);
    if (playing === playingWas) return;
    const first = playingWas === null;
    playingWas = playing;
    if (first && !playing) return; // the baseline: silence, nothing to announce
    fire({ kind: 'duck', chapter: game.chapter.peek(), on: playing });
  });

  return {
    fire,
    dispose(): void {
      stopConfirm();
      stopReject();
      stopCodex();
      stopChapter();
      stopPlaying();
    },
  };
}
