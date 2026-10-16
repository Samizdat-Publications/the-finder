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
  bed: -34,
} as const;

/** How far the ambience drops while the record plays, dB. */
export const DUCK_DB = -12;
/** How far the ambience drops for the hush after the first sound, dB. */
export const HUSH_DB = -26;
/** Seconds the hush holds before the instruments return. */
export const HUSH_HOLD_S = 5;

export type Bed = 'cold' | 'ring' | 'warm' | 'shimmer' | 'hub';

export interface ChapterVoice {
  /** The chapter's drone root, Hz. */
  rootHz: number;
  /** The pitch of the pluck that confirms one of its deductions, Hz. */
  pluckHz: number;
  bed: Bed;
}

/** Each chapter has its own key. The four built chapters have their own beds; the rest share the hub's. */
export const CHAPTER_VOICE: Record<ChapterView, ChapterVoice> = {
  hub: { rootHz: 55.0, pluckHz: 220.0, bed: 'hub' },
  arrival: { rootHz: 55.0, pluckHz: 220.0, bed: 'cold' },
  key: { rootHz: 65.41, pluckHz: 261.63, bed: 'ring' },
  map: { rootHz: 73.42, pluckHz: 293.66, bed: 'hub' },
  spot: { rootHz: 82.41, pluckHz: 329.63, bed: 'hub' },
  trail: { rootHz: 87.31, pluckHz: 349.23, bed: 'hub' },
  player: { rootHz: 49.0, pluckHz: 196.0, bed: 'warm' },
  pictures: { rootHz: 73.42, pluckHz: 293.66, bed: 'shimmer' },
  voices: { rootHz: 98.0, pluckHz: 392.0, bed: 'hub' },
  portrait: { rootHz: 61.74, pluckHz: 246.94, bed: 'hub' },
  epilogue: { rootHz: 55.0, pluckHz: 220.0, bed: 'hub' },
};

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
