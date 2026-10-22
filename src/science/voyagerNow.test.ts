import { describe, expect, it } from 'vitest';
import { loadEphemeris } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { isoUtcToJd } from './astro';
import { crossingJd, distanceKm, hermiteState } from './ephemeris';
import { LIGHT_DAY_HOURS, TDB_MINUS_UTC_DAYS, lightDayUtcMs, tdbJdOf, utcMsOfTdbJd, voyagerNow } from './voyagerNow';

const bodies = loadEphemeris().bodies;

describe('voyagerNow: where the Voyagers are, from the Horizons tables', () => {
  it('gives the distances of 15 October 2026 that the epilogue.today check holds (Horizons: V1 172.06 AU, 23.9 h; V2 144.2 AU, 20.0 h)', () => {
    const now = voyagerNow(bodies, new Date('2026-10-15T00:00:00Z'));
    const [v1, v2] = now.craft;
    expect(v1!.name).toBe('Voyager 1');
    expect(v2!.name).toBe('Voyager 2');
    // Same truth and tolerances as src/science/ephemeris.test.ts (epilogue.today): 0.05 AU, 0.1 AU, 0.05 h.
    expect(Math.abs(v1!.au - 172.06)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(v2!.au - 144.2)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(v1!.hours - 23.9)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(v2!.hours - 20.0)).toBeLessThanOrEqual(0.05);
    // Speeds: Voyager 1 about 16.9 km/s (voyager.md section 5: "16.92 km/s today"), Voyager 2 slower.
    expect(v1!.speedKmS).toBeGreaterThan(16.8);
    expect(v1!.speedKmS).toBeLessThan(17.0);
    expect(v2!.speedKmS).toBeLessThan(v1!.speedKmS);
    recordCheck({
      id: 'epilogue.voyagerNow',
      claim: 'The shared "where they are now" maths (used by the tour card and Our Frame) reproduces the 15 October 2026 distances.',
      measured: `V1 ${v1!.au.toFixed(3)} AU, ${v1!.hours.toFixed(3)} h, ${v1!.speedKmS.toFixed(2)} km/s; V2 ${v2!.au.toFixed(3)} AU, ${v2!.hours.toFixed(3)} h, ${v2!.speedKmS.toFixed(2)} km/s`,
      expected: 'V1 172.06 AU, 23.9 h; V2 144.2 AU, 20.0 h (JPL Horizons, docs/research/voyager.md sections 3 and 4)',
      tolerance: '0.05 AU (V1), 0.1 AU (V2), 0.05 h',
      pass: true,
    });
  });

  it('is the same distance as the ephemeris functions give directly, at an instant', () => {
    const at = new Date('2027-03-02T12:34:56Z');
    const jd = isoUtcToJd(at.toISOString()) + TDB_MINUS_UTC_DAYS;
    expect(tdbJdOf(at)).toBeCloseTo(jd, 9);
    const earth = hermiteState(bodies['399']!, jd).posKm;
    const v1 = hermiteState(bodies['-31']!, jd).posKm;
    expect(voyagerNow(bodies, at).craft[0]!.km).toBeCloseTo(distanceKm(v1, earth), 3);
  });

  it('round-trips a UTC instant through the TDB Julian date', () => {
    const at = new Date('2026-11-18T10:16:07Z');
    expect(utcMsOfTdbJd(tdbJdOf(at))).toBeCloseTo(at.getTime(), -1);
  });

  it('finds the one-light-day moment on 18 November 2026, within an hour of NASA, and agrees with crossingJd', () => {
    const ms = lightDayUtcMs(bodies);
    expect(ms).not.toBeNull();
    const nasa = Date.parse('2026-11-18T10:16:07Z');
    expect(Math.abs((ms as number) - nasa)).toBeLessThanOrEqual(60 * 60_000);
    const jd = crossingJd(bodies['-31']!, bodies['399']!, LIGHT_DAY_HOURS, isoUtcToJd('2020-01-01T00:00:00Z'), isoUtcToJd('2039-12-01T00:00:00Z'));
    expect(utcMsOfTdbJd(jd)).toBe(ms);
  });

  it('refuses a moment outside the tables and a missing body', () => {
    expect(() => voyagerNow(bodies, new Date('2045-01-01T00:00:00Z'))).toThrow(/outside the table/);
    expect(() => voyagerNow({ '-31': bodies['-31']! }, new Date('2026-10-15T00:00:00Z'))).toThrow(/no body/);
  });
});
