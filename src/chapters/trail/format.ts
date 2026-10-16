// How The Trail writes its quantities on the instrument: the alien's own units (src/ui/units.ts: lengths in
// reaches, times in beats, speeds in reaches per beat, large numbers as powers of ten), with the human gloss
// in parentheses when it is on, in the units an astronomer would use here (parsecs, years, km/s). Angles
// are in degrees, as everywhere in the game. Pure: no DOM.

import { JULIAN_YEAR_S, PARSEC_KM } from '../../science/units';
import { formatPower, quantity, toAlien, UNIT_KEY, type Dim } from '../../ui/units';

export const fmtDeg = (x: number): string => (x < 0.1 ? x.toFixed(4) : x < 10 ? x.toFixed(2) : x.toFixed(1));
export const fmtYears = (x: number): string => Math.round(x).toLocaleString('en-US');
export const fmtPc = (x: number): string => (x < 10 ? x.toFixed(3) : x.toFixed(1));
/** Astronomical units per parsec (648,000 / pi; IAU 2012 and 2015 definitions). */
const AU_PER_PC = 648_000 / Math.PI;
/** The human gloss of a distance: parsecs, or astronomical units below a thousandth of a parsec. */
export const glossPc = (pc: number): string => (pc < 0.001 ? `${(pc * AU_PER_PC).toPrecision(3)} AU` : `${fmtPc(pc)} pc`);

/** "reach" to "reaches", "beat" to "beats", "reach per beat" to "reaches per beat". */
export function pluralUnit(key: string): string {
  return key.replace(/^(\w+)/, (w) => (/(ch|sh|s|x)$/.test(w) ? `${w}es` : `${w}s`));
}

/** The alien's number and unit; `digits` significant figures for a power of ten (default the shared three). */
function alien(dim: Dim, si: number, digits?: number): string {
  const n = toAlien(dim, si);
  // Measured quantities from a million up read as powers of ten (an 11-digit count of beats is unreadable).
  if (Math.abs(n) >= 1e6) return `${formatPower(n, digits ?? 3)} ${pluralUnit(UNIT_KEY[dim])}`;
  const q = quantity(dim, si);
  return `${q.number} ${pluralUnit(q.unitKey)}`;
}

export function distText(pc: number, gloss: boolean): string {
  return `${alien('length', pc * PARSEC_KM * 1000)}${gloss ? ` (${glossPc(pc)})` : ''}`;
}

/** A time in years, as the alien writes it; `digits` significant figures when the number needs finer steps than three figures give. */
export function yearsText(years: number, gloss: boolean, digits?: number): string {
  return `${alien('time', years * JULIAN_YEAR_S, digits)}${gloss ? ` (${fmtYears(years)} years)` : ''}`;
}

/**
 * Significant figures that resolve a time to a tenth of an interval's width, so an estimate and both ends of
 * its interval read apart (three at least, the shared default). Computed from the largest value and the width.
 */
export function figuresFor(largestYears: number, widthYears: number): number {
  const n = Math.abs(largestYears) * beatsPerYear();
  const step = (Math.abs(widthYears) * beatsPerYear()) / 10;
  if (!(n > 0) || !(step > 0)) return 3;
  return Math.max(3, Math.floor(Math.log10(n)) - Math.floor(Math.log10(step)) + 1);
}

/** Beats in a year: the alien's count of a time given in years. */
export const beatsPerYear = (): number => toAlien('time', JULIAN_YEAR_S);

export function speedText(kmS: number, gloss: boolean): string {
  return `${alien('speed', kmS * 1000)}${gloss ? ` (${kmS.toFixed(2)} km/s)` : ''}`;
}

export function angleText(deg: number, sigmaDeg?: number): string {
  return sigmaDeg === undefined ? `${fmtDeg(deg)} deg` : `${fmtDeg(deg)} ± ${fmtDeg(sigmaDeg)} deg`;
}
