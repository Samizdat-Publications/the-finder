// The Pictures, complete: pictures.colour, three consecutive frames as one colour picture, decided by the
// measured edge likeness (M5 science audit finding 5). Split out of checkersM5.ts, which re-exports it. Pure.

import { type Answer, type CheckResult, type Reading } from '../../game/deductions';
import { register } from '../../dsp/colour';
import { DECODER_DATA } from '../../dsp/params';
import { q } from '../../ui/message';
import { channelFrames, frameRow, need, obj, type DecodedPicture, type PictureProvider } from './framesM5';

// ---- pictures.colour -----------------------------------------------------------------------------------

/** Line time of a frame on the tape, s (data/decoder.json, the fitted period at 384 kHz). */
const lineSeconds = (frame: string): number => (DECODER_DATA.frames[frame]?.periodSamples384k ?? DECODER_DATA.reference.linePeriodMedian384k) / 384_000;

/** Mean brightness of a decoded picture before its level stretch (more is lighter), in the decoder's tape units. */
export function meanBrightness(p: DecodedPicture): number {
  let s = 0;
  for (let i = 0; i < p.gray.length; i++) s += p.gray[i] as number;
  const [lo, hi] = p.levels;
  return lo + ((hi - lo) * s) / p.gray.length / 255;
}

export interface Stack {
  frames: [string, string, string];
  /** Registration peaks (edge likeness, -1 to 1) of the first with the second and the second with the third. */
  inner: [number, number];
  /** The same with the frame before the three and the frame after them (none: the channel's end). */
  outer: number[];
  triple: boolean;
}

/** Three consecutive frames of one channel, and how alike they are against their neighbours. */
export function stackOf(get: PictureProvider, frames: readonly string[]): Stack {
  if (frames.length !== 3) throw new Error('Pick three frames.');
  const rows = frames.map(frameRow);
  const ch = channelFrames(rows[0]!.channel);
  const i = ch.indexOf(frames[0] as string);
  if (rows.some((r, k) => r.channel !== rows[0]!.channel || ch[i + k] !== r.frame)) throw new Error('Pick three frames that follow each other on one track.');
  const [a, b, c] = frames.map((f) => need(get, f)) as [DecodedPicture, DecodedPicture, DecodedPicture];
  const inner: [number, number] = [register(a, b).peak, register(b, c).peak];
  const outer: number[] = [];
  if (i > 0) outer.push(register(need(get, ch[i - 1] as string), a).peak);
  if (i + 3 < ch.length) outer.push(register(c, need(get, ch[i + 3] as string)).peak);
  const triple = rows[0]!.colourRole === 'R' && rows[1]!.colourRole === 'G' && rows[2]!.colourRole === 'B' && rows.every((r) => r.image === rows[0]!.image);
  return { frames: [frames[0], frames[1], frames[2]] as [string, string, string], inner, outer, triple };
}

/**
 * Edge likeness (the colour registration's correlation peak, src/dsp/colour.ts) that separates one scene's three
 * shades from three frames that are not one picture, measured on the browser's own 96 kHz decodes of every
 * consecutive three frames of both tracks (152 windows; pictures.m5.test.ts, M5 science audit finding 5):
 * - LIKENESS_APART_MAX: the most alike of the 132 windows that are not one picture, 0.236 (R068 to R070, whose
 *   last two frames are the astronaut's red and green);
 * - LIKENESS_ONE_MIN: the least alike of the 19 colour pictures whose frames show a scene, 0.588 (R073 to R075,
 *   the sunset with birds). The 20th, the solar spectrum (L007 to L009), reads 0.144: its frames are too faint and
 *   featureless to register (teaching-frames.md "Colour order": nearly featureless, as gourneau also found).
 * The threshold is the midpoint of that gap, the line farthest from both measured extremes (0.176 either side).
 * Not the point of equal error under a fitted model: with 19 scenes against 132 non-scenes, the shapes are not
 * Gaussian (the scenes bunch at 0.75 to 0.94 with one at 0.59) and a model's tails would be its assumption,
 * not the data's; the test reports that point for comparison.
 */
export const LIKENESS_APART_MAX = 0.236;
export const LIKENESS_ONE_MIN = 0.588;
export const LIKENESS_THRESHOLD = (LIKENESS_APART_MAX + LIKENESS_ONE_MIN) / 2;

/**
 * The colour order shown with every colour picture (D-A08): probable, not proven. Evidence, from
 * docs/research/teaching-frames.md "Colour order" and images-and-audio.md section 3: Barry and gourneau assemble
 * the three as red, green, blue; amazing-rando's README says blue, green, red (its code reads the first as red).
 */
const ORDER_NOTE = 'red, green, blue, as most readers of the tape assemble them (one reads blue, green, red); the record does not say';

export function checkColour(get: PictureProvider, answer: Answer): CheckResult {
  const a = obj(answer, 'the three frames');
  const f = a.frames;
  if (!Array.isArray(f) || !f.every((x) => typeof x === 'string')) throw new Error('frames must be a list of three frame ids.');
  const st = stackOf(get, f as string[]);
  const alike = Math.min(...st.inner);
  const around = st.outer.length ? Math.max(...st.outer) : 0;
  // the measurement decides; a triple of the record's own frame list the measurement cannot confirm (on the
  // record, only the solar spectrum) is accepted on the list's word, and the message says so
  const measured = alike >= LIKENESS_THRESHOLD;
  const listedOnly = !measured && st.triple;
  const ok = measured || listedOnly;
  const levels = st.frames.map((x) => meanBrightness(need(get, x)));
  const top = Math.max(...levels);
  const rel = levels.map((v) => Math.round((100 * v) / top));
  const tape = st.frames.reduce((s, x) => s + DECODER_DATA.geometry.columns * lineSeconds(x), 0);
  const T = LIKENESS_THRESHOLD.toFixed(2);
  const result: Reading[] = [
    { key: 'likeness of the three', value: Number(alike.toFixed(3)) },
    { key: 'likeness of one scene', value: `${T} or more` },
    { key: 'likeness to the neighbours', value: Number(around.toFixed(3)) },
    { key: 'mean brightness of the three', value: rel.join(' / ') },
  ];
  if (ok) {
    result.push({ key: 'probable order', value: 'red, green, blue' });
    result.push({ key: 'tape time of the three', value: tape, dim: 'time' });
  }
  const gap = `three frames that are not one picture reach at most ${LIKENESS_APART_MAX.toFixed(2)}, one scene's three shades at least ${LIKENESS_ONE_MIN.toFixed(2)}`;
  const order = `The order of the three is probable, not proven: ${ORDER_NOTE} (their mean brightness ${rel.join(', ')}). The three take ${q('time', tape, 3)} of tape.`;
  let message: string;
  if (measured) message = `One scene three times: the three line up edge for edge (likeness ${alike.toFixed(2)}; ${gap}, so the line is drawn midway, at ${T}). Stacked as three primaries they make one colour picture. ${order}`;
  else if (listedOnly) message = `The record's list of pictures stores these three as one picture's three shades, and stacked they make one colour picture; but their frames are too faint and featureless for the measurement to confirm it: their likeness is ${alike.toFixed(2)}, below the ${T} that marks one scene (${gap}). Accepted on the record's word, not on the measurement. ${order}`;
  else message = `Not a colour picture: the three are not one scene (likeness ${alike.toFixed(2)}, below the ${T} that marks one; ${gap}). Stacked, they come out as a misregistered smear.`;
  return { ok, result, message };
}
