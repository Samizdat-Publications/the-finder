// The unit-word check for checker messages (M4 step 7c): with the human gloss off a rendered message must hold
// no SI or human unit, as a whole word or after a number; with it on, every quantity token reads in the alien's
// units followed by its human reading in parentheses, once.
import { countTokens, renderMessage } from '../../src/ui/message';

/** Unit words that are never English on their own: banned anywhere in a message, as whole words. */
export const UNIT_WORDS = [
  'years', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds',
  'ms', 'µs', 'ns', 'km', 'mm', 'cm', 'µm', 'nm', 'pc', 'AU', 'ly', 'kg', 'Hz', 'kHz', 'MHz', 'eV', 'keV', 'MeV',
  'km/s', 'm/s', 'm/s²', 'm²', 'J/kg', 'J/K', 'tonnes', 'metres', 'metre', 'millimetres', 'millimetre', 'centimetres',
  'kilometres', 'parsecs', 'parsec', 'light-years', 'kelvin', 'watts', 'joules',
];
/** Unit symbols that are English letters or words too: banned only right after a number. */
export const UNIT_AFTER_NUMBER = ['s', 'm', 'h', 'g', 'J', 'K', 'W', 'min', 'd', 'day', 'year', 'second', 'hour', 'minute', 'metre'];

const esc = (w: string): string => w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// A word boundary that also works around "/", "²" and "µ": not preceded or followed by a letter, digit or slash.
const word = (w: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}/])${esc(w)}(?![\\p{L}\\p{N}/²])`, 'u');
const afterNumber = (w: string): RegExp => new RegExp(`[\\d⁰¹²³⁴⁵⁶⁷⁸⁹]\\s?${esc(w)}(?![\\p{L}\\p{N}/²])`, 'u');

/** The unit words and symbols a text contains (empty when it reads in the alien's units only). */
export function unitWordsIn(text: string): string[] {
  const hits = UNIT_WORDS.filter((w) => word(w).test(text));
  for (const w of UNIT_AFTER_NUMBER) if (afterNumber(w).test(text)) hits.push(`number + ${w}`);
  return hits;
}

const ALIEN_UNIT = /(?:beats?|reach(?:es)?|hefts?|labour|notch(?:es)?|per beat|square reach(?:es)?|reach(?:es)? per beat(?: squared)?|labour per (?:beat|heft|notch))/u;
const GLOSSED = new RegExp(`${ALIEN_UNIT.source} \\(([^()]*)\\)`, 'gu');
/** A human reading as the gloss writes it (src/ui/message.ts humanText, units.ts formatSI): a number and one unit. */
const HUMAN_READING = /^-?[\d.,]+(?: × 10[⁻⁰-⁹]+)? ?(?:[nµmkMGT]?(?:s|m|g|Hz|W|J)|min|h|days|years|pc|AU|kg|m\/s|km\/s|K|m\/s²|m²|J\/kg|J\/K)$/u;

/**
 * Checks one raw message (with tokens): gloss off, no unit words; gloss on, as many "alien unit (human reading)"
 * pairs as the message has tokens, each human reading holding a unit. Returns the problems found.
 */
export function messageUnitProblems(raw: string): string[] {
  const out: string[] = [];
  const off = renderMessage(raw, false);
  const words = unitWordsIn(off);
  if (words.length) out.push(`gloss off shows ${words.join(', ')}: ${off}`);
  const n = countTokens(raw);
  const on = renderMessage(raw, true);
  const pairs = [...on.matchAll(GLOSSED)].filter((m) => HUMAN_READING.test(m[1] ?? ''));
  if (pairs.length !== n) out.push(`gloss on shows ${pairs.length} glossed quantities for ${n} tokens: ${on}`);
  return out;
}
