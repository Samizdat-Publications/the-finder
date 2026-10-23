// The teaching pictures' arithmetic against independent truth: the hydrogen constants of units.ts and the SI
// definitions (their second, centimetre, gram and Earth mass must land on ours within the precision of the
// numbers the senders wrote), and today's planetary values (NASA's Planetary Fact Sheet) cell by cell at each
// number's own written precision, with 1977's estimates and the discrepancies named. Never the module's own
// earlier output.
import { describe, expect, it } from 'vitest';
import teachingJson from '../../data/teaching.json';
import { recordCheck } from '../../tests/support/record';
import {
  H1_MASS_KG, digitTable, digitsOf, heights, homeColumn, placeBase, placeOutward, planetColumns, readDigits, senderUnits, slips,
  writtenPrecision, type TeachingData,
} from './teaching';
import { LAMBDA_H_METRES, T_H_SECONDS } from './units';

const D = teachingJson as unknown as TeachingData;

/**
 * Today's values, for the test only (the player never sees them): NASA Planetary Fact Sheet, metric (D. R.
 * Williams, NSSDCA, nssdc.gsfc.nasa.gov/planetary/factsheet/) and the Sun Fact Sheet. Diameter km, distance
 * from the Sun 10^6 km, mass in Earth masses, rotation period in days (sidereal; the sign of retrograde spin
 * dropped). Checked against the sheets on 2026-10-16 (metric planetary sheet updated 18 Mar 2025; the Sun, Pluto
 * and Earth pages): every value matches to the precision used here, except that the summary table rounds
 * Mars's distance to 228.0 (227.9 here); the Sun's 25.38 d is its adopted period at 16 deg latitude.
 */
const TODAY: { name: string; diameter: number; distance: number | null; mass: number; day: number }[] = [
  { name: 'Sun', diameter: 1_391_400, distance: null, mass: 332_946, day: 25.38 },
  { name: 'Mercury', diameter: 4879, distance: 57.9, mass: 0.0553, day: 58.65 },
  { name: 'Venus', diameter: 12_104, distance: 108.2, mass: 0.815, day: 243.02 },
  { name: 'Earth', diameter: 12_756, distance: 149.6, mass: 1, day: 0.9973 },
  { name: 'Mars', diameter: 6792, distance: 227.9, mass: 0.107, day: 1.026 },
  { name: 'Jupiter', diameter: 142_984, distance: 778.5, mass: 317.8, day: 0.4135 },
  { name: 'Saturn', diameter: 120_536, distance: 1432.0, mass: 95.2, day: 0.444 },
  { name: 'Uranus', diameter: 51_118, distance: 2867.0, mass: 14.54, day: 0.718 },
  { name: 'Neptune', diameter: 49_528, distance: 4515.0, mass: 17.15, day: 0.671 },
  { name: 'Pluto', diameter: 2376, distance: 5906.4, mass: 0.0022, day: 6.387 },
];
/** Earth's mass, kg (NASA Planetary Fact Sheet: 5.9722e24). */
const EARTH_KG = 5.9722e24;

/**
 * The columns the research marks as 1977's estimates (docs/research/teaching-frames.md "L004 and L005": "Uranus,
 * Neptune and Pluto from the estimates of the time"), whose cells are listed with their disagreement, not tested,
 * and the slip (Pluto's 591 breaks the table's order, found by the order alone). Earth's mass and day are the
 * units e and d themselves (L003 defines them; teaching.units tests them), not readings to compare.
 */
const ESTIMATE_COLUMNS = new Set(['Uranus', 'Neptune', 'Pluto']);
const SLIP = 'Pluto distance';
const UNITS_THEMSELVES = new Set(['Earth mass', 'Earth day']);

/**
 * The precision a cell's writing carries, relative (M5 science audit finding 6: each cell against its own
 * written precision, not one tolerance for the table): half a unit in its last written figure. A whole
 * number's trailing zeros are not counted as written figures (12400 is written to the hundred, as the senders
 * wrote 139 x 10^4 for the Sun's diameter); that is our reading of the writing, an assumption. A decimal
 * fraction (82/100, 14 6/10) carries half its step (1/200, 1/20); a unit fraction carries half a unit of its
 * denominator (1/19: 0.5 / 19, 2.6%).
 */
