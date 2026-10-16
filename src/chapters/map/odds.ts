// How The Map writes odds: plain "about N to 1" with the interface's powers of ten (src/ui/units.ts), never
// e-notation and never a bare logarithm. Pure.

import { formatNumber, superscript } from '../../ui/units';

/** A power of ten written as the interface writes it: 10 with a superscript exponent. */
function ten(k: number): string {
  return `10${superscript(k)}`;
}

/** A ratio given as its log10: "about 160", "about 10⁵", "more than 10³⁰⁰". */
export function timesText(log10: number): string {
  if (!Number.isFinite(log10)) return 'infinitely';
  if (log10 > 300) return `more than ${ten(300)}`;
  if (log10 >= 3) return `about ${ten(Math.round(log10))}`;
  return `about ${formatNumber(Number((10 ** log10).toPrecision(2)))}`;
}

/** Odds given as their log10, for or against: "about 10⁵ to 1", "about 3.2 to 1", "about 1 to 40". */
export function oddsText(log10: number): string {
  if (log10 === Infinity) return 'certain: no other pulsar along the line fits';
  if (log10 === -Infinity) return 'none';
  if (log10 >= 0) return `${timesText(log10)} to 1`;
  return `about 1 to ${timesText(-log10).replace(/^about /, '')}`;
}
