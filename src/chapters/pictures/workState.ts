// What the player's hands are doing on The Pictures' work views (M5): which view is open, the three frames on the
// colour mixer, the picture being turned, the table of numerals being built, the readings set on the converters
// and the cell marked on the planets table. This is the instrument's own view state, like a dial's position
// (the game state changes only through the command bus: each view proposes its answer with deduction.propose).

import { signal } from '@preact/signals';

export type WorkView = 'decoder' | 'album' | 'colour' | 'turn' | 'numerals' | 'units' | 'planets' | 'height';

export const view = signal<WorkView>('decoder');
/** The first of three consecutive frames on the colour mixer. */
export const stackStart = signal<string | null>(null);
/** The picture on the turntable of the "down" view, and its clockwise quarter turns. */
export const turnFrame = signal<string | null>(null);
export const quarterTurns = signal(0);
/** The table being built: the senders' digit (glyph index) to the Finder's numeral (0 to 9). */
export const numeralTable = signal<Record<string, number>>({});
/** The second's line set on the converter: whole, numerator, denominator, power of ten. */
export const secondReading = signal({ whole: 1, num: 0, den: 1, power: 0 });
/** The column (home) and the cell (slip) marked on the planets table. */
export const markedColumn = signal<number | null>(null);
export const markedCell = signal<{ column: number; row: string } | null>(null);
/** The height read off the scale bar, in their centimetres. */
export const heightCm = signal(0);

export function openView(v: WorkView): void {
  view.value = v;
}
