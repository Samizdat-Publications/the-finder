// The Player's result headlines (M4 step 7e): which reading leads each confirmed result, and one plain sentence.
import type { HeadlineDef } from '../../ui/headline';

export const PLAYER_HEADLINES: Record<string, HeadlineDef> = {
  'player.speed': { from: { reading: 'turn time on the cover' }, sentence: "The platter turns once in the time written round the disc's edge." },
  'player.start': { from: { reading: 'needle radius' }, sentence: 'The needle starts in the groove at the outer edge, where the cover draws it.' },
  'player.direction': { from: { reading: 'groove carries the needle' }, sentence: 'Turned this way the spiral carries the needle in from the rim: the side plays forward.' },
  'player.firstSound': { from: { reading: 'repeats every' }, sentence: "A short shape repeats this often, like the cover's picture line: the first sound is a picture." },
};
