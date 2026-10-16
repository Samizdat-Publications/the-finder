// The arithmetic of the teaching pictures (L002, L003, L004, L005, L039): the senders' numerals, their units
// built from hydrogen, their table of planets read in those units (home, its place outward, the one cell that
// breaks the table's own order), and their heights. Pure: no DOM, no randomness. The data (data/teaching.json,
// tools/data/build_teaching.py) holds where each symbol sits on our decode and the value docs/research/
// teaching-frames.md reads there; this module only computes with those values.

import { AVOGADRO, LAMBDA_H_METRES, T_H_SECONDS } from './units';

/**
 * Atomic mass of hydrogen-1, u: 1.007825031898 (AME2020, Wang et al. 2021, Chinese Physics C 45, 030003; the
 * evaluation src/science/nuclides.ts cites). The senders' "1 M" is one hydrogen atom (teaching-frames.md L003).
 */
export const H1_MASS_U = 1.007825031898;

/** One unified atomic mass unit, kg: the molar mass constant 1e-3 kg/mol over Avogadro (2019 SI, to 3.5e-10). */
export const U_KG = 1e-3 / AVOGADRO;

/** One hydrogen-1 atom, kg (1.6735e-27). */
export const H1_MASS_KG = H1_MASS_U * U_KG;

// ---- the data's shape ----------------------------------------------------------------------------------

export type Region = [number, number, number, number];

export interface DigitEntry { glyph: number; value: number; row: number; region: Region; ink: number; cite: string }
export interface DotsEntry { row: number; count: number; region: Region; ink: number }
export interface RegionEntry { region: Region; ink: number; value: string | number; cite: string }
export interface Definition { of: string; is: string; whole: number; num: number; den: number; power: number; inverse?: boolean }
export interface UnitLine extends RegionEntry { id: string; definition?: Definition }
export interface Cell { region: Region; ink: number; text: string; whole: number; num: number; den: number; power: number; written: boolean; unit: string; cite: string }
export type Row = 'diameter' | 'distance' | 'mass' | 'day';
export interface Column { frame: string; index: number; circle: Region; cells: Partial<Record<Row, Cell>> }
export interface HeightEntry extends RegionEntry { figure: string; unit: string; text: string; ticks: Region[] }

export interface TeachingData {
  L002: { digits: DigitEntry[]; dots: DotsEntry[]; binary: (RegionEntry & { row: number })[]; sums: (RegionEntry & { terms: number[]; total: number; op: string })[]; larger: (RegionEntry & { number: number })[] };
  L003: { lines: UnitLine[] };
  table: { columns: Column[] };
  L039: { heights: HeightEntry[] };
}

export const ROWS: readonly Row[] = ['diameter', 'distance', 'mass', 'day'];

// ---- numerals ------------------------------------------------------------------------------------------

/** The senders' digit glyphs and the count each stands for (glyph index to count), as L002 sets them beside the dots. */
export function digitTable(d: TeachingData): Map<number, number> {
  return new Map(d.L002.digits.map((g) => [g.glyph, g.value]));
}

/**
 * The base of their place value, read from the counting table: the first count written with two digit glyphs
 * (the row of ten, "|-|-" in the cover's binary) is one of the base. Its first glyph means one, its second none.
 */
export function placeBase(d: TeachingData): number {
  // every row up to the base holds the digit of its own count; the row of the base writes "1 0" instead
  const odd = d.L002.digits.filter((g) => g.value !== g.row).map((g) => g.row);
  if (!odd.length) throw new Error('no row of the counting table needs two digits');
  return Math.min(...odd);
}

/** A number written with their digits (most significant first), read with their base. */
export function readDigits(digits: readonly number[], base: number): number {
  return digits.reduce((v, x) => v * base + x, 0);
}

/** The value of each digit of a written number, from its decimal writing (the research's reading of the frame). */
export function digitsOf(n: number, base: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new Error(`not a whole number: ${n}`);
  const out: number[] = [];
  let v = n;
  do {
    out.unshift(v % base);
    v = Math.floor(v / base);
  } while (v > 0);
  return out;
}

// ---- units ---------------------------------------------------------------------------------------------

/** A quantity as the senders write it: whole + num/den, times ten to the power. */
export function written(q: { whole: number; num: number; den: number; power: number }): number {
  return (q.whole + (q.den ? q.num / q.den : 0)) * 10 ** q.power;
}

/**
 * Every unit L003 defines, in SI (seconds, metres, kilograms), built from its three hydrogen units: t (one period
 * of the spin flip, the cover's unit), L (one wavelength of that light) and M (one hydrogen atom). Each line
 * "N of = 1 is" sets is = N x of; the Angstrom line runs the other way (1 L = 21 x 10^8 A).
 */
export function senderUnits(d: TeachingData): Record<string, number> {
  const u: Record<string, number> = { t: T_H_SECONDS, L: LAMBDA_H_METRES, M: H1_MASS_KG };
  const defs = d.L003.lines.flatMap((l) => (l.definition ? [l.definition] : []));
  for (let pass = 0; pass < defs.length; pass++) {
    for (const q of defs) {
      const n = written(q);
      if (q.inverse) {
        if (u[q.is] !== undefined && u[q.of] === undefined) u[q.of] = (u[q.is] as number) / n;
      } else if (u[q.of] !== undefined && u[q.is] === undefined) u[q.is] = n * (u[q.of] as number);
    }
  }
  for (const q of defs) if (u[q.is] === undefined || u[q.of] === undefined) throw new Error(`unit ${q.is} or ${q.of} is not built from hydrogen`);
  return u;
}

