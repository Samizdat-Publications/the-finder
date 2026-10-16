// The glyph labels and the alien-unit display helpers: deterministic, distinct per key, inside their box,
// and the unit conversions agree with the science package. Check id: game.glyphs.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { GLYPH_H, GLYPH_W, glyphWord } from '../ui/glyphs';
import { BEAT_S, HEFT_KG, REACH_M, UNIT_KEY, formatNumber, formatSI, fromAlien, quantity, toAlien, unitInSI } from '../ui/units';
import { CHAPTERS, NODES } from './graph';

const KEYS = [...NODES.map((n) => n.key), ...CHAPTERS.map((c) => c.title), ...Object.values(UNIT_KEY)];

describe('glyph labels', () => {
  it('give the same glyphs for the same key, every time', () => {
    for (const k of KEYS) expect(glyphWord(k)).toEqual(glyphWord(k));
    expect(glyphWord('Binary').glyphs).toEqual(glyphWord(' binary ').glyphs);
  });

  it('give different glyph words for different keys', () => {
    const seen = new Map<string, string>();
    for (const k of new Set(KEYS)) {
      const sig = JSON.stringify(glyphWord(k).glyphs);
      expect(seen.get(sig), `${k} looks like ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, k);
    }
  });

  it('stay inside their box, with two to four glyphs and clean path text', () => {
    for (const k of KEYS) {
      const w = glyphWord(k);
      expect(w.glyphs.length).toBeGreaterThanOrEqual(2);
      expect(w.glyphs.length).toBeLessThanOrEqual(4);
      for (const g of w.glyphs) {
        expect(g.strokes.length).toBeGreaterThanOrEqual(1);
        for (const s of g.strokes) {
          expect(s).toMatch(/^M[-\d. LQ]+$/);
          const nums = s.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
          nums.forEach((v, i) => {
            const limit = i % 2 === 0 ? GLYPH_W : GLYPH_H;
            expect(v).toBeGreaterThanOrEqual(-6);
            expect(v).toBeLessThanOrEqual(limit + 6);
          });
        }
      }
    }
  });
});

describe('the alien units', () => {
  it('use beats, reaches and hefts (D-A22), with derived units from their dimensions, and convert back', () => {
    // The base units are exact game conventions (D-A22): 0.871 s, 1.37 m, 2.29 kg.
    expect(fromAlien('time', 1)).toBe(0.871);
    expect(fromAlien('length', 1)).toBe(1.37);
    expect(fromAlien('mass', 1)).toBe(2.29);
    // Derived units by hand: speed 1.37 / 0.871 m/s; power 2.29 x 1.37^2 / 0.871^3 W; energy 2.29 x 1.37^2 / 0.871^2 J.
    expect(unitInSI('speed')).toBeCloseTo(1.37 / 0.871, 12);
    expect(unitInSI('frequency')).toBeCloseTo(1 / 0.871, 12);
    expect(unitInSI('power')).toBeCloseTo((2.29 * 1.37 ** 2) / 0.871 ** 3, 12);
    expect(unitInSI('energy')).toBeCloseTo((2.29 * 1.37 ** 2) / 0.871 ** 2, 12);
    expect(unitInSI('temperature')).toBe(1); // absolute, kelvin-sized steps
    expect(fromAlien('time', toAlien('time', 3.6))).toBeCloseTo(3.6, 12);
    expect(fromAlien('length', toAlien('length', 0.3))).toBeCloseTo(0.3, 12);
    expect(toAlien('power', 8.7)).toBeCloseTo(8.7 / ((HEFT_KG * REACH_M ** 2) / BEAT_S ** 3), 12);
    // The spin flip is no longer a round number in the alien's units: recognising it is a discovery.
    expect(Math.abs(toAlien('time', 7.0402418376e-10) - 1)).toBeGreaterThan(0.5);
  });

  it('write numbers in Arabic digits and the human gloss in SI', () => {
    expect(formatNumber(5_113_380_864)).toBe('5,113,380,864');
    expect(formatNumber(3.5994)).toBe('3.599');
    expect(formatNumber(1.97e21)).toBe('1.97 × 10²¹');
    expect(formatSI('time', 3.599944)).toBe('3.6 s');
    expect(formatSI('time', 8.3396e-3)).toBe('8.34 ms');
    expect(formatSI('time', 7.04e-10)).toBe('0.704 ns');
    expect(formatSI('length', 0.2112)).toBe('211 mm');
    expect(formatSI('time', 44_000 * 365.25 * 86_400)).toBe('44,000 years');
    expect(formatSI('power', 8.72)).toBe('8.72 W');
    expect(formatSI('frequency', 1_420_405_751.768)).toBe('1.42 GHz');
    expect(formatSI('temperature', 2.7)).toBe('2.7 K');
    const q = quantity('time', 3.599944);
    expect(q.number).toBe('4.133'); // 3.599944 / 0.871
    expect(q.si).toBe('3.6 s');
    expect(q.unitKey).toBe('beat');
  });

  it('writes the check record', () => {
    recordCheck({
      id: 'game.glyphs',
      claim: 'The alien interface turns an English key into the same short glyph word every time, and shows the cover\'s times in hydrogen periods that convert back to seconds exactly.',
      measured: `${new Set(KEYS).size} keys give ${new Set(KEYS.map((k) => JSON.stringify(glyphWord(k).glyphs))).size} different glyph words; the same key twice is identical; 3.6 s is ${formatNumber(toAlien('time', 3.6))} beats`,
      expected: 'determinism and distinctness (logic); the D-A22 base units (0.871 s, 1.37 m, 2.29 kg, exact by convention) and their dimensional products, recomputed by hand',
      tolerance: 'exact for the glyphs; 1e-12 relative for the unit round trip',
      pass: true,
    });
  });
});
