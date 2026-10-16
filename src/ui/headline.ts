// A confirmed result's headline (M4 step 7e, from the blind critic: results were walls of text): the key
// quantity, large, in the alien's units, with its glyph label above it, and one plain sentence. Each chapter
// chooses its headline per deduction in one table (src/chapters/<chapter>/headlines.ts) from what its checker
// already returns: a reading by its key, or a quantity token of the message by its place (the same number the
// message prints). The sentences carry no numbers (rule 1: the number is the checker's). Pure: no DOM.

import type { Attempt, Reading } from '../game/deductions';
import { messageTokens, type MsgDim } from './message';

export type HeadlineFrom =
  /** A reading of the result, by its key. */
  | { reading: string }
  /** The n-th quantity token of the message (0 first), with the glyph label to show above it. */
  | { token: number; label: string }
  /** A value counted from the readings (for a result that lists one reading per item). */
  | { count: (r: readonly Reading[]) => number; label: string };

export interface HeadlineDef {
  from: HeadlineFrom;
  /** One plain sentence, no numbers. */
  sentence: string;
}

/** What the headline shows: a quantity (SI, its dimension and figures) or a plain value, under a label. */
export interface Headline {
  label: string;
  sentence: string;
  /** A quantity: written in the alien's units, with the human gloss when it is on. */
  quantity?: { dim: MsgDim; si: number; digits?: number };
  /** A plain value (a count, a name, a ratio, a string the checker wrote). */
  value?: number | string;
}

/** The headline of an attempt, or null when the definition finds nothing in it (the result then shows its message). */
export function headlineOf(def: HeadlineDef | undefined, a: Pick<Attempt, 'result' | 'message'>): Headline | null {
  if (!def) return null;
  const f = def.from;
  if ('reading' in f) {
    const r = a.result.find((x) => x.key === f.reading);
    if (!r) return null;
    return r.dim && typeof r.value === 'number'
      ? { label: r.key, sentence: def.sentence, quantity: { dim: r.dim, si: r.value } }
      : { label: r.key, sentence: def.sentence, value: r.value };
  }
  if ('token' in f) {
    const t = messageTokens(a.message)[f.token];
    return t ? { label: f.label, sentence: def.sentence, quantity: t } : null;
  }
  return { label: f.label, sentence: def.sentence, value: f.count(a.result) };
}
