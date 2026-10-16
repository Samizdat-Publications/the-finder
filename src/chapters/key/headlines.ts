// The Key's result headlines (M4 step 7e): which reading leads each confirmed result, and one plain sentence.
import type { HeadlineDef } from '../../ui/headline';

export const KEY_HEADLINES: Record<string, HeadlineDef> = {
  'key.binary': { from: { reading: 'number round the disc' }, sentence: 'The strokes are binary digits: read that way, this is the number round the disc.' },
  'key.unit': { from: { reading: 'one turn of the disc' }, sentence: "With hydrogen's spin flip as the unit, the disc turns once in this time: a speed a hand could build." },
  'key.timesNotLengths': { from: { reading: 'smallest length over the craft' }, sentence: 'Read as lengths, even the smallest number is this many times the whole craft: the numbers are times.' },
};
