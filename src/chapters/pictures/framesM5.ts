// The Pictures, complete (M5 step 3): the album's frames and the shared pieces of the M5 picture checkers (the
// frame list, the decoded-picture provider, answer parsing) and the pictures.album checker. Split out of
// checkersM5.ts, which re-exports everything here. Pure: the decoded pictures come from a provider (the album's
// store in the browser, decodes of the WAV slices in Node tests).

import framesData from '../../../data/frames.json';
import teachingJson from '../../../data/teaching.json';
import { type Answer, type CheckResult } from '../../game/deductions';
import { type Gray } from '../../dsp/colour';
import { type TeachingData } from '../../science/teaching';
import { checkCircle, parseSettings, type SignalProvider } from './checkers';
import type { PictureSettings } from './measure';

export const TEACHING = teachingJson as unknown as TeachingData;

export const M5_PICTURE_IDS = [
  'pictures.album', 'pictures.colour', 'pictures.down', 'pictures.numerals', 'pictures.units', 'pictures.home', 'pictures.slip', 'pictures.height',
] as const;
export type M5PictureId = (typeof M5_PICTURE_IDS)[number];

export interface FrameRow {
  frame: string;
  channel: string;
  index: number;
  image: number;
  title: string;
  colourRole: string;
  tapeStartSample384k: number;
  orientationBarry: number;
}
/** The record's frame list (data/frames.json), as the tape stores it. */
export const FRAME_ROWS: readonly FrameRow[] = framesData.frames as unknown as FrameRow[];
const byId = new Map(FRAME_ROWS.map((f) => [f.frame, f]));

/** Every frame of the picture side (both channels), in the order the tape plays them. */
export const ALBUM_FRAMES: readonly string[] = [...FRAME_ROWS]
  .sort((a, b) => a.tapeStartSample384k - b.tapeStartSample384k || a.frame.localeCompare(b.frame))
  .map((f) => f.frame);

/** A channel's frames in order (L000 to L077, R000 to R077). */
export function channelFrames(ch: string): string[] {
  return FRAME_ROWS.filter((f) => f.channel === ch).sort((a, b) => a.index - b.index).map((f) => f.frame);
}

export function frameRow(frame: string): FrameRow {
  const f = byId.get(frame);
  if (!f) throw new Error(`unknown frame ${frame}`);
  return f;
}

/** A decoded picture as the album keeps it: the 8-bit grey, its level stretch and the settings that made it. */
export interface DecodedPicture extends Gray {
  frame: string;
  gray: Uint8Array;
  levels: [number, number];
  settings: PictureSettings;
}
export type PictureProvider = (frame: string) => DecodedPicture | undefined;

export function sameSettings(a: PictureSettings, b: PictureSettings): boolean {
  // a free-running line time does not matter once the lines are locked to their own edges
  return a.syncLock === b.syncLock && a.interlace === b.interlace && a.polarity === b.polarity && a.rows === b.rows && (a.syncLock || Math.abs(a.lineTimeMs - b.lineTimeMs) < 1e-9);
}

/** The answer as an object, or a refusal to read it. */
export function obj(answer: Answer, what: string): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error(`Propose ${what} as an object.`);
  return answer;
}
/** A decoded picture, or a refusal: a checker whose pictures are not decoded yet throws, so the bus refuses the proposal. */
export function need(get: PictureProvider, frame: string): DecodedPicture {
  const p = get(frame);
  if (!p) throw new Error(`Frame ${frame} is not developed yet. Develop it in the album first.`);
  return p;
}

// ---- pictures.album ------------------------------------------------------------------------------------

export function checkAlbum(signals: SignalProvider, pictures: PictureProvider, answer: Answer): CheckResult {
  const a = obj(answer, 'the album');
  const s = parseSettings(a.settings ?? null);
  const listed = Array.isArray(a.developed) ? new Set(a.developed.filter((x): x is string => typeof x === 'string')) : new Set<string>();
  const circle = checkCircle(signals, s as unknown as Answer);
  const developed = ALBUM_FRAMES.filter((f) => {
    const p = pictures(f);
    return listed.has(f) && p !== undefined && sameSettings(p.settings, s);
  });
  const ok = circle.ok && developed.length === ALBUM_FRAMES.length;
  const missing = ALBUM_FRAMES.length - developed.length;
  return {
    ok,
    result: [
      { key: 'frames developed', value: developed.length },
      { key: 'frames on the side', value: ALBUM_FRAMES.length },
      { key: 'settings', value: circle.ok ? 'the circle comes out round' : 'the circle does not come out round' },
    ],
    message: ok
      ? `Every frame of the side is developed with the settings that made the circle round: ${developed.length} pictures, ${channelFrames('L').length} on each of the tape's two tracks.`
      : !circle.ok
        ? `These settings do not make the calibration circle round, so they cannot read the rest of the side: ${circle.message}`
        : `Not yet: ${developed.length} of the side's ${ALBUM_FRAMES.length} frames are developed with these settings; ${missing} still to come off the tape.`,
  };
}
