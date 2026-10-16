// The Trail: registers its five checkers (each judges the player's selection on the instrument with the
// science, on the shared epoch model for the playthrough's seed) and its instrument with the shell.

import { registerInstrument } from '../registry';
import { registerTrailCheckers } from './checkers';
import { TrailInstrument } from './TrailInstrument';

registerTrailCheckers();
registerInstrument('trail', TrailInstrument);
