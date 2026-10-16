// The Player: registers its four checkers (over the cover's turn time, the record model and the tape's line
// period) and its instrument with the shell (src/chapters/registry.ts).

import { registerInstrument } from '../registry';
import { registerPlayerCheckers } from './checkers';
import { PlayerInstrument } from './PlayerInstrument';

registerPlayerCheckers();
registerInstrument('player', PlayerInstrument);
