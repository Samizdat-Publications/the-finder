// Our Frame (chapter 9, the epilogue): registers the chapter's instrument with the shell. It has no
// deductions, so there are no checkers to register; it counts as done once the player has entered it
// (src/game/deductions.ts chapterStatus, the saved list of visited chapters).

import { registerInstrument } from '../registry';
import { EpilogueInstrument } from './EpilogueInstrument';

registerInstrument('epilogue', EpilogueInstrument);
