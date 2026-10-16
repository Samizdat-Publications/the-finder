// key.binary: what do the two kinds of stroke mean? Everything here is computed from the strokes of the
// rebuilt cover (src/chapters/shared/coverSvg.ts measures each stroke's kind from its geometry). Pure.
//
// The right reading: a number written place by place in base two, the stroke ACROSS the line of writing
// being 1. It is the only reading consistent with every string beginning with the same stroke (a written
// number never begins with 0) and with the single stroke between the two hydrogen drawings reading as 1.

import type { Answer, CheckResult, Reading } from '../../game/deductions';
import type { BinaryGroup, StrokeKind } from '../shared/coverSvg';

export type BinaryReading = 'positional' | 'tally' | 'letters' | 'decoration';

export interface BinaryAnswer {
  reading: BinaryReading;
  /** For the positional reading: which kind of stroke is 1. */
  one?: StrokeKind;
}

/** The id of the one-stroke group between the two hydrogen drawings (cover.svg data-id). */
export const HYDROGEN_MARK_ID = 'hydrogen.one';

export interface StrokeCensus {
  groups: number;
  strokes: number;
  across: number;
  along: number;
  /** Strokes within 20 degrees of either kind's ideal (0 or 90 degrees from the line of writing). */
  clean: number;
  /** Largest angle of an "along" stroke and smallest angle of an "across" stroke, degrees. */
  alongMaxDeg: number;
  acrossMinDeg: number;
  beginAcross: number;
  beginAlong: number;
  hydrogenMark: StrokeKind | null;
}

export function census(groups: readonly BinaryGroup[]): StrokeCensus {
  let strokes = 0;
  let across = 0;
  let clean = 0;
  let alongMaxDeg = 0;
  let acrossMinDeg = 90;
  for (const g of groups) {
    for (const b of g.bits) {
      strokes++;
      if (b.kind === 'across') {
        across++;
        acrossMinDeg = Math.min(acrossMinDeg, b.angleDeg);
      } else alongMaxDeg = Math.max(alongMaxDeg, b.angleDeg);
      if (b.angleDeg < 20 || b.angleDeg > 70) clean++;
    }
  }
  const first = groups.map((g) => g.bits[0]?.kind);
  const hm = groups.find((g) => g.id === HYDROGEN_MARK_ID);
  return {
    groups: groups.length,
    strokes,
    across,
    along: strokes - across,
    clean,
    alongMaxDeg,
    acrossMinDeg,
    beginAcross: first.filter((k) => k === 'across').length,
    beginAlong: first.filter((k) => k === 'along').length,
    hydrogenMark: hm?.bits.length === 1 ? (hm.bits[0]?.kind ?? null) : null,
  };
}

/** A group read as a base-two number with the given kind as 1, most significant stroke first. */
export function positionalValue(g: BinaryGroup, one: StrokeKind): number {
  let v = 0;
  for (const b of g.bits) v = v * 2 + (b.kind === one ? 1 : 0);
  return v;
}

/**
 * If the order of the strokes in a string carried no meaning (a tally, or ornament), each string's first
 * stroke would be a random draw from its own strokes. The chance that all of them begin with the kind they
 * do is the product, over the strings, of the fraction of that kind in each.
 */
