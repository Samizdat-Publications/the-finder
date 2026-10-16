// The groove as geometry: needle radius <-> music time on a side.
// Pure module: no DOM, no randomness.
//
// Model: one constant-pitch spiral per side, played from the outside in, one turn every T seconds.
// T is the cover's etched rotation period (data/cover.json record.rotationPeriod, read through
// src/science/units.ts: 5,113,380,864 hydrogen periods = 3.59994 s, which NASA states as 3.6 s,
// 16 2/3 rpm; docs/research/cover.md section 1b). "Played from the outside in" is NASA's own wording
// for the cover (cover.md 1b).
//
// Radii of the music band: 12-inch disc recording standard (IEC 60098 / RIAA), outermost music groove
// diameter 292.1 mm and innermost 120.6 mm, so radii 146.05 mm and 60.3 mm. The Voyager record's
// actual groove radii are not documented anywhere we found, so these are the standard values, and the
// pitch follows from fitting each side's real duration between them:
//   pitch = (146.05 - 60.3) mm / (sideDuration / T) turns.
// Outside the band: a lead-in (a few turns of silent groove outside 146.05 mm that lead the needle
// in) and a run-out (inside 60.3 mm: a locked groove, one click every turn).

import { binaryToSeconds } from '../science/units';
import type { Timeline } from './timeline';

/** Outermost music groove radius, mm (IEC 60098 / RIAA 12-inch disc: diameter 292.1 mm). */
export const R_OUTER_MUSIC_MM = 146.05;
/** Innermost music groove radius, mm (IEC 60098 / RIAA 12-inch disc: diameter 120.6 mm). */
export const R_INNER_MUSIC_MM = 60.3;
/**
 * Lead-in, turns of silent groove before the music (modelling choice, not a documented Voyager value:
 * "a few turns", step 4 spec).
 */
export const LEAD_IN_TURNS = 3;
/** Lead-in pitch, mm per turn (modelling choice: a coarse lead-in spiral, wider than the music pitch). */
export const LEAD_IN_PITCH_MM = 1.0;
/** Outer edge of the lead-in, mm. Outside this the stylus sits on the smooth rim: silence, no motion. */
export const R_LEAD_IN_OUTER_MM = R_OUTER_MUSIC_MM + LEAD_IN_TURNS * LEAD_IN_PITCH_MM;

/**
 * The direction that plays the record: clockwise seen from above. The groove is cut so that a disc
 * turning clockwise (seen from the playing face) carries the stylus inward along the spiral, the
 * standard for every phonograph record; the player deduces it from the spiral under the microscope
 * (PLAN.md chapter 5: no arrow on the cover says which way it turns, cover.md 1b).
 */
export const PLAYING_DIRECTION = 'cw' as const;
export type Direction = 'cw' | 'ccw';

export type Region = 'rim' | 'leadin' | 'music' | 'runout';

/** Rotation period from the cover's etched binary, s (cover.md 1b: 3.59994 s). */
export function rotationPeriodFromCover(cover: { record: { rotationPeriod: { binary: string } } }): number {
  return binaryToSeconds(cover.record.rotationPeriod.binary);
}

export class Groove {
  /** Seconds per turn at the true speed. */
  readonly periodS: number;
  /** The true speed, turns per second (1 / T). */
  readonly trueSpeed: number;

  constructor(
    readonly timeline: Timeline,
    periodS: number,
  ) {
    if (!(periodS > 0)) throw new Error('groove: rotation period must be positive');
    this.periodS = periodS;
    this.trueSpeed = 1 / periodS;
  }

  /** Turns of music groove on the side: sideDuration / T. */
  turns(side: number): number {
    return this.timeline.sideDuration(side) / this.periodS;
  }

  /** Radial advance per turn in the music band, mm. */
  pitchMm(side: number): number {
    return (R_OUTER_MUSIC_MM - R_INNER_MUSIC_MM) / this.turns(side);
  }

  /** Lead-in duration at the true speed, s (negative side time down to -leadInS). */
  get leadInS(): number {
    return LEAD_IN_TURNS * this.periodS;
  }

  regionAtRadius(r: number): Region {
    if (!(r > 0)) throw new Error(`groove: radius must be positive, got ${r}`);
    if (r > R_LEAD_IN_OUTER_MM) return 'rim';
    if (r > R_OUTER_MUSIC_MM) return 'leadin';
    if (r >= R_INNER_MUSIC_MM) return 'music';
    return 'runout';
  }

  /**
   * Side time at radius r, s. Music band: 0 at 146.05 mm to sideDuration at 60.3 mm. Lead-in: negative
   * (seconds before the music). Rim: -leadInS (the needle cannot go further out). Run-out: the side's
   * end (the locked groove does not advance the music).
   */
  timeAtRadius(side: number, r: number): number {
    const region = this.regionAtRadius(r);
    if (region === 'rim') return -this.leadInS;
    if (region === 'runout') return this.timeline.sideDuration(side);
    if (region === 'leadin') return (-(r - R_OUTER_MUSIC_MM) / LEAD_IN_PITCH_MM) * this.periodS;
    return ((R_OUTER_MUSIC_MM - r) / this.pitchMm(side)) * this.periodS;
  }

  /** Radius at side time t, mm (inverse of timeAtRadius over the lead-in and music band). */
  radiusAtTime(side: number, t: number): number {
    const d = this.timeline.sideDuration(side);
    if (t < -this.leadInS) return R_LEAD_IN_OUTER_MM;
    if (t < 0) return R_OUTER_MUSIC_MM + (-t / this.periodS) * LEAD_IN_PITCH_MM;
    if (t > d) return R_INNER_MUSIC_MM;
    return R_OUTER_MUSIC_MM - (t / this.periodS) * this.pitchMm(side);
  }
}
