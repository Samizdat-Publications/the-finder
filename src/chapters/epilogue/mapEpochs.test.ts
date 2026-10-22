import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars, loadScenario } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { launchYear } from '../../science/epoch';
import { STOPS } from '../../tour/script';
import { epilogue } from './epilogueData';
import { numberWord } from './format';
import { mapEpochs, mapSpan } from './mapEpochs';

describe('the map is older than the machine', () => {
  const m = mapEpochs(loadCover(), loadPulsars(), loadGlitches());
  const launch = launchYear(loadScenario());
  const usable = m.rows.filter((r) => r.usable);

  it("dates the map's fourteen periods from today's timing to 1966 to 1972, before launch", () => {
    expect(m.rows).toHaveLength(14);
    expect(usable.length).toBe(13); // B1240-64 is known to three figures and cannot date anything
    expect(m.rows.find((r) => !r.usable)?.bname).toBe('B1240-64');
    for (const r of usable) {
      expect(r.year, r.bname).toBeGreaterThan(1966);
      expect(r.year, r.bname).toBeLessThan(1973);
      expect(r.year, r.bname).toBeLessThan(launch);
    }
    // clocks.md 3a: mean 1969.7, s.d. 1.4 yr over 13 pulsars; Crab 1971.76 and glitch-corrected Vela about 1971.8.
    expect(Math.abs(m.mean - 1969.7)).toBeLessThanOrEqual(0.4);
    expect(Math.abs(m.sd - 1.4)).toBeLessThanOrEqual(0.4);
    expect(m.sharp.map((r) => r.jname)).toEqual(['J0534+2200', 'J0835-4510']);
    for (const r of m.sharp) expect(Math.abs(r.year - 1971.8)).toBeLessThanOrEqual(0.3);
    recordCheck({
      id: 'epilogue.mapOlder',
      claim: "The pulsar map's periods, published as the 1970/1971 epoch, date from 1966.6 to 1971.8, on average about 8 years before launch: the map is older than the machine.",
      measured: `mean epoch ${m.mean.toFixed(2)} (s.d. ${m.sd.toFixed(2)}) over ${usable.length} pulsars; Crab ${m.sharp[0]!.year.toFixed(2)}, Vela ${m.sharp[1]!.year.toFixed(2)}; launch ${launch.toFixed(2)}`,
      expected: 'clocks.md 3a: mean 1969.7, s.d. 1.4; Crab 1971.76, glitch-corrected Vela about 1971.8; SSD72 Table 1: "1970/1971 epoch"',
      tolerance: '0.4 yr on the mean and spread, 0.3 yr on the sharp clocks',
      pass: true,
    });
  });

  it('puts the published 1970 and 1971 epochs inside the computed spread, and the words shown match the computed span', () => {
    const [a, b] = epilogue.map.periodsEpoch.years as [number, number];
    const span = mapSpan(m, launch);
    expect(span.first).toBeLessThan(a);
    expect(span.last).toBeGreaterThan(b);
    expect(Math.floor(launch)).toBe(epilogue.map.launchYear);
    // clocks.md 3a and the M6 science audit: 1966.6 to 1971.8, mean 1969.67 (launch 1977.68), so about 8 years.
    // Tolerance: 0.1 yr, the one decimal the page shows.
    expect(Math.abs(span.first - 1966.6)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(span.last - 1971.8)).toBeLessThanOrEqual(0.1);
    expect(Math.round(span.meanYearsBefore)).toBe(8);
    // The tour's words for the same span (src/tour/script.ts finale.map), typed there, must match the computation.
    const look = STOPS.find((x) => x.id === 'finale.map')!.look;
    expect(look).toContain(`between ${Math.floor(span.first)} and ${Math.floor(span.last)}`);
    expect(look).toContain(`about ${Math.round(span.meanYearsBefore)} years before`);
    expect(numberWord(Math.round(span.meanYearsBefore))).toBe('eight');
  });
});
