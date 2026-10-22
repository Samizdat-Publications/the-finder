// Portrait: registers its checker (over the player's own confirmed results, read from the saved attempts) and its
// instrument with the shell (src/chapters/registry.ts).

import { registerInstrument } from '../registry';
import { registerPortraitCheckers } from './checkers';
import { PortraitInstrument } from './PortraitInstrument';
import { lastOk } from './state';

registerPortraitCheckers(lastOk);
registerInstrument('portrait', PortraitInstrument);
