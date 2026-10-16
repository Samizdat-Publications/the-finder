// Contour text (M4 step 7e): no "100.000% contour"; above 99.9% a point reads as beyond the 99.9% contour.
import { describe, expect, it } from 'vitest';
import { contourPct, onContour } from './contour';

describe('contour text', () => {
  it('writes levels up to 99.9% as numbers and beyond it as beyond the 99.9% contour', () => {
    expect(onContour(0.973)).toBe('on the 97.3% contour');
    expect(onContour(0.999)).toBe('on the 99.9% contour');
    expect(onContour(0.99996)).toBe('beyond the 99.9% contour');
    expect(onContour(1)).toBe('beyond the 99.9% contour');
    expect(contourPct(0.5, 0)).toBe('50%');
    expect(contourPct(0.9999999)).toBe('beyond 99.9%');
    expect(onContour(1)).not.toMatch(/100/);
  });
});
