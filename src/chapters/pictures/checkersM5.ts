// The Pictures, complete (M5 step 3): eight checkers over the album of decoded frames and the teaching pictures.
// Each reads what the decoder made of the real 1977 tape (rule 2) or computes with the senders' own numbers as
// our research reads them on that decode (data/teaching.json, src/science/teaching.ts). Pure: the decoded
// pictures come from a provider (the album's store in the browser, decodes of the WAV slices in Node tests).
// A checker whose pictures are not decoded yet throws, so the bus refuses the proposal instead of recording it.

import framesData from '../../../data/frames.json';
import teachingJson from '../../../data/teaching.json';
import { type Answer, type CheckResult, type Checker, type Reading } from '../../game/deductions';
import { register, type Gray } from '../../dsp/colour';
import { DECODER_DATA } from '../../dsp/params';
import {
  digitTable, heights, homeColumn, placeBase, placeOutward, planetColumns, ROWS, senderUnits, slips, writtenPrecision, type Row, type TeachingData,
} from '../../science/teaching';
import { BEAT_S, REACH_M, formatNumber } from '../../ui/units';
import { alienText, q } from '../../ui/message';
import { checkCircle, parseSettings, type SignalProvider } from './checkers';
import type { PictureSettings } from './measure';

export const TEACHING = teachingJson as unknown as TeachingData;

export const M5_PICTURE_IDS = [
  'pictures.album', 'pictures.colour', 'pictures.down', 'pictures.numerals', 'pictures.units', 'pictures.home', 'pictures.slip', 'pictures.height',
] as const;
export type M5PictureId = (typeof M5_PICTURE_IDS)[number];

interface FrameRow {
  frame: string;
  channel: string;
  index: number;
  image: number;
  title: string;
  colourRole: string;
  tapeStartSample384k: number;
  orientationBarry: number;
}
const ROWS_DATA = framesData.frames as unknown as FrameRow[];
const byId = new Map(ROWS_DATA.map((f) => [f.frame, f]));

/** Every frame of the picture side (both channels), in the order the tape plays them. */
export const ALBUM_FRAMES: readonly string[] = [...ROWS_DATA]
  .sort((a, b) => a.tapeStartSample384k - b.tapeStartSample384k || a.frame.localeCompare(b.frame))
  .map((f) => f.frame);

/** A channel's frames in order (L000 to L077, R000 to R077). */
export function channelFrames(ch: string): string[] {
  return ROWS_DATA.filter((f) => f.channel === ch).sort((a, b) => a.index - b.index).map((f) => f.frame);
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

function obj(answer: Answer, what: string): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error(`Propose ${what} as an object.`);
  return answer;
}
function need(get: PictureProvider, frame: string): DecodedPicture {
  const p = get(frame);
  if (!p) throw new Error(`Frame ${frame} is not developed yet. Develop it in the album first.`);
  return p;
}
const pct = (x: number, d = 2): string => `${(x * 100).toFixed(d)}%`;

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

// ---- pictures.down -------------------------------------------------------------------------------------

/** Barry's code to clockwise quarter turns: 1 is the native frame turned 90 degrees clockwise, 2 anticlockwise. */
export const BARRY_TO_CW: Record<number, number> = { 0: 0, 1: 1, 2: 3 };
const TURN_WORDS = ['no turn', 'a quarter turn clockwise', 'a half turn', 'a quarter turn anticlockwise'];

/** Frames the record stores turned on their sides (Barry's table, data/frames.json orientationBarry). */
export const TURNED_FRAMES: readonly string[] = ROWS_DATA.filter((f) => f.orientationBarry !== 0).map((f) => f.frame);

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

// ---- pictures.numerals ---------------------------------------------------------------------------------

export function checkNumerals(answer: Answer): CheckResult {
  const a = obj(answer, 'the table of numerals');
  const t = obj(a.table ?? null, 'the table of numerals');
  const truth = digitTable(TEACHING);
  const rows = TEACHING.L002.digits;
  const wrong: string[] = [];
  let matched = 0;
  for (const d of rows) {
    const v = t[String(d.glyph)];
    if (typeof v !== 'number') continue;
    if (v === truth.get(d.glyph)) matched++;
    else wrong.push(d.value === 0 ? `the second mark of the ten row, set as ${v}` : `the mark beside the row of ${d.row}, set as ${v}`);
  }
  const base = placeBase(TEACHING);
  const ok = matched === rows.length;
  const missing = rows.length - matched - wrong.length;
  return {
    ok,
    result: [
      { key: 'digits matched', value: `${matched} of ${rows.length}` },
      ...(ok ? [{ key: 'their base', value: base }] : []),
    ],
    message: ok
      ? `Every one of their ${rows.length} digits is matched to its count. Ten is written with two of them, one and none: they count by place, in tens. Read with your table, their sums hold.`
      : wrong.length
        ? `Not all: ${wrong.join('; ')}. The dots and the cover's strokes beside it say otherwise.`
        : `${missing} of their digits are not matched to a count yet.`,
  };
}

