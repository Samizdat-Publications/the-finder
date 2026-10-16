// Start over's seed choice (D-A28): the next seed from the validated list, cycling; never a time-based seed;
// an old save keeps its own seed. Check id: game.startOverSeed.
import { beforeEach, describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { dispatch } from './bus';
import { DEFAULT_SEED, clearCheckers, installTestCheckers } from './deductions';
import { resetAll, setClock } from './gameService';
import { migrate } from './save';
import { PLAYTHROUGH_SEEDS, nextSeed } from './seeds';
import { game } from './state';

beforeEach(() => {
  resetAll();
  clearCheckers();
  installTestCheckers();
  let t = 1_700_000_000_000;
  setClock(() => (t += 1));
});

describe('Start over takes its seed from the validated list', () => {
  it('nextSeed cycles through the list and starts it from any seed not in it', () => {
    const list = ['a', 'b', 'c'];
    expect(nextSeed('a', list)).toBe('b');
    expect(nextSeed('c', list)).toBe('a'); // cycles after the last
    expect(nextSeed(DEFAULT_SEED, list)).toBe('a');
    expect(nextSeed('finder-1697000000000', list)).toBe('a'); // a time-based seed from an old save
    expect(() => nextSeed('a', [])).toThrow(/empty/);
  });

  it('save.reset walks the list in order, whatever the clock says', async () => {
    expect(PLAYTHROUGH_SEEDS.length).toBeGreaterThanOrEqual(200); // the spec's minimum
    expect(PLAYTHROUGH_SEEDS).not.toContain(DEFAULT_SEED);
    expect(game.seed.value).toBe(DEFAULT_SEED);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      await dispatch({ type: 'save.reset' });
      seen.push(game.seed.value);
    }
    expect(seen).toEqual(PLAYTHROUGH_SEEDS.slice(0, 3));
    // From the last listed seed it cycles back to the first.
    game.seed.value = PLAYTHROUGH_SEEDS[PLAYTHROUGH_SEEDS.length - 1] as string;
    await dispatch({ type: 'save.reset' });
    expect(game.seed.value).toBe(PLAYTHROUGH_SEEDS[0]);
    // An old save keeps the seed it carries, even one that is not in the list.
    const old = migrate({ version: 1, nodes: {}, chapter: 'hub', settings: {}, seed: 'finder-1697000000000' });
    expect(old?.seed).toBe('finder-1697000000000');
    recordCheck({
      id: 'game.startOverSeed',
      claim: 'Start over takes the next seed from the validated list (data/seeds.json), cycling, never a seed made from the clock; an old save keeps its own seed.',
      measured: `three resets from the default seed gave ${seen.join(', ')}; from the last of ${PLAYTHROUGH_SEEDS.length} listed seeds the next is the first; an old save's time-based seed is kept`,
      expected: 'the list order (tools/seeds/build-seeds.mjs tries finder-2, finder-3, ... in order)',
      tolerance: 'exact',
      pass: true,
    });
  });
});
