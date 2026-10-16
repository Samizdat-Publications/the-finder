// The epoch Worker's parts (M4 step 7e): what the Worker computes and posts back (computePart, through a
// structured clone as postMessage does) is exactly what the model's own getters give for the same inputs and
// seed, so moving the heavy parts off the main thread changes no number the player sees or any checker
// reads. A deferred model refuses a heavy part it does not hold yet (asking for it), and holds it once primed.

import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../../tests/support/data';
import { DEFAULT_SEED } from '../../game/deductions';
import { computePart } from './epochCompute';
import { buildEpochModel, type HeavyPart } from './epochModel';

const inputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };
const local = buildEpochModel(inputs, DEFAULT_SEED);
/** What the main thread receives: postMessage's structured clone. */
const posted = (part: Parameters<typeof computePart>[2]) => structuredClone(computePart(inputs, DEFAULT_SEED, part));

describe('the epoch Worker parts', () => {
  it('a deferred model built on the posted catalogue holds the same numbers once primed', () => {
    const asked: HeavyPart[] = [];
    const m = buildEpochModel(inputs, DEFAULT_SEED, { pre: posted('alien'), request: (p) => asked.push(p) });
    expect(m.alien).toEqual(local.alien);
    // Not primed: each heavy getter asks for its part and refuses, so a checker refuses instead of blocking.
    expect(() => m.identification()).toThrow(/Still measuring/);
    expect(() => m.region()).toThrow(/Still measuring/);
    expect(() => m.trailRows()).toThrow(/Still measuring/);
    expect(asked).toEqual(['identification', 'region', 'trail']);
    expect(m.has('identification')).toBe(false);

    m.prime(posted('identification'));
    m.prime(posted('region'));
    m.prime(posted('trail'));
    expect(m.has('identification') && m.has('region') && m.has('trail')).toBe(true);
    // Exact equality, number for number (toEqual on the full objects).
    expect(m.identification()).toEqual(local.identification());
    expect(m.region()).toEqual(local.region());
    expect(m.motionFit()).toEqual(local.motionFit());
    expect(m.ages('own')).toEqual(local.ages('own'));
    expect(m.trailRows()).toEqual(local.trailRows());
    // The light parts computed here on the posted catalogue agree as well.
    expect(m.ages('sun')).toEqual(local.ages('sun'));
    expect(m.trailAcceptCut(0)).toBe(local.trailAcceptCut(0));
    expect(asked.length).toBe(3);
  });
});
