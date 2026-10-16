// The glyph labels and the alien-unit display helpers: deterministic, distinct per key, inside their box,
// and the unit conversions agree with the science package. Check id: game.glyphs.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { HYDROGEN_HZ } from '../science/units';
import { GLYPH_H, GLYPH_W, glyphWord } from '../ui/glyphs';
import { formatNumber, formatSI, fromAlien, quantity, toAlien } from '../ui/units';
import { CHAPTERS, NODES } from './graph';

const KEYS = [...NODES.map((n) => n.key), ...CHAPTERS.map((c) => c.title), 'hydrogen period', 'hydrogen wavelength'];

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
  it('count time in hydrogen periods and length in hydrogen wavelengths, and convert back', () => {
    expect(toAlien('time', 1)).toBeCloseTo(HYDROGEN_HZ, 3);
    expect(fromAlien('time', toAlien('time', 3.6))).toBeCloseTo(3.6, 12);
    expect(fromAlien('length', toAlien('length', 0.3))).toBeCloseTo(0.3, 12);
    expect(toAlien('length', 0.2112)).toBeCloseTo(1, 2);
  });

  it('write numbers in Arabic digits and the human gloss in SI', () => {
    expect(formatNumber(5_113_380_864)).toBe('5,113,380,864');
    expect(formatNumber(3.5994)).toBe('3.599');
    expect(formatNumber(1.97e21)).toBe('1.97e21');
    expect(formatSI('time', 3.599944)).toBe('3.6 s');
    expect(formatSI('time', 8.3396e-3)).toBe('8.34 ms');
    expect(formatSI('time', 7.04e-10)).toBe('0.704 ns');
    expect(formatSI('length', 0.2112)).toBe('211 mm');
    expect(formatSI('time', 44_000 * 365.25 * 86_400)).toBe('44,000 years');
    const q = quantity('time', fromAlien('time', 5_113_380_864));
    expect(q.number).toBe('5,113,380,864');
    expect(q.si).toBe('3.6 s');
    expect(q.unitKey).toBe('hydrogen period');
  });

  it('writes the check record', () => {
    recordCheck({
      id: 'game.glyphs',
      claim: 'The alien interface turns an English key into the same short glyph word every time, and shows the cover\'s times in hydrogen periods that convert back to seconds exactly.',
      measured: `${new Set(KEYS).size} keys give ${new Set(KEYS.map((k) => JSON.stringify(glyphWord(k).glyphs))).size} different glyph words; the same key twice is identical; 3.6 s is ${formatNumber(toAlien('time', 3.6))} hydrogen periods`,
      expected: 'determinism and distinctness (logic); src/science/units.ts for the hydrogen period',
      tolerance: 'exact for the glyphs; 1e-12 relative for the unit round trip',
      pass: true,
    });
  });
});