export function chanceAllBeginSame(groups: readonly BinaryGroup[], kind: StrokeKind): number {
  let p = 1;
  for (const g of groups) p *= g.bits.filter((b) => b.kind === kind).length / g.bits.length;
  return p;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Letter lengths 2 to 8 strokes, and how many of the long strings (10 or more strokes) each one divides. */
export function letterFits(groups: readonly BinaryGroup[]): { long: number; gcd: number; best: { size: number; fits: number } } {
  const lens = groups.map((g) => g.bits.length).filter((n) => n >= 10);
  let best = { size: 2, fits: -1 };
  for (let size = 2; size <= 8; size++) {
    const fits = lens.filter((n) => n % size === 0).length;
    if (fits > best.fits) best = { size, fits };
  }
  return { long: lens.length, gcd: lens.reduce(gcd, 0), best };
}

const fmtChance = (p: number): string => (p > 0 ? `1 in ${Number((1 / p).toPrecision(2)).toExponential(1).replace('e+', 'e')}` : '0');

export function parseBinaryAnswer(answer: Answer): BinaryAnswer | null {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return null;
  const r = answer.reading;
  if (r !== 'positional' && r !== 'tally' && r !== 'letters' && r !== 'decoration') return null;
  const one = answer.one;
  if (r === 'positional' && one !== 'across' && one !== 'along') return null;
  return { reading: r, one: r === 'positional' ? (one as StrokeKind) : undefined };
}

/** The checker for key.binary over the cover's strokes. */
export function checkBinary(groups: readonly BinaryGroup[], answer: Answer): CheckResult {
  const a = parseBinaryAnswer(answer);
  if (!a) {
    return { ok: false, result: [], message: 'Choose a reading: a number written place by place (and which stroke is one), a tally, letters or decoration.' };
  }
  const c = census(groups);
  const base: Reading[] = [
    { key: 'strings counted', value: c.groups },
    { key: 'strokes counted', value: c.strokes },
    { key: 'begin across', value: c.beginAcross },
    { key: 'begin along', value: c.beginAlong },
  ];
  const turn = groups.find((g) => g.id === 'record.rotationPeriod');

  if (a.reading === 'positional') {
    const one = a.one as StrokeKind;
    const zero: StrokeKind = one === 'across' ? 'along' : 'across';
    const leadingZeros = one === 'across' ? c.beginAlong : c.beginAcross;
    const hydrogenValue = c.hydrogenMark === one ? 1 : 0;
    const ok = leadingZeros === 0 && hydrogenValue === 1;
    const result: Reading[] = [
      ...base,
      { key: 'numbers beginning with zero', value: leadingZeros },
      { key: 'hydrogen mark', value: hydrogenValue },
    ];
    if (turn) result.push({ key: 'number round the disc', value: positionalValue(turn, one) });
    if (ok) {
      return {
        ok,
        result,
        message: `All ${c.groups} strings begin with the stroke across the line, so read with that stroke as one, no number begins with zero, and the single stroke between the two hydrogen drawings reads 1. The strokes are binary digits.`,
      };
    }
    return {
      ok,
      result,
      message: `With the stroke ${one} the line as one, ${leadingZeros} of the ${c.groups} strings begin with a zero, which no one writes in front of a number, and the single stroke between the two hydrogen drawings would read ${hydrogenValue}: a unit of nothing. Try the stroke ${zero} the line as one.`,
    };
  }

  const p = chanceAllBeginSame(groups, 'across');
  if (a.reading === 'tally') {
    const sample = groups.filter((g) => g.bits.length >= 10).slice(0, 4);
    const tallies = sample.map((g) => g.bits.filter((b) => b.kind === 'across').length);
    return {
      ok: false,
      result: [...base, ...sample.map((g, i) => ({ key: `tally ${i + 1}`, value: tallies[i] as number })), { key: 'chance of the same first stroke', value: fmtChance(p) }],
      message: `Read as tallies, the strings count ${tallies.join(', ')} strokes across the line with no pattern between them, and a tally would not care about order: yet all ${c.beginAcross} strings begin with the same kind of stroke. If order did not matter, the chance of that is ${fmtChance(p)}. The order carries meaning.`,
    };
  }
  if (a.reading === 'letters') {
    const f = letterFits(groups);
    return {
      ok: false,
      result: [...base, { key: 'long strings', value: f.long }, { key: 'common letter length', value: f.gcd }, { key: 'best letter length', value: f.best.size }, { key: 'strings it fits', value: f.best.fits }],
      message: `Letters of a two-stroke alphabet need a fixed number of strokes each, but no letter length from 2 to 8 cuts all ${f.long} long strings evenly (the best, ${f.best.size} strokes, fits ${f.best.fits} of them; the lengths share no common factor but ${f.gcd}). The strokes run evenly with no gaps for letters, and nothing repeats like words: no structure of writing.`,
    };
  }
  return {
    ok: false,
    result: [...base, { key: 'strokes of one kind or the other', value: c.clean }, { key: 'chance of the same first stroke', value: fmtChance(p) }],
    message: `Ornament would not need two exact kinds of stroke, yet ${c.clean} of the ${c.strokes} strokes lie within 20 degrees of along or across the line and ${c.strokes - c.clean} in between; and all ${c.beginAcross} strings begin with the same kind, a chance of ${fmtChance(p)} if the order meant nothing. These marks are written, not decorative.`,
  };
}
