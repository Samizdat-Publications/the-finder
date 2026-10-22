// Our Frame, section 5: the pulsar map is older than the machine. The map's periods are from the "1970/1971
// epoch" (Sagan, Salzman Sagan and Drake 1972); Voyager launched in 1977. Each pulsar's own epoch is dated from
// today's timing by the science that already does it (src/science/pulsars.ts dateMapToday, via mapEpochs.ts), and
// the player's own reading of the map's age in The Map is shown beside it when they confirmed it.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { game } from '../../game/state';
import { messageTokens } from '../../ui/message';
import { discoveryState, launchYear } from '../../science/epoch';
import { JULIAN_YEAR_S } from '../../science/units';
import { epilogue, loadPulsarTables, nearStars, scenario } from './epilogueData';
import { grouped, numberWord } from './format';
import { mapEpochs, type MapEpochs } from './mapEpochs';

const W = 640;
const H = 200;
const X0 = 1966;
const X1 = 1979;
const PAD = { l: 18, r: 18, t: 26, b: 52 };
const xOf = (year: number): number => PAD.l + ((year - X0) / (X1 - X0)) * (W - PAD.l - PAD.r);

/**
 * The player's own reading of the map's age, if they confirmed trail.when: read in the warm-white star's frame,
 * the estimate and its 95% bounds (the confirmed message's first three quantity tokens, as moments.ts reads them).
 * Not map.old: that age is read in the Finder's own moving frame, Doppler-skewed by thousands of years, and beside
 * the flight time it would wrongly suggest a map younger than the machine.
 */
export function useOwnReading(): { yearsAgo: number; low: number | null; high: number | null } | null {
  const rec = game.records.value['trail.when'];
  const ok = [...(rec?.attempts ?? [])].reverse().find((a) => a.ok);
  if (!rec?.confirmed || !ok) return null;
  const t = messageTokens(ok.message).filter((x) => x.dim === 'time');
  const years = (i: number): number | null => (t[i] ? t[i]!.si / JULIAN_YEAR_S : null);
  const yearsAgo = years(0);
  return yearsAgo === null ? null : { yearsAgo, low: years(1), high: years(2) };
}

function Strip(p: { m: MapEpochs; launch: number }) {
  const { m, launch } = p;
  const usable = m.rows.filter((r) => r.usable).sort((a, b) => a.year - b.year);
  const base = H - PAD.b;
  const [e0, e1] = epilogue.map.periodsEpoch.years as [number, number];
  return (
    <svg class="epi-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="When each of the map's periods was true, against the year of launch" data-epilogue-strip>
      <rect class="band" x={xOf(e0)} y={PAD.t} width={xOf(e1 + 1) - xOf(e0)} height={base - PAD.t} />
      <text class="lab dim" x={(xOf(e0) + xOf(e1 + 1)) / 2} y={PAD.t - 7} text-anchor="middle">
        {epilogue.map.periodsEpoch.text}
      </text>
      <line class="axis" x1={PAD.l} y1={base} x2={W - PAD.r} y2={base} />
      {Array.from({ length: X1 - X0 + 1 }, (_, i) => X0 + i)
        .filter((y) => y % 2 === 0)
        .map((y) => (
          <g key={y}>
            <line class="tick" x1={xOf(y)} y1={base} x2={xOf(y)} y2={base + 5} />
            <text class="lab dim" x={xOf(y)} y={base + 19} text-anchor="middle">
              {y}
            </text>
          </g>
        ))}
      {usable.map((r, i) => (
        <circle key={r.jname} class="dot" data-map-epoch={r.bname} data-year={r.year.toFixed(2)} cx={xOf(r.year)} cy={base - 16 - (i % 4) * 22} r="5" />
      ))}
      <line class="launch" x1={xOf(launch)} y1={PAD.t} x2={xOf(launch)} y2={base} />
      <text class="lab launch" x={xOf(launch) - 6} y={PAD.t + 12} text-anchor="end">
        Launch, 1977
      </text>
      <text class="lab dim" x={xOf(m.mean)} y={base + 42} text-anchor="middle">
        mean of the {numberWord(usable.length)}: {m.mean.toFixed(1)}
      </text>
    </svg>
  );
}

export function MapOlder() {
  const [m, setM] = useState<MapEpochs | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadPulsarTables().then(
      (t) => {
        if (!alive) return;
        try {
          setM(mapEpochs(t.cover, t.pulsars, t.glitches));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  const launch = useMemo(() => launchYear(scenario), []);
  const own = useOwnReading();
  const flown = useMemo(() => discoveryState(scenario, nearStars).yearsAfterLaunch, []);
  const [e0, e1] = epilogue.map.periodsEpoch.years as [number, number];
  const gap = epilogue.map.launchYear - (e1 as number);
  const gapWords = numberWord(gap);
  const sharp = m?.sharp ?? [];
  const usable = m?.rows.filter((r) => r.usable) ?? [];
  const unusable = m?.rows.find((r) => !r.usable);
  return (
    <section class="epi-sec epi-map" data-epilogue-section="map" aria-labelledby="epi-map-h">
      <h2 id="epi-map-h" class="epi-head">
        The map is older than the machine
      </h2>
      <p class="epi-lead small">
        The map's periods were measured in {e0} and {e1}, about {gapWords} years before launch.
      </p>
      {error && <p class="epi-small" role="alert">Could not date the map: {error}</p>}
      {!m && !error && <p class="epi-small">Dating the map from today's pulsar timing...</p>}
      {m && <Strip m={m} launch={launch} />}
      {m && (
        <p class="epi-small" data-epilogue-map-note>
          Each dot is one pulsar: the moment, found from today's timing, when it ticked at the number on the cover (glitches allowed for).{' '}
          {sharp.length === 2 && <>The two sharpest clocks, the Crab and Vela, say {sharp.map((r) => r.year.toFixed(1)).join(' and ')}. </>}
          The {numberWord(usable.length)} dated pulsars run from {Math.min(...usable.map((r) => r.year)).toFixed(1)} to {Math.max(...usable.map((r) => r.year)).toFixed(1)}
          {unusable ? `; ${unusable.bname} is written too coarsely on the cover to date anything.` : '.'}
        </p>
      )}
      {own && (
        <p class="epi-yours" data-epilogue-yours={own.yearsAgo.toFixed(1)}>
          <b>Your own reading in The Trail:</b> read from the warm-white star, the map was made about {grouped(own.yearsAgo)} years before you found the machine
          {own.low !== null && own.high !== null ? ` (95%: ${grouped(own.low)} to ${grouped(own.high)})` : ''}, which had by then been flying about {grouped(flown)} years.
          {own.low !== null && own.high !== null && own.high - own.low > gap
            ? ` The ${gapWords} years between the map and the launch sit far inside that spread: clocks like these cannot see the gap.`
            : ''}
        </p>
      )}
      <p class="epi-why">So when the clocks in Portrait disagreed by a few years, this is one reason: each started at a different moment.</p>
    </section>
  );
}
