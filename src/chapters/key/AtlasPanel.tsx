// The atlas of hydrogen (key.unit): five transitions, each a period and a wavelength; pick one and the units
// panel reads the cover's numbers with it, live: the disc's turn and how its rim speed compares with what a
// copper disc survives, a side, a picture line, and the 14 map numbers against the pulsar catalogue.

import { game } from '../../game/state';
import { GlyphLabel } from '../../ui/Glyph';
import { formatNumber, quantity } from '../../ui/units';
import { keyInputs, pulsarError, pulsarSpan } from './data';
import { LastReading, PanelHead, Propose, type Choice } from './parts';
import { TRANSITIONS, periodS, transition, wavelengthM, type TransitionId } from './physics';
import { readWithUnit } from './readings';

export const ATLAS_CHOICES: Choice[] = TRANSITIONS.map((t) => ({ id: t.id, label: `The ${t.key} transition`, answer: t.id }));

function Q(p: { dim: 'time' | 'length'; si: number }) {
  const q = quantity(p.dim, p.si);
  return (
    <span class="q">
      <span class="num">{q.number}</span> <span class="unitname">{q.number === '1' ? q.unitKey : `${q.unitKey}s`}</span>
      {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
    </span>
  );
}

const ratio = (x: number): string => (x >= 1000 || x < 0.01 ? x.toExponential(1).replace('e+', 'e') : formatNumber(Number(x.toPrecision(2))));

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
          </td>
        </tr>
      </tbody>
    </table>
    <p class="note">
      Known pulsars turn once in <Q dim="time" si={range.minS} /> to <Q dim="time" si={range.maxS} /> (the alien's catalogue).
    </p>
    </>
  );
}

export function AtlasPanel(p: { choice: TransitionId; onChoice: (id: TransitionId) => void }) {
  return (
    <section class="kpanel" data-panel="key.unit" aria-label="Atlas of hydrogen">
      <PanelHead id="key.unit" />
      <p class="note">
        The plate draws one small atom twice, side by side, with a single stroke between them; inside each, two little marks point the
        same way in one drawing and opposite ways in the other.
      </p>
      <ul class="atlas" role="radiogroup" aria-label="Atlas of hydrogen transitions">
        {TRANSITIONS.map((t) => (
          <li key={t.id}>
            <button type="button" role="radio" aria-checked={p.choice === t.id} class={`atlasrow${p.choice === t.id ? ' on' : ''}`} data-atlas={t.id} onClick={() => p.onChoice(t.id)}>
              <GlyphLabel k={t.key} gloss={`${t.key}: ${t.gloss}`} height={16} />
              <span class="atlasq">
                period <Q dim="time" si={periodS(t)} />, wavelength <Q dim="length" si={wavelengthM(t)} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <UnitsTable id={p.choice} />
      <Propose id="key.unit" choices={ATLAS_CHOICES} legend="Which transition is the cover's unit?" />
      <LastReading id="key.unit" />
    </section>
  );
}
