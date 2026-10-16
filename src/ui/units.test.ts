// The interface's one way of writing a very large or very small number (M3 step 8b): a mantissa and a power of
// ten with a superscript exponent, never e-notation.

import { describe, expect, it } from 'vitest';
import { formatNumber, formatPower, quantityText, superscript } from './units';

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

  it('quantityText shows only the alien unit unless the human gloss is on', () => {
    const off = quantityText('time', 3.6, false);
    const on = quantityText('time', 3.6, true);
    expect(off).toBe('4.133 beat');
    expect(off).not.toContain('(');
    expect(on).toBe('4.133 beat (3.6 s)');
  });
});
