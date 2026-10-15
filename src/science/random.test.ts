import { describe, expect, it } from 'vitest';
import { createRng } from './random';

// Tolerances are computed from n: the sample mean has standard error sqrt(var / n) and the sample
// variance has standard error sqrt((mu4 - sigma^4) / n). We allow 5 standard errors (false-alarm
// probability about 6e-7 per check; the streams are seeded, so the result is fixed anyway).
const K = 5;

function moments(xs: number[]): { m: number; v: number } {
  const n = xs.length;
  let s = 0;
  for (const x of xs) s += x;
  const m = s / n;
  let q = 0;
  for (const x of xs) q += (x - m) * (x - m);
  return { m, v: q / (n - 1) };
}

describe('random: seeded streams', () => {
  it('repeats exactly for the same seed and differs between seeds and labels', () => {
    const a = createRng('voyager');
    const b = createRng('voyager');
    const xa = Array.from({ length: 100 }, () => a.uniform());
    const xb = Array.from({ length: 100 }, () => b.uniform());
    expect(xa).toEqual(xb);
    const c = createRng('voyager2');
    expect(Array.from({ length: 100 }, () => c.uniform())).not.toEqual(xa);
    const f1 = createRng(42).fork('counts');
    const f1again = createRng(42).fork('counts');
    const f2 = createRng(42).fork('noise');
    const s1 = Array.from({ length: 50 }, () => f1.normal());
    expect(Array.from({ length: 50 }, () => f1again.normal())).toEqual(s1);
    expect(Array.from({ length: 50 }, () => f2.normal())).not.toEqual(s1);
    // A fork does not depend on how much the parent has consumed.
    const p = createRng(42);
    for (let i = 0; i < 17; i++) p.uniform();
    const f3 = p.fork('counts');
    expect(Array.from({ length: 50 }, () => f3.normal())).toEqual(s1);
  });

  it('uniform has mean 1/2 and variance 1/12', () => {
    const r = createRng('u');
    const n = 200_000;
    const xs = Array.from({ length: n }, () => r.uniform());
    expect(Math.min(...xs.slice(0, 1000))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs.slice(0, 1000))).toBeLessThan(1);
    const { m, v } = moments(xs);
    expect(Math.abs(m - 0.5)).toBeLessThan(K * Math.sqrt(1 / 12 / n));
    expect(Math.abs(v - 1 / 12)).toBeLessThan(K * Math.sqrt((1 / 80 - 1 / 144) / n)); // uniform mu4 = 1/80
  });

  it('normal has mean 0 and variance 1', () => {
    const r = createRng('n');
    const n = 200_000;
    const { m, v } = moments(Array.from({ length: n }, () => r.normal()));
    expect(Math.abs(m)).toBeLessThan(K * Math.sqrt(1 / n));
    expect(Math.abs(v - 1)).toBeLessThan(K * Math.sqrt(2 / n)); // normal: mu4 - sigma^4 = 2
  });

  for (const lambda of [3, 50, 1e4, 1e6, 3e7]) {
    it(`poisson(${lambda}) has mean and variance lambda`, () => {
      const r = createRng(`p${lambda}`);
      const n = 100_000;
      const xs = Array.from({ length: n }, () => r.poisson(lambda));
      expect(xs.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
      const { m, v } = moments(xs);
      expect(Math.abs(m - lambda)).toBeLessThan(K * Math.sqrt(lambda / n));
      // Poisson: mu4 = lambda (1 + 3 lambda), so mu4 - sigma^4 = lambda + 2 lambda^2.
      expect(Math.abs(v - lambda)).toBeLessThan(K * Math.sqrt((lambda + 2 * lambda * lambda) / n));
    });
  }

  it('poisson small-lambda probabilities match the pmf (lambda = 3)', () => {
    const r = createRng('pmf');
    const n = 200_000;
    const counts = new Array<number>(20).fill(0);
    for (let i = 0; i < n; i++) {
      const k = r.poisson(3);
      if (k < 20) counts[k] = (counts[k] as number) + 1;
    }
    let pk = Math.exp(-3);
    for (let k = 0; k < 10; k++) {
      if (k > 0) pk *= 3 / k;
      const se = Math.sqrt((pk * (1 - pk)) / n); // binomial standard error of a frequency
      expect(Math.abs((counts[k] as number) / n - pk)).toBeLessThan(K * se);
    }
  });
});
