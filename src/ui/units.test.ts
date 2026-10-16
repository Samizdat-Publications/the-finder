// The interface's one way of writing a very large or very small number (M3 step 8b): a mantissa and a power of
// ten with a superscript exponent, never e-notation.

import { describe, expect, it } from 'vitest';
import { formatMeasured, formatNumber, formatPower, humanLength, lengthLabel, quantity, quantityText, superscript } from './units';

describe('powers of ten in the interface', () => {
  it('superscript writes integers, negatives included', () => {
    expect(superscript(12)).toBe('¹²');
    expect(superscript(-6)).toBe('⁻⁶');
    expect(superscript(0)).toBe('⁰');
  });

  it('formatPower gives a mantissa and a superscript power', () => {
    expect(formatPower(1.59e12)).toBe('1.59 × 10¹²');
    expect(formatPower(3.2e-7, 2)).toBe('3.2 × 10⁻⁷');
    expect(formatPower(1e15)).toBe('1 × 10¹⁵');
    expect(formatPower(-4.56e9, 3)).toBe('-4.56 × 10⁹');
    expect(formatPower(0)).toBe('0');
  });

  it('formatNumber uses it for large and small numbers and never writes e-notation', () => {
    for (const x of [1.59e12, 7.04e-10, 3.1e21, 2.5e-5, 9.99e14]) expect(formatNumber(x)).not.toMatch(/e[+-]?\d/);
    expect(formatNumber(1.59e12)).toBe('1.59 × 10¹²');
    expect(formatNumber(8.08e-10)).toBe('8.08 × 10⁻¹⁰');
    expect(formatNumber(5_113_380_864)).toBe('5,113,380,864');
  });

  it('a measured quantity from a million up reads as a power of ten; exact cover counts keep their digits', () => {
    expect(formatMeasured(18_708_965_633)).toBe('1.87 × 10¹⁰');
    expect(formatMeasured(999_999)).toBe('999,999');
    expect(formatNumber(509_549_854)).toBe('509,549,854');
    expect(quantity('time', 2e10).number).not.toMatch(/,/);
  });

  it('quantityText shows only the alien unit unless the human gloss is on', () => {
    const off = quantityText('time', 3.6, false);
    const on = quantityText('time', 3.6, true);
    expect(off).toBe('4.133 beat');
    expect(off).not.toContain('(');
    expect(on).toBe('4.133 beat (3.6 s)');
  });
});

describe('chart labels follow the human-gloss rule (M5 step 0c)', () => {
  it('a distance in parsecs reads in reaches with the gloss off and gains its parsec reading with it on', () => {
    const off = lengthLabel(0.75, false);
    expect(off).toBe('1.69 × 10¹⁶ reaches');
    expect(off).not.toMatch(/\bpc\b|\bAU\b|\bkm\b/);
    expect(lengthLabel(0.75, true)).toBe(`${off} (0.75 pc)`);
  });

  it('the human reading steps from parsecs to AU to km to SI', () => {
    expect(humanLength(3.0857e16 * 8180)).toMatch(/pc$/);
    expect(humanLength(3.0857e16 * 0.004)).toMatch(/AU$/);
    expect(humanLength(2e8)).toBe('200,000 km');
    expect(humanLength(5)).toBe('5 m');
  });
});
