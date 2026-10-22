// The tour's last card: where the two Voyagers are tonight, computed live from the JPL Horizons tables
// (data/ephemeris.json, src/science/ephemeris.ts), and the moment Voyager 1 becomes one light-day from Earth.
// Every number here is computed (rule 1); the table is fetched lazily so the play bundle stays small.

import { useEffect, useState } from 'preact/hooks';
import { lightDayUtcMs, voyagerNow, type EphemerisBodies, type VoyagerNow as Positions } from '../science/voyagerNow';

interface Now extends Positions {
  /** Voyager 1's one-light-day moment (UTC ms), if it falls inside the tables after launch. */
  lightDayMs: number | null;
}

function compute(bodies: EphemerisBodies, at: Date): Now {
  return { ...voyagerNow(bodies, at), lightDayMs: lightDayUtcMs(bodies) };
}

const wholeKm = (km: number): string => Math.round(km).toLocaleString('en-US');
const hm = (h: number): string => {
  const min = Math.round(h * 60);
  return `${Math.floor(min / 60)} hours ${min % 60} minutes`;
};

export function VoyagerNow() {
  const [now, setNow] = useState<Now | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let bodies: EphemerisBodies | null = null;
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
        bodies = (m.default as unknown as { bodies: EphemerisBodies }).bodies;
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
            {wholeKm(c.km)} <span>km from Earth</span>
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
