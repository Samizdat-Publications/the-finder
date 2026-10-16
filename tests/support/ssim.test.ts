// The SSIM used by the decoder tests must be scikit-image's structural_similarity (the metric of the
// Python reference's own 96 kHz comparison). Fixture values were computed once with scikit-image 0.26.0
// (Python 3.14) on three integer-formula images, 64 x 48:
//   i1 = (x*x + 3y) % 256;  i2 = clip(i1 + ((7x + 5y) % 31) - 15, 0, 255);  i3 = (11x XOR 17y) & 255
//   structural_similarity(i1, i2, data_range=255) = 0.9847673125640565
//   structural_similarity(i1, i3, data_range=255) = 0.03829988881366735
//   structural_similarity(i2, i3, data_range=255) = 0.04096552006285778
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPng } from './png';
import { ssim } from './ssim';

const W = 64;
const H = 48;
function images(): [Uint8Array, Uint8Array, Uint8Array] {
  const i1 = new Uint8Array(W * H);
  const i2 = new Uint8Array(W * H);
  const i3 = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = (x * x + 3 * y) % 256;
      i1[y * W + x] = a;
      i2[y * W + x] = Math.min(255, Math.max(0, a + ((x * 7 + y * 5) % 31) - 15));
      i3[y * W + x] = ((x * 11) ^ (y * 17)) & 255;
    }
  return [i1, i2, i3];
}

describe('SSIM matches scikit-image', () => {
  it('reproduces three scikit-image values', () => {
    const [i1, i2, i3] = images();
    // 1e-12: both compute in float64; the integral-image sums here are exact integers, so only the
    // final divisions can differ in the last bits
    expect(Math.abs(ssim(i1, i2, W, H) - 0.9847673125640565)).toBeLessThan(1e-12);
    expect(Math.abs(ssim(i1, i3, W, H) - 0.03829988881366735)).toBeLessThan(1e-12);
    expect(Math.abs(ssim(i2, i3, W, H) - 0.04096552006285778)).toBeLessThan(1e-12);
    expect(ssim(i2, i2, W, H)).toBe(1);
  });

  it('reproduces the reference run\'s own 96 kHz vs 384 kHz SSIM (when build/ is present)', () => {
    const metricsPath = 'build/ref/metrics.json';
    if (!existsSync(metricsPath) || !existsSync('build/ref/frames/L000.png') || !existsSync('build/ref96/frames/L000.png')) {
      console.log('SKIP: build/ref and build/ref96 not present (needs the tape run)');
      return;
    }
    // Python's json writes NaN, which JSON.parse rejects
    const m = JSON.parse(readFileSync(metricsPath, 'utf8').replace(/\bNaN\b/g, 'null')) as { slices: { per_frame: { id: string; ssim: number }[] } };
    for (const id of ['L000', 'L009', 'R072']) {
      const want = m.slices.per_frame.find((f) => f.id === id)?.ssim as number;
      const a = readPng(`build/ref/frames/${id}.png`);
      const b = readPng(`build/ref96/frames/${id}.png`);
      // make_slices.py wrote these with skimage after decoding; 1e-9 allows only float summation order
      expect(Math.abs(ssim(a.data, b.data, a.width, a.height) - want)).toBeLessThan(1e-9);
    }
  });
});
