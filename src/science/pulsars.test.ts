import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import {
  catalogueViewToday, dateMapToday, elapsedFromSpin, honestHalfWidth1970, identifyLines, impliedEpoch, mapPeriod, spinForward,
} from './pulsars';
import { HYDROGEN_HZ, JULIAN_YEAR_S, SAGAN_HYDROGEN_HZ } from './units';

const cover = loadCover();
const cat = loadPulsars();
const byJ = new Map(cat.pulsars.map((p) => [p.jname, p]));
const glitches = loadGlitches().pulsars;

// docs/research/clocks.md section 3a table ("Implied epoch"), decimal years. Crab: 1971.76 (the
// research's F0-F3 solution; dating.py prints 1971.75 with F2). Vela and B1727-47 also glitch-corrected.
const TABLE_3A: Record<string, { raw: number; corrected?: number }> = {
  'B0531+21': { raw: 1971.76 },
  'B0833-45': { raw: 1972.21, corrected: 1971.77 },
  'B1727-47': { raw: 1970.64, corrected: 1970.09 },
  'B0525+21': { raw: 1968.94 },
  'B1933+16': { raw: 1970.19 },
  'B2217+47': { raw: 1969.91 },
  'B0329+54': { raw: 1969.76 },
  'B1642-03': { raw: 1969.77 },
  'B0823+26': { raw: 1969.14 },
  'B1929+10': { raw: 1969.78 },
  'B0950+08': { raw: 1968.47 },
  'B2016+28': { raw: 1966.60 },
  'B1451-68': { raw: 1969.52 },
};

