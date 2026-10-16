// Display helpers for the alien's units (D-A07). The alien measures time in hydrogen periods and length in
// hydrogen wavelengths (src/science/units.ts); numbers are written with Arabic digits (the translation
// layer). With the human gloss setting on, SI units follow in parentheses. Pure: no DOM.

import { JULIAN_YEAR_S, LAMBDA_H_METRES, T_H_SECONDS } from '../science/units';

export type Dim = 'time' | 'length';

/** The English key (and so the glyph label) of each unit. */
export const UNIT_KEY: Record<Dim, string> = { time: 'hydrogen period', length: 'hydrogen wavelength' };
export const UNIT_GLOSS: Record<Dim, string> = {
  time: 'the period of hydrogen\'s spin-flip',
  length: 'the wavelength of hydrogen\'s spin-flip',
};

/** SI value (seconds or metres) in the alien's unit. */
export function toAlien(dim: Dim, si: number): number {
  return dim === 'time' ? si / T_H_SECONDS : si / LAMBDA_H_METRES;
}

/** The alien's unit count back in SI. */
export function fromAlien(dim: Dim, n: number): number {
  return dim === 'time' ? n * T_H_SECONDS : n * LAMBDA_H_METRES;
}

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Arabic digits, grouped in thousands; very large or small numbers in e-notation with three significant figures. */
export function formatNumber(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e12 || a < 1e-3) return x.toExponential(2).replace('e+', 'e');
  if (a >= 1000) return grouped.format(x);
  return String(Number(x.toPrecision(4)));
}

const sig = (x: number): string => String(Number(x.toPrecision(3)));

/** A human reading of an SI value: seconds in ns, us, ms, s, min, h, d or years; metres in nm to Mm. */
export function formatSI(dim: Dim, si: number): string {
  const a = Math.abs(si);
  if (a === 0) return dim === 'time' ? '0 s' : '0 m';
  if (dim === 'time') {
    if (a < 1e-6) return `${sig(si * 1e9)} ns`;
    if (a < 1e-3) return `${sig(si * 1e6)} µs`;
    if (a < 1) return `${sig(si * 1e3)} ms`;
    if (a < 120) return `${sig(si)} s`;
    if (a < 7200) return `${sig(si / 60)} min`;
    if (a < 172_800) return `${sig(si / 3600)} h`;
    if (a < 100 * 86_400) return `${sig(si / 86_400)} days`;
    return `${grouped.format(Number((si / JULIAN_YEAR_S).toPrecision(3)))} years`;
  }
  if (a < 1e-6) return `${sig(si * 1e9)} nm`;
  if (a < 1e-3) return `${sig(si * 1e6)} µm`;
  if (a < 1) return `${sig(si * 1e3)} mm`;
  if (a < 1000) return `${sig(si)} m`;
  return `${sig(si / 1000)} km`;
}

export interface QuantityText {
  /** The number in the alien's unit, Arabic digits. */
  number: string;
  unitKey: string;
  unitGloss: string;
  /** The same quantity in SI, for the human gloss. */
  si: string;
}

/** A quantity given in SI, as the alien writes it. */
export function quantity(dim: Dim, si: number): QuantityText {
  return { number: formatNumber(toAlien(dim, si)), unitKey: UNIT_KEY[dim], unitGloss: UNIT_GLOSS[dim], si: formatSI(dim, si) };
}
