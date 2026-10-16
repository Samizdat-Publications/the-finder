// The Map's result headlines (M4 step 7e): which reading leads each confirmed result, and one plain sentence.
import type { HeadlineDef } from '../../ui/headline';

export const MAP_HEADLINES: Record<string, HeadlineDef> = {
  'map.periods': { from: { reading: 'match quality' }, sentence: "The odds that this line's pulsar is the one it points to, against every other along it." },
  'map.old': { from: { reading: 'years ago' }, sentence: 'The pulsars have slowed since: the map was drawn this long ago.' },
  'map.identify': {
    // map.identify lists one reading per line that holds its most likely pulsar ("line 1", "line 2", ...).
    from: { count: (r) => r.filter((x) => /^line \d+$/.test(x.key)).length, label: 'lines with their pulsar' },
    sentence: 'Every line on the map has its most likely pulsar.',
  },
  'map.motion': { from: { reading: 'your speed' }, sentence: "You move this fast against the map's makers: that is why the lines told different ages." },
  'map.region': { from: { reading: 'stars inside then' }, sentence: 'The map was drawn from one of the stars inside its region.' },
};
