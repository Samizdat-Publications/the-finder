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

function Cell(p: { craft: CraftInstruments; row: InstrumentRow }) {
  const { craft, row } = p;
  return (
    <td data-craft={craft.id} data-instrument={row.code} data-state={row.on ? 'on' : 'off'} class={row.on ? 'on' : 'off'}>
      {row.on ? 'running' : offText(row)}
    </td>
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
      <div class="epi-table-wrap">
        <table class="epi-table" data-epilogue-instruments>
          <caption class="epi-small">As of {asOfText}.</caption>
          <thead>
            <tr>
              <th scope="col">Instrument</th>
              <th scope="col">{v1.name}</th>
              <th scope="col">{v2.name}</th>
            </tr>
          </thead>
          <tbody>
            {v1.instruments.map((row, i) => (
              <tr key={row.code}>
                <th scope="row">{row.name}</th>
                <Cell craft={v1} row={row} />
                <Cell craft={v2} row={v2.instruments[i] as InstrumentRow} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="epi-why">
        Their power falls by about {powerLossWattsPerYear} watts a year as the plutonium decays.{' '}
        <a href={`/checked/#row-${FUEL_CLOCK_ROW}`} target="_blank" rel="noopener" data-epilogue-fuel-link>
          This is the same decay you used as a clock in Arrival
        </a>
        .
      </p>
      <p class="epi-small">{bigBang.text}</p>
    </section>
  );
}
