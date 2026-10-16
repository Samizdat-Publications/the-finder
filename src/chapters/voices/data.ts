// The Voices' reference numbers (data/voices.json, built by tools/voices/analyse.py from the lossless Ozma
// transfers) and the measurements the checkers and the instrument compute on them with the pure DSP
// (src/dsp/segment.ts, pitch.ts). Every accepted range here is derived in the reference and stated in
// docs/HOW_ITS_CHECKED.md row 16. Pure: no DOM.

import recordJson from '../../../data/record.json';
import voicesJson from '../../../data/voices.json';
import { FoldNotes } from '../../dsp/fold';
import { binCentres, CHROMA_BIN, combScores, COMB_K } from '../../dsp/pitch';
import { FRAME_S, segmentPitches, segments, voicesByPitch } from '../../dsp/segment';

export const V = voicesJson;

/** The greetings' stored frame levels (dBFS) and pitch track (Hz, 0 unvoiced). */
export const GREET_LEVELS = Float64Array.from(V.greetings.levelsDb10, (v) => v / 10);
export const GREET_F0 = Float64Array.from(V.greetings.f0Hz100, (v) => v / 100);
/** One speaker's pitch spread, semitones (Waldheim, Ozma 01, at the centre of the reasonable settings). */
export const SD_ONE = V.greetings.oneSpeaker.sdSemitones;
/** The two-sided 95% normal point: one speaker's 95% pitch range is 2 x 1.96 sd. */
export const ONE_VOICE_SEMITONES = 2 * 1.959963984540054 * SD_ONE;

export interface GreetingsReading {
  count: number;
  pitches: number[];
  voices: number;
}

/** The greetings cut at a threshold (dBFS) and minimum gap (s): segment count, segment pitches, voices by pitch. */
export function greetingsAt(thresholdDb: number, gapS: number): GreetingsReading {
  const count = segments(GREET_LEVELS, thresholdDb, gapS).length;
  const pitches = segmentPitches(GREET_LEVELS, GREET_F0, thresholdDb, gapS);
  return { count, pitches, voices: voicesByPitch(pitches, SD_ONE) };
}

/** The segmenter's controls: thresholds in 0.5 dB steps, gaps in whole frames (the reference's grid). */
export const THRESHOLD_RANGE = { min: -60, max: -10, step: 0.5 } as const;
export const GAP_RANGE = { min: 0.02, max: 1.5, step: FRAME_S } as const;

/** The reasonable settings, the one definition (tools/voices/analyse.py REASONABLE_GAPS): a threshold on the
 * slider's grid between where a frame is the noise between voices with probability 0.95 and 0.05, and a pause from
 * 0.15 to 0.40 s. The accepted count range is taken over exactly this grid. */
export const REASONABLE = {
  thresholdDb: V.greetings.reasonable.thresholdGridDb as [number, number],
  gapS: V.greetings.reasonable.gapS as [number, number],
} as const;
/** Slider values carry float rounding (0.02 + k x 0.01): compare within a millionth. */
const EPS = 1e-6;
export const isReasonable = (thresholdDb: number, gapS: number): boolean =>
  thresholdDb >= REASONABLE.thresholdDb[0] - EPS && thresholdDb <= REASONABLE.thresholdDb[1] + EPS && gapS >= REASONABLE.gapS[0] - EPS && gapS <= REASONABLE.gapS[1] + EPS;

/** The octave: the best fold of the violin's notes (tools/voices/vfold.py), cents, and its tolerance: the bootstrap's
 * 95% half-width and the tracker's systematic slope (its 95% bound) in quadrature. */
export const OCTAVE_CENTS = V.music.violin.octaveCents;
export const OCTAVE_TOL_CENTS = V.music.violin.octaveTolCents;
/** The fold comparison: every other peak of the score, with the bootstrapped margin by which the best beats it. */
export const FOLD = V.music.violin.fold;
/** The step's tolerance, cents: half the distance from a twelfth of the octave to a thirteenth (the nearest other comb). */
export const STEP_TOL_CENTS = (1200 / 12 - 1200 / 13) / 2;

