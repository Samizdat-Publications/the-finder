// The validated seed list (D-A28, data/seeds.json): re-verifies the default seed, a spread sample of the listed
// seeds and one excluded seed per reason with the game's own checkers (seedCheck.ts verifySeed), and checks the
// file's bookkeeping. The full list is built by tools/seeds/build-seeds.mjs (about 8 minutes on 15 workers);
// re-verifying all of it here would take over an hour of CPU, so a sample is played. Check ids: seeds.validated,
// trail.acceptRates.
import { describe, expect, it } from 'vitest';
import seedsJson from '../../data/seeds.json';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { DEFAULT_SEED } from '../game/deductions';
import { candidateSeed, verifySeed } from './seedCheck';

interface SeedsFile {
  meta: {
    candidates: number;
    listed: number;
    excluded: { total: number; byCheck: Record<string, number>; seeds: { seed: string; failed: { id: string; message: string }[] }[] };
    rates: Record<string, number | string>;
  };
  seeds: string[];
}
const file = seedsJson as unknown as SeedsFile;
const inputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };

describe('the validated seed list', () => {
  it('lists every candidate once, either as a seed or as an exclusion with its reason', () => {
    const { meta, seeds } = file;
    const excluded = meta.excluded.seeds.map((e) => e.seed);
    expect(seeds.length).toBe(meta.listed);
    expect(excluded.length).toBe(meta.excluded.total);
    expect(seeds.length + excluded.length).toBe(meta.candidates);
    const all = new Set([...seeds, ...excluded]);
    expect(all.size).toBe(meta.candidates);
    for (let k = 0; k < meta.candidates; k++) expect(all.has(candidateSeed(k))).toBe(true);
    // In the order the builder tried them.
    const index = (s: string): number => Number(s.slice('finder-'.length));
    expect(seeds.every((s, i) => i === 0 || index(s) > index(seeds[i - 1] as string))).toBe(true);
    expect(seeds).not.toContain(DEFAULT_SEED);
    expect(seeds.length).toBeGreaterThanOrEqual(200); // the spec's minimum
  });

  it('the default seed, a sample of the listed seeds and one excluded seed per reason replay as the file says', () => {
    const { meta, seeds } = file;
    // The first, the last and three spread between: the sample covers the whole list.
    const sample = [DEFAULT_SEED, ...[0, 0.25, 0.5, 0.75, 1].map((f) => seeds[Math.round(f * (seeds.length - 1))] as string)];
    const passed = sample.map((s) => verifySeed(inputs, s));
    for (const v of passed) expect(v.ok, `${v.seed}: ${JSON.stringify(v.failed)}`).toBe(true);
    // One excluded seed for each check that excluded any: it must fail again, on the same checks.
    const reasons = Object.keys(meta.excluded.byCheck);
    const replayed: string[] = [];
    for (const id of reasons) {
      const e = meta.excluded.seeds.find((x) => x.failed.some((f) => f.id === id))!;
      if (replayed.includes(e.seed)) continue;
      const v = verifySeed(inputs, e.seed);
      expect(v.failed.map((f) => f.id)).toEqual(e.failed.map((f) => f.id));
      replayed.push(e.seed);
    }
    const share = meta.excluded.total / meta.candidates;
    const by = Object.entries(meta.excluded.byCheck).map(([k, n]) => `${k} ${n}`).join(', ');
    recordCheck({
      id: 'seeds.validated',
      claim: 'Start over only hands out seeds whose every check can be passed: each listed seed was played with every seed-reading checker\'s right answer (the answers the instruments lead to) and all of them confirm.',
      measured: `${meta.listed} of ${meta.candidates} candidate seeds listed; ${meta.excluded.total} excluded (${(share * 1000).toFixed(0)} in 1,000), by check: ${by}; replayed now: the default seed and ${sample.length - 1} listed seeds confirm everything, and excluded seeds ${replayed.join(', ')} fail again on the same checks`,
      expected: 'every listed seed confirms (the builder\'s verdict, reproduced on a sample); exclusions come from measurement noise only',
      tolerance: 'exact (verdicts)',
      pass: true,
      notes: `Rates over all ${meta.candidates} candidates: ${JSON.stringify(Object.fromEntries(Object.entries(meta.rates).filter(([k]) => k !== 'note')))}. The Key, The Player and The Pictures never read the seed.`,
    });
  }, 300_000);

  it('records how often the true origin lands beyond each cut over the candidates (trail.origin and trail.where at 99.9%)', () => {
    const { meta } = file;
    const r = meta.rates as Record<string, number>;
    const N = meta.candidates;
    // Three binomial standard errors above 0.1% over N candidates; 5% within 3 binomial standard errors.
    const tol999 = 3 * Math.sqrt((0.001 * 0.999) / N);
    const tol95 = 3 * Math.sqrt((0.05 * 0.95) / N);
    const originOk = (r.trailOriginBeyond999 as number) / N <= 0.001 + tol999 && Math.abs((r.trailOriginBeyond95 as number) / N - 0.05) <= tol95;
    const whereOk = (r.trailWhereBeyond999 as number) / N <= 0.001 + tol999;
    recordCheck({
      id: 'trail.acceptRates',
      claim: 'Over the whole game\'s candidate seeds, the true origin is refused by trail.origin and trail.where at the 99.9% level about 1 time in 1,000 or less, while the drawn 95% cut and region are honest 95% ones.',
      measured: `over ${N} seeds: the warm-white star beyond its 95% cut ${r.trailOriginBeyond95} times, beyond its 99.9% cut ${r.trailOriginBeyond999}; outside the drawn 95% region ${r.trailWhereBeyond95} times, outside the 99.9% contour ${r.trailWhereBeyond999} (largest contour reached ${(100 * (r.trailWhereContourMax as number)).toFixed(1)}%)`,
      expected: '5% and 0.1% for the trail angle (its null distribution, by construction); at most 0.1% beyond the 99.9% contour for the region',
      tolerance: `0.1% plus 3 binomial standard errors (${(tol999 * 100).toFixed(2)} points); 5% within ${(tol95 * 100).toFixed(2)} points`,
      pass: originOk && whereOk,
      notes: 'From data/seeds.json meta.rates (the full game model per seed: the alien\'s measured observer, its pulsar catalogue, the region from 2,000 draws, the trail from 2,000 draws and the 99.9% cut from 20,000). The region holds the Sun far inside in every seed: its size comes from the map\'s own bearing scatter, which is fixed by the cover, not by the seed.',
    });
    expect(originOk).toBe(true);
    expect(whereOk).toBe(true);
  });
});