/**
 * The relative precision of a number as written: half a unit in its last figure (for 1 42/100, half of 1/100
 * against 1.42; for 160, half of one against 160). A definition's own number is exact by definition; a reading
 * is not.
 */
export function writtenPrecision(q: { whole: number; num: number; den: number }): number {
  const v = q.whole + (q.den ? q.num / q.den : 0);
  return q.num && q.den ? 0.5 / q.den / v : 0.5 / q.whole;
}

// ---- the planets ---------------------------------------------------------------------------------------

export interface PlanetColumn {
  index: number;
  frame: string;
  /** In the senders' units as written (km, km, e, d), the implied power of ten applied. */
  read: Partial<Record<Row, number>>;
  /** In SI through their units: metres, metres, kilograms, seconds. */
  si: Partial<Record<Row, number>>;
}

const SI_OF: Record<Row, string> = { diameter: 'km', distance: 'km', mass: 'e', day: 'd' };

/** Every column of the two tables, read in their units and in SI. */
export function planetColumns(d: TeachingData): PlanetColumn[] {
  const u = senderUnits(d);
  return d.table.columns.map((c) => {
    const read: Partial<Record<Row, number>> = {};
    const si: Partial<Record<Row, number>> = {};
    for (const r of ROWS) {
      const cell = c.cells[r];
      if (!cell) continue;
      if (cell.unit !== SI_OF[r]) throw new Error(`column ${c.index} ${r}: unit ${cell.unit}`);
      read[r] = written(cell);
      si[r] = (read[r] as number) * (u[cell.unit] as number);
    }
    return { index: c.index, frame: c.frame, read, si };
  });
}

/** The column whose mass and day are both one of their units: the world they measured the others against. */
export function homeColumn(d: TeachingData): number {
  const hits = planetColumns(d).filter((c) => c.read.mass === 1 && c.read.day === 1);
  if (hits.length !== 1) throw new Error(`${hits.length} columns read one and one`);
  return (hits[0] as PlanetColumn).index;
}

/** Place outward from their star (1 = nearest): the rank of a column's distance among the columns that have one. */
export function placeOutward(d: TeachingData, column: number): number {
  const cols = planetColumns(d).filter((c) => c.read.distance !== undefined);
  const mine = cols.find((c) => c.index === column);
  if (!mine) throw new Error(`column ${column} has no distance`);
  return cols.filter((c) => (c.read.distance as number) < (mine.read.distance as number)).length + 1;
}

/** The longest strictly increasing run (not necessarily contiguous) through a sequence: the indices kept. */
function longestIncreasing(xs: readonly number[]): number[] {
  const n = xs.length;
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      if ((xs[j] as number) < (xs[i] as number) && (len[j] as number) + 1 > (len[i] as number)) {
        len[i] = (len[j] as number) + 1;
        prev[i] = j;
      }
  let best = 0;
  for (let i = 1; i < n; i++) if ((len[i] as number) > (len[best] as number)) best = i;
  const out: number[] = [];
  for (let i = best; i >= 0; i = prev[i] as number) out.unshift(i);
  return out;
}

export interface Slip {
  column: number;
  row: Row;
  /** Its distance as read (their km). */
  read: number;
  /** From the order alone, the distance must lie above this (their km): the largest distance inward of it. */
  mustExceed: number;
  /** ... and below this, the next distance outward (null: it is the outermost). */
  mustStayBelow: number | null;
  /** The column whose distance it falls below, read as written. */
  fallsInsideColumn: number;
  /** That column's place outward among the distances that keep the order (1 = nearest): the slip's own value left out. */
  fallsInsidePlace: number;
}

/**
 * The cells that break the table's own order: the circles are drawn outward from the star, so the distances,
 * read the same way across the table, must rise from column to column. The longest rising run through them is
 * the order; every column left out of it breaks it. With the senders' table exactly one does.
 */
export function slips(d: TeachingData): Slip[] {
  const cols = planetColumns(d).filter((c) => c.read.distance !== undefined);
  const dist = cols.map((c) => c.read.distance as number);
  const keep = new Set(longestIncreasing(dist));
  const out: Slip[] = [];
  cols.forEach((c, i) => {
    if (keep.has(i)) return;
    const inward = dist.slice(0, i).filter((_, j) => keep.has(j));
    const outward = dist.slice(i + 1).filter((_, j) => keep.has(j + i + 1));
    const v = dist[i] as number;
    const inside = cols.find((x) => (x.read.distance as number) > v && keep.has(cols.indexOf(x))) as PlanetColumn;
    const insideD = inside.read.distance as number;
    out.push({
      column: c.index,
      row: 'distance',
      read: v,
      mustExceed: Math.max(...inward),
      mustStayBelow: outward.length ? Math.min(...outward) : null,
      fallsInsideColumn: inside.index,
      fallsInsidePlace: dist.filter((x, j) => keep.has(j) && x <= insideD).length,
    });
  });
  return out;
}

// ---- heights -------------------------------------------------------------------------------------------

export interface Height {
  figure: string;
  /** As written, in their cm. */
  cm: number;
  /** Through their cm (1/21 of hydrogen's wavelength), metres. */
  metres: number;
  /** Relative precision of the written number (half a unit in its last figure). */
  precision: number;
}

/** The two heights of L039, read in their cm and turned into metres through L. */
export function heights(d: TeachingData): Height[] {
  const u = senderUnits(d);
  return d.L039.heights.map((h) => {
    const cm = Number(h.value);
    return { figure: h.figure, cm, metres: cm * (u[h.unit] as number), precision: writtenPrecision({ whole: cm, num: 0, den: 0 }) };
  });
}
