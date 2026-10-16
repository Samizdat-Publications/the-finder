import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { mapPeriod, wrapDeg } from './pulsars';
import { SAGAN_HYDROGEN_HZ } from './units';

// Independent truth: Sagan, Salzman Sagan and Drake 1972 (Science 175, 881), Table 1, column
// "Period (second) (1970/1971 epoch)", as transcribed in docs/research/cover.md section 2 ("P 1970/71").
const SSD72_TABLE1_S: Record<string, number> = {
  'B1642-03': 0.387688779,
  'B1929+10': 0.226517038,
  'B1933+16': 0.35873542,
  'B2016+28': 0.55795339,
  'B2217+47': 0.538467378,
  'B0329+54': 0.7145186424,
  'B0525+21': 3.7454908,
  'B0531+21': 0.033129645,
  'B0823+26': 0.530659599,
  'B0950+08': 0.2530650432,
  'B0833-45': 0.0892187479,
  'B1240-64': 0.388,
  'B1451-68': 0.263376764,
  'B1727-47': 0.82968300,
};

describe('cover map: the engraved numbers and directions', () => {
  const cover = loadCover();
  const lines = cover.pulsarMap.lines;

  it('decodes all 14 binary periods to the 1972 table', () => {
    // Tolerance 1e-9 s: Sagan's integers are the table periods rounded to one hydrogen period
    // (0.70 ns), so the decoded value differs from the decimal table by at most half of that.
    let worst = 0;
    for (const line of lines) {
      const truth = SSD72_TABLE1_S[line.bname];
      expect(truth, line.bname).toBeDefined();
      const d = Math.abs(mapPeriod(line, SAGAN_HYDROGEN_HZ) - (truth as number));
      worst = Math.max(worst, d);
    }
    const pass = lines.length === 14 && worst < 1e-9;
    recordCheck({
      id: 'cover.map.periods',
      claim: `The ${lines.length} binary numbers on the map, read in units of hydrogen's 21 cm period, are the pulsar periods published in 1972.`,
      measured: `14 of 14 decoded; largest difference ${(worst * 1e9).toFixed(2)} ns`,
      expected: 'Sagan, Salzman Sagan and Drake 1972, Table 1 (1970/71 periods)',
      tolerance: '1 ns (the rounding of the published decimal to whole hydrogen periods, 0.70 ns)',
      pass,
    });
    expect(lines.length).toBe(14);
    expect(worst).toBeLessThan(1e-9);
  });

  it('draws every pulsar within 3 degrees of its galactic longitude', () => {
    const byJ = new Map(loadPulsars().pulsars.map((p) => [p.jname, p]));
    let worst = { d: 0, name: '' };
    for (const line of lines) {
      const p = byJ.get(line.jname);
      expect(p, line.jname).toBeDefined();
      const d = Math.abs(wrapDeg(line.mapAngleDeg - (p?.gl ?? NaN)));
      if (d > worst.d) worst = { d, name: line.bname };
    }
    // 3 deg: the research's measurement of the drawn angles, 0.2 to 2.7 deg (cover.md section 2).
    const pass = worst.d <= 3;
    recordCheck({
      id: 'cover.map.angles',
      claim: `Each map line points within ${worst.d.toFixed(1)} degrees of its pulsar's galactic longitude, measured counter-clockwise from the galactic-centre line.`,
      measured: `largest difference ${worst.d.toFixed(2)} deg (${worst.name})`,
      expected: 'ATNF v2.9.0 galactic longitudes (data/pulsars.json)',
      tolerance: '3 deg (research measurement: 0.2 to 2.7 deg, B1451-68 the largest; cover.md section 2)',
      pass,
    });
    expect(worst.d).toBeLessThanOrEqual(3);
  });
});
