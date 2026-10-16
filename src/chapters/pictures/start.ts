// Where the decoder starts when the player first enters The Pictures: free-running, with neutral values
// that are clearly wrong (spec): sync lock off, no interlace offset, the "straight" reading (more signal
// lighter), as many rows as lines (a square raster), and a round line time of the player's own, 0.0090
// beats (7.84 ms, 6% short of the tape's lines). A returning player gets back the settings each confirmed
// deduction accepted. Pure.

import type { Answer, Attempt } from '../../game/deductions';
import { BEAT_S } from '../../ui/units';
import type { PictureSettings } from './measure';

/** Beats: the player's own starting line time (D-A22 units), a round number on the knob. */
export const START_LINE_BEATS = 0.009;

export const START_SETTINGS: PictureSettings = {
  lineTimeMs: START_LINE_BEATS * BEAT_S * 1000,
  syncLock: false,
  interlace: false,
  polarity: 'positive',
  rows: 512,
};

type Records = Readonly<Record<string, { confirmed: boolean; attempts: Attempt[] } | undefined>>;

function acceptedAnswer(records: Records, id: string): Record<string, Answer> | null {
  const r = records[id];
  if (!r?.confirmed) return null;
  const a = [...r.attempts].reverse().find((x) => x.ok)?.answer;
  return a && typeof a === 'object' && !Array.isArray(a) ? a : null;
}

/** The settings to resume with: the start values, overridden by what each confirmed deduction accepted. */
export function resumeSettings(records: Records): PictureSettings {
  const s = { ...START_SETTINGS };
  const lt = acceptedAnswer(records, 'pictures.lineTime');
  if (lt && typeof lt.lineTimeMs === 'number') s.lineTimeMs = lt.lineTimeMs;
  if (records['pictures.sync']?.confirmed) s.syncLock = true;
  if (records['pictures.interlace']?.confirmed) s.interlace = true;
  if (records['pictures.polarity']?.confirmed) s.polarity = 'negative';
  const asp = acceptedAnswer(records, 'pictures.aspect');
  if (asp && typeof asp.rows === 'number') s.rows = asp.rows;
  return s;
}