function cellPrecision(c: { whole: number; num: number; den: number }): number {
  if (c.num && c.den) {
    const decimal = Number.isInteger(Math.log10(c.den));
    if (!decimal && c.whole === 0 && c.num === 1) return 0.5 / c.den;
    return 0.5 / c.den / (c.whole + c.num / c.den);
  }
  let place = 1;
  while (c.whole % (place * 10) === 0 && place * 10 <= c.whole) place *= 10;
  return (0.5 * place) / c.whole;
}

/**
 * The cells that differ from today's values by more than their written precision, found by this comparison
 * on 2026-10-16 and stated as discrepancies (the test fails if the set changes, so a changed reading or
 * transcription cannot pass silently). Mercury's mass written 1/19 against today's 1/18.1 is a mis-rounding;
 * the others differ by 0.3% to 3.2%, more than their figures carry; why (1977's values, equatorial against
 * mean diameters, which rotation was meant) is not established here: UNVERIFIED.
 */
const STATED = ['Mercury diameter', 'Mercury mass', 'Mercury day', 'Venus diameter', 'Venus mass', 'Jupiter diameter', 'Saturn distance', 'Saturn day'];

describe('teaching: the senders\' numerals (L002)', () => {
  it('sets a digit beside each count, and writes ten as one and none', () => {
    const t = digitTable(D);
    const values = [...t.values()].sort((a, b) => a - b);
    // research: "The senders' own numerals are the ordinary digits 0 to 9"
    const digitsOk = JSON.stringify(values) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // the builder measured the dots on the decode: one to six, one row each (research: "a column of dots, one to six")
    const dotsOk = D.L002.dots.every((d) => d.count === d.row) && D.L002.dots.length === 6;
    const base = placeBase(D);
    // the larger numbers and the sums read with the table and that base are the research's readings
    const larger = D.L002.larger.every((l) => readDigits(digitsOf(l.number, base), base) === l.number);
    const sums = D.L002.sums.every((s) => (s.op === '+' ? (s.terms[0] as number) + (s.terms[1] as number) : (s.terms[0] as number) * (s.terms[1] as number)) === s.total);
    const pass = digitsOk && dotsOk && base === 10 && larger && sums;
    recordCheck({
      id: 'teaching.numerals',
      claim: 'The counting picture sets one of the senders\' digits beside each count of dots (and the cover\'s binary); ten is written with two of them, so they count by place in tens, and the picture\'s sums hold when read that way.',
      measured: `digits for ${values.join(', ')}; dots measured on the decode ${D.L002.dots.map((d) => d.count).join(', ')}; base ${base}; ${D.L002.sums.map((s) => String(s.value)).join(', ')} hold`,
      expected: 'docs/research/teaching-frames.md L002: dots one to six with binary and "= decimal"; digits 0 to 9; 2 + 3 = 5, 8 + 17 = 25, 13 x 28 = 364',
      tolerance: 'exact',
      pass,
    });
    expect(pass).toBe(true);
  });
});

