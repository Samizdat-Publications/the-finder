// The Voices: registers its four checkers (over the reference analysis of the real record, data/voices.json)
// and its instrument with the shell (src/chapters/registry.ts).

import { registerInstrument } from '../registry';
import { registerVoicesCheckers } from './checkers';
import { VoicesInstrument } from './VoicesInstrument';

registerVoicesCheckers();
registerInstrument('voices', VoicesInstrument);
