// The Spot's result headlines (M4 step 7e): which reading leads each confirmed result, and one plain sentence.
import type { HeadlineDef } from '../../ui/headline';

export const SPOT_HEADLINES: Record<string, HeadlineDef> = {
  'spot.find': { from: { reading: 'times the background' }, sentence: 'The counts rise this many times above the background: something radioactive lies under the gold.' },
  'spot.age': { from: { reading: 'age' }, sentence: 'The uranium was laid down this long ago.' },
  'spot.purity': { from: { reading: 'fitted age' }, sentence: 'From a pure start both clocks agree on one age: the uranium was laid down pure.' },
};