describe('spin-down with a braking index', () => {
  it('closed form matches a numerical integration of dP/dt = k P^(2-n)', () => {
    // RK4 with 20,000 steps; its truncation error is far below the 1e-9 relative tolerance (spec).
    const cases = [
      { p0: 0.0334, pdot0: 4.21e-13, n: 2.342 },
      { p0: 0.0893, pdot0: 1.25e-13, n: 1.7 },
      { p0: 0.83, pdot0: 1.64e-13, n: 0.9 },
      { p0: 0.558, pdot0: 1.48e-16, n: 3 },
      { p0: 0.5, pdot0: 1e-14, n: 1 },
    ];
    const t = 44_000 * JULIAN_YEAR_S;
    for (const c of cases) {
      const k = c.pdot0 * Math.pow(c.p0, c.n - 2);
      const f = (p: number): number => k * Math.pow(p, 2 - c.n);
      const steps = 20_000;
      const h = t / steps;
      let p = c.p0;
      for (let i = 0; i < steps; i++) {
        const k1 = f(p);
        const k2 = f(p + (h * k1) / 2);
        const k3 = f(p + (h * k2) / 2);
        const k4 = f(p + h * k3);
        p += (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
      }
      const closed = spinForward(c.p0, c.pdot0, c.n, t);
      expect(Math.abs(closed.p / p - 1)).toBeLessThan(1e-9);
      // The inverse recovers the elapsed time.
      expect(Math.abs(elapsedFromSpin(closed.p, closed.pdot, c.p0, c.n) / t - 1)).toBeLessThan(1e-9);
    }
  });
});

describe('dating the map today (clocks.md 3a)', () => {
  const dating = dateMapToday(cover.pulsarMap.lines, byJ, glitches, SAGAN_HYDROGEN_HZ);

  it('reproduces every implied epoch in clocks.md Table 3a', () => {
    // 0.05 yr: the research quotes epochs to 0.01 yr; 0.05 allows its rounding plus the choice of
    // F2-only versus F2 and F3 for the Crab (1971.75 versus 1971.76) (spec).
    const lines: string[] = [];
    let worst = 0;
    for (const r of dating.rows) {
      const ref = TABLE_3A[r.line.bname];
      if (!ref) continue;
      const dRaw = Math.abs(r.raw.decimalYear - ref.raw);
      worst = Math.max(worst, dRaw);
      expect(dRaw, `${r.line.bname} raw`).toBeLessThanOrEqual(0.05);
      let s = `${r.line.bname} ${r.raw.decimalYear.toFixed(2)} (research ${ref.raw})`;
      if (ref.corrected !== undefined) {
        const dC = Math.abs(r.corrected.decimalYear - ref.corrected);
        worst = Math.max(worst, dC);
        expect(dC, `${r.line.bname} corrected`).toBeLessThanOrEqual(0.05);
        s += `, glitch-corrected ${r.corrected.decimalYear.toFixed(2)} (research ${ref.corrected}; ${r.corrected.glitchesAdded} glitches, sum ${r.corrected.sumDfOverF.toExponential(4)})`;
      }
      lines.push(s);
    }
    const crab = dating.rows.find((r) => r.line.bname === 'B0531+21');
    const vela = dating.rows.find((r) => r.line.bname === 'B0833-45');
    recordCheck({
      id: 'dating.today',
      claim: 'Today the map dates itself to about 1971: the Crab and the glitch-corrected Vela pulsar agree on late 1971, and 13 pulsars average 1969.7.',
      measured: `Crab ${crab?.raw.decimalYear.toFixed(2)}, Vela glitch-corrected ${vela?.corrected.decimalYear.toFixed(2)}; mean of ${dating.usable.length} usable ${dating.rawMean.toFixed(2)} (s.d. ${dating.rawSd.toFixed(2)}), glitch-corrected ${dating.correctedMean.toFixed(2)} (s.d. ${dating.correctedSd.toFixed(2)}). ${lines.join('; ')}`,
      expected: 'docs/research/clocks.md section 3a (ATNF v2.9.0 ephemerides; Jodrell Bank glitch table)',
      tolerance: 'each epoch within 0.05 yr; mean within 0.3 yr of 1969.7',
      pass: worst <= 0.05,
      notes: 'F0 and F1 only, except where F2 implies a physical braking index (only the Crab); glitches added back strictly between the solved epoch and PEPOCH, iterated until stable. Vela: 13 glitches give 1971.82; the research value 1971.77 also added back glitch #2 (MJD 41192), which precedes the date it solved for (MJD 41234), so it is not self-consistent (D-A16).',
    });
  });

  it('averages 1969.7 over the 13 usable pulsars and flags B1240-64 by rule', () => {
    expect(dating.usable.length).toBe(13);
    // 0.3 yr: the spec's tolerance on the research mean 1969.7 (s.d. 1.4 over 13, standard error 0.4).
    expect(Math.abs(dating.rawMean - 1969.7)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(dating.correctedMean - 1969.7)).toBeLessThanOrEqual(0.3);
    // s.d. "about 1.4" (clocks.md 3a): within 0.2.
    expect(Math.abs(dating.rawSd - 1.4)).toBeLessThanOrEqual(0.2);
    const flagged = dating.rows.filter((r) => !r.usable);
    expect(flagged.map((r) => r.line.bname)).toEqual(['B1240-64']);
    const b1240 = flagged[0];
    // clocks.md 3a: -1408 (unusable); 1 yr tolerance on the research's rounding.
    expect(Math.abs((b1240?.raw.decimalYear ?? 0) - -1407.67)).toBeLessThan(1);
  });

  it('the hydrogen constant used makes no difference (under 0.02 yr)', () => {
    // Sagan's 1.420405752e9 Hz versus the maser value 1,420,405,751.768 Hz: 1.6e-10 relative (units.ts).
    let worst = 0;
    let who = '';
    for (const line of cover.pulsarMap.lines) {
      const p = byJ.get(line.jname);
      if (!p || line.bname === 'B1240-64') continue;
      const a = impliedEpoch(p, mapPeriod(line, SAGAN_HYDROGEN_HZ)).decimalYear;
      const b = impliedEpoch(p, mapPeriod(line, HYDROGEN_HZ)).decimalYear;
      if (Math.abs(a - b) > worst) { worst = Math.abs(a - b); who = line.bname; }
    }
    expect(who).toBe('B2016+28');
    expect(worst).toBeLessThan(0.02);
  });
});

describe('identification today', () => {
  it('each map line has exactly one consistent pulsar among all 4,503', () => {
    const now = 2026.79; // 2026-10-15
    const view = catalogueViewToday(cat.pulsars, now);
    const ids = identifyLines(cover.pulsarMap.lines, view, {
      // 5 deg: 3 deg map accuracy (cover.md section 2) plus 2 deg of motion since the map was made (spec).
      directionTolDeg: 5,
      dopplerAllowance: 0,
      // No pulsar was known before 1967 (Hewish et al. 1968), so no map of periods is older than 59 yr.
      windowYears: [0, 59],
      nRange: [0.9, 4],
      // Precision: max(Sagan's stated digits, 0.4 ppm), the measured accuracy of the 1970/71 periods (D-A16).
      mapHalfWidth: (line) => honestHalfWidth1970(line, SAGAN_HYDROGEN_HZ),
      hz: SAGAN_HYDROGEN_HZ,
    });
    const summary = ids.map((r) => {
      const names = r.candidates.map((c) => `${c.view.jname}${c.tRangeYears ? ` [${c.tRangeYears[0].toFixed(1)}, ${c.tRangeYears[1].toFixed(1)}] yr` : ''}`);
      return `${r.line.bname}: ${r.directionCandidates.length} by direction, ${r.candidates.length} consistent (${names.join(', ') || 'none'})`;
    });
    const ok = ids.every((r) => r.candidates.length === 1 && r.candidates[0]?.view.jname === r.line.jname);
    recordCheck({
      id: 'identify.today',
      claim: 'Using direction and period together, each map line matches exactly one pulsar in the modern catalogue of 4,503, and it is the right one.',
      measured: summary.join('; '),
      expected: 'the identities in Sagan et al. 1972 and Johnston (docs/research/clocks.md section 2)',
      tolerance: 'longitude within 5 deg; map age between 0 and 59 years for some braking index 0.9 to 4, with each period trusted to max(its stated digits, 0.4 ppm)',
      pass: ok,
      notes: 'Finding: B2016+28 implies a date of 1966.6, before its 1968 discovery, so its 1970/71 period was good to about 8 significant figures, not the 9 Sagan et al. state; 0.4 ppm is the accuracy Johnston measured against Taylor and Manchester 1975 (cover.md section 2).',
    });
    for (const r of ids) {
      expect(r.candidates.map((c) => c.view.jname), `${r.line.bname}: ${summary.find((s) => s.startsWith(r.line.bname))}`).toEqual([r.line.jname]);
    }
  });
});
