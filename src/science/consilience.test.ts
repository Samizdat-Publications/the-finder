// Consilience (Portrait): the combination of clocks against cases worked by hand. Check id: consilience.math.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { Z95, bandHalfWidth, combineClocks, combineGls, covarianceOf, outsideCount, sigmaFacing } from './consilience';

describe('consilience: combining clocks', () => {
  it('matches the inverse-variance mean, its sigma, the chi-square and its p value worked by hand', () => {
    // By hand: values 10, 12, 14 with sigmas 1, 2, 2. Weights 1, 1/4, 1/4 (sum 3/2):
    //   m = (10 + 12/4 + 14/4) / (3/2) = 11; sigma_m = sqrt(2/3) = 0.816497;
    //   chi-square = (10-11)^2/1 + (12-11)^2/4 + (14-11)^2/4 = 1 + 0.25 + 2.25 = 3.5 on 2 degrees of freedom;
    //   for 2 degrees of freedom the upper tail is exp(-x/2): p = exp(-1.75) = 0.173774.
    const g = combineGls([10, 12, 14], covarianceOf([1, 2, 2]));
    expect(g.mean).toBeCloseTo(11, 12);
    expect(g.sigma).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(g.chi2).toBeCloseTo(3.5, 12);
    expect(g.dof).toBe(2);
    expect(g.p).toBeCloseTo(Math.exp(-1.75), 10);
    expect(g.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(g.weights[0]).toBeCloseTo(2 / 3, 12);

    // Correlated, by hand: x = (0, 1), sigmas 1 and 1, rho 0.5. C^-1 = (1/0.75) [[1, -0.5], [-0.5, 1]];
    //   1'C^-1 1 = 4/3, so sigma_m = sqrt(3/4) = 0.866025 and m = 0.5 (by symmetry);
    //   d = (-0.5, 0.5), C^-1 d = (-1, 1), chi-square = 1 on 1 degree of freedom, p = 0.317311 (two-sided 1 sigma).
    const c = combineGls([0, 1], covarianceOf([1, 1], [{ a: 0, b: 1, rho: 0.5 }]));
    expect(c.mean).toBeCloseTo(0.5, 12);
    expect(c.sigma).toBeCloseTo(Math.sqrt(0.75), 12);
    expect(c.chi2).toBeCloseTo(1, 12);
    expect(c.p).toBeCloseTo(0.3173105, 6);

    // Asymmetric intervals: the side facing the combined value. Clock A 100 (95%: 80 to 140), clock B 130 (95%:
    // 110 to 150). Settled by hand: m lies between them, so A's upper half (40) and B's lower half (20) face it:
    //   sigma_A = 40/1.96, sigma_B = 20/1.96; weights 1/1600 : 1/400 = 1 : 4; m = (100 + 4 x 130)/5 = 124.
    const clocks = [
      { id: 'A', estimate: 100, lo: 80, hi: 140 },
      { id: 'B', estimate: 130, lo: 110, hi: 150 },
    ];
    const k = combineClocks(clocks);
    expect(k.mean).toBeCloseTo(124, 10);
    expect(k.sigmas[0]).toBeCloseTo(40 / Z95, 12);
    expect(k.sigmas[1]).toBeCloseTo(20 / Z95, 12);
    expect(k.sigma).toBeCloseTo(1 / Math.sqrt(Z95 ** 2 / 1600 + Z95 ** 2 / 400), 10);
    expect(sigmaFacing(clocks[0]!, 90)).toBeCloseTo(20 / Z95, 12);
    expect(outsideCount(clocks, 105)).toBe(1);
    expect(outsideCount(clocks, 200)).toBe(2);
    // The 99.9% two-sided band is 3.2905 sigma (normal tables); 95% is 1.96 sigma.
    expect(bandHalfWidth(1, 0.999)).toBeCloseTo(3.290527, 5);
    expect(bandHalfWidth(1, 0.95)).toBeCloseTo(1.959964, 5);

    recordCheck({
      id: 'consilience.math',
      claim: 'Portrait combines its clocks by inverse-variance weighting (generalised least squares when two clocks share an error) and judges their agreement by a chi-square, and both agree with cases worked by hand.',
      measured: `10, 12, 14 (sigmas 1, 2, 2): mean ${g.mean.toFixed(6)}, sigma ${g.sigma.toFixed(6)}, chi-square ${g.chi2.toFixed(6)}, p ${g.p.toFixed(6)}; correlated pair (rho 0.5): mean ${c.mean}, sigma ${c.sigma.toFixed(6)}, chi-square ${c.chi2.toFixed(6)}; asymmetric pair: mean ${k.mean.toFixed(6)} after ${k.iterations + 1} passes`,
      expected: 'by hand: 11, 0.816497, 3.5, exp(-1.75) = 0.173774; 0.5, 0.866025, 1; 124 (the sides facing the combined value)',
      tolerance: '1e-10 (floating point; the formulas are exact)',
      pass: true,
    });
  });

  it('refuses intervals that do not enclose their estimate, and a non-positive-definite covariance', () => {
    expect(() => sigmaFacing({ id: 'x', estimate: 5, lo: 6, hi: 9 }, 1)).toThrow(/enclose/);
    expect(() => combineGls([0, 1], [[1, 2], [2, 1]])).toThrow(/positive definite/);
  });
});
