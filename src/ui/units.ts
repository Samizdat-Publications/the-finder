// Display helpers for the alien's own units (D-A07, D-A22). The alien does NOT count in hydrogen: its base
// units are a game convention, exact in SI and arbitrary, chosen only so that everyday quantities read as
// small numbers. So recognising hydrogen's clock on the cover is a real discovery, not something the
// interface already knows. Derived units follow from the base units by dimension. Numbers are written with
// Arabic digits (the translation layer); with the human gloss on, SI follows in parentheses. Pure: no DOM.

import { JULIAN_YEAR_S, PARSEC_KM } from '../science/units';

/** One beat, s (game convention, D-A22): the alien's base unit of time. Exact. */
export const BEAT_S = 0.871;
/** One reach, m (game convention, D-A22): the alien's base unit of length. Exact. */
export const REACH_M = 1.37;
/** One heft, kg (game convention, D-A22): the alien's base unit of mass. Exact. */
export const HEFT_KG = 2.29;

export type Dim = 'time' | 'length' | 'mass' | 'speed' | 'frequency' | 'energy' | 'power' | 'temperature';

/** Dimension exponents [length, time, mass] of each quantity (temperature is handled on its own). */
const EXPONENTS: Record<Exclude<Dim, 'temperature'>, [number, number, number]> = {
  time: [0, 1, 0],
  length: [1, 0, 0],
  mass: [0, 0, 1],
  speed: [1, -1, 0],
  frequency: [0, -1, 0],
  energy: [2, -2, 1],
  power: [2, -3, 1],
};

/** The size of one alien unit of this quantity, in SI. Temperature: an absolute scale in steps the size of the kelvin. */
export function unitInSI(dim: Dim): number {
  if (dim === 'temperature') return 1;
  const [l, t, m] = EXPONENTS[dim];
  return REACH_M ** l * BEAT_S ** t * HEFT_KG ** m;
}

/** The English key (and so the glyph label) of each unit. */
export const UNIT_KEY: Record<Dim, string> = {
  time: 'beat',
  length: 'reach',
  mass: 'heft',
  speed: 'reach per beat',
  frequency: 'per beat',
  energy: 'labour',
  power: 'labour per beat',
  temperature: 'notch',
};
export const UNIT_GLOSS: Record<Dim, string> = {
  time: 'the alien\'s beat of time',
  length: 'the alien\'s reach of length',
  mass: 'the alien\'s heft of mass',
  speed: 'reaches per beat',
  frequency: 'times per beat',
  energy: 'a heft moved a reach in a beat squared: the alien\'s unit of energy',
  power: 'labour each beat: the alien\'s unit of power',
  temperature: 'notches above absolute cold (the zero is physical: no heat at all)',
};

/** SI value in the alien's unit. */
export function toAlien(dim: Dim, si: number): number {
  return si / unitInSI(dim);
}

/** The alien's unit count back in SI. */
export function fromAlien(dim: Dim, n: number): number {
  return n * unitInSI(dim);
}

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

/** An integer as superscript characters (12 gives ¹², -6 gives ⁻⁶). */
export function superscript(n: number): string {
  return String(Math.trunc(n))
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');
}

/**
 * The one way the interface writes a very large or very small number: a mantissa and a power of ten with a
 * superscript exponent (1.59 × 10¹², 3.2 × 10⁻⁷), never e-notation. `digits` is the number of significant figures.
 */
export function formatPower(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const [m, e] = x.toExponential(Math.max(0, digits - 1)).split('e') as [string, string];
  return `${Number(m)} × 10${superscript(Number(e))}`;
}

/** Arabic digits, grouped in thousands; very large or small numbers as a power of ten with three significant figures. */
export function formatNumber(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e12 || a < 1e-3) return formatPower(x, 3);
  if (a >= 1000) return grouped.format(x);
  return String(Number(x.toPrecision(4)));
}

const sig = (x: number): string => String(Number(x.toPrecision(3)));

/** Engineering prefixes for the plain SI units. */
function prefixed(si: number, unit: string): string {
  const a = Math.abs(si);
  const steps: [number, string][] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  for (const [f, p] of steps) if (a >= f) return `${sig(si / f)} ${p}${unit}`;
  return `${sig(si)} ${unit}`;
}

