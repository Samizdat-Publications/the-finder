// Where the two Voyagers are at a given moment, in our units (km, hours, AU), computed from the JPL Horizons
// tables (data/ephemeris.json) by cubic Hermite interpolation, and the moment Voyager 1 is one light-day from
// Earth. Used by the tour's last card and by Our Frame (the epilogue). Pure: callers pass the parsed tables and
// a Date; no DOM, no clock of its own.

import { isoUtcToJd } from './astro';
import { crossingJd, distanceKm, hermiteState, lightTimeHours } from './ephemeris';
import type { EphemerisBody } from './types';
import { AU_KM } from './units';

/** TT - UTC = 32.184 s + 37 leap seconds (IERS Bulletin C, in force since 2017-01-01); TDB - TT under 2 ms, ignored. */
export const TDB_MINUS_UTC_DAYS = 69.184 / 86_400;

/** JD of the Unix epoch (1970-01-01T00:00:00 UTC). */
const JD_UNIX_EPOCH = 2_440_587.5;
const MS_PER_DAY = 86_400_000;

/** The Horizons ids the tables carry. */
export const EARTH_ID = '399';
export const VOYAGER_IDS = ['-31', '-32'] as const;

/** One craft at one moment. */
export interface CraftNow {
  id: (typeof VOYAGER_IDS)[number];
  name: string;
  /** Distance from Earth's centre, km. */
  km: number;
  /** One-way light time from Earth, hours. */
  hours: number;
  /** Distance from the Sun, AU. */
  au: number;
  /** Speed relative to the Sun, km/s. */
  speedKmS: number;
}

export interface VoyagerNow {
  at: Date;
  craft: CraftNow[];
}

/** The ephemeris bodies this module needs, by Horizons id. */
export type EphemerisBodies = Record<string, EphemerisBody>;

/** Julian date (TDB) of a UTC instant. */
export function tdbJdOf(at: Date): number {
  return isoUtcToJd(at.toISOString()) + TDB_MINUS_UTC_DAYS;
}

/** UTC milliseconds of a TDB Julian date. */
export function utcMsOfTdbJd(jdTdb: number): number {
  return (jdTdb - TDB_MINUS_UTC_DAYS - JD_UNIX_EPOCH) * MS_PER_DAY;
}

function need(bodies: EphemerisBodies, id: string): EphemerisBody {
  const b = bodies[id];
  if (!b) throw new Error(`voyagerNow: the ephemeris has no body ${id}`);
  return b;
}

/** Both Voyagers' distance from Earth, light time, distance from the Sun and speed at `at`. Throws outside the tables. */
export function voyagerNow(bodies: EphemerisBodies, at: Date): VoyagerNow {
  const jd = tdbJdOf(at);
  const earth = hermiteState(need(bodies, EARTH_ID), jd);
  const craft = VOYAGER_IDS.map((id, i): CraftNow => {
    const s = hermiteState(need(bodies, id), jd);
    const km = distanceKm(s.posKm, earth.posKm);
    return {
      id,
      name: i === 0 ? 'Voyager 1' : 'Voyager 2',
      km,
      hours: lightTimeHours(km),
      au: Math.hypot(...s.posKm) / AU_KM,
      speedKmS: Math.hypot(...s.velKmS),
    };
  });
  return { at, craft };
}

/** One light-day, in hours of one-way light time. */
export const LIGHT_DAY_HOURS = 24;

/**
 * The UTC moment (ms) Voyager 1 first becomes one light-day from Earth, searched in the stretch where both
 * tables overlap (Earth's runs 2020 to 2040). The geometric distance between the bodies' centres is used.
 * Returns null when there is no crossing in the window.
 */
export function lightDayUtcMs(bodies: EphemerisBodies): number | null {
  try {
    const jd = crossingJd(need(bodies, '-31'), need(bodies, EARTH_ID), LIGHT_DAY_HOURS, isoUtcToJd('2020-01-01T00:00:00Z'), isoUtcToJd('2039-12-01T00:00:00Z'));
    return utcMsOfTdbJd(jd);
  } catch {
    return null;
  }
}
