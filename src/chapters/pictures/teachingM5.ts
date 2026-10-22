// The Pictures, complete: the teaching checkers (pictures.numerals, pictures.units, pictures.home, pictures.slip,
// pictures.height), computing with the senders' own numbers as our research reads them on our decode
// (data/teaching.json, src/science/teaching.ts). Split out of checkersM5.ts, which re-exports them. Pure.

import { type Answer, type CheckResult, type Reading } from '../../game/deductions';
import {
  digitTable, heights, homeColumn, placeBase, placeOutward, planetColumns, ROWS, senderUnits, slips, writtenPrecision, type Row,
} from '../../science/teaching';
import { BEAT_S, REACH_M, formatNumber } from '../../ui/units';
import { alienText, q } from '../../ui/message';
import { TEACHING, obj } from './framesM5';

const pct = (x: number, d = 2): string => `${(x * 100).toFixed(d)}%`;

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
