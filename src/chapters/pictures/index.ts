// The Pictures: registers its seven checkers (each decodes the real 1977 tape with the player's settings and
// measures the picture) over the chapter's signal store, and its instrument with the shell.

import { registerInstrument } from '../registry';
import { registerPictureCheckers } from './checkers';
import { PicturesInstrument } from './PicturesInstrument';
import { getSignal } from './signal';

registerPictureCheckers(getSignal);
registerInstrument('pictures', PicturesInstrument);