describe('teaching: their units (L003)', () => {
  it('builds a second, a centimetre, a gram and an Earth mass from hydrogen that land on ours within what they wrote', () => {
    const u = senderUnits(D);
    const line = (id: string) => D.L003.lines.find((l) => l.id === id)!.definition!;
    const rows: [string, number, number, number][] = [
      // [unit, theirs in SI, the SI truth, relative precision of the number that defines it]
      ['s', u.s as number, 1, writtenPrecision(line('second'))],
      ['cm', u.cm as number, 0.01, writtenPrecision({ whole: 21, num: 0, den: 0 })],
      ['A', u.A as number, 1e-10, writtenPrecision({ whole: 21, num: 0, den: 0 })],
      ['g', u.g as number, 1e-3, writtenPrecision({ whole: 6, num: 0, den: 0 })],
      ['e', u.e as number, EARTH_KG, writtenPrecision({ whole: 6, num: 0, den: 0 })],
      ['d', u.d as number, 86_400, writtenPrecision(line('second'))],
    ];
    const out = rows.map(([k, theirs, truth, prec]) => ({ k, rel: theirs / truth - 1, prec }));
    // the hydrogen units themselves are the cover's (units.ts), and M is one hydrogen-1 atom: 1.00782503 u
    // (AME2020) times the CODATA 2018 atomic mass constant 1.66053906660e-27 kg, to the 1e-8 those figures carry
    const baseOk = u.t === T_H_SECONDS && u.L === LAMBDA_H_METRES && Math.abs(H1_MASS_KG / (1.00782503 * 1.6605390666e-27) - 1) < 1e-8;
    const pass = baseOk && out.every((r) => Math.abs(r.rel) <= r.prec);
    const txt = out.map((r) => `${r.k} ${(r.rel * 100).toFixed(3)}% (allowed ${(r.prec * 100).toFixed(2)}%)`).join('; ');
    console.log(`teaching.units: ${txt}`);
    recordCheck({
      id: 'teaching.units',
      claim: 'Their units, built from hydrogen as the unit picture defines them (1 42/100 x 10^9 spin flips = 1 s; 1/21 of the 21 cm wave = 1 cm; 6 x 10^23 hydrogen atoms = 1 g; 6 x 10^27 g = 1 e), are our second, centimetre, gram and Earth\'s mass, each within the precision of the number the senders wrote.',
      measured: txt,
      expected: 'SI: 1 s, 0.01 m, 1e-3 kg, 1 Angstrom = 1e-10 m, 1 day = 86,400 s; Earth 5.9722e24 kg (NASA Planetary Fact Sheet); hydrogen period and wavelength from units.ts (clocks.md section 5); H-1 mass 1.007825 u (AME2020)',
      tolerance: 'Half a unit in the last figure of the defining number: 1 42/100 to 0.35%, 21 to 2.4%, 6 to 8.3%',
      pass,
      notes: 'Their centimetre read through hydrogen is 21.106/21 = 1.005 of ours: the picture rounds the 21.1 cm wave to 21. The game reads their numbers through their own definitions.',
    });
    expect(pass).toBe(true);
  });
});

