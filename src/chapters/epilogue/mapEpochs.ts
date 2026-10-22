// "The map is older than the machine": when each of the map's fourteen periods was true, dated from today's
// pulsar timing by the science that already does it (dateMapToday, src/science/pulsars.ts: the date when each
// pulsar's ephemeris ticks at the number on the cover). Nothing is typed in; the glitch-corrected epoch is
// used where the pulsar has glitches. Pure: no DOM.

import { dateMapToday, type MapDating } from '../../science/pulsars';
import type { CoverData, GlitchData, PulsarCatalogue } from '../../science/types';
import { SAGAN_HYDROGEN_HZ } from '../../science/units';

export interface MapEpochRow {
  bname: string;
  jname: string;
  /** Decimal year when the pulsar ticked at the map's number (glitch-corrected). */
  year: number;
  /** False for a pulsar whose map period is too imprecise to date anything (B1240-64, known to 3 figures). */
  usable: boolean;
}

export interface MapEpochs {
  rows: MapEpochRow[];
  mean: number;
  sd: number;
  /** The two sharpest clocks, the Crab and Vela, if the map has them. */
  sharp: MapEpochRow[];
}

/** The two pulsars whose timing is sharp enough to date the map to a month (clocks.md 3a): Crab and Vela. */
const SHARP_JNAMES = ['J0534+2200', 'J0835-4510'];

export function mapEpochs(cover: CoverData, pulsars: PulsarCatalogue, glitches: GlitchData): MapEpochs {
  const byJ = new Map(pulsars.pulsars.map((p) => [p.jname, p]));
  const dating: MapDating = dateMapToday(cover.pulsarMap.lines, byJ, glitches.pulsars, SAGAN_HYDROGEN_HZ);
  const rows = dating.rows.map((r): MapEpochRow => ({ bname: r.line.bname, jname: r.line.jname, year: r.corrected.decimalYear, usable: r.usable }));
  return { rows, mean: dating.correctedMean, sd: dating.correctedSd, sharp: rows.filter((r) => r.usable && SHARP_JNAMES.includes(r.jname)) };
}

/** What Our Frame says of the span: the first and last usable epochs and how long before launch they are on average. */
export function mapSpan(m: MapEpochs, launchYear: number): { first: number; last: number; meanYearsBefore: number } {
  const ys = m.rows.filter((r) => r.usable).map((r) => r.year);
  return { first: Math.min(...ys), last: Math.max(...ys), meanYearsBefore: launchYear - m.mean };
}
