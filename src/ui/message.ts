// Checker messages carry their physical quantities as tokens, and the interface renders them in the alien's
// units (D-A07, D-A22; M4 step 7c): with the human gloss off a message reads in beats, reaches and hefts only;
// with it on, each quantity is followed by its human reading in parentheses. Saved attempts keep the token
// text, so they re-render when the gloss changes; text with no tokens (saves from before) renders unchanged.
//
// Token syntax: {{q|<dim>|<SI value>}} or {{q|<dim>|<SI value>|<significant figures>}}, plain ASCII. Double
// braces never occur in the game's English. The SI value is JavaScript's shortest round-trip form.
// Pure: no DOM.

import { JULIAN_YEAR_S, PARSEC_KM } from '../science/units';
import { BEAT_S, HEFT_KG, REACH_M, UNIT_KEY, formatMeasured, formatPower, formatSI, toAlien, type Dim } from './units';

/**
 * Quantities a message may carry: the readings' dimensions, plus four compound ones that appear only in
 * sentences (an acceleration, an area, energy per mass, heat capacity). Temperature steps are kelvin-sized
 * (D-A22), so heat capacity per notch has the same number as per kelvin.
 */
export type MsgDim = Dim | 'acceleration' | 'area' | 'specificEnergy' | 'heatCapacity';

const EXTRA: Record<Exclude<MsgDim, Dim>, { exp: [number, number, number]; key: string; si: string }> = {
  acceleration: { exp: [1, -2, 0], key: 'reach per beat squared', si: 'm/s²' },
  area: { exp: [2, 0, 0], key: 'square reach', si: 'm²' },
  specificEnergy: { exp: [2, -2, 0], key: 'labour per heft', si: 'J/kg' },
  heatCapacity: { exp: [2, -2, 1], key: 'labour per notch', si: 'J/K' },
};
const isExtra = (d: string): d is Exclude<MsgDim, Dim> => d in EXTRA;
const DIMS: readonly string[] = ['time', 'length', 'mass', 'speed', 'frequency', 'energy', 'power', 'temperature', ...Object.keys(EXTRA)];

/** A quantity in a message: the token the interface replaces with the alien's number and unit. */
export function q(dim: MsgDim, si: number, digits?: number): string {
  if (!Number.isFinite(si)) return String(si);
  return digits === undefined ? `{{q|${dim}|${si}}}` : `{{q|${dim}|${si}|${digits}}}`;
}

/** The plural of an alien unit key: "beat" to "beats", "reach per beat" to "reaches per beat"; "per beat" and "labour" stay. */
export function pluralKey(key: string): string {
  if (key.startsWith('per ') || key.startsWith('labour')) return key;
  if (key.startsWith('square ')) return `square ${pluralKey(key.slice(7))}`;
  return key.replace(/^(\w+)/, (w) => (/(ch|sh|s|x)$/.test(w) ? `${w}es` : `${w}s`));
}

/** A number in the alien's units as messages write it: three figures from a million up, else grouped; `digits` figures when given. */
export function alienNumber(n: number, digits?: number): string {
  if (digits === undefined) return formatMeasured(n);
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return formatPower(n, digits);
  return Number(n.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 20 });
}

const sigText = (x: number, digits: number): string => Number(x.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 20 });
/** Astronomical units per parsec (648,000 / pi; IAU 2012 and 2015). */
const AU_PER_PC = 648_000 / Math.PI;

/** The human reading for the gloss: an astronomer's units for the large ones (years, parsecs, AU), SI otherwise. */
export function humanText(dim: MsgDim, si: number, digits?: number): string {
  const d = digits ?? 3;
  if (dim === 'time' && Math.abs(si) >= 100 * 86_400) return `${sigText(si / JULIAN_YEAR_S, Math.max(3, d))} years`;
  if (dim === 'length') {
    const pc = si / (PARSEC_KM * 1000);
    if (Math.abs(pc) >= 0.01) return `${sigText(pc, Math.max(3, d))} pc`;
    if (Math.abs(pc * AU_PER_PC) >= 0.1) return `${sigText(pc * AU_PER_PC, 3)} AU`;
    // Kilometres grouped in thousands (formatSI writes "1080000 km").
    if (Math.abs(si) >= 1e5) return `${sigText(si / 1000, d)} km`;
  }
  if (isExtra(dim)) return `${sigText(si, d)} ${EXTRA[dim].si}`;
  return formatSI(dim, si);
}

/** One alien unit of a message quantity, in SI. */
export function unitSize(dim: MsgDim): number {
  if (!isExtra(dim)) return 1 / toAlien(dim, 1);
  const [l, t, m] = EXTRA[dim].exp;
  return REACH_M ** l * BEAT_S ** t * HEFT_KG ** m;
}

/** The English key (and glyph label) of a message quantity's alien unit. */
export function unitKeyOf(dim: MsgDim): string {
  return isExtra(dim) ? EXTRA[dim].key : UNIT_KEY[dim];
}

/** The alien's number and unit for a quantity, plural unless the number reads 1. */
export function alienText(dim: MsgDim, si: number, digits?: number): string {
  const key = isExtra(dim) ? EXTRA[dim].key : UNIT_KEY[dim];
  const n = alienNumber(si / unitSize(dim), digits);
  return `${n} ${n === '1' ? key : pluralKey(key)}`;
}

/** One quantity as a message shows it: the alien's units, and the human reading in parentheses when the gloss is on. */
export function quantityInMessage(dim: MsgDim, si: number, humanGloss: boolean, digits?: number): string {
  return `${alienText(dim, si, digits)}${humanGloss ? ` (${humanText(dim, si, digits)})` : ''}`;
}

const TOKEN = /\{\{q\|([A-Za-z]+)\|([^|}]+)(?:\|(\d+))?\}\}/g;

/** A message as the player reads it: every token in the alien's units, with the human gloss when it is on. */
export function renderMessage(text: string, humanGloss: boolean): string {
  return text.replace(TOKEN, (whole, dim: string, value: string, digits?: string) => {
    const si = Number(value);
    if (!DIMS.includes(dim) || !Number.isFinite(si)) return whole;
    return quantityInMessage(dim as MsgDim, si, humanGloss, digits === undefined ? undefined : Number(digits));
  });
}

/**
 * Significant figures that tell an estimate and the ends of its interval apart in the alien's units: enough to
 * resolve a tenth of the interval's width (three at least, the shared default).
 */
export function rangeDigits(dim: MsgDim, largestSI: number, widthSI: number): number {
  const n = Math.abs(largestSI / unitSize(dim));
  const step = Math.abs(widthSI / unitSize(dim)) / 10;
  if (!(n > 0) || !(step > 0)) return 3;
  return Math.max(3, Math.floor(Math.log10(n)) - Math.floor(Math.log10(step)) + 1);
}

/** A message's quantity tokens, in order: what each one carries. */
export function messageTokens(text: string): { dim: MsgDim; si: number; digits?: number }[] {
  const out: { dim: MsgDim; si: number; digits?: number }[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const si = Number(m[2]);
    if (!DIMS.includes(m[1] as string) || !Number.isFinite(si)) continue;
    out.push(m[3] === undefined ? { dim: m[1] as MsgDim, si } : { dim: m[1] as MsgDim, si, digits: Number(m[3]) });
  }
  return out;
}

/** How many quantity tokens a message holds. */
export function countTokens(text: string): number {
  return [...text.matchAll(TOKEN)].length;
}
