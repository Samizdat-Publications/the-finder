// Our Frame, sections 1 and 2. "The turn": the game steps out of the fiction into the viewer's own time, with
// the viewer's own clock. "Right now": where both Voyagers are this second, in kilometres, hours and years,
// computed in the browser from the JPL Horizons tables (src/science/voyagerNow.ts, the same maths as the tour's
// last card), and the moment Voyager 1 is one light-day from Earth.

import { useEffect, useState } from 'preact/hooks';
import { lightDayUtcMs, voyagerNow, type EphemerisBodies, type VoyagerNow } from '../../science/voyagerNow';
import { epilogue, loadEphemeris } from './epilogueData';
import { grouped, hoursMinutes, lightDaySentence } from './format';

/** The viewer's clock, ticking once a second. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function Turn() {
  const now = useClock();
  return (
    <section class="epi-sec epi-turn" data-epilogue-section="turn" aria-labelledby="epi-turn-h">
      <h2 id="epi-turn-h" class="epi-lead">
        You have been the Finder, a scientist 44,000 years from now. Now step back to your own time: the year the machine is still flying.
      </h2>
      <p class="epi-clock" data-epilogue-clock aria-live="off">
        <span class="epi-date">{now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <span class="epi-time">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </p>
      <p class="epi-small">This is the clock of the device you are playing on.</p>
    </section>
  );
}

/** The tables, loaded once; null while loading; an error text if they could not be read. */
function useEphemeris(): { bodies: EphemerisBodies | null; error: string | null } {
  const [bodies, setBodies] = useState<EphemerisBodies | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadEphemeris().then(
      (b) => alive && setBodies(b),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { bodies, error };
}

function Craft(p: { c: VoyagerNow['craft'][number] }) {
  const { c } = p;
  return (
    <div class="epi-craft" data-epilogue-craft={c.id} data-km={c.km.toFixed(0)} data-hours={c.hours.toFixed(5)} data-au={c.au.toFixed(4)} data-kms={c.speedKmS.toFixed(4)}>
      <h3>{c.name}</h3>
      <p class="epi-big">
        {grouped(c.km)} <span>km from Earth</span>
      </p>
      <dl>
        <div>
          <dt>Light from Earth takes</dt>
          <dd>{hoursMinutes(c.hours)}</dd>
        </div>
        <div>
          <dt>From the Sun</dt>
          <dd>{c.au.toFixed(1)} times Earth's distance</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{c.speedKmS.toFixed(1)} km every second</dd>
        </div>
      </dl>
    </div>
  );
}

export function Now() {
  const { bodies, error } = useEphemeris();
  const clock = useClock();
  let positions: VoyagerNow | null = null;
  let problem = error;
  if (bodies) {
    try {
      positions = voyagerNow(bodies, clock);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }
  const ld = bodies ? lightDayUtcMs(bodies) : null;
  return (
    <section class="epi-sec epi-now" data-epilogue-section="now" aria-labelledby="epi-now-h">
      <h2 id="epi-now-h" class="epi-head">
        Right now
      </h2>
      {problem && <p class="epi-small" role="alert">Could not compute the positions: {problem}</p>}
      {!positions && !problem && <p class="epi-small">Computing where they are...</p>}
      {positions && (
        <div class="epi-crafts" data-epilogue-now>
          {positions.craft.map((c) => (
            <Craft key={c.id} c={c} />
          ))}
        </div>
      )}
      {ld !== null && (
        <p class="epi-lightday" data-epilogue-lightday data-computed-ms={Math.round(ld)}>
          {lightDaySentence(ld, Date.parse(epilogue.lightDay.nasaUtc), clock.getTime())}
        </p>
      )}
      <p class="epi-small">Computed in your browser, this second, from NASA JPL Horizons tables. The numbers keep moving because the machines do.</p>
    </section>
  );
}
