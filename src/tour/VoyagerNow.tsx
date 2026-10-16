// The tour's last card: where the two Voyagers are tonight, computed live from the JPL Horizons tables
// (data/ephemeris.json, src/science/ephemeris.ts), and the moment Voyager 1 becomes one light-day from Earth.
// Every number here is computed (rule 1); the table is fetched lazily so the play bundle stays small.

import { useEffect, useState } from 'preact/hooks';
import { isoUtcToJd } from '../science/astro';
import { crossingJd, distanceKm, hermiteState, lightTimeHours } from '../science/ephemeris';
import type { EphemerisBody } from '../science/types';
import { AU_KM } from '../science/units';

/** TT - UTC = 32.184 s + 37 leap seconds (in force since 2017); TDB - TT under 2 ms, ignored. */
const TDB_MINUS_UTC_DAYS = 69.184 / 86_400;

interface Craft {
  name: string;
  km: number;
  hours: number;
  au: number;
  speedKmS: number;
}

interface Now {
  at: Date;
  craft: Craft[];
  /** Voyager 1's one-light-day moment (UTC ms), if it falls inside the tables after launch. */
  lightDayMs: number | null;
}

function compute(bodies: Record<string, EphemerisBody>, at: Date): Now {
  const jd = isoUtcToJd(at.toISOString()) + TDB_MINUS_UTC_DAYS;
  const earth = bodies['399']!;
  const e = hermiteState(earth, jd);
  const craft = (['-31', '-32'] as const).map((id, i) => {
    const s = hermiteState(bodies[id]!, jd);
    const km = distanceKm(s.posKm, e.posKm);
    return {
      name: i === 0 ? 'Voyager 1' : 'Voyager 2',
      km,
      hours: lightTimeHours(km),
      au: Math.hypot(...s.posKm) / AU_KM,
      speedKmS: Math.hypot(...s.velKmS),
    };
  });
  let lightDayMs: number | null = null;
  try {
    const jdLd = crossingJd(bodies['-31']!, earth, 24, isoUtcToJd('2020-01-01T00:00:00Z'), isoUtcToJd('2039-12-01T00:00:00Z'));
    lightDayMs = (jdLd - TDB_MINUS_UTC_DAYS - 2_440_587.5) * 86_400_000;
  } catch {
    lightDayMs = null;
  }
  return { at, craft, lightDayMs };
}

const billions = (km: number): string => (km / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const hm = (h: number): string => `${Math.floor(h)} hours ${Math.round((h % 1) * 60)} minutes`;

export function VoyagerNow() {
  const [now, setNow] = useState<Now | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let bodies: Record<string, EphemerisBody> | null = null;
    const tick = (): void => {
      if (!bodies || !alive) return;
      try {
        setNow(compute(bodies, new Date()));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    import('../../data/ephemeris.json')
      .then((m) => {
        bodies = (m.default as unknown as { bodies: Record<string, EphemerisBody> }).bodies;
        tick();
      })
      .catch((err: unknown) => setError(String(err)));
    const id = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  if (error) return <p class="tour-now-error">Could not compute the positions: {error}</p>;
  if (!now) return <p class="tour-now-loading">Computing where they are...</p>;
  const ld = now.lightDayMs;
  const ldText =
    ld === null
      ? null
      : ld > now.at.getTime()
        ? `Voyager 1 will be one whole light-day from Earth on ${new Date(ld).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })} (your time): a radio message will take a full day to reach it.`
        : `Since ${new Date(ld).toLocaleDateString(undefined, { dateStyle: 'long' })}, Voyager 1 has been more than one light-day from Earth: a radio message takes over a day to reach it.`;
  return (
    <div class="tour-now" data-tour-now>
      {now.craft.map((c) => (
        <div class="tour-now-craft" key={c.name}>
          <h3>{c.name}</h3>
          <p class="tour-now-big">
            {billions(c.km)} <span>billion km from Earth</span>
          </p>
          <p>
            Light from Earth takes <strong>{hm(c.hours)}</strong> to reach it. It is {c.au.toFixed(1)} times as far from the Sun as Earth is, moving at{' '}
            {c.speedKmS.toFixed(1)} km every second.
          </p>
        </div>
      ))}
      {ldText && <p class="tour-now-ld">{ldText}</p>}
      <p class="tour-now-src">Computed now, in your browser, from NASA JPL Horizons tables. The numbers tick as it moves.</p>
    </div>
  );
}
