// The Voices' result headlines: which reading leads each confirmed result, and one plain sentence (no numbers).
import type { HeadlineDef } from '../../ui/headline';

export const VOICES_HEADLINES: Record<string, HeadlineDef> = {
  'voices.many': { from: { reading: 'separate voices counted' }, sentence: 'Many voices, one after another: a few dozen at least, high and low.' },
  'voices.hearing': { from: { reading: 'falls into the noise' }, sentence: 'Their voices reach at least this high before the disc\'s own hiss: they hear at least this much.' },
  'voices.octave': { from: { reading: 'steps in it' }, sentence: 'Their music repeats at a doubled frequency, and the doubling is cut into this many equal steps.' },
  'voices.others': { from: { reading: 'longest call' }, sentence: 'Long sliding calls, higher than any speaker holds: another animal of their world, singing.' },
};
