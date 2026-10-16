// The Key's three checkers against independent truth: the stroke kinds measured from the SVG geometry
// against the generator's own labels, the base-two values against data/cover.json (pixel-scanned from NASA
// photo GPN-2000-001978, docs/research/cover.md 1b to 1d), the atlas against NIST wavelengths, and the
// time and length readings against the research's quoted values. Ids key.binary, key.unit,
// key.timesNotLengths (How it's checked rows 3 and 4).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { parseCoverSvg, strokeString } from '../shared/coverSvg';
import { census, chanceAllBeginSame, checkBinary, letterFits, positionalValue } from './binary';
import { makeKeyCheckers } from './checkers';
import { FINE_STRUCTURE, TRANSITIONS, burstRimSpeed, transition, wavelengthM } from './physics';
import { checkTimesNotLengths, checkUnit, pulsarRange, readWithUnit, timesAndLengths, type KeyInputs } from './readings';

const svg = parseCoverSvg(readFileSync(resolve(process.cwd(), 'public/media/cover/cover.svg'), 'utf8'));
const cover = loadCover();
const voyager = JSON.parse(readFileSync(resolve(process.cwd(), 'public/media/models/voyager.json'), 'utf8')) as {
  recordDisc: { radius: number };
  extents: { min: number[]; max: number[] };
};
const span = Math.max(...voyager.extents.max.map((v, i) => v - (voyager.extents.min[i] as number)));
const inputs: KeyInputs = { cover, recordRadiusM: voyager.recordDisc.radius, craftSpanM: span, pulsars: pulsarRange(loadPulsars()) };

/** cover.json's binary strings: 2 record, 1 line time, 1 raster count, 3 line labels, 14 map lines. */
const coverStrings = [
  cover.record.rotationPeriod, cover.record.playTime, cover.picture.lineTime, cover.picture.rasterLines,
  ...cover.picture.lineLabels, ...cover.pulsarMap.lines,
];