describe('teaching: their planets (L004, L005)', () => {
  it('compares every cell with today\'s value at its own written precision; home and the slip from the table alone', () => {
    const cols = planetColumns(D);
    expect(cols.length).toBe(TODAY.length);
    const within: string[] = [];
    const beyond: string[] = [];
    const marked: string[] = [];
    cols.forEach((c, i) => {
      const t = TODAY[i]!;
      for (const row of ['diameter', 'distance', 'mass', 'day'] as const) {
        const v = c.read[row];
        const cell = D.table.columns[c.index]!.cells[row];
        const truth = row === 'distance' ? (t.distance === null ? null : t.distance * 1e6) : t[row];
        if (v === undefined || !cell || truth === null) continue;
        const k = `${t.name} ${row}`;
        if (UNITS_THEMSELVES.has(k)) continue;
        const r = v / truth - 1;
        if (ESTIMATE_COLUMNS.has(t.name) || k === SLIP) {
          marked.push(`${k} ${(r * 100).toFixed(1)}%`);
          continue;
        }
        const prec = cellPrecision(cell);
        const txt = `${k} ${cell.text} ${(r * 100).toFixed(2)}% (written to ${(prec * 100).toFixed(2)}%)`;
        (Math.abs(r) <= prec ? within : beyond).push(txt);
      }
    });
    const beyondKeys = beyond.map((x) => x.split(' ').slice(0, 2).join(' '));
    const asStated = JSON.stringify([...beyondKeys].sort()) === JSON.stringify([...STATED].sort());
    const home = homeColumn(D);
    const place = placeOutward(D, home);
    const s = slips(D);
    const slip = s[0]!;
    const pass =
      asStated &&
      TODAY[home]!.name === 'Earth' &&
      place === 3 &&
      s.length === 1 &&
      TODAY[slip.column]!.name === 'Pluto' &&
      slip.read === 591e6 &&
      slip.mustExceed === 4498e6 &&
      // read as written it falls inside the fifth world's distance (Jupiter's 778), the order kept without it
      TODAY[slip.fallsInsideColumn]!.name === 'Jupiter' &&
      slip.fallsInsidePlace === 5 &&
      // today's distance does fit the order the table asks for
      TODAY[slip.column]!.distance! * 1e6 > slip.mustExceed;
    console.log(`teaching.planets: within ${within.length}: ${within.join('; ')}\nbeyond ${beyond.length}: ${beyond.join('; ')}\nmarked: ${marked.join(', ')}`);
    recordCheck({
      id: 'teaching.planets',
      claim: 'The table of circles, read in their units, agrees cell by cell with today\'s Sun and planets to the precision each number is written, except eight stated discrepancies and the columns 1977 could only estimate; the column of ones is the third world out; and one cell, the last distance, breaks the table\'s own rising order, which a reader can find from the table alone.',
      measured: `${within.length} of ${within.length + beyond.length} cells outside the estimate columns agree within their written precision; ${beyond.length} differ by more (stated): ${beyond.join('; ')}; 1977 estimates and the slip, not tested: ${marked.join(', ')}; home = column ${home}, ${place}rd from the star; slip: column ${slip.column}'s ${slip.read / 1e6} x 10^6 km, which the order says must exceed ${slip.mustExceed / 1e6} x 10^6 km (today 5,906)`,
      expected: 'NASA Planetary and Sun Fact Sheets, checked against the sheets on 2026-10-16 (metric planetary sheet updated 18 Mar 2025; Mars\'s distance 227.9 here, which the summary table rounds to 228.0); teaching-frames.md: Uranus, Neptune and Pluto from 1977 estimates; Pluto\'s 591 breaks the order',
      tolerance: 'Each cell\'s own written precision: half a unit in its last written figure (trailing zeros of a whole number not counted), half the step of a decimal fraction, half a unit of a unit fraction\'s denominator (Mercury\'s 1/19: 2.6%); the cells beyond it must be exactly the stated eight',
      pass,
      notes: 'Mercury\'s mass written 1/19 is 4.8% low against today\'s 1/18.1, beyond the 2.6% its writing carries. The other stated cells differ by 0.3% to 3.2%. Against a 1970s table (Allen, Astrophysical Quantities, 3rd ed. 1973, section 65, read from an OCR scan whose page images are not yet checked: docs/research/planets-1970s.md) Saturn\'s day (10 h 14 m) and Venus\'s mass match, four cells (Mercury\'s diameter and mass, Jupiter\'s diameter, Saturn\'s distance) are within a last digit or a rounding, and Mercury\'s day and Venus\'s diameter are not explained: their cause is UNVERIFIED. Two cells sit at the edge of their precision: the mass of Venus (0.613% against 0.610%, beyond) and the distance of Jupiter (0.0642% against 0.0643%, within). The numbers are compared as written (the senders meant our km; their hydrogen centimetre is 0.5% larger than ours, teaching.units). The table\'s values were read from our decode (research); the comparison checks the reading, not the decoder.',
    });
    expect(pass).toBe(true);
  });
});

describe('teaching: their height (L039)', () => {
  it('reads 155 cm and 160 cm, 1.55 and 1.60 m through their centimetre', () => {
    const h = heights(D);
    const u = senderUnits(D);
    const truthM = [1.55, 1.6]; // research: "female 155 cm, male 160 cm (1.55 and 1.60 m)"
    const rel = h.map((x, i) => x.metres / truthM[i]! - 1);
    // their cm is L/21 (exactly what the picture defines), 0.5% larger than ours; allowed: the height's own
    // precision (half a centimetre) plus the defining 21's rounding (2.4%)
    const allowed = h.map((x) => x.precision + writtenPrecision({ whole: 21, num: 0, den: 0 }));
    const pass = h.length === 2 && h[0]!.cm === 155 && h[1]!.cm === 160 && rel.every((r, i) => Math.abs(r) <= allowed[i]!) && Math.abs((u.cm as number) / (LAMBDA_H_METRES / 21) - 1) < 1e-12;
    recordCheck({
      id: 'teaching.height',
      claim: 'The two figures are 155 and 160 of their centimetres tall: 1.55 and 1.60 m, a little more through their hydrogen centimetre.',
      measured: h.map((x) => `${x.cm} cm = ${x.metres.toFixed(4)} m`).join(', '),
      expected: 'teaching-frames.md L039: 155 cm and 160 cm (1.55 and 1.60 m), read by the lead on the decoded frame',
      tolerance: 'half a centimetre plus the rounding of the picture\'s "1/21 L = 1 cm" (2.4%)',
      pass,
    });
    expect(pass).toBe(true);
  });
});
