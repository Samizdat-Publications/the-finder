// The Pictures' result headlines (M4 step 7e; M5 step 3 adds the album and the teaching pictures): which reading leads each confirmed result, and one plain sentence.
import type { HeadlineDef } from '../../ui/headline';

export const PICTURES_HEADLINES: Record<string, HeadlineDef> = {
  'pictures.lineTime': { from: { reading: 'line time' }, sentence: 'One picture line lasts this long: the picture stands straight.' },
  'pictures.sync': { from: { reading: 'wobble now' }, sentence: 'Each line now starts at its own pulse: the edges stand still.' },
  'pictures.interlace': { from: { reading: 'even and odd shift' }, sentence: 'The even and odd lines now line up: the jagged edges are gone.' },
  'pictures.polarity': { from: { reading: 'frames with dark mounts' }, sentence: 'Read with more signal darker, the mounts come out dark: the brightness is the right way round.' },
  'pictures.aspect': { from: { reading: 'axis ratio' }, sentence: "The calibration figure's width over its height: it comes out round." },
  'pictures.circle': { from: { reading: 'axis ratio' }, sentence: 'The calibration circle comes out true: whoever made this sees.' },
  'pictures.firstFrames': { from: { reading: 'pictures developed' }, sentence: 'The same settings develop the next pictures.' },
  // M5: the pictures complete
  'pictures.album': { from: { reading: 'frames developed' }, sentence: 'Every frame of the side, developed from the tape with the settings that made the circle round.' },
  'pictures.colour': { from: { reading: 'probable order' }, sentence: 'One scene three times: stacked as three primaries it is a colour picture. The order is probable, not proven.' },
  'pictures.down': { from: { reading: 'turned frames on the side' }, sentence: 'Turned upright: the same turn rights every picture stored on its side.' },
  'pictures.numerals': { from: { reading: 'their base' }, sentence: 'They count by place: this many of one place make one of the next.' },
  'pictures.units': { from: { reading: 'their second' }, sentence: 'Their second, counted in spin flips of hydrogen: the root of every unit they use.' },
  'pictures.home': { from: { reading: 'place outward' }, sentence: 'The column of ones is theirs: this many worlds out from their star.' },
  'pictures.slip': { from: { reading: 'must be more than' }, sentence: 'The outermost distance breaks the order; from the order alone it must be more than this.' },
  'pictures.height': { from: { reading: 'their heights' }, sentence: 'The two figures, measured in your own reaches.' },
};
