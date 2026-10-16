// The Trail's result headlines (M4 step 7e): which reading or message quantity leads each confirmed result,
// and one plain sentence. The Trail's readings write times and distances as text, so its quantities come from
// the message's tokens (the same numbers the message prints).
import type { HeadlineDef } from '../../ui/headline';

export const TRAIL_HEADLINES: Record<string, HeadlineDef> = {
  'trail.origin': { from: { reading: 'star' }, sentence: 'The machine flies straight away from this star, within its errors.' },
  // The confirmed message gives the proposed meeting time first, then the measured distance over speed.
  'trail.age': { from: { token: 1, label: 'distance over speed' }, sentence: 'Distance over speed: the machine left that star this long ago.' },
  'trail.neighbour': { from: { token: 0, label: 'distance from your star' }, sentence: 'The star it came from is your neighbour.' },
  'trail.where': { from: { reading: 'stars in the region' }, sentence: 'One of these stars drew the map, and the trail picks out which.' },
  'trail.when': { from: { token: 0, label: "map's age" }, sentence: 'In the frame of the star it came from, the old pulsars agree: the map was made this long ago.' },
};
