// The Player's physics, pure (no DOM, no audio): the speed ratio and its pitch shift, where on the disc a
// needle lands, what the groove does under the microscope, and what the stylus hears at a turntable state.
// Everything is computed from the cover (data/cover.json through rotationPeriodFromCover), the record model
// (src/record/: timeline and groove) and the decoder's measurements of the tape (data/decoder.json,
// data/frames.json). Nothing here is typed in as an answer (rule 1).

import framesJson from '../../../data/frames.json';
import { BASE_RATE, DECODER_DATA } from '../../dsp/params';
import { COVER_PERIOD_S, groove, timeline } from '../../game/model';
import { PLAYING_DIRECTION, R_INNER_MUSIC_MM, type Direction, type Groove, type Region } from '../../record/groove';
import { DISC_RADIUS_MM, LABEL_RADIUS_MM, PLAYER_SIDE } from './constants';

/** The cover's turn time, s (3.59994: cover.md 1b, through rotationPeriodFromCover). */
export const TRUE_PERIOD_S = COVER_PERIOD_S;

/** Speed ratio k: how many times faster than the cover's speed a platter turning once every `secondsPerTurn` goes. */
export function speedRatio(secondsPerTurn: number): number {
  if (!(secondsPerTurn > 0)) throw new Error('player: seconds per turn must be positive');
  return TRUE_PERIOD_S / secondsPerTurn;
}

/** A pitch ratio in semitones (twelfths of a doubling): 12 log2 k. */
export function semitones(k: number): number {
  return 12 * Math.log2(k);
}

/** Where a needle lands, by radius: the groove model's regions, plus the label inside and off the disc outside. */
export type Spot = 'off' | 'label' | Region;

export function spotAt(radiusMm: number): Spot {
  if (!(radiusMm >= 0) || !Number.isFinite(radiusMm)) throw new Error(`player: radius must be a number of mm, got ${radiusMm}`);
  if (radiusMm > DISC_RADIUS_MM) return 'off';
  if (radiusMm < LABEL_RADIUS_MM) return 'label';
  return groove.regionAtRadius(Math.max(radiusMm, 1e-9));
}

// ---- the first picture line on the disc (side 1 opens with the image tape, D-A17) ----

const frameMeta = framesJson.meta;
const firstFrame = framesJson.frames.find((f) => f.frame === 'L000');
if (!firstFrame) throw new Error('player: data/frames.json has no frame L000');
const picturesEntry = timeline.entryById('pictures');

/**
 * Side time of the first picture line (frame L000's first falling edge), s: the slice's start on the tape
 * (tapeStartSample384k at 384 kHz) plus the first line's offset in the slice (at 96 kHz). The tape and the
 * record item `pictures` share one clock (data/record.json: the tape at its header rate). About 15.63 s
 * (images-and-audio.md section 1: "First frame at 15.63 s (left)").
 */
export const FIRST_LINE_S: number =
  picturesEntry.startS + firstFrame.tapeStartSample384k / frameMeta.tapeSampleRate384k + firstFrame.firstLineOffset / frameMeta.sampleRate;

/**
 * The line period of that first picture, s: frame L000's fitted period on the tape (data/decoder.json,
 * measured by the reference decoder), about 8.327 ms (images-and-audio.md section 1: 3197.4 samples at 384 kHz).
 */
export const FIRST_PICTURE_LINE_S: number = (DECODER_DATA.frames.L000?.periodSamples384k ?? NaN) / BASE_RATE;

// ---- the groove under the microscope ----

/**
 * How far one turn carries the groove under a fixed point, mm (negative = inward), from the groove model:
 * the radius one turn later along the side's time, with time running forward when the disc turns the
 * playing way and backward the other way (src/record/engine.ts: the wrong way drags the stylus back out).
 */
export function grooveDrift(g: Groove, side: number, direction: Direction, atTimeS?: number): number {
  const t0 = atTimeS ?? g.timeline.sideDuration(side) / 2;
  const dt = (direction === PLAYING_DIRECTION ? 1 : -1) * g.periodS;
  return g.radiusAtTime(side, t0 + dt) - g.radiusAtTime(side, t0);
}

/**
 * The microscope's picture: radial positions (mm, outward positive, relative to the window's centre) of the
 * grooves crossing a fixed window after the disc has turned `turns` (signed, playing way positive) from rest.
 * One turn shifts every groove by `driftPerTurnMm` (grooveDrift for the playing way), so the pattern streams
 * inward when the disc turns the playing way and outward the other way.
 */
export function microscopeGrooves(turns: number, driftPerTurnMm: number, halfWindowMm: number): number[] {
  const pitch = Math.abs(driftPerTurnMm);
  if (!(pitch > 0)) throw new Error('player: the groove pitch must be positive');
  const shift = turns * driftPerTurnMm;
  const phase = shift - Math.floor(shift / pitch) * pitch; // in [0, pitch)
  const out: number[] = [];
  const n0 = Math.ceil((-halfWindowMm - phase) / pitch);
  for (let n = n0; phase + n * pitch <= halfWindowMm; n++) out.push(phase + n * pitch);
  return out;
}

// ---- what the stylus hears ----

/** The turntable as the instrument reads it (the bus's state plus how long the needle has played undisturbed). */
export interface TurntableReading {
  side: number | null;
  secondsPerTurn: number;
  direction: Direction;
  down: boolean;
  /** The engine's region under the needle (null when the needle is up). */
  region: Region | null;
  /** Side time under the needle, s (null when the needle is up). */
  timeS: number | null;
  /** Seconds since the needle was dropped or the platter last changed. */
  listenedS: number;
}

export type HeardKind = 'nothing' | 'silentGroove' | 'clicks' | 'opening' | 'lines' | 'content';

export interface Heard {
  kind: HeardKind;
  /** The side plays backward (the platter turns against the groove). */
  backward: boolean;
  k: number;
  /** For lines: the line period heard, s (period / k). For clicks: one click per turn, s. Otherwise null. */
  periodS: number | null;
  /** The record item under the needle, if any. */
  itemId: string | null;
}

/** What the stylus picks up at this turntable state. */
export function hear(r: TurntableReading): Heard {
  const k = speedRatio(r.secondsPerTurn);
  const backward = r.direction !== PLAYING_DIRECTION;
  const base = { backward, k, periodS: null, itemId: null };
  if (!r.down || r.region === null || r.region === 'rim' || r.side === null || r.timeS === null) return { kind: 'nothing', ...base };
  if (r.region === 'leadin') return { kind: 'silentGroove', ...base };
  if (r.region === 'runout') return { kind: 'clicks', ...base, periodS: r.secondsPerTurn };
  const hit = timeline.itemAt(r.side, r.timeS);
  if (!hit) return { kind: 'nothing', ...base };
  const itemId = hit.entry.item.id;
  if (itemId === picturesEntry.item.id) {
    if (r.timeS >= FIRST_LINE_S) return { kind: 'lines', ...base, periodS: FIRST_PICTURE_LINE_S / k, itemId };
    return { kind: 'opening', ...base, itemId };
  }
  return { kind: 'content', ...base, itemId };
}

/** Radius of the needle at the start of the side's music, mm (R_OUTER_MUSIC_MM) and the run-out's edge. */
export function musicBand(): { outerMm: number; innerMm: number } {
  return { outerMm: groove.radiusAtTime(PLAYER_SIDE, 0), innerMm: R_INNER_MUSIC_MM };
}
