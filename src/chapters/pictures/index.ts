// The Pictures: registers its checkers, the seven of M3 (each decodes the real 1977 tape with the player's settings
// and measures the picture, over the chapter's signal store) and the eight of M5 (over the album of decoded
// frames and the teaching pictures), and its instrument with the shell.

import { registerInstrument } from '../registry';
import { registerChecker } from '../../game/deductions';
import { registerPictureCheckers } from './checkers';
import { M5_PICTURE_IDS, makeM5PictureCheckers } from './checkersM5';
import { albumPicture } from './album';
import { PicturesInstrument } from './PicturesInstrument';
import { getSignal } from './signal';

registerPictureCheckers(getSignal);
const m5 = makeM5PictureCheckers(getSignal, albumPicture);
for (const id of M5_PICTURE_IDS) registerChecker(id, m5[id]);
registerInstrument('pictures', PicturesInstrument);
