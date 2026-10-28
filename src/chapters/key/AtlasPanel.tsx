// The atlas of hydrogen (key.unit): five transitions, each a period and a wavelength; pick one and the units
// panel reads the cover's numbers with it, live: the disc's turn and how its rim speed compares with what a
// copper disc survives, a side, a picture line, and the 14 map numbers against the pulsar catalogue. The rows are
// one line each and the choices lead under them; the 14 numbers themselves fold (the hero-control pass, 2026-10-28).

import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { Clamp, Fine } from '../../ui/Fine';
import { GlyphLabel } from '../../ui/Glyph';
import { formatNumber, formatPower, quantity } from '../../ui/units';
import { keyInputs, pulsarError, pulsarSpan } from './data';
import { LastReading, PanelHead, Propose, plural, type Choice } from './parts';
import { TRANSITIONS, periodS, transition, wavelengthM, type TransitionId } from './physics';
import { readWithUnit } from './readings';

export const ATLAS_CHOICES: Choice[] = TRANSITIONS.map((t) => ({ id: t.id, label: `The ${t.key} transition`, answer: t.id }));

function Q(p: { dim: 'time' | 'length'; si: number }) {
  const q = quantity(p.dim, p.si);
  return (
    <span class="q">
      <span class="num">{q.number}</span> <span class="unitname">{q.number === '1' ? q.unitKey : plural(q.unitKey)}</span>
      {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
    </span>
  );
}

const ratio = (x: number): string => (x >= 1000 || x < 0.01 ? formatPower(x, 2) : formatNumber(Number(x.toPrecision(2))));

function UnitsTable(p: { id: TransitionId }) {
  const t = transition(p.id);
  const range = pulsarSpan.value;
  if (!t) return null;
  if (!range) {
    return <p class="note" role="status">{pulsarError.value ? `The pulsar catalogue did not load: ${pulsarError.value}` : 'Loading the pulsar catalogue...'}</p>;
  }
  const r = readWithUnit(t, keyInputs(), range);
  return (
    <>
    <table class="ktable units" data-units={p.id} data-in-range={r.mapInRange}>
      <caption>
        The cover's numbers counted in the {t.key}
      </caption>
      <tbody>
        <tr>
          <th>one turn of the disc</th>
          <td><Q dim="time" si={r.turnS} /></td>
        </tr>
        <tr class={r.rimMS < r.burstMS ? 'fine' : 'absurd'}>
          <th>its rim speed over the speed that bursts a copper disc</th>
          <td data-rim-ratio={ratio(r.rimMS / r.burstMS)}>{ratio(r.rimMS / r.burstMS)}</td>
        </tr>
        <tr>
          <th>one side</th>
          <td><Q dim="time" si={r.sideS} /></td>
        </tr>
        <tr>
          <th>one picture line</th>
          <td><Q dim="time" si={r.lineS} /></td>
        </tr>
        <tr class={r.mapInRange === r.mapS.length ? 'fine' : 'absurd'}>
          <th>map numbers among the {range.count.toLocaleString('en-US')} known pulsars</th>
          <td data-map-in-range={r.mapInRange}>
            {r.mapInRange} of {r.mapS.length}
          </td>
        </tr>
        <tr>
          <td colSpan={2}>
            <Fine label={`The ${r.mapS.length} map numbers`}>
            <ol class="mapnums">
              {r.mapS.map((s, i) => {
                const ok = s >= range.minS && s <= range.maxS;
                return (
                  <li key={i} class={ok ? 'fine' : 'absurd'} title={ok ? 'a period some known pulsar has' : 'faster than any known pulsar'}>
                    <Q dim="time" si={s} /> <span class="tag">{ok ? 'known' : 'too fast'}</span>
                  </li>
                );
              })}
            </ol>
            </Fine>
          </td>
        </tr>
      </tbody>
    </table>
    <Clamp>
      Known pulsars turn once in <Q dim="time" si={range.minS} /> to <Q dim="time" si={range.maxS} /> (the alien's catalogue).
    </Clamp>
    </>
  );
}

export function AtlasPanel(p: { choice: TransitionId; onChoice: (id: TransitionId) => void }) {
  const status = nodeStatus('key.unit', confirmedSet.value);
  // The picked row says what its reading makes of the map numbers (the table's own row, from readWithUnit), so the
  // finding shows where the player clicked; the full table follows the choices.
  const range = pulsarSpan.value;
  const picked = transition(p.choice);
  const map = range && picked ? readWithUnit(picked, keyInputs(), range) : null;
  return (
    <section class={`kpanel ${status}`} data-panel="key.unit" data-status={status} aria-label="Atlas of hydrogen">
      <PanelHead id="key.unit" />
      <Clamp>
        The plate draws one small atom twice, side by side, with a single stroke between them; inside each, two little marks point the
        same way in one drawing and opposite ways in the other.
      </Clamp>
      {/* One line a row; the picked row shows what its change is and its wavelength (the hero-control pass, 2026-10-28). */}
      <ul class="atlas compact" role="radiogroup" aria-label="Atlas of hydrogen transitions">
        {TRANSITIONS.map((t) => {
          const on = p.choice === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                class={`atlasrow${on ? ' on' : ''}`}
                data-atlas={t.id}
                title={`${t.key}: ${t.gloss}`}
                onClick={() => p.onChoice(t.id)}
              >
                <span class="atlasline">
                  <GlyphLabel k={t.key} gloss={on ? `${t.key}: ${t.gloss}` : t.key} height={16} />
                  {!on && (
                    <span class="atlasq">
                      period <Q dim="time" si={periodS(t)} />
                    </span>
                  )}
                </span>
                {on && (
                  <span class="atlasq">
                    period <Q dim="time" si={periodS(t)} />, wavelength <Q dim="length" si={wavelengthM(t)} />
                  </span>
                )}
                {on && map && (
                  <span class={`atlasmap ${map.mapInRange === map.mapS.length ? 'fine' : 'absurd'}`} data-atlas-map={map.mapInRange}>
                    read with it, {map.mapInRange} of {map.mapS.length} map numbers are periods some known pulsar has
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <Propose id="key.unit" choices={ATLAS_CHOICES} legend="Which transition is the cover's unit?" class="hero-control kchoices-grid" />
      <UnitsTable id={p.choice} />
      <LastReading id="key.unit" />
    </section>
  );
}
