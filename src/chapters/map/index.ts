// The Map: registers its five checkers (on the shared epoch model: the likelihood identification, the ages in
// the alien's frame, the motion fit and the origin region) and its instrument with the shell.

import { registerInstrument } from '../registry';
import { registerMapCheckers } from './checkers';
import { MapInstrument } from './MapInstrument';

registerMapCheckers();
registerInstrument('map', MapInstrument);