describe('key.binary', () => {
  const c = census(svg.groups);

  it('counts the strings from the SVG and they match cover.json', () => {
    // The SVG draws the three line labels twice (above the waveform and beside the scan) and adds the single
    // stroke of the hydrogen drawing: 21 strings in cover.json + 3 repeats + 1 = 25 groups.
    const distinct = new Set(svg.groups.filter((g) => g.id !== 'hydrogen.one').map((g) => g.svgBinary));
    expect(svg.groups.length).toBe(coverStrings.length + cover.picture.lineLabels.length + 1);
    expect(distinct.size).toBe(new Set(coverStrings.map((s) => s.binary)).size);
    for (const s of coverStrings) expect(distinct.has(s.binary), s.binary).toBe(true);
  });

  it('measures every stroke kind from geometry and reads every string as cover.json does', () => {
    const mismatched = svg.groups.flatMap((g) => g.bits.filter((b) => (b.kind === 'across') !== (b.svgClass === 'one')));
    const margin = Math.min(...svg.groups.flatMap((g) => g.bits.map((b) => Math.abs(b.angleDeg - 45))));
    // base-two values with the across stroke as 1, against the integers in cover.json (independent pixel scans)
    const byBinary = new Map(coverStrings.map((s) => [s.binary, s.valueTH]));
    const wrongValue = svg.groups.filter((g) => g.id !== 'hydrogen.one' && positionalValue(g, 'across') !== byBinary.get(g.svgBinary as string));
    const res = checkBinary(svg.groups, { reading: 'positional', one: 'across' });
    const ok = mismatched.length === 0 && wrongValue.length === 0 && c.beginAcross === 25 && c.beginAlong === 0 && c.hydrogenMark === 'across' && res.ok;
    recordCheck({
      id: 'key.binary',
      claim: 'The cover\'s two kinds of stroke are binary digits: every one of its 25 strings begins with the stroke across the line of writing, and read as base two with that stroke as one, every string is the number the cover carries.',
      measured: `${c.groups} strings, ${c.strokes} strokes (${c.across} across, ${c.along} along) classified from geometry; ${mismatched.length} disagree with the SVG's labels, closest call ${margin.toFixed(1)} deg from the 45 deg boundary; ${c.beginAcross} begin across, ${c.beginAlong} along; hydrogen mark ${c.hydrogenMark}; ${wrongValue.length} values differ from cover.json`,
      expected: 'the integers of data/cover.json (pixel-scanned from NASA photo GPN-2000-001978, cover.md 1b to 1d) and NASA\'s legend: a bar across = 1, a dash along = 0',
      tolerance: 'exact (integers and stroke kinds)',
      pass: ok,
      notes: 'The dash-as-one reading makes all 25 strings begin with zero and the hydrogen mark read 0; tally, letters and decoration are rejected with computed results (chance of the shared first stroke, letter-length fits, stroke-angle census).',
    });
    expect(mismatched.length).toBe(0);
    expect(margin).toBeGreaterThan(15); // the generator's strokes are near 0 or 90 deg; 15 deg leaves room for tracing error
    expect(wrongValue.map((g) => g.id)).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('shows what each wrong reading gives', () => {
    const along = checkBinary(svg.groups, { reading: 'positional', one: 'along' });
    expect(along.ok).toBe(false);
    expect(along.result.find((r) => r.key === 'numbers beginning with zero')?.value).toBe(25);
    expect(along.result.find((r) => r.key === 'hydrogen mark')?.value).toBe(0);

    // Hand calculation of the chance: the record turn (6 across of 33), alone, already gives 6/33.
    const rot = svg.groups.find((g) => g.id === 'record.rotationPeriod');
    expect(rot && strokeString(rot).split('x').length - 1).toBe(6); // 100110000110010000000000000000000 has 6 ones (cover.md 1b)
    const p = chanceAllBeginSame(svg.groups, 'across');
    const hand = svg.groups.reduce((acc, g) => acc * (g.bits.filter((b) => b.svgClass === 'one').length / g.bits.length), 1);
    expect(p).toBeCloseTo(hand, 20);
    expect(p).toBeLessThan(1e-6);
    for (const reading of ['tally', 'letters', 'decoration'] as const) {
      const r = checkBinary(svg.groups, { reading });
      expect(r.ok, reading).toBe(false);
      expect(r.message.length, reading).toBeGreaterThan(60);
    }
    const f = letterFits(svg.groups);
    expect(f.gcd).toBe(1); // lengths 33, 43, 24, 10, 30, 29, ... (cover.json bits) share no factor
    expect(f.best.fits).toBeLessThan(f.long);
    expect(checkBinary(svg.groups, 'nonsense').ok).toBe(false);
  });
});

describe('key.unit', () => {
  it('the atlas matches NIST wavelengths', () => {
    // NIST Atomic Spectra Database (fetched 2026-10-16, docs/research/key-physics.md 2): H I vacuum Ritz
    // wavelengths of the unresolved n-to-n' lines, nm: Lyman-alpha 121.56701, H-alpha 656.4632, Paschen-alpha
    // 1875.6096; ionization energy 13.598434599702 eV, as a wavelength hc / E with exact SI h, c and e.
    const hcEvNm = ((6.626_070_15e-34 * 299_792_458) / 1.602_176_634e-19) * 1e9;
    const nist: Record<string, number> = { lymanAlpha: 121.56701, balmerAlpha: 656.4632, paschenAlpha: 1875.6096, ionization: hcEvNm / 13.598434599702 };
    for (const [id, nm] of Object.entries(nist)) {
      const t = transition(id);
      expect(t).toBeDefined();
      // Bohr levels omit fine structure and the Lamb shift: relative error of order alpha^2 (5.3e-5)
      expect(Math.abs((wavelengthM(t!) * 1e9) / nm - 1), id).toBeLessThan(FINE_STRUCTURE ** 2);
    }
    expect(wavelengthM(transition('hyperfine')!) * 100).toBeCloseTo(21.106114054, 8); // clocks.md section 5
  });

  it('only the spin flip puts the 14 map numbers among real pulsars and the disc at a buildable speed', () => {
    const range = inputs.pulsars!;
    const rows = TRANSITIONS.map((t) => readWithUnit(t, inputs, range));
    const hyper = rows.find((r) => r.transition.id === 'hyperfine')!;
    const others = rows.filter((r) => r.transition.id !== 'hyperfine');
    // Hand calculation of the burst speed: sqrt(8 x 220.6e6 / (3.328 x 8910)) = 244.0 m/s (key-physics.md 3)
    expect(burstRimSpeed()).toBeCloseTo(244.0, 0);
    const ok = hyper.mapInRange === 14 && hyper.physical && others.every((r) => r.mapInRange === 0 && !r.physical);
    const verdicts = TRANSITIONS.map((t) => [t.id, checkUnit(inputs, t.id).ok] as const);
    recordCheck({
      id: 'key.unit',
      claim: 'Only hydrogen\'s spin flip makes the cover\'s numbers physical: with it all 14 map numbers are periods real pulsars have and the disc turns once in 3.6 s; with any other hydrogen line none of the 14 is, and the disc would spin fast enough to tear itself apart.',
      measured: rows.map((r) => `${r.transition.id}: ${r.mapInRange}/14 in range, turn ${r.turnS.toPrecision(3)} s, rim ${r.rimMS.toPrecision(3)} m/s`).join('; '),
      expected: `catalogue periods ${range.minS.toPrecision(3)} s to ${range.maxS.toPrecision(3)} s (${range.count} ATNF v2.9.0 pulsars, data/pulsars.json); turn 3.59994 s (cover.md 1b); copper disc bursts above ${burstRimSpeed().toPrecision(3)} m/s rim speed`,
      tolerance: 'counts exact; burst speed from annealed copper C11000 (CDA: 32 ksi, specific gravity 8.91, Poisson 0.328 from its moduli) and the uniform rotating-disc stress (Timoshenko and Goodier)',
      pass: ok && verdicts.every(([id, v]) => v === (id === 'hyperfine')),
      notes: 'The optical and ionization lines are computed from the Rydberg formula (CODATA 2022) and agree with the NIST ASD to parts in 1e5 (docs/research/key-physics.md).',
    });
    expect(hyper.mapInRange).toBe(14);
    expect(hyper.turnS).toBeCloseTo(3.59994, 5); // cover.md 1b
    for (const r of others) expect(r.mapInRange, r.transition.id).toBe(0);
    for (const [id, v] of verdicts) expect(v, id).toBe(id === 'hyperfine');
    const lyman = readWithUnit(transition('lymanAlpha')!, inputs, range);
    expect(lyman.turnS).toBeLessThan(1e-5); // microseconds
    expect(lyman.rimMS / lyman.burstMS).toBeGreaterThan(1000);
  });

  it('refuses while the catalogue is loading, and refuses an unknown transition', () => {
    expect(() => checkUnit({ ...inputs, pulsars: null }, 'hyperfine')).toThrow(/loading/);
    expect(checkUnit(inputs, 'helium').ok).toBe(false);
  });
});

describe('key.timesNotLengths', () => {
  it('as lengths the numbers are absurd; as times they are physical', () => {
    const tl = timesAndLengths(inputs, inputs.pulsars!);
    const turn = tl.rows.find((r) => r.key === 'round the disc')!;
    const side = tl.rows.find((r) => r.key === 'beside the disc')!;
    const line = tl.rows.find((r) => r.key === 'under the line')!;
    const right = checkTimesNotLengths(inputs, 'times');
    const wrong = checkTimesNotLengths(inputs, 'lengths');
    // cover.md 1b and 1c: 3.59994 s, 3229.4 s, 8.3396 ms; PLAN.md: the turn as a length is "a million kilometres"
    const ok =
      Math.abs(turn.seconds - 3.59994) < 1e-5 && Math.abs(side.seconds - 3229.4) < 0.05 && Math.abs(line.seconds * 1e3 - 8.3396) < 1e-4 &&
      turn.metres > 1e9 && turn.metres < 1.2e9 && line.metres > 1e6 && tl.lengthsAbsurd && tl.timesPhysical && right.ok && !wrong.ok;
    recordCheck({
      id: 'key.timesNotLengths',
      claim: 'Read as lengths, the cover\'s numbers are absurd (the number round the record would be about a million kilometres); read as times, they are a turn of 3.6 s, a side of 54 minutes and a picture line of 8.34 ms.',
      measured: `turn ${turn.seconds.toFixed(5)} s or ${(turn.metres / 1e3).toExponential(3)} km; side ${side.seconds.toFixed(1)} s; line ${(line.seconds * 1e3).toFixed(4)} ms or ${(line.metres / 1e3).toFixed(0)} km; smallest length ${tl.smallestOverCraft.toExponential(2)} times the craft (${span.toFixed(1)} m); ${tl.mapInRange}/14 map numbers among pulsars`,
      expected: '3.59994 s, 3229.4 s, 8.3396 ms (cover.md 1b, 1c); lengths absurd = at least 1000 times the craft\'s largest extent (voyager.json); the disc in hand is 0.314 m across',
      tolerance: 'last quoted digit of the research values; the absurdity factor 1000 (three orders of magnitude) is the stated criterion',
      pass: ok,
    });
    expect(turn.metres / 1e9).toBeCloseTo(1.079, 2); // 5,113,380,864 x 0.21106 m
    expect(ok).toBe(true);
    expect(checkTimesNotLengths(inputs, 'neither').ok).toBe(false);
  });

  it('registers through the checker factory with the right ids', () => {
    const c = makeKeyCheckers(svg.groups, () => inputs);
    const ctx = { attempts: 0, confirmed: new Set<string>(), seed: 'test' };
    expect(c['key.binary']({ reading: 'positional', one: 'across' }, ctx).ok).toBe(true);
    expect(c['key.unit']('hyperfine', ctx).ok).toBe(true);
    expect(c['key.timesNotLengths']('times', ctx).ok).toBe(true);
  });
});
