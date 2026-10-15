import { describe, expect, it } from 'vitest';
import {
  brentRoot, chiSquareCdf, chiSquareSf, clopperPearson, incompleteBeta, lnGamma, mean, normalCdf, normalQuantile, sd,
  weightedMean, wilsonInterval,
} from './stats';

function binomPmf(k: number, n: number, p: number): number {
  return Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

describe('stats: published values', () => {
  it('normal quantile and CDF', () => {
    // Abramowitz and Stegun table 26.5 / any 16-digit reference: z_0.975 = 1.959963984540054.
    expect(Math.abs(normalQuantile(0.975) - 1.959963984540054)).toBeLessThan(1e-12);
    expect(Math.abs(normalQuantile(0.5))).toBeLessThan(1e-15);
    // z_0.999 = 3.090232306167813; z_1e-10 = -6.361340902404056 (tail branch).
    expect(Math.abs(normalQuantile(0.999) - 3.090232306167813)).toBeLessThan(1e-11);
    expect(Math.abs(normalQuantile(1e-10) + 6.361340902404056)).toBeLessThan(1e-9);
    // Phi(1.96) = 0.9750021048517795; Phi(-3) = 0.0013498980316301 (A and S 26.2.17 tables).
    expect(Math.abs(normalCdf(1.96) - 0.9750021048517795)).toBeLessThan(1e-14);
    expect(Math.abs(normalCdf(-3) / 0.0013498980316301 - 1)).toBeLessThan(1e-12);
  });

  it('chi-square CDF', () => {
    // 95th percentiles: 1 dof 3.841458820694124, 2 dof 5.991464547107979 (NIST/SEMATECH table 1.3.6.7.4).
    expect(Math.abs(chiSquareCdf(3.841458820694124, 1) - 0.95)).toBeLessThan(1e-13);
    expect(Math.abs(chiSquareCdf(5.991464547107979, 2) - 0.95)).toBeLessThan(1e-13);
    // 2 dof has the closed form 1 - exp(-x/2); the tail must stay accurate far out.
    expect(Math.abs(chiSquareSf(100, 2) / Math.exp(-50) - 1)).toBeLessThan(1e-12);
    expect(chiSquareSf(3000, 1)).toBeLessThan(1e-300);
  });

  it('lnGamma matches factorials', () => {
    expect(Math.abs(lnGamma(11) - Math.log(3628800))).toBeLessThan(1e-12);
    expect(Math.abs(lnGamma(0.5) - 0.5 * Math.log(Math.PI))).toBeLessThan(1e-14);
  });

  it('Wilson and Clopper-Pearson intervals reproduce Newcombe 1998 (Stat. Med. 17, 857), table I', () => {
    // 81/263: Wilson 0.2553-0.3662, exact 0.2527-0.3676; 15/148: Wilson 0.0624-0.1605, exact 0.0578-0.1617.
    // Tolerance: half a unit in the fourth decimal, as printed.
    const w1 = wilsonInterval(81, 263);
    const c1 = clopperPearson(81, 263);
    const w2 = wilsonInterval(15, 148);
    const c2 = clopperPearson(15, 148);
    for (const [got, want] of [
      [w1.lo, 0.2553], [w1.hi, 0.3662], [c1.lo, 0.2527], [c1.hi, 0.3676],
      [w2.lo, 0.0624], [w2.hi, 0.1605], [c2.lo, 0.0578], [c2.hi, 0.1617],
    ] as const) {
      expect(Math.abs(got - want)).toBeLessThanOrEqual(0.00005);
    }
  });

  it('Clopper-Pearson satisfies its defining tail equations and closed forms', () => {
    const n = 20;
    const k = 7;
    const { lo, hi } = clopperPearson(k, n);
    let upperTail = 0;
    let lowerTail = 0;
    for (let j = k; j <= n; j++) upperTail += binomPmf(j, n, lo);
    for (let j = 0; j <= k; j++) lowerTail += binomPmf(j, n, hi);
    expect(Math.abs(upperTail - 0.025)).toBeLessThan(1e-12);
    expect(Math.abs(lowerTail - 0.025)).toBeLessThan(1e-12);
    // k = 0: upper limit 1 - 0.025^(1/n) exactly.
    expect(Math.abs(clopperPearson(0, 10).hi - (1 - Math.pow(0.025, 0.1)))).toBeLessThan(1e-12);
    expect(Math.abs(incompleteBeta(0.3, 2, 3) - 0.3483)).toBeLessThan(1e-12); // I_0.3(2,3) = 0.3483 exactly
  });

  it('brentRoot, mean, sd and weighted mean', () => {
    expect(Math.abs(brentRoot((x) => x * x - 2, 0, 2) - Math.SQRT2)).toBeLessThan(1e-12);
    expect(Math.abs(brentRoot((x) => Math.cos(x) - x, 0, 1) - 0.7390851332151607)).toBeLessThan(1e-12);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9]) - Math.sqrt(32 / 7))).toBeLessThan(1e-14);
    const w = weightedMean([1, 3], [1, 1]);
    expect(w.mean).toBe(2);
    expect(Math.abs(w.sigma - Math.SQRT1_2)).toBeLessThan(1e-15);
  });
});
