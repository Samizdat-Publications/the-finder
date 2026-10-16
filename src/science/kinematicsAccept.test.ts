// trail.origin's acceptance at 99.9% (D-A28): the null's 99.9th percentile, computed on demand for one star
// (kinematics.ts trailNullQuantile, TRAIL_ACCEPT_DRAWS draws). Two checks: the estimate is stable for one star
// at that draw count, and over 2,000 seeded measurements the true origin (the Sun: the scenario's craft was
// launched from it) lands beyond the 99.9% cut about 0.1% of the time, and beyond the drawn 95% cut about 5%.
import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { discoveryState, homeObserver } from './epoch';
import { TRAIL_ACCEPT_DRAWS, TRAIL_ACCEPT_QUANTILE, trail, trailConsistent, trailNullQuantile } from './kinematics';
import { drawObserver } from './pulsarEpoch';
import { createRng } from './random';

const scenario = loadScenario();
const stars = loadStars();
const d = discoveryState(scenario, stars);
const observer = homeObserver(scenario, stars, d.decimalYear);
const sunStar = stars.near.find((s) => s.id === 0)!;
const sunOnly = { meta: {}, near: [sunStar], sky: [] };
// 10 pc and 2,000 draws: the game's trail (epochModel.ts TRAIL_MAX_DIST_PC, TRAIL_DRAWS).
const TRAIL = { maxDistPc: 10, draws: 2000 };

describe("trail.origin's 99.9% acceptance", () => {
  it('the 99.9% cut from 20,000 draws is stable for one star', () => {
    const row = trail(d.craft, sunOnly, observer, { ...TRAIL, seed: 'trail.acceptStable' })[0]!;
    const cuts = Array.from({ length: 10 }, (_, i) => trailNullQuantile(d.craft, observer, row, { q: TRAIL_ACCEPT_QUANTILE, draws: TRAIL_ACCEPT_DRAWS, seed: `trail.acceptStable/${i}` }));
    const mean = cuts.reduce((a, b) => a + b, 0) / cuts.length;
    const sd = Math.sqrt(cuts.reduce((a, b) => a + (b - mean) ** 2, 0) / (cuts.length - 1));
    const ratio = mean / row.nullAngle95Deg;
    console.log(`[trail.acceptStable] 99.9% cut ${mean.toFixed(4)} deg, sd ${(100 * sd / mean).toFixed(1)}% over 10 forks; ${ratio.toFixed(2)} times the 95% cut`);
    // A sample quantile's relative spread near the 99.9th percentile with 20 draws beyond it is about
    // 1 / sqrt(20) of the tail's scale, a few per cent of the cut; 5% is the stability the spec asks for.
    const pass = sd / mean < 0.05 && ratio > 1;
    recordCheck({
      id: 'trail.acceptCutStable',
      claim: "The 99.9% cut trail.origin accepts up to is estimated stably for one star: 20,000 null draws, computed on demand for the proposed star only.",
      measured: `the Sun's 99.9% cut ${mean.toFixed(4)} deg with a ${(100 * sd / mean).toFixed(1)}% spread over 10 independent forks; ${ratio.toFixed(2)} times its 95% cut`,
      expected: 'a spread of a few per cent (about 20 draws lie beyond the 99.9th percentile of 20,000)',
      tolerance: 'relative standard deviation under 5% (spec: stable for that one star)',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('over 2,000 seeded measurements the Sun lands beyond its 99.9% cut about 0.1% of the time', () => {
    const N = 2000;
    let beyond95 = 0;
    let beyond999 = 0;
    for (let r = 0; r < N; r++) {
      // Each trial redraws the alien's own measured state and the Sun's measured row (as epochModel.ts does).
      const obs = drawObserver(observer, createRng(`trail.accept/${r}`).fork('measure/observer'));
      const row = trail(d.craft, sunOnly, obs, { ...TRAIL, seed: `trail.accept/${r}/trail` })[0]!;
      if (!trailConsistent(row)) beyond95++;
      const cut = trailNullQuantile(d.craft, obs, row, { q: TRAIL_ACCEPT_QUANTILE, draws: TRAIL_ACCEPT_DRAWS, seed: `trail.accept/${r}/trail` });
      if (row.measuredAngleDeg > cut) beyond999++;
    }
    // Three binomial standard errors over N trials: 3 sqrt(p (1 - p) / N); 0.21 points at 0.1%, 1.46 points at 5%.
    const tol999 = 3 * Math.sqrt((0.001 * 0.999) / N);
    const tol95 = 3 * Math.sqrt((0.05 * 0.95) / N);
    const pass999 = beyond999 / N <= 0.001 + tol999;
    const pass95 = Math.abs(beyond95 / N - 0.05) <= tol95;
    console.log(`[trail.acceptCoverage] Sun beyond 95% cut ${beyond95} of ${N}; beyond 99.9% cut ${beyond999} of ${N}`);
    recordCheck({
      id: 'trail.acceptCoverage',
      claim: 'trail.origin accepts the star the machine truly flew from at the 99.9% level: over 2,000 seeded measurements its measured angle lands beyond the 99.9% cut about 1 time in 1,000 (and beyond the drawn 95% cut about 1 time in 20, where it is shown as consistent, at the edge).',
      measured: `beyond the 99.9% cut ${beyond999} of ${N} (${((beyond999 / N) * 100).toFixed(2)}%); beyond the 95% cut ${beyond95} of ${N} (${((beyond95 / N) * 100).toFixed(1)}%)`,
      expected: "0.1% and 5% (the null distribution's 99.9th and 95th percentiles, by construction)",
      tolerance: `at most 0.1% plus 3 binomial standard errors (${(tol999 * 100).toFixed(2)} points); 5% within 3 binomial standard errors (${(tol95 * 100).toFixed(2)} points)`,
      pass: pass999 && pass95,
      notes: 'Seeds trail.accept/0 to /1999; each trial redraws the observer and the Sun measurement; 2,000 null draws for the 95% cut and 20,000 for the 99.9% cut, as in the game. The rate for the whole game, trail.where included, is the seed list\'s (data/seeds.json meta.rates).',
    });
    expect(pass999).toBe(true);
    expect(pass95).toBe(true);
  }, 300_000);
});
