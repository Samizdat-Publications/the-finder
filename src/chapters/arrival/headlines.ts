// Arrival's result headlines (M4 step 7e): which of each checker's readings leads a confirmed result, and the
// plain sentence under it (no numbers: the number is the checker's).
import type { HeadlineDef } from '../../ui/headline';

export const ARRIVAL_HEADLINES: Record<string, HeadlineDef> = {
  'arrival.purpose': { from: { reading: 'dish diameter' }, sentence: 'A dish this wide faces back along the path it came: a radio, made to talk to whoever sent it.' },
  'arrival.heat': { from: { reading: 'time away from every star' }, sentence: 'Away from every star at least this long and still warm: the heat comes from decaying atoms.' },
  'arrival.madeNotMined': { from: { reading: 'orders of magnitude apart' }, sentence: "Orders of magnitude short of nature's share of uranium-238: the fuel was made, not mined." },
  'arrival.fuelAge': { from: { reading: 'age' }, sentence: 'The heat source was made this long ago.' },
};
