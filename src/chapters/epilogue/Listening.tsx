// Our Frame, section 3: the ten instruments on each Voyager, which still run and, for the rest, the date each
// was switched off and why (power, or the instrument itself degraded). Every row comes from data/epilogue.json,
// which comes from NASA's pages (docs/research/epilogue.md section 1).

import { nodeDef } from '../../game/graph';
import { dateLong } from './format';
import { epilogue, type CraftInstruments, type InstrumentRow } from './epilogueData';

const FUEL_CLOCK_ROW = nodeDef('arrival.fuelAge')?.checkedRow ?? 1;

/** "off since 25 February 2025 (power)"; two dates are both named. */
function offText(i: InstrumentRow): string {
  const dates = (i.offDates ?? []).map(dateLong);
  const when = dates.length > 1 ? `${dates.slice(0, -1).join(', ')} and ${dates[dates.length - 1]}` : `since ${dates[0] ?? 'an unrecorded date'}`;
  return `off ${when} (${i.reason ?? 'power'})`;
}

/** The first date an instrument went dark ("1990-02-14"), or '' for one still running. */
const firstOff = (i: InstrumentRow): string => (i.on ? '' : (i.offDates ?? [])[0] ?? '');

/** The slow dimming, in order: dark ones by the date they went out, the still-running ones last. */
function byDimming(rows: InstrumentRow[]): InstrumentRow[] {
  const key = (i: InstrumentRow): string => (i.on ? '9999' : firstOff(i) || '9998');
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)));
}

function Lamp(p: { craft: CraftInstruments; row: InstrumentRow }) {
  const { craft, row } = p;
  const state = row.on ? 'running' : offText(row);
  const full = `${row.name} (${row.code}): ${state}`;
  return (
    <li class="epi-lamp-cell">
      <div class={`epi-lamp ${row.on ? 'on' : 'off'}`} tabIndex={0} role="img" aria-label={`${craft.name}, ${full}`} data-craft={craft.id} data-instrument={row.code} data-state={row.on ? 'on' : 'off'}>
        <span class="epi-bulb" aria-hidden="true" />
        <span class="epi-lamp-code" aria-hidden="true">
          {row.code}
        </span>
        <span class="epi-lamp-year" aria-hidden="true">
          {row.on ? 'running' : firstOff(row).slice(0, 4)}
        </span>
        <span class="epi-tip" aria-hidden="true">
          <b>{row.name}</b>
          {state}
        </span>
      </div>
    </li>
  );
}

function LampRow(p: { craft: CraftInstruments }) {
  const { craft } = p;
  const running = craft.instruments.filter((i) => i.on).length;
  return (
    <div class="epi-lamprow" data-lamprow={craft.id}>
      <p class="epi-lamphead">
        <span class="epi-lampname">{craft.name}</span>
        <span class="epi-lampcount">
          {running} of {craft.instruments.length} still running
        </span>
      </p>
      <ul class="epi-lamps" aria-label={`${craft.name} instruments, in the order they were switched off`}>
        {byDimming(craft.instruments).map((row) => (
          <Lamp key={row.code} craft={craft} row={row} />
        ))}
      </ul>
    </div>
  );
}

export function Listening() {
  const { craft, asOfText, powerLossWattsPerYear, bigBang } = epilogue.instruments;
  const [v1, v2] = craft as [CraftInstruments, CraftInstruments];
  const running = (c: CraftInstruments): number => c.instruments.filter((i) => i.on).length;
  return (
    <section class="epi-sec epi-listening" data-epilogue-section="listening" aria-labelledby="epi-listen-h">
      <h2 id="epi-listen-h" class="epi-head">
        Still listening
      </h2>
      <p class="epi-lead small" data-epilogue-counts={`${running(v1)}/${v1.instruments.length},${running(v2)}/${v2.instruments.length}`}>
        {v1.name} runs {running(v1)} of its {v1.instruments.length} instruments, {v2.name} runs {running(v2)}.
      </p>
      <div class="epi-lampsbox" data-epilogue-instruments>
        <p class="epi-small epi-asof">As of {asOfText}. Switched off, oldest first.</p>
        <LampRow craft={v1} />
        <LampRow craft={v2} />
        <div class="epi-powerbar" data-epilogue-powerbar>
          <span class="epi-powerline" aria-hidden="true" />
          <span class="epi-powerlabel">Power: about {powerLossWattsPerYear} watts less every year</span>
        </div>
      </div>
      <p class="epi-why">
        Their power falls by about {powerLossWattsPerYear} watts a year, partly because the plutonium decays and partly because the generators' thermocouples, which turn its heat into
        electricity, wear out.{' '}
        <a href={`/checked/#row-${FUEL_CLOCK_ROW}`} target="_blank" rel="noopener" data-epilogue-fuel-link>
          The decay is the same one you used as a clock in Arrival
        </a>
        .
      </p>
      <p class="epi-small">{bigBang.text}</p>
    </section>
  );
}