// ---- pictures.units ------------------------------------------------------------------------------------

export const UNITS = senderUnits(TEACHING);
const SECOND_LINE = TEACHING.L003.lines.find((l) => l.id === 'second')?.definition;
if (!SECOND_LINE) throw new Error('teaching.json has no second');
/** Their second in beats, and the precision of the number that defines it (1 42/100: half of 1/100 against 1.42). */
export const SECOND_BEATS = (UNITS.s as number) / BEAT_S;
export const SECOND_PRECISION = writtenPrecision(SECOND_LINE);

export function checkUnits(answer: Answer): CheckResult {
  const a = obj(answer, 'their second in beats');
  const x = a.secondInBeats;
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) throw new Error('secondInBeats must be a positive number.');
  const rel = x / SECOND_BEATS - 1;
  const ok = Math.abs(rel) <= SECOND_PRECISION;
  const result: Reading[] = [
    { key: 'their second', value: UNITS.s as number, dim: 'time' },
    { key: 'your reading', value: x * BEAT_S, dim: 'time' },
    { key: 'precision of what they wrote', value: pct(SECOND_PRECISION) },
  ];
  if (ok) {
    result.push({ key: 'their day', value: UNITS.d as number, dim: 'time' });
    result.push({ key: 'their centimetre', value: UNITS.cm as number, dim: 'length' });
    result.push({ key: 'their metre', value: UNITS.m as number, dim: 'length' });
    result.push({ key: 'their kilometre', value: UNITS.km as number, dim: 'length' });
    result.push({ key: 'their gram', value: UNITS.g as number, dim: 'mass' });
    result.push({ key: 'their kilogram', value: UNITS.kg as number, dim: 'mass' });
    result.push({ key: 'their world\'s mass', value: UNITS.e as number, dim: 'mass' });
  }
  const times = x / SECOND_BEATS;
  return {
    ok,
    result,
    message: ok
      ? `Their second is 1 42/100 x 10^9 spin flips: ${q('time', UNITS.s as number, 3)}, within the ${pct(SECOND_PRECISION)} that their three figures carry. From it and the drawings: their day, ${q('time', UNITS.d as number, 3)}; their centimetre, a 21st of the hydrogen wave, ${q('length', UNITS.cm as number, 3)}; their gram, ${q('mass', UNITS.g as number, 3)}; and the mass of their world, e, ${q('mass', UNITS.e as number, 3)}.`
      : `Read that way their second would be ${q('time', x * BEAT_S, 3)}, ${times >= 1 ? `${formatNumber(Number(times.toPrecision(3)))} times` : `${formatNumber(Number((1 / times).toPrecision(3)))} times less than`} what the line says: 1 42/100 x 10^9 flips is ${q('time', UNITS.s as number, 3)}.`,
  };
}

// ---- pictures.home and pictures.slip -------------------------------------------------------------------

export const COLUMNS = planetColumns(TEACHING);
export const HOME = homeColumn(TEACHING);
export const SLIP = slips(TEACHING)[0];

const fracText = (c: { whole: number; num: number; den: number }): string => (c.num ? `${c.whole ? `${c.whole} ` : ''}${c.num}/${c.den}` : String(c.whole));

export function checkHome(answer: Answer): CheckResult {
  const a = obj(answer, 'a column');
  const col = a.column;
  if (typeof col !== 'number' || !Number.isInteger(col) || col < 0 || col >= COLUMNS.length) throw new Error(`column must be a whole number from 0 to ${COLUMNS.length - 1}.`);
  const ok = col === HOME;
  const cells = TEACHING.table.columns[col]!.cells;
  const place = placeOutward(TEACHING, HOME);
  const read = (r: Row): string => (cells[r] ? `${fracText(cells[r])} ${cells[r].unit}` : 'none');
  return {
    ok,
    result: [
      { key: 'mass', value: read('mass') },
      { key: 'day', value: read('day') },
      ...(ok ? [{ key: 'place outward', value: place }, { key: 'distance from their star', value: (COLUMNS[HOME]!.si.distance as number), dim: 'length' as const }] : []),
    ],
    message: ok
      ? `The column of ones: a mass of one e and a day of one d. They measured every other world against this one: it is theirs, world number ${place} outward from their star, ${q('length', COLUMNS[HOME]!.si.distance as number, 3)} from it.`
      : col === 0
        ? 'This is the great circle with no distance: the star the others go round, not a world.'
        : `This world's mass reads ${read('mass')} and its day ${read('day')}: it is measured in another world's units, not its own.`,
  };
}

