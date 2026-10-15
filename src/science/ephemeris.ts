// The epilogue's "where are they now": JPL Horizons tables for Voyager 1, Voyager 2 and Earth
// (data/ephemeris.json: Sun-centred, ICRF, km and km/s, TDB; 30-day nodes for the craft 2000-2099,
// 10-day nodes for Earth 2020-2040), interpolated by cubic Hermite on position using the node
// velocities. docs/research/voyager.md section 3: 30-day nodes give 1.9 km maximum error for V1.
// Pure: callers pass the parsed tables.

import type { Vec3 } from './astro';
import { C_KM_S } from './units';
import { bisectRoot } from './stats';
import type { EphemerisBody } from './types';

const DAY_S = 86_400;

/** Cubic Hermite state at jdTdb; throws outside [first node, last node]. */
export function hermiteState(body: EphemerisBody, jdTdb: number): { posKm: Vec3; velKmS: Vec3 } {
  const n = body.rows.length;
  const jdLast = body.jd0 + (n - 1) * body.stepDays;
  if (!(jdTdb >= body.jd0 && jdTdb <= jdLast)) {
    throw new Error(`hermiteState: JD ${jdTdb} is outside the table (${body.jd0} to ${jdLast} TDB)`);
  }
  const i = Math.min(n - 2, Math.floor((jdTdb - body.jd0) / body.stepDays));
  const a = body.rows[i]!;
  const b = body.rows[i + 1]!;
  const h = body.stepDays * DAY_S; // interval length, s
  const s = (jdTdb - (body.jd0 + i * body.stepDays)) / body.stepDays;
  const s2 = s * s;
  const s3 = s2 * s;
  // Hermite basis on [0, 1] and their derivatives.
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const d00 = 6 * s2 - 6 * s;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = -6 * s2 + 6 * s;
  const d11 = 3 * s2 - 2 * s;
  const pos = [0, 1, 2].map((k) => h00 * a[k]! + h10 * h * a[k + 3]! + h01 * b[k]! + h11 * h * b[k + 3]!);
  const vel = [0, 1, 2].map((k) => (d00 * a[k]! + d01 * b[k]!) / h + d10 * a[k + 3]! + d11 * b[k + 3]!);
  return { posKm: [pos[0]!, pos[1]!, pos[2]!], velKmS: [vel[0]!, vel[1]!, vel[2]!] };
}

export function distanceKm(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** One-way light time, hours (c exact by the SI, units.ts). */
export function lightTimeHours(km: number): number {
  return km / C_KM_S / 3600;
}

/**
 * First JD (TDB) after jdFrom, up to jdTo, when the craft's geometric distance from Earth reaches the
 * given light time. Earth's orbital motion (up to 30 km/s) beats the craft's recession (17 km/s), so
 * the distance is not monotone over a year: scan in 1-day steps for the first upward crossing, then
 * bisect to about 0.01 s. Throws if there is no crossing in the window.
 */
export function crossingJd(craft: EphemerisBody, earth: EphemerisBody, lightHours: number, jdFrom: number, jdTo: number): number {
  const f = (jd: number): number => lightTimeHours(distanceKm(hermiteState(craft, jd).posKm, hermiteState(earth, jd).posKm)) - lightHours;
  // A 1-day step can only miss a crossing pair that sits on a turning point of the distance: its
  // second derivative is at most about Earth's centripetal acceleration (6e-3 m/s^2), so within one
  // day the distance bends by at most 0.5 a t^2 = 22,000 km (0.07 light-seconds) from a straight line.
  const step = 1;
  let a = jdFrom;
  let fa = f(a);
  if (fa === 0) return a;
  while (a < jdTo) {
    const b = Math.min(jdTo, a + step);
    const fb = f(b);
    if (fa < 0 && fb >= 0) return fb === 0 ? b : bisectRoot(f, a, b, 200, 1e-7);
    a = b;
    fa = fb;
  }
  throw new Error(`crossingJd: light time ${lightHours} h is not reached between JD ${jdFrom} and ${jdTo}`);
}
