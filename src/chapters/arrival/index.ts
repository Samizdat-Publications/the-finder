// Arrival: registers the chapter's instrument with the shell and its four checkers with the deduction graph.
// The checkers answer from the playthrough's model (data.ts), built from the seed in the save.

import { registerInstrument } from '../registry';
import { ArrivalInstrument } from './Arrival';
import { installArrivalCheckers } from './checkers';
import { arrivalModel } from './data';

registerInstrument('arrival', ArrivalInstrument);
installArrivalCheckers(arrivalModel);
