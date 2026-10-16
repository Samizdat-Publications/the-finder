// The Voices' result headlines: which reading leads each confirmed result, and one plain sentence (no numbers).
import type { HeadlineDef } from '../../ui/headline';

export const VOICES_HEADLINES: Record<string, HeadlineDef> = {
  'voices.many': { from: { reading: 'stretches of voice between pauses' }, sentence: 'Many voices, one after another: a few dozen at least, high and low.' },
  'voices.hearing': { from: { reading: 'falls into the hiss' }, sentence: 'Their voices stand above the disc\'s own hiss up to about this pitch: they make sounds at least this high.' },
  'voices.octave': { from: { reading: 'steps in it' }, sentence: 'Their notes come back at a doubled frequency, and the doubling is cut into this many equal steps.' },
  'voices.others': { from: { reading: 'longest call' }, sentence: 'Long sliding calls where nobody speaks, higher than any speaker holds: another animal of their world.' },
};