/** The violin's notes, cents re 440 Hz. */
export const VIOLIN_NOTES = V.music.violin.notes.map((n) => n[2]! / 100);
/** The violin's notes with their pair tables, built on first use (about 84,000 pairs). */
let violinFold: FoldNotes | null = null;
export const violinNotes = (): FoldNotes => (violinFold ??= new FoldNotes(VIOLIN_NOTES));

/** The piano's spectral-peak histogram (weights) and its bin centres, cents. */
export const PIANO_HIST = Float64Array.from(V.music.piano.hist);
export const PIANO_CENTRES = binCentres(PIANO_HIST.length, CHROMA_BIN);

/** The comb scores for every k, for the octave the player read (cached per octave). */
const combCache = new Map<number, number[]>();
export function combFor(octaveCents: number): number[] {
  const key = Math.round(octaveCents * 1000) / 1000;
  let s = combCache.get(key);
  if (!s) {
    s = combScores(PIANO_CENTRES, PIANO_HIST, key);
    combCache.set(key, s);
  }
  return s;
}
export const combScore = (octaveCents: number, k: number): number => combFor(octaveCents)[k - COMB_K[0]] ?? Number.NaN;

/** The hearing measurement: band edges, the greetings' and the noise's band levels, the crossing and its band. */
export const SPEC = V.spectrum;

/** The greetings' signal-to-noise ratio (dB) in the band holding f, or null outside the bands. */
export function snrAt(hz: number): number | null {
  const e = SPEC.bandEdgesHz;
  for (let i = 0; i + 1 < e.length; i++) if (hz >= e[i]! && hz < e[i + 1]!) return SPEC.greetingsDb[i]! - SPEC.noiseDb[i]!;
  return null;
}

/** The whale: the calls found on Ozma 03 and the stretch they span, s. */
export const WHALE = V.whale;
export const WHALE_TRACK = V.whale.track;

/** voices.others, measured on every track (tools/voices/others.py): held calls and speech, and for music the held
 * tones. What a marked stretch holds: calls wholly inside it, speech runs touching it, held tones inside it. */
export const OTHERS = V.others;
export interface Held {
  startS: number;
  endS: number;
  hz: number;
  glide: number;
}
export interface StretchMeasure {
  kind: string;
  calls: Held[];
  speech: [number, number][];
  heldTones: number;
}
type OthersTrack = { kind: string; calls?: number[][]; speech?: number[][]; held?: number[][] };
export function measureStretch(track: string, start: number, end: number): StretchMeasure | null {
  const t = (OTHERS.tracks as Record<string, OthersTrack>)[track];
  if (!t) return null;
  const sec = (a: number, n: number): [number, number] => [a * FRAME_S, (a + n) * FRAME_S];
  const calls = (t.calls ?? [])
    .map((c) => ({ startS: c[0]! * FRAME_S, endS: (c[0]! + c[1]!) * FRAME_S, hz: c[2]!, glide: c[3]! }))
    .filter((c) => c.startS >= start && c.endS <= end);
  const speech = (t.speech ?? []).map((r) => sec(r[0]!, r[1]!)).filter(([a, b]) => b > start && a < end);
  const heldTones = (t.held ?? []).map((r) => sec(r[0]!, r[1]!)).filter(([a, b]) => a >= start && b <= end).length;
  return { kind: t.kind, calls, speech, heldTones };
}

/** The record's items after the pictures, in order, side by side (D-A17's break is an inference). */
export interface TrackRef {
  id: string;
  side: number;
  kind: string;
  title: string;
  musicNumber: number | null;
  durationS: number;
}
export const TRACKS: TrackRef[] = recordJson.sides.flatMap((s) =>
  s.items.filter((i) => i.kind !== 'pictures').map((i) => ({ id: i.id, side: s.side, kind: i.kind, title: i.title, musicNumber: i.musicNumber, durationS: i.durationS })),
);
export const trackById = (id: string): TrackRef | undefined => TRACKS.find((t) => t.id === id);

/** The four pieces the deductions are made on, and the speaker for comparison. */
export const PIECES = {
  greetings: V.greetings.track,
  oneSpeaker: V.greetings.oneSpeaker.track,
  violin: V.music.violin.track,
  piano: V.music.piano.track,
  whale: V.whale.track,
} as const;
