// The Key: registers its three checkers (over the rebuilt cover's strokes, the cover's numbers and the
// pulsar catalogue) and its instrument with the shell (src/chapters/registry.ts).

import { registerInstrument } from '../registry';
import { coverModel } from '../shared/coverData';
import { registerKeyCheckers } from './checkers';
import { keyInputs } from './data';
import { KeyInstrument } from './KeyInstrument';

registerKeyCheckers(coverModel.groups, keyInputs);
registerInstrument('key', KeyInstrument);
