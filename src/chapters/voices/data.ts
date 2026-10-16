// The Voices' reference numbers (data/voices.json, built by tools/voices/analyse.py from the lossless Ozma
// transfers) and the measurements the checkers and the instrument compute on them with the pure DSP
// (src/dsp/segment.ts, pitch.ts). Every accepted range here is derived in the reference and stated in
// docs/HOW_ITS_CHECKED.md row 16. Pure: no DOM.

import recordJson from '../../../data/record.json';
import voicesJson from '../../../data/voices.json';
import { binCentres, CHROMA_BIN, combScores, COMB_K, HIST_BIN, noteHistogram, peakNear, repetitionCurve } from '../../dsp/pitch';
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

/** The octave's tolerance, cents: the bootstrap's 95% half-width and the tracker's 95% error in quadrature. */
export const OCTAVE_TOL_CENTS = Math.hypot(V.music.violin.bootstrap.octaveHalfWidthCents, V.music.violin.trackerError95Cents);
/** The step's tolerance, cents: half the distance from a twelfth of the octave to a thirteenth (the nearest other comb). */
export const STEP_TOL_CENTS = (1200 / 12 - 1200 / 13) / 2;

/** The violin's notes, cents re 440 Hz. */
export const VIOLIN_NOTES = V.music.violin.notes.map((n) => n[2]! / 100);
/** Its repetition curve, lags 0 to 2400 cents in HIST_BIN steps. */
export const VIOLIN_CURVE = repetitionCurve(noteHistogram(VIOLIN_NOTES), Math.round(2400 / HIST_BIN));

/** The repetition curve's peak nearest a clicked interval (within half a tempered step), cents; null if none. */
export function curvePeakNear(cents: number): number | null {
  const pk = peakNear(VIOLIN_CURVE, cents / HIST_BIN, Math.round(50 / HIST_BIN));
  return pk === null ? null : pk * HIST_BIN;
}

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
export const callTimes = WHALE.calls.map((c) => ({ startS: c[0]! * FRAME_S, endS: (c[0]! + c[1]!) * FRAME_S, hz: c[2]!, glide: c[3]! }));

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
