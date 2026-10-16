// Glyph labels: a deterministic generator that turns an English key into a short alien glyph word made of
// strokes. Seeded by the key alone (the science package's seeded stream, never Math.random), so the same key
// always gives the same glyphs. Pure: no DOM. src/ui/Glyph.tsx draws the result as inline SVG.

import { createRng, type Rng } from '../science/random';

/** One glyph is drawn in a box this wide and tall. */
export const GLYPH_W = 24;
export const GLYPH_H = 32;
export const GLYPH_GAP = 8;

export interface Glyph {
  /** SVG path data for the strokes, in the glyph's own box (0 to GLYPH_W across, 0 to GLYPH_H down). */
  strokes: string[];
  /** Small rings or dots: [x, y, radius, filled]. */
  marks: [number, number, number, boolean][];
}

export interface GlyphWord {
  key: string;
  glyphs: Glyph[];
  /** Width of the whole word in glyph-box units. */
  width: number;
}

const COLS = [4, 12, 20];
const ROWS = [4, 12, 20, 28];

/** One decimal place, as a short string with no trailing zero: keeps the path text stable. */
const n1 = (x: number): string => String(Math.round(x * 10) / 10);

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng.uniform() * items.length))] as T;
}

function glyph(rng: Rng): Glyph {
  const lattice = ROWS.flatMap((y) => COLS.map((x) => [x, y] as const));
  let at = pick(rng, lattice);
  const strokes: string[] = [];
  const count = 3 + Math.floor(rng.uniform() * 3); // 3 to 5 chained strokes
  let d = `M${n1(at[0])} ${n1(at[1])}`;
  for (let i = 0; i < count; i++) {
    let to = pick(rng, lattice);
    while (to[0] === at[0] && to[1] === at[1]) to = pick(rng, lattice);
    if (rng.uniform() < 0.45) {
      // an arc: a quadratic curve bowed to one side
      const mx = (at[0] + to[0]) / 2;
      const my = (at[1] + to[1]) / 2;
      const bow = (rng.uniform() < 0.5 ? -1 : 1) * (4 + rng.uniform() * 5);
      const dx = to[0] - at[0];
      const dy = to[1] - at[1];
      const len = Math.hypot(dx, dy);
      d += `Q${n1(mx - (dy / len) * bow)} ${n1(my + (dx / len) * bow)} ${n1(to[0])} ${n1(to[1])}`;
    } else {
      d += `L${n1(to[0])} ${n1(to[1])}`;
    }
    at = to;
  }
  strokes.push(d);
  if (rng.uniform() < 0.5) {
    // a separate short stroke
    const a = pick(rng, lattice);
    let b = pick(rng, lattice);
    while (b[0] === a[0] && b[1] === a[1]) b = pick(rng, lattice);
    strokes.push(`M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`);
  }
  const marks: Glyph['marks'] = [];
  if (rng.uniform() < 0.6) {
    const m = pick(rng, lattice);
    marks.push([m[0], m[1], rng.uniform() < 0.5 ? 2 : 3, rng.uniform() < 0.5]);
  }
  return { strokes, marks };
}

/** The glyph word for an English key: two to four glyphs, more for a longer key. */
export function glyphWord(key: string): GlyphWord {
  const rng = createRng(`glyph:${key.trim().toLowerCase()}`);
  const words = key.trim().split(/\s+/).length;
  const n = Math.min(4, 2 + (key.length > 8 ? 1 : 0) + (words > 1 ? 1 : 0));
  const glyphs: Glyph[] = [];
  for (let i = 0; i < n; i++) glyphs.push(glyph(rng.fork(`g${i}`)));
  return { key, glyphs, width: n * GLYPH_W + (n - 1) * GLYPH_GAP };
}

/**
 * The Finder's own numerals, nought to nine (M5: "give the alien script a job"): one glyph each, made by the same
 * generator as the glyph words, seeded by "numeral:<n>", so the alien writes counts in its own script. Each is a
 * single glyph in the GLYPH_W x GLYPH_H box. They are a game convention like the glyph words: nothing in the
 * record depends on their shapes. The test (src/game/glyphs.test.ts style) holds them distinct and in their box.
 */
export function numeralGlyph(n: number): Glyph {
  if (!Number.isInteger(n) || n < 0 || n > 9) throw new Error(`a numeral is a digit from 0 to 9, got ${n}`);
  return glyph(createRng(`numeral:${n}`));
}
