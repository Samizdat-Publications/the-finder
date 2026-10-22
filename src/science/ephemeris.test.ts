import { describe, expect, it } from 'vitest';
import { loadEphemeris, loadSpotChecks } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { isoUtcToJd } from './astro';
import { crossingJd, distanceKm, hermiteState, lightTimeHours } from './ephemeris';
import type { EphemerisBody } from './types';
import { AU_KM } from './units';

const eph = loadEphemeris();
const body = (id: string): EphemerisBody => {
  const b = eph.bodies[id];
  if (!b) throw new Error(`ephemeris body ${id} missing`);
  return b;
};
const V1 = body('-31');
const V2 = body('-32');
const EARTH = body('399');
/** TT - UTC = 32.184 s + 37 leap seconds (IERS Bulletin C, in force since 2017-01-01); TDB - TT < 2 ms, ignored. */
const TDB_MINUS_UTC_DAYS = 69.184 / 86_400;
const utcToTdb = (iso: string): number => isoUtcToJd(iso) + TDB_MINUS_UTC_DAYS;
const ORIGIN = [0, 0, 0] as const;

describe('ephemeris: Horizons tables', () => {
  it('reproduces every off-node Horizons spot check within 100 km', () => {
    const checks = loadSpotChecks().checks;
    let worst = 0;
    let worstAt = '';
    for (const c of checks) {
      const p = hermiteState(body(c.body), c.jd).posKm;
      const e = distanceKm(p, [c.x, c.y, c.z]);
      if (e > worst) { worst = e; worstAt = `${c.body} at JD ${c.jd}`; }
    }
    // 100 km: the spec's limit; the research measured 1.9 km maximum for 30-day nodes (voyager.md section 3).
    recordCheck({
      id: 'epilogue.ephemeris',
      claim: 'The shipped tables give the Voyagers\' positions to within 100 km at any moment from 2000 to 2099.',
      measured: `worst of ${checks.length} spot checks ${worst.toFixed(2)} km (${worstAt})`,
      expected: 'Positions fetched directly from JPL Horizons at off-node times (data/ephemeris_spotchecks.json)',
      tolerance: '100 km (spec); research found 1.9 km for 30-day nodes',
      pass: worst <= 100,
    });
    console.log(`[epilogue.ephemeris] worst ${worst.toFixed(3)} km at ${worstAt}`);
    expect(worst).toBeLessThanOrEqual(100);
  });

  it('gives the Voyagers\' distances on 2026-10-15', () => {
    const jd = utcToTdb('2026-10-15T00:00:00Z');
    const e = hermiteState(EARTH, jd).posKm;
    const v1 = hermiteState(V1, jd).posKm;
    const v2 = hermiteState(V2, jd).posKm;
    const v1Au = distanceKm(v1, ORIGIN) / AU_KM;
    const v2Au = distanceKm(v2, ORIGIN) / AU_KM;
    const v1h = lightTimeHours(distanceKm(v1, e));
    const v2h = lightTimeHours(distanceKm(v2, e));
    // Truth: voyager.md sections 3 and 4 (Horizons, 2026-10-15): V1 172.06 AU and 23.9 light-hours, V2 144.2 AU
    // and 20.0 light-hours. Tolerances from the spec: 0.05 AU, 0.1 AU, 0.05 h (the research's rounding).
    const pass = Math.abs(v1Au - 172.06) <= 0.05 && Math.abs(v2Au - 144.2) <= 0.1 && Math.abs(v1h - 23.9) <= 0.05 && Math.abs(v2h - 20.0) <= 0.05;
    recordCheck({
      id: 'epilogue.today',
      claim: 'On 15 October 2026 Voyager 1 is 172 AU from the Sun (almost 24 light-hours from Earth) and Voyager 2 is 144 AU (20 light-hours).',
      measured: `V1 ${v1Au.toFixed(3)} AU, ${v1h.toFixed(3)} h; V2 ${v2Au.toFixed(3)} AU, ${v2h.toFixed(3)} h (2026-10-15 00:00 UTC)`,
      expected: 'V1 172.06 AU, 23.9 h; V2 144.2 AU, 20.0 h (JPL Horizons, voyager.md sections 3 and 4)',
      tolerance: '0.05 AU (V1), 0.1 AU (V2), 0.05 h (the research\'s rounding)',
      pass,
    });
    expect(Math.abs(v1Au - 172.06)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(v2Au - 144.2)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(v1h - 23.9)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(v2h - 20.0)).toBeLessThanOrEqual(0.05);
  });

  it('finds Voyager 1 crossing one light-day from Earth on 18 November 2026', () => {
    const jdTdb = crossingJd(V1, EARTH, 24, utcToTdb('2026-10-15T00:00:00Z'), utcToTdb('2027-06-01T00:00:00Z'));
    const utcMs = (jdTdb - TDB_MINUS_UTC_DAYS - 2_440_587.5) * 86_400_000;
    const nasa = Date.parse('2026-11-18T10:16:07Z'); // NASA, voyager.md section 4 ("2:16:07 a.m. PST")
    const diffMin = (utcMs - nasa) / 60_000;
    const iso = new Date(Math.round(utcMs / 1000) * 1000).toISOString().replace('.000', '');
    console.log(`[epilogue.lightDay] ${iso} (${diffMin.toFixed(2)} min from NASA)`);
    recordCheck({
      id: 'epilogue.lightDay',
      claim: 'Voyager 1 becomes one light-day from Earth on 18 November 2026.',
      measured: `${iso} (geometric distance from Earth's centre; ${diffMin.toFixed(1)} min from NASA's time)`,
      expected: '2026-11-18 10:16:07 UTC (NASA, voyager.md section 4); the research\'s geometric crossing from Earth\'s centre about 10:15:51 UTC (voyager.md section 4, the same crossing to the minute); from the Sun the light-day comes later, 2027-02-03 21:39 UTC (M6 science audit, on these tables)',
      tolerance: '1 hour (spec)',
      pass: Math.abs(diffMin) <= 60,
    });
    expect(Math.abs(diffMin)).toBeLessThanOrEqual(60);
  });

  it('refuses times outside the tables', () => {
    expect(() => hermiteState(V1, isoUtcToJd('1999-12-31T00:00:00Z'))).toThrow(/outside the table/);
    const last = V1.jd0 + (V1.rows.length - 1) * V1.stepDays;
    expect(() => hermiteState(V1, last + 1)).toThrow(/outside the table/);
    expect(() => hermiteState(EARTH, isoUtcToJd('2045-01-01T00:00:00Z'))).toThrow(/outside the table/);
    // Exactly on the last node is inside.
    expect(hermiteState(V1, last).posKm[0]).toBe(V1.rows[V1.rows.length - 1]![0]);
  });

  it('interpolates smoothly: node values exact, velocity consistent with position', () => {
    const jd = V1.jd0 + 300 * V1.stepDays + 7.3;
    // Half a day: JD near 2.45e6 is resolved to about 5e-10 day, so a shorter step would be swamped by the
    // rounding of the times themselves; the cubic's truncation error over half a day is negligible.
    const dt = 0.5; // days
    const a = hermiteState(V1, jd - dt).posKm;
    const b = hermiteState(V1, jd + dt).posKm;
    const v = hermiteState(V1, jd).velKmS;
    for (let k = 0; k < 3; k++) {
      // Central difference of the interpolating cubic: error (dt^2 / 6) x its third derivative, far below 1e-6 km/s.
      expect(Math.abs(((b[k]! - a[k]!) / (2 * dt * 86_400)) - v[k]!)).toBeLessThan(1e-6);
    }
    expect(hermiteState(V1, V1.jd0 + 10 * V1.stepDays).posKm[1]).toBe(V1.rows[10]![1]);
  });
});
