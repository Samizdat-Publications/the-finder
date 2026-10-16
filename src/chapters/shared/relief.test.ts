// The relief shader on a synthetic groove: overhead light shows the groove faintly, raking light strongly,
// and the wall facing the lamp is the bright one. Truth is plain geometry (Lambert's cosine law).

import { describe, expect, it } from 'vitest';
import { contrast, lampVector, shadeRelief } from './relief';

const W = 41;
const H = 9;

/** A vertical groove 5 pixels wide down the middle of a small plate. */
function groove(): { cov: Float32Array; inside: Uint8Array } {
  const cov = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 18; x <= 22; x++) cov[y * W + x] = 1;
  return { cov, inside: new Uint8Array(W * H).fill(1) };
}

function shade(az: number, el: number): Uint8ClampedArray {
  const { cov, inside } = groove();
  const out = new Uint8ClampedArray(W * H * 4);
  shadeRelief(cov, inside, W, H, { azimuthDeg: az, elevationDeg: el }, out);
  return out;
}

const red = (img: Uint8ClampedArray, x: number): number => img[(4 * W + x) * 4] as number;

describe('relief', () => {
  it('points the lamp vector where the light comes from', () => {
    const [x, y, z] = lampVector({ azimuthDeg: 180, elevationDeg: 0 });
    expect(x).toBeCloseTo(-1, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(0, 12);
    expect(lampVector({ azimuthDeg: 0, elevationDeg: 90 })[2]).toBeCloseTo(1, 12);
  });

  it('shows the groove faintly under overhead light and strongly under raking light', () => {
    const flat = contrast(shade(0, 90));
    const raking = contrast(shade(0, 8));
    // Overhead: the walls tilt about 35 degrees (wallSlope 0.7), so they keep cos 35 = 0.82 of the light: about 10% contrast.
    expect(flat).toBeGreaterThan(0.03);
    expect(flat).toBeLessThan(0.2);
    // Raking at 8 degrees: the lit wall gets 0.12 + 0.88 sin(8 + 35) = 0.72, the far wall only the 0.12
    // ambient: (0.72 - 0.12) / (0.72 + 0.12) = 0.71 by hand.
    expect(raking).toBeGreaterThan(0.68);
    expect(raking).toBeGreaterThan(4 * flat);
  });

  it('lights the wall that faces the lamp', () => {
    const fromLeft = shade(180, 10);
    // The right wall of the groove (x about 23) faces left, toward the lamp; the left wall (x about 17) faces away.
    expect(red(fromLeft, 23)).toBeGreaterThan(red(fromLeft, 17) + 50);
    const fromRight = shade(0, 10);
    expect(red(fromRight, 17)).toBeGreaterThan(red(fromRight, 23) + 50);
  });

  it('leaves pixels off the plate transparent', () => {
    const { cov } = groove();
    const out = new Uint8ClampedArray(W * H * 4);
    shadeRelief(cov, new Uint8Array(W * H), W, H, { azimuthDeg: 0, elevationDeg: 45 }, out);
    expect(out.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });
});
