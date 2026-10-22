// Which game-state change makes which sound. One subscription to the game's signals (rule 5: the interface
// and the bots change the state through the same commands, so a bot hears and logs exactly what a player
// does). This file is logic only: it turns state changes into cue events, rate-limits them, keeps the cue
// log and the caption, and hands the events to a sink (the real Web Audio sink in start.tsx, a fake in tests).

import { effect, signal } from '@preact/signals';
import { reframeReading } from '../chapters/trail/state';
import { nodeDef, type ChapterId, type ChapterView } from '../game/graph';
import { confirmedSet, game, turntable } from '../game/state';

export type CueKind = 'pluck' | 'cadence' | 'tick' | 'breath' | 'swell' | 'hush' | 'chapter' | 'duck' | 'snap' | 'warm' | 'twist' | 'agree';

export interface CueEvent {
  kind: CueKind;
  /** The chapter whose key the cue is in (pluck, cadence, swell), or the one entered (chapter). */
  chapter: ChapterView;
  /** The deduction that caused it, when one did. */
  nodeId?: string;
  /** For duck: true while the record plays. */
  on?: boolean;
  /** For snap: each old line's age offset in the alien's own frame, scaled so the largest is +/-1. */
  scatter?: number[];
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
  snap: 3000,
  warm: 3000,
  twist: 3000,
  agree: 3000,
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
  snap: 'scattered tones settle into one chord',
  warm: 'a warm low tone, held',
  twist: 'the instruments hush, then the warm tone again, softer',
  agree: 'the clocks agree',
};

/** The caption when Portrait's bed comes in (the hum changes to a slow chord of every chapter's key). */
export const PORTRAIT_BED_CAPTION = "a slow chord of every chapter's key";

export function captionFor(kind: CueKind): string | null {
  return CAPTIONS[kind];
}

/** The deduction ids with a cue of their own. A pluck would crowd them, so they replace it. */
export const SWELL_NODE = 'pictures.circle';
export const HUSH_NODE = 'player.firstSound';
/** The Sun found: the warm low tone under the pluck. */
export const WARM_NODE = 'trail.origin';
/** The neighbour twist: the hush, then the warm tone again, softer. */
export const TWIST_NODE = 'trail.neighbour';
/** The clocks agree (Portrait): a resolving swell. */
export const AGREE_NODE = 'portrait.together';

/**
 * The one cue a state change that confirms these deductions plays: the moments first (swell, hush, the Sun
 * found, the neighbour twist), else a pluck in the first node's key. Shared with the staged moments, whose
 * caption line names the sound that plays (src/ui/Moment.tsx).
 */
export function confirmationCue(added: readonly string[]): CueEvent {
  const has = (id: string): boolean => added.includes(id);
  if (has(SWELL_NODE)) return { kind: 'swell', chapter: 'pictures', nodeId: SWELL_NODE };
  if (has(HUSH_NODE)) return { kind: 'hush', chapter: 'player', nodeId: HUSH_NODE };
  if (has(WARM_NODE)) return { kind: 'warm', chapter: 'trail', nodeId: WARM_NODE };
  if (has(TWIST_NODE)) return { kind: 'twist', chapter: 'trail', nodeId: TWIST_NODE };
  if (has(AGREE_NODE)) return { kind: 'agree', chapter: 'portrait', nodeId: AGREE_NODE };
  const first = added[0] as string;
  return { kind: 'pluck', chapter: nodeDef(first)?.chapter ?? 'hub', nodeId: first };
}

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
    const caption = event.kind === 'chapter' && event.chapter === 'portrait' ? PORTRAIT_BED_CAPTION : CAPTIONS[event.kind];
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
    // One cue per state change (confirmationCue).
    fire(confirmationCue(added));
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

  // ---- The Trail's reframe: the first time the ages are read in the origin star's frame and agree ----
  let snapped = false;
  const stopSnap = effect(() => {
    const r = reframeReading.value;
    if (snapped || !r || !r.origin || !r.agree) return;
    const big = Math.max(1e-9, ...r.scatterYears.map((y) => Math.abs(y)));
    if (fire({ kind: 'snap', chapter: 'trail', nodeId: 'trail.when', scatter: r.scatterYears.map((y) => y / big) })) snapped = true;
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
      stopSnap();
      stopCodex();
      stopChapter();
      stopPlaying();
    },
  };
}