/** A human reading of an SI value: seconds in ns to years; metres in nm to km; the rest with SI prefixes. */
export function formatSI(dim: Dim, si: number): string {
  const a = Math.abs(si);
  if (dim === 'time') {
    if (a === 0) return '0 s';
    if (a < 1e-6) return `${sig(si * 1e9)} ns`;
    if (a < 1e-3) return `${sig(si * 1e6)} µs`;
    if (a < 1) return `${sig(si * 1e3)} ms`;
    if (a < 120) return `${sig(si)} s`;
    if (a < 7200) return `${sig(si / 60)} min`;
    if (a < 172_800) return `${sig(si / 3600)} h`;
    if (a < 2 * JULIAN_YEAR_S) return `${sig(si / 86_400)} days`;
    return `${grouped.format(Number((si / JULIAN_YEAR_S).toPrecision(3)))} years`;
  }
  if (dim === 'length') {
    if (a === 0) return '0 m';
    if (a < 1e-6) return `${sig(si * 1e9)} nm`;
    if (a < 1e-3) return `${sig(si * 1e6)} µm`;
    if (a < 1) return `${sig(si * 1e3)} mm`;
    if (a < 1000) return `${sig(si)} m`;
    return `${grouped.format(Number((si / 1000).toPrecision(3)))} km`;
  }
  if (dim === 'mass') return a >= 1 || a === 0 ? `${sig(si)} kg` : `${sig(si * 1000)} g`;
  if (dim === 'speed') return a >= 1000 ? `${sig(si / 1000)} km/s` : `${sig(si)} m/s`;
  if (dim === 'temperature') return `${sig(si)} K`;
  if (a === 0) return dim === 'frequency' ? '0 Hz' : dim === 'energy' ? '0 J' : '0 W';
  return prefixed(si, dim === 'frequency' ? 'Hz' : dim === 'energy' ? 'J' : 'W');
}

export interface QuantityText {
  /** The number in the alien's unit, Arabic digits. */
  number: string;
  unitKey: string;
  unitGloss: string;
  /** The same quantity in SI, for the human gloss. */
  si: string;
}

/** A quantity as plain text for a sentence or a tooltip: the alien's number and unit, with the SI value in parentheses only when the human gloss is on. */
export function quantityText(dim: Dim, si: number, humanGloss: boolean): string {
  const q = quantity(dim, si);
  return `${q.number} ${q.unitKey}${humanGloss ? ` (${q.si})` : ''}`;
}

/** A quantity given in SI, as the alien writes it. */
/**
 * A measured number: from a million up a power of ten with three figures (an 11-digit count of beats is
 * unreadable, and a measurement has no more figures than that); below, as formatNumber. Exact counts read
 * off the cover (dimensionless integers) keep formatNumber's full grouped digits.
 */
export function formatMeasured(x: number): string {
  return Number.isFinite(x) && Math.abs(x) >= 1e6 ? formatPower(x, 3) : formatNumber(x);
}

export function quantity(dim: Dim, si: number): QuantityText {
  return { number: formatMeasured(toAlien(dim, si)), unitKey: UNIT_KEY[dim], unitGloss: UNIT_GLOSS[dim], si: formatSI(dim, si) };
}

/** Astronomical units per parsec (648,000 / pi; IAU 2012 and 2015). */
const AU_PER_PC = 648_000 / Math.PI;
const sigGrouped = (x: number, digits: number): string => Number(x.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 20 });

/** The human reading of a length in metres: parsecs from a hundredth of one, then AU, then km (grouped), else formatSI. */
export function humanLength(si: number, digits = 3): string {
  const pc = si / (PARSEC_KM * 1000);
  if (Math.abs(pc) >= 0.01) return `${sigGrouped(pc, Math.max(3, digits))} pc`;
  if (Math.abs(pc * AU_PER_PC) >= 0.1) return `${sigGrouped(pc * AU_PER_PC, 3)} AU`;
  if (Math.abs(si) >= 1e5) return `${sigGrouped(si / 1000, digits)} km`;
  return formatSI('length', si);
}

/**
 * A length as a chart label writes it: the alien's reaches, and with the human gloss on the astronomer's
 * reading in parentheses (parsecs). The charts take a distance in parsecs (the unit their data is in).
 */
export function lengthLabel(pc: number, humanGloss: boolean, digits = 3): string {
  const si = pc * PARSEC_KM * 1000;
  const n = toAlien('length', si);
  const num = formatMeasured(Number(n.toPrecision(digits)));
  return `${num} ${num === '1' ? UNIT_KEY.length : `${UNIT_KEY.length}es`}${humanGloss ? ` (${humanLength(si, digits)})` : ''}`;
}
