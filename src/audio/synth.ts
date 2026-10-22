// Shared pieces for the alien instruments' voice: the level targets, each chapter's key, and small
// helpers that work on any BaseAudioContext (live or Offline), so a browser test can render a cue exactly
// as the game plays it. Sound design, not physics: every level and pitch here is a taste choice, labelled.
// Randomness only from seeded streams (src/science/random.ts), never Math.random (rule 6).

import type { ChapterView } from '../game/graph';
import type { Rng } from '../science/random';

export const dbToLin = (db: number): number => 10 ** (db / 20);

/**
 * Level targets, dBFS, before the master volume. The record's own audio is far louder than any of these.
 * "peak" is the highest sample of the cue alone; the ambience targets are per bed. Taste choices.
 */
export const LEVEL_DBFS = {
  pluck: -24,
  cadence: -27,
  tick: -50,
  breath: -30,
  swell: -22,
  /** The ages snapping together (The Trail's reframe): the scattered tones drawing into one chord. */
  snap: -22,
  /** The Sun found (trail.origin): the warm low tone held under the pluck. */
  warm: -26,
  /** The clocks agree (portrait.together): the chapters' keys swelling, then resolving onto one chord. */
  agree: -23,
  bed: -34,
  /** Portrait's bed, a slow chord of the chapters' keys: softer than the other beds (the plate is quiet). */
  portraitBed: -37,
} as const;

/** The warm tone's level in the neighbour twist, relative to its level for the Sun found, dB ("softer"). */
export const TWIST_WARM_DB = -6;

/** How far the ambience drops while the record plays, dB. */
export const DUCK_DB = -12;
/** How far the ambience drops for the hush after the first sound, dB. */
export const HUSH_DB = -26;
/** Seconds the hush holds before the instruments return. */
export const HUSH_HOLD_S = 5;

export type Bed = 'cold' | 'ring' | 'warm' | 'shimmer' | 'sky' | 'room' | 'drift' | 'hub' | 'portrait';

export interface ChapterVoice {
  /** The chapter's drone root, Hz. */
  rootHz: number;
  /** The pitch of the pluck that confirms one of its deductions, Hz. */
  pluckHz: number;
  bed: Bed;
}

/**
 * Each chapter has its own key. The seven built chapters have their own beds; the rest share the hub's.
 * The Map moved off The Pictures' D to C sharp (M4 step 7) so no two built chapters share a key.
 */
export const CHAPTER_VOICE: Record<ChapterView, ChapterVoice> = {
  hub: { rootHz: 55.0, pluckHz: 220.0, bed: 'hub' },
  arrival: { rootHz: 55.0, pluckHz: 220.0, bed: 'cold' },
  key: { rootHz: 65.41, pluckHz: 261.63, bed: 'ring' },
  map: { rootHz: 69.3, pluckHz: 277.18, bed: 'sky' },
  spot: { rootHz: 82.41, pluckHz: 329.63, bed: 'room' },
  trail: { rootHz: 87.31, pluckHz: 349.23, bed: 'drift' },
  player: { rootHz: 49.0, pluckHz: 196.0, bed: 'warm' },
  pictures: { rootHz: 73.42, pluckHz: 293.66, bed: 'shimmer' },
  voices: { rootHz: 98.0, pluckHz: 392.0, bed: 'hub' },
  portrait: { rootHz: 61.74, pluckHz: 246.94, bed: 'portrait' },
  epilogue: { rootHz: 55.0, pluckHz: 220.0, bed: 'hub' },
};

/** The chapters Portrait's plate draws on: its bed and its cue are built from their roots (taste, M6 portrait spec). */
export const PORTRAIT_CHORD_FROM: readonly ChapterView[] = ['arrival', 'key', 'player', 'pictures', 'map', 'spot', 'trail', 'voices'];

/**
 * Those chapters' roots folded into one octave, [lowHz, 2 lowHz), sorted and without repeats (two chapters an
 * octave apart share a note): the notes of Portrait's chord.
 */
export function portraitChord(lowHz = 110): number[] {
  const out: number[] = [];
  for (const c of PORTRAIT_CHORD_FROM) {
    let f = CHAPTER_VOICE[c].rootHz;
    while (f < lowHz) f *= 2;
    while (f >= 2 * lowHz) f /= 2;
    if (!out.some((x) => Math.abs(1200 * Math.log2(x / f)) < 20)) out.push(f);
  }
  return out.sort((a, b) => a - b);
}

export function voiceFor(view: ChapterView): ChapterVoice {
  return CHAPTER_VOICE[view] ?? CHAPTER_VOICE.hub;
}

/** A buffer of seeded white noise (standard normal, scaled), or brown noise (integrated, leaky, normalized). */
export function noiseBuffer(ctx: BaseAudioContext, rng: Rng, seconds: number, kind: 'white' | 'brown' = 'white'): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.round(seconds * sr));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < n; i++) d[i] = rng.normal() * 0.3;
    return buf;
  }
  let y = 0;
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    y = 0.995 * y + rng.normal() * 0.05;
    d[i] = y;
    peak = Math.max(peak, Math.abs(y));
  }
  for (let i = 0; i < n; i++) d[i] = (d[i] ?? 0) / peak;
  return buf;
}

/** A sine at hz through its own gain, started at `when`; returns the gain so the caller can shape it. */
export function tone(ctx: BaseAudioContext, dest: AudioNode, hz: number, when: number, type: OscillatorType = 'sine'): { osc: OscillatorNode; gain: GainNode } {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = hz;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(dest);
  osc.start(when);
  return { osc, gain };
}
