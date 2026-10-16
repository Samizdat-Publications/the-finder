// The Player's model parameters. Every value carries its unit and source; the ones that are modelling
// choices (not documented for the Voyager record) say so. Pure: no DOM.

import { BEAT_S } from '../../ui/units';

/** The side the alien plays: side 1 faces the craft and begins with the pictures (D-A17, docs/DECISIONS.md). */
export const PLAYER_SIDE = 1;

/**
 * The speed control's step, beats per turn (0.005 beat = 4.355 ms, 0.121% of the cover's 3.59994 s turn).
 * Interface resolution, a design choice. The speed checker accepts any setting within one step of the cover's
 * period, so the nearest step to the cover's value (at most half a step off) always passes; the spec caps the
 * tolerance at 0.5% (docs/plans/M3_specs/step5-the-player.md).
 */
export const SPEED_STEP_BEATS = 0.005;
/** The same step in seconds per turn (BEAT_S from src/ui/units.ts, D-A22). */
export const SPEED_STEP_S = SPEED_STEP_BEATS * BEAT_S;

/** Speed control range, beats per turn (design choice: 2 to 8.5 beats = 1.74 to 7.40 s per turn). */
export const SPEED_RANGE_BEATS = { min: 2, max: 8.5 } as const;
/** Where the control starts before the player has set it (design choice, deliberately not the cover's value). */
export const SPEED_START_BEATS = 6;

/**
 * Nominal radius of a 12-inch disc, mm: IEC 60098 / RIAA give the diameter as 301.6 mm (11 7/8 in). Not
 * documented for the Voyager record (the same standard as R_OUTER_MUSIC_MM in src/record/groove.ts).
 */
export const DISC_RADIUS_MM = 150.8;
/**
 * Radius of the smooth label area, mm: a 100 mm label, the usual size on a 12-inch disc. Modelling choice:
 * the Voyager record's label size is not documented anywhere we found. Inside it there is no groove.
 */
export const LABEL_RADIUS_MM = 50;

/** Seconds of steady playing at the right settings before the first sound counts as heard, s (design choice). */
export const LISTEN_S = 3;
/** Seconds of picture lines heard before the first sound is confirmed, s (about 120 lines; design choice). */
export const LINES_HEARD_S = 1;
