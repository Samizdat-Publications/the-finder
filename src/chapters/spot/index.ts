// The Spot: registers the chapter's instrument with the shell and its three checkers with the deduction graph.
// The checkers answer from the playthrough's model (data.ts), built from the seed in the save.

import { registerInstrument } from '../registry';
import { installSpotCheckers } from './checkers';
import { spotModel } from './data';
import { SpotInstrument } from './SpotInstrument';

registerInstrument('spot', SpotInstrument);
installSpotCheckers(spotModel);
