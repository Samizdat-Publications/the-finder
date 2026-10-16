// Start over's seed choice (D-A28): the next seed from the validated list, cycling; never a time-based seed;
// an old save whose seed is not validated moves to the next validated seed on load, its confirmed deductions
// kept (M4 step 7e). Check ids: game.startOverSeed, game.oldSaveSeed.
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

    recordCheck({
      id: 'game.startOverSeed',
      claim: 'Start over takes the next seed from the validated list (data/seeds.json), cycling, never a seed made from the clock.',
      measured: `three resets from the default seed gave ${seen.join(', ')}; from the last of ${PLAYTHROUGH_SEEDS.length} listed seeds the next is the first`,
      expected: 'the list order (tools/seeds/build-seeds.mjs tries finder-2, finder-3, ... in order)',
      tolerance: 'exact',
      pass: true,
    });
  });

  it('an old save with a seed outside the list moves to the next validated seed and keeps what it confirmed', () => {
    const reading = { key: 'age', value: 1.39e12, dim: 'time' };
    const nodes = {
      'arrival.purpose': { confirmed: true, attempts: [{ answer: 'radio', ok: true, result: [reading], message: 'kept', at: 5 }], hints: 1 },
      'map.periods': { confirmed: false, attempts: [{ answer: { line: 1, jname: 'J0' }, ok: false, result: [], message: 'refused', at: 6 }], hints: 0 },
    };
    const old = migrate({ version: 1, nodes, chapter: 'hub', settings: {}, seed: 'finder-1697000000000' });
    // The time-based seed is not listed: the next validated seed is the list's first (nextSeed).
    expect(old?.seed).toBe(PLAYTHROUGH_SEEDS[0]);
    expect(old?.nodes['arrival.purpose']).toEqual(nodes['arrival.purpose']);
    expect(old?.nodes['map.periods']).toEqual(nodes['map.periods']);
    // A listed seed and the default seed stay as they are.
    const listed = PLAYTHROUGH_SEEDS[17] as string;
    expect(migrate({ version: 1, nodes: {}, chapter: 'hub', settings: {}, seed: listed })?.seed).toBe(listed);
    expect(migrate({ version: 1, nodes: {}, chapter: 'hub', settings: {}, seed: DEFAULT_SEED })?.seed).toBe(DEFAULT_SEED);
    expect(migrate({ version: 1, nodes: {}, chapter: 'hub', settings: {} })?.seed).toBe(DEFAULT_SEED);
    recordCheck({
      id: 'game.oldSaveSeed',
      claim: 'A save made by Start over before the validated list (a time-based seed, about 1.3% of which fail a check) moves to the next validated seed when it loads; deductions it confirmed stay confirmed with the readings they recorded.',
      measured: `finder-1697000000000 loads as ${old?.seed}; the confirmed arrival.purpose and its reading kept, the refused attempt kept; a listed seed and the default seed unchanged`,
      expected: 'the first seed of data/seeds.json (nextSeed of a seed not in the list), records unchanged',
      tolerance: 'exact',
      pass: true,
    });
  });
});
