import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars, loadScenario } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { launchYear } from '../../science/epoch';
import { epilogue } from './epilogueData';
import { mapEpochs } from './mapEpochs';

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
      claim: "The pulsar map's periods were measured in 1970 and 1971, about six years before launch: the map is older than the machine.",
      measured: `mean epoch ${m.mean.toFixed(2)} (s.d. ${m.sd.toFixed(2)}) over ${usable.length} pulsars; Crab ${m.sharp[0]!.year.toFixed(2)}, Vela ${m.sharp[1]!.year.toFixed(2)}; launch ${launch.toFixed(2)}`,
      expected: 'clocks.md 3a: mean 1969.7, s.d. 1.4; Crab 1971.76, glitch-corrected Vela about 1971.8; SSD72 Table 1: "1970/1971 epoch"',
      tolerance: '0.4 yr on the mean and spread, 0.3 yr on the sharp clocks',
      pass: true,
    });
  });

  it('puts the published 1970 and 1971 epochs inside the computed spread, and launch six calendar years after 1971', () => {
    const [a, b] = epilogue.map.periodsEpoch.years as [number, number];
    const lo = Math.min(...usable.map((r) => r.year));
    const hi = Math.max(...usable.map((r) => r.year));
    expect(lo).toBeLessThan(a);
    expect(hi).toBeGreaterThan(b);
    expect(epilogue.map.launchYear - b).toBe(6);
    expect(Math.floor(launch)).toBe(epilogue.map.launchYear);
  });
});
