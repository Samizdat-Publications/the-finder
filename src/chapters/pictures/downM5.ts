// The Pictures, complete: pictures.down, turning the pictures the record stores on their sides (Barry's table).
// Split out of checkersM5.ts, which re-exports it. Pure.

import { type Answer, type CheckResult, type Reading } from '../../game/deductions';
import { FRAME_ROWS, frameRow, obj } from './framesM5';

// ---- pictures.down -------------------------------------------------------------------------------------

/** Barry's code to clockwise quarter turns: 1 is the native frame turned 90 degrees clockwise, 2 anticlockwise. */
export const BARRY_TO_CW: Record<number, number> = { 0: 0, 1: 1, 2: 3 };
const TURN_WORDS = ['no turn', 'a quarter turn clockwise', 'a half turn', 'a quarter turn anticlockwise'];

/** Frames the record stores turned on their sides (Barry's table, data/frames.json orientationBarry). */
export const TURNED_FRAMES: readonly string[] = FRAME_ROWS.filter((f) => f.orientationBarry !== 0).map((f) => f.frame);

/**
 * Images whose subject is people, by the record's own titles (data/frames.json, the Ozma book list): a person or
 * people named as the subject (a figure diagram included). Only these messages speak of people; every other
 * picture is said to stand or lie (M5 science audit, wording: Jupiter, L012, has no people in it).
 */
export const PEOPLE_IMAGES: ReadonlySet<number> = new Set([32, 34, 35, 36, 37, 38, 60, 61, 62, 63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 74, 76, 81, 82, 89, 96, 100, 115]);

export function checkDown(answer: Answer): CheckResult {
  const a = obj(answer, 'a turned picture');
  const frame = a.frame;
  const t = a.quarterTurns;
  if (typeof frame !== 'string') throw new Error('frame must be a frame id.');
  if (typeof t !== 'number' || !Number.isInteger(t)) throw new Error('quarterTurns must be a whole number of quarter turns.');
  const row = frameRow(frame);
  const people = PEOPLE_IMAGES.has(row.image);
  const turns = ((t % 4) + 4) % 4;
  const right = BARRY_TO_CW[row.orientationBarry] as number;
  const off = (turns - right + 4) % 4;
  const ok = row.orientationBarry !== 0 && off === 0;
  const result: Reading[] = [
    { key: 'turn', value: TURN_WORDS[turns] as string },
    { key: 'turned frames on the side', value: TURNED_FRAMES.length },
  ];
  const tw = TURN_WORDS[turns] as string;
  let message: string;
  if (ok) message = `Turned ${tw}, the picture stands upright${people ? ': people stand, heads up' : ''}. The same table turns every one of the ${TURNED_FRAMES.length} pictures the record stores on their sides.`;
  else if (row.orientationBarry === 0)
    message = turns === 0
      ? 'This picture already came the right way up. Find one that came off the tape on its side, and turn it.'
      : `This picture came the right way up; turned ${tw}, ${people ? 'people would stand on the wall or on their heads' : 'it would lie on its side or stand on its head'}.`;
  else if (off === 2) message = `Turned ${tw}, ${people ? 'people would stand on their heads' : 'the picture would stand on its head'}.`;
  else message = `Turned ${tw}, ${people ? 'people would lie on their sides, and the ground would stand up beside them' : 'the picture would lie on its side'}.`;
  return { ok, result, message };
}
