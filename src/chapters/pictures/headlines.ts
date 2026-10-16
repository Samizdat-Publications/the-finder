// The Pictures' result headlines (M4 step 7e): which reading leads each confirmed result, and one plain sentence.
import type { HeadlineDef } from '../../ui/headline';

export const PICTURES_HEADLINES: Record<string, HeadlineDef> = {
  'pictures.lineTime': { from: { reading: 'line time' }, sentence: 'One picture line lasts this long: the picture stands straight.' },
  'pictures.sync': { from: { reading: 'wobble now' }, sentence: 'Each line now starts at its own pulse: the edges stand still.' },
  'pictures.interlace': { from: { reading: 'even and odd shift' }, sentence: 'The even and odd lines now line up: the jagged edges are gone.' },
  'pictures.polarity': { from: { reading: 'frames with dark mounts' }, sentence: 'Read with more signal darker, the mounts come out dark: the brightness is the right way round.' },
  'pictures.aspect': { from: { reading: 'axis ratio' }, sentence: "The calibration figure's width over its height: it comes out round." },
  'pictures.circle': { from: { reading: 'axis ratio' }, sentence: 'The calibration circle comes out true: whoever made this sees.' },
  'pictures.firstFrames': { from: { reading: 'pictures developed' }, sentence: 'The same settings develop the next pictures.' },
};
