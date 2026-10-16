// How the charts write a distance on a label (M5 step 0c): the alien's reaches, with the astronomer's reading
// (parsecs) in parentheses only when the human gloss is on, the same rule as every other quantity (D-A07;
// src/ui/units.ts lengthLabel). The charts (src/world) take this as an option and never read the setting.

import { game } from '../../game/state';
import { lengthLabel } from '../../ui/units';

/** A distance in parsecs as a chart label, under the player's current human-gloss setting. */
export const chartLength = (pc: number, digits = 3): string => lengthLabel(pc, game.settings.value.humanGloss, digits);
