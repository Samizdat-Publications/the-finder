// Times or lengths (key.timesNotLengths): every number on the cover read with the spin flip both ways, as a
// time (that many periods) and as a length (that many wavelengths), beside the disc in the alien's hand and
// the whole craft, so the absurd reading shows itself.

import { game } from '../../game/state';
import { formatNumber, quantity } from '../../ui/units';
import { CRAFT_SPAN_M, RECORD_RADIUS_M, keyInputs, pulsarSpan } from './data';
import { LastReading, PanelHead, Propose, type Choice } from './parts';
import { ABSURD_FACTOR, timesAndLengths } from './readings';

export const TIMES_CHOICES: Choice[] = [
  { id: 'times', label: 'Times: each number counts periods of the spin flip', answer: 'times' },
  { id: 'lengths', label: 'Lengths: each number counts wavelengths of the spin flip', answer: 'lengths' },
];

function Q(p: { dim: 'time' | 'length'; si: number; bare?: boolean }) {
  const q = quantity(p.dim, p.si);
  return (
    <span class="q">
      <span class="num">{q.number}</span> {!p.bare && <span class="unitname">{q.number === '1' ? q.unitKey : `${q.unitKey}s`}</span>}
      {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
    </span>
  );
}

const big = (x: number): string => (x >= 1e6 ? x.toExponential(2).replace('e+', 'e') : formatNumber(Number(x.toPrecision(3))));

export function TimesPanel() {
  const range = pulsarSpan.value;
  const disc = 2 * RECORD_RADIUS_M;
  const tl = range ? timesAndLengths(keyInputs(), range) : null;
  return (
    <section class="kpanel" data-panel="key.timesNotLengths" aria-label="Times or lengths">
      <PanelHead id="key.timesNotLengths" />
      {!tl ? (
        <p class="note" role="status">Loading the pulsar catalogue...</p>
      ) : (
        <>
          <p class="note">
            The disc in your hand is <Q dim="length" si={disc} /> across; the whole craft spans <Q dim="length" si={CRAFT_SPAN_M} />. A side
            holds {formatNumber(Math.round(tl.turnsPerSide))} turns of the disc, and a turn {formatNumber(Math.round(tl.linesPerTurn))} picture lines.
          </p>
          <div class="kscroll">
            <table class="ktable tl" data-times-lengths="" data-smallest-over-craft={tl.smallestOverCraft.toPrecision(3)}>
              <thead>
                <tr>
                  <th>number</th>
                  <th>as a time, in hydrogen periods</th>
                  <th>as a length, in discs</th>
                  <th>in crafts</th>
                </tr>
              </thead>
              <tbody>
                {tl.rows.map((r) => (
                  <tr key={r.key} title={r.where}>
                    <th>{r.key}</th>
                    <td><Q dim="time" si={r.seconds} bare /></td>
                    <td class="absurd">{big(r.metres / disc)}</td>
                    <td class="absurd">{big(r.metres / CRAFT_SPAN_M)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="note">
            The shortest of them, read as a length, is {big(tl.smallestOverCraft)} times the size of the whole craft (absurd is anything over{' '}
            {formatNumber(ABSURD_FACTOR)} times). Read as times, the disc's rim moves at {big(tl.rimMS / tl.burstMS)} of the speed that bursts it.
          </p>
        </>
      )}
      <Propose id="key.timesNotLengths" choices={TIMES_CHOICES} legend="What do the cover's numbers count?" />
      <LastReading id="key.timesNotLengths" />
    </section>
  );
}
