// Plain-language formatting for Our Frame: dates, times of day in UTC, numbers in words, and the light-day
// sentence. Human units only (km, hours, years, AD dates), independent of the gloss setting. Pure: no DOM, no
// clock of its own (callers pass the moment).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** A small whole number in words (0 to 20), else the digits. */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? (WORDS[n] as string) : String(n);
}

/** 12345.6 as "12,346". */
export const grouped = (n: number): string => Math.round(n).toLocaleString('en-US');

/** A number to `digits` significant figures with thousands separators: 44123 to 3 figures is "44,100". */
export const sig = (x: number, digits = 3): string => Number(x.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 20 });

/** "2025-02-25" as "25 February 2025". */
export function dateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`dateLong: not a date: ${iso}`);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** A UTC instant (ms) as "18 November 2026". */
export function utcDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const two = (n: number): string => String(n).padStart(2, '0');

/** A UTC instant (ms) as "10:16:18", the second rounded to the nearest. */
export function utcHms(ms: number): string {
  const d = new Date(Math.round(ms / 1000) * 1000);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}

/** A UTC instant (ms) as "10:16" (minutes truncated, so "about" is honest). */
export function utcHm(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** Light time, hours, as "23 hours 54 minutes". */
export function hoursMinutes(hours: number): string {
  const min = Math.round(hours * 60);
  return `${Math.floor(min / 60)} hours ${min % 60} minutes`;
}

/** The light-day sentences of the "Right now" section: future tense before the moment, past tense after. */
export function lightDaySentence(computedMs: number, nasaMs: number, nowMs: number): string {
  const when = `On ${utcDate(computedMs)}, at about ${utcHm(computedMs)} UTC, Voyager 1`;
  const tail = `NASA gives ${utcHms(nasaMs)}; these tables give ${utcHms(computedMs)}.`;
  return computedMs > nowMs
    ? `${when} is one light-day from Earth: light, or a radio message, takes a full day (to within seconds) to cross the gap. ${tail}`
    : `${when} became one light-day from Earth: since then light, or a radio message, takes more than a full day to cross the gap. ${tail}`;
}
