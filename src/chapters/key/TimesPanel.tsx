// Times or lengths (key.timesNotLengths): every number on the cover read with the spin flip both ways, as a
// time (that many periods) and as a length (that many wavelengths), beside the disc in the alien's hand and
// the whole craft, so the absurd reading shows itself. The disc's own three numbers lead; the 14 map lines fold
// under them (the hero-control pass, 2026-10-28).

import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { Clamp, Fine } from '../../ui/Fine';
import { formatNumber, formatPower, quantity } from '../../ui/units';
import { CRAFT_SPAN_M, RECORD_RADIUS_M, keyInputs, pulsarSpan } from './data';
import { LastReading, PanelHead, Propose, plural, type Choice } from './parts';
import { ABSURD_FACTOR, timesAndLengths } from './readings';

export const TIMES_CHOICES: Choice[] = [
  { id: 'times', label: 'Times: each number counts periods of the spin flip', answer: 'times' },
  { id: 'lengths', label: 'Lengths: each number counts wavelengths of the spin flip', answer: 'lengths' },
];

function Q(p: { dim: 'time' | 'length'; si: number; bare?: boolean }) {
  const q = quantity(p.dim, p.si);
  return (
    <span class="q">
      <span class="num">{q.number}</span> {!p.bare && <span class="unitname">{q.number === '1' ? q.unitKey : plural(q.unitKey)}</span>}
      {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
    </span>
  );
}

const big = (x: number): string => (x >= 1e6 ? formatPower(x, 3) : formatNumber(Number(x.toPrecision(3))));

/** The rows of the times-or-lengths table (shared by the leading table and the folded map lines). */
function Rows(p: { rows: ReturnType<typeof timesAndLengths>['rows']; disc: number }) {
  return (
    <>
      {p.rows.map((r) => (
        <tr key={r.key} title={r.where}>
          <th>{r.key}</th>
          <td><Q dim="time" si={r.seconds} bare /></td>
          <td class="absurd">{big(r.metres / p.disc)}</td>
          <td class="absurd">{big(r.metres / CRAFT_SPAN_M)}</td>
        </tr>
      ))}
    </>
  );
}

function Head() {
  return (
    <thead>
      <tr>
        <th>number</th>
        <th>as a time, in beats</th>
        <th>as a length, in discs</th>
        <th>in crafts</th>
      </tr>
    </thead>
  );
}

/** How many of the table's rows lead (the disc's turn, its side, the picture line); the map lines fold under them. */
const LEAD_ROWS = 3;

export function TimesPanel() {
  const status = nodeStatus('key.timesNotLengths', confirmedSet.value);
  const range = pulsarSpan.value;
  const disc = 2 * RECORD_RADIUS_M;
  const tl = range ? timesAndLengths(keyInputs(), range) : null;
  return (
    <section class={`kpanel ${status}`} data-panel="key.timesNotLengths" data-status={status} aria-label="Times or lengths">
      <PanelHead id="key.timesNotLengths" />
      {!tl ? (
        <p class="note" role="status">Loading the pulsar catalogue...</p>
      ) : (
        <>
          <div class="kscroll">
            <table class="ktable tl" data-times-lengths="" data-smallest-over-craft={tl.smallestOverCraft.toPrecision(3)}>
              <Head />
              <tbody>
                <Rows rows={tl.rows.slice(0, LEAD_ROWS)} disc={disc} />
              </tbody>
            </table>
          </div>
          <Propose id="key.timesNotLengths" choices={TIMES_CHOICES} legend="What do the cover's numbers count?" class="hero-control" />
          {tl.rows.length > LEAD_ROWS && (
            <Fine label={`The ${tl.rows.length - LEAD_ROWS} map numbers, both ways`}>
              <div class="kscroll">
                <table class="ktable tl" data-times-lengths-map="">
                  <Head />
                  <tbody>
                    <Rows rows={tl.rows.slice(LEAD_ROWS)} disc={disc} />
                  </tbody>
                </table>
              </div>
            </Fine>
          )}
          <Clamp>
            The disc in your hand is <Q dim="length" si={disc} /> across; the whole craft spans <Q dim="length" si={CRAFT_SPAN_M} />. A side
            holds {formatNumber(Math.round(tl.turnsPerSide))} turns of the disc, and a turn {formatNumber(Math.round(tl.linesPerTurn))} picture lines.
          </Clamp>
          <Clamp>
            The shortest of them, read as a length, is {big(tl.smallestOverCraft)} times the size of the whole craft (absurd is anything over{' '}
            {formatNumber(ABSURD_FACTOR)} times). Read as times, the disc's rim moves at {big(tl.rimMS / tl.burstMS)} of the speed that bursts it.
          </Clamp>
        </>
      )}
      {!tl && <Propose id="key.timesNotLengths" choices={TIMES_CHOICES} legend="What do the cover's numbers count?" class="hero-control" />}
      <LastReading id="key.timesNotLengths" />
    </section>
  );
}