export function checkSlip(answer: Answer): CheckResult {
  const a = obj(answer, 'a cell');
  const col = a.column;
  const row = a.row;
  if (typeof col !== 'number' || !Number.isInteger(col) || col < 0 || col >= COLUMNS.length) throw new Error(`column must be a whole number from 0 to ${COLUMNS.length - 1}.`);
  if (typeof row !== 'string' || !(ROWS as readonly string[]).includes(row)) throw new Error(`row must be one of ${ROWS.join(', ')}.`);
  if (!SLIP) throw new Error('the table has no slip');
  const ok = col === SLIP.column && row === SLIP.row;
  const km = UNITS.km as number;
  const inside = SLIP.fallsInsidePlace;
  const nth = `${inside}${inside === 1 ? 'st' : inside === 2 ? 'nd' : inside === 3 ? 'rd' : 'th'}`;
  const cell = TEACHING.table.columns[col]!.cells[row as Row];
  return {
    ok,
    result: [
      { key: 'cell', value: cell ? `${cell.text} ${cell.unit}` : 'empty' },
      ...(ok
        ? [
            { key: 'as written', value: SLIP.read * km, dim: 'length' as const },
            { key: 'must be more than', value: SLIP.mustExceed * km, dim: 'length' as const },
          ]
        : []),
    ],
    message: ok
      ? `This distance breaks the table's own order. The circles go outward from the star and every other distance rises with them; read the same way, this one would put the outermost world (${q('length', SLIP.read * km, 3)}) closer to the star than the ${nth} world out. From the order alone it must be more than ${q('length', SLIP.mustExceed * km, 3)}. A slip in their table, not in your decoding: the tape carries the whole cell, and its last figure is followed by blank card.`
      : !cell
        ? 'There is nothing written in that cell.'
        : row === 'distance'
          ? `This distance fits: it is larger than every distance inward of it and smaller than every one outward.`
          : `Nothing in the table's own rules says what this cell must be: only the distances must rise outward, with the circles.`,
  };
}

// ---- pictures.height -----------------------------------------------------------------------------------

export const HEIGHTS = heights(TEACHING);

export function checkHeight(answer: Answer): CheckResult {
  const a = obj(answer, 'the height in reaches');
  const v = a.reaches;
  const list = typeof v === 'number' ? [v] : Array.isArray(v) ? v : [];
  if (!list.length || !list.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) throw new Error('reaches must be a positive number, or two.');
  const truth = [...HEIGHTS].sort((x, y) => y.metres - x.metres).map((h) => ({ ...h, reaches: h.metres / REACH_M }));
  const given = (list as number[]).slice().sort((x, y) => y - x);
  const fits = given.map((g, i) => Math.abs(g / truth[i]!.reaches - 1) <= truth[i]!.precision);
  const ok = fits.every(Boolean);
  const both = truth.map((h) => formatNumber(Number(h.reaches.toPrecision(3)))).join(' and ');
  const result: Reading[] = [
    { key: 'taller figure', value: truth[0]!.metres, dim: 'length' },
    { key: 'shorter figure', value: truth[1]!.metres, dim: 'length' },
    { key: 'your reading', value: (given[0] as number) * REACH_M, dim: 'length' },
  ];
  if (ok) result.unshift({ key: 'their heights', value: `${both} reaches` });
  // a refusal shows the refused and the true readings to as many figures as it takes to tell them apart
  const gm = (given[0] as number) * REACH_M;
  let d = 3;
  while (d < 7 && alienText('length', gm, d) === alienText('length', truth[0]!.metres, d)) d++;
  return {
    ok,
    result,
    message: ok
      ? `The bars run the figures' full height: ${truth.map((h) => `${h.cm} of their centimetres, ${q('length', h.metres, 3)}`).join(', and ')}. A little taller than one of your reaches.`
      : `Read that way the taller figure would stand ${q('length', gm, d)}; the bar beside it says ${truth[0]!.cm} of their centimetres, ${q('length', truth[0]!.metres, d)}.`,
  };
}

/** The eight checkers over a signal provider (for the circle's settings) and the album's decoded pictures. */
export function makeM5PictureCheckers(signals: SignalProvider, pictures: PictureProvider): Record<M5PictureId, Checker> {
  return {
    'pictures.album': (a) => checkAlbum(signals, pictures, a),
    'pictures.colour': (a) => checkColour(pictures, a),
    'pictures.down': (a) => checkDown(a),
    'pictures.numerals': (a) => checkNumerals(a),
    'pictures.units': (a) => checkUnits(a),
    'pictures.home': (a) => checkHome(a),
    'pictures.slip': (a) => checkSlip(a),
    'pictures.height': (a) => checkHeight(a),
  };
}
