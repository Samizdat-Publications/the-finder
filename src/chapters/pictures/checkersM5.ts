// The Pictures, complete (M5 step 3): eight checkers over the album of decoded frames and the teaching pictures.
// Each reads what the decoder made of the real 1977 tape (rule 2) or computes with the senders' own numbers as
// our research reads them on that decode (data/teaching.json, src/science/teaching.ts). Pure: the decoded
// pictures come from a provider (the album's store in the browser, decodes of the WAV slices in Node tests).
// A checker whose pictures are not decoded yet throws, so the bus refuses the proposal instead of recording it.
//
// The checkers live in cohesive files beside this one: framesM5.ts (the frame list, the provider and
// pictures.album), colourM5.ts (pictures.colour), downM5.ts (pictures.down) and teachingM5.ts (the teaching
// checkers). This file re-exports them, so importers keep one entry point, and assembles the set.

import { type Checker } from '../../game/deductions';
import { type SignalProvider } from './checkers';
import { checkColour } from './colourM5';
import { checkDown } from './downM5';
import { checkAlbum, type M5PictureId, type PictureProvider } from './framesM5';
import { checkHeight, checkHome, checkNumerals, checkSlip, checkUnits } from './teachingM5';

export {
  ALBUM_FRAMES, M5_PICTURE_IDS, TEACHING, channelFrames, checkAlbum, frameRow, sameSettings,
  type DecodedPicture, type M5PictureId, type PictureProvider,
} from './framesM5';
export { LIKENESS_APART_MAX, LIKENESS_ONE_MIN, LIKENESS_THRESHOLD, checkColour, meanBrightness, stackOf, type Stack } from './colourM5';
export { BARRY_TO_CW, PEOPLE_IMAGES, TURNED_FRAMES, checkDown } from './downM5';
export {
  COLUMNS, HEIGHTS, HOME, SECOND_BEATS, SECOND_PRECISION, SLIP, UNITS, checkHeight, checkHome, checkNumerals, checkSlip, checkUnits,
} from './teachingM5';

/** The eight checkers over a signal provider (for the circle's settings) and the album's decoded pictures. */
export function makeM5PictureCheckers(signals: SignalProvider, pictures: PictureProvider): Record<M5PictureId, Checker> {
  return {
    'pictures.album': (a) => checkAlbum(signals, pictures, a),
    'pictures.colour': (a) => checkColour(pictures, a),
    'pictures.down': (a) => checkDown(a),
    'pictures.numerals': (a) => checkNumerals(a),
    'pictures.units': (a) => checkUnits(a),
    'pictures.home': (a) => checkHome(a),
    'pictures.slip': (a) => checkSlip(a),
    'pictures.height': (a) => checkHeight(a),
  };
}
