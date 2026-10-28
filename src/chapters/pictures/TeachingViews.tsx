// The teaching pictures as work views: crops of the decoded frames (data/teaching.json regions, our decode of the
// tape) beside the instrument's tools. Their numerals: the player sets one of the Finder's numerals beside each of
// the senders' digits and sees their sums read back. Their units: a converter for "1 42/100 x 10^9 t = 1 s". Their
// planets: the table of circles, a column to mark home and a cell to mark the slip. Their height: the scale bars
// read through their centimetre into reaches. Every proposal goes through the command bus.

import { confirmedSet } from '../../game/state';
import { readDigits } from '../../science/teaching';
import { T_H_SECONDS } from '../../science/units';
import { Clamp } from '../../ui/Fine';
import { send } from '../../ui/send';
import { BEAT_S, REACH_M, formatNumber } from '../../ui/units';
import { uprightTurns } from './AlbumView';
import { HOME, TEACHING, UNITS } from './checkersM5';
import { Crop, Numeral } from './Crop';
import { heightCm, markedCell, markedColumn, numeralTable, secondReading } from './workState';

const fmt = (x: number, d = 4): string => formatNumber(Number(x.toPrecision(d)));

// ---- their numerals ------------------------------------------------------------------------------------

/** A number written with the senders' digits, as the player's table turns it into the Finder's numerals (null: a digit not set). */
function translate(n: number): number[] | null {
  const t = numeralTable.value;
  const out: number[] = [];
  for (const ch of String(n)) {
    const v = Number(ch);
    const g = TEACHING.L002.digits.find((d) => d.value === v);
    const mine = g ? t[String(g.glyph)] : undefined;
    if (mine === undefined) return null;
    out.push(mine);
  }
  return out;
}

function SumCheck(p: { sum: (typeof TEACHING.L002.sums)[number] }) {
  const s = p.sum;
  const terms = s.terms.map(translate);
  const total = translate(s.total);
  const ready = terms.every(Boolean) && total !== null;
  const val = (ds: number[]): number => readDigits(ds, 10);
  const holds = ready && (s.op === '+' ? val(terms[0]!) + val(terms[1]!) : val(terms[0]!) * val(terms[1]!)) === val(total!);
  const write = (ds: number[] | null) => (ds ? ds.map((d, i) => <Numeral key={i} n={d} height={20} gloss={false} />) : <span class="pic-q">?</span>);
  return (
    <div class="pic-sum" data-sum={String(s.value)} data-holds={ready ? String(holds) : 'unread'}>
      <Crop frame="L002" region={s.region} label={`their sum ${s.value}`} scale={1.4} />
      <span class="pic-sum-mine" aria-label="the sum in your numerals">
        {write(terms[0] ?? null)} <span class="op">{s.op === '+' ? '+' : '×'}</span> {write(terms[1] ?? null)} <span class="op">=</span> {write(total)}
      </span>
      {ready && <span class={`pic-sum-verdict ${holds ? 'ok' : 'bad'}`}>{holds ? 'holds' : 'does not hold'}</span>}
    </div>
  );
}

export function NumeralsView() {
  const t = numeralTable.value;
  const done = confirmedSet.value.has('pictures.numerals');
  const digits = TEACHING.L002.digits;
  const dots = (row: number) => TEACHING.L002.dots.find((d) => d.row === row);
  const bin = (row: number) => TEACHING.L002.binary.find((b) => b.row === row);
  return (
    <div class="pic-work pic-numerals-view" data-work="numerals">
      <Clamp>The counting picture: dots, the cover's strokes, then a mark of their own. Set one of your numerals beside each of their marks.</Clamp>
      <ol class="pic-digit-rows">
        {digits.map((d) => {
          const dt = dots(d.row);
          const b = bin(d.row);
          return (
            <li key={d.glyph} data-digit-row={d.glyph}>
              <span class="pic-digit-dots">{dt && <Crop frame="L002" region={dt.region} label="a row of dots" scale={1.3} maxWidth={92} />}</span>
              <span class="pic-digit-bin">{b && <Crop frame="L002" region={b.region} label="the cover's strokes" scale={1.3} maxWidth={68} />}</span>
              <span class="pic-digit-their">
                <Crop frame="L002" region={d.region} label="their mark" scale={1.6} maxWidth={46} />
                {d.value === 0 && <span class="note">its second mark</span>}
              </span>
              <span class="pic-digit-pick" role="group" aria-label="your numeral for this mark">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    class={`pic-npick${t[String(d.glyph)] === n ? ' on' : ''}`}
                    disabled={done}
                    data-numeral-pick={`${d.glyph}:${n}`}
                    onClick={() => (numeralTable.value = { ...numeralTable.value, [String(d.glyph)]: n })}
                  >
                    <Numeral n={n} height={18} />
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      <div class="pic-sums">
        <p class="note">Their sums, read back with your table:</p>
        {TEACHING.L002.sums.map((s) => (
          <SumCheck key={String(s.value)} sum={s} />
        ))}
      </div>
      {!done && (
        <button type="button" class="btn small" data-propose-button="pictures.numerals" onClick={() => send({ type: 'deduction.propose', id: 'pictures.numerals', answer: { table: { ...t } } })}>
          Propose this table
        </button>
      )}
    </div>
  );
}

// ---- their units ---------------------------------------------------------------------------------------

/** Beats in one spin flip of hydrogen (the cover's unit, found in The Key). */
const FLIP_BEATS = T_H_SECONDS / BEAT_S;

/** The converter's reading now, in beats. */
export function secondBeatsNow(): number {
  const r = secondReading.value;
  return (r.whole + (r.den ? r.num / r.den : 0)) * 10 ** r.power * FLIP_BEATS;
}

/** The height converter's reading now, in reaches. */
export function heightReachesNow(): number {
  return (heightCm.value * (UNITS.cm as number)) / REACH_M;
}

export function UnitsView() {
  const r = secondReading.value;
  const lines = TEACHING.L003.lines;
  const second = lines.find((l) => l.id === 'second')!;
  const beats = secondBeatsNow();
  const done = confirmedSet.value.has('pictures.units');
  const set = (k: keyof typeof r) => (e: Event) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) secondReading.value = { ...secondReading.value, [k]: v };
  };
  return (
    <div class="pic-work pic-units-view" data-work="units">
      <div class="pic-units-top">
        <Crop frame="L003" region={lines.find((l) => l.id === 'atom')!.region} label="the atom drawings: one atom, one spin flip" scale={1.2} />
        <Crop frame="L003" region={second.region} label="their line about the spin flip" scale={1.8} class="pic-units-line" />
      </div>
      <fieldset class="pic-converter hero-control" disabled={done}>
        <legend>Converter: a count of spin flips (the cover's unit) into your beats</legend>
        <label>
          whole <input type="number" min="0" value={r.whole} onInput={set('whole')} data-reading="whole" />
        </label>
        <label>
          and <input type="number" min="0" value={r.num} onInput={set('num')} data-reading="num" /> /
          <input type="number" min="1" value={r.den} onInput={set('den')} data-reading="den" />
        </label>
        <label>
          × 10 to the <input type="number" min="0" max="40" value={r.power} onInput={set('power')} data-reading="power" />
        </label>
        <output class="hero-readout" data-converter-beats={beats}>
          = {fmt(beats)} beats
        </output>
      </fieldset>
      {!done && (
        <button type="button" class="btn small" data-propose-button="pictures.units" onClick={() => send({ type: 'deduction.propose', id: 'pictures.units', answer: { secondInBeats: beats } })}>
          Propose: their s is this many beats
        </button>
      )}
      {done && (
        <ul class="pic-unit-list">
          {lines.filter((l) => l.definition).map((l) => (
            <li key={l.id}>
              <Crop frame="L003" region={l.region} label={`their definition of ${l.definition!.is}`} scale={0.9} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- their planets -------------------------------------------------------------------------------------

const ROW_KEYS = ['diameter', 'distance', 'mass', 'day'] as const;

export function PlanetsView() {
  const confirmed = confirmedSet.value;
  const homeDone = confirmed.has('pictures.home');
  const slipOpen = homeDone && !confirmed.has('pictures.slip');
  const col = markedColumn.value;
  const cell = markedCell.value;
  const cols = TEACHING.table.columns;
  return (
    <div class="pic-work pic-planets" data-work="planets">
      <Clamp>{slipOpen ? 'Mark the one cell that does not follow the table\'s own rules.' : 'Their table of circles, both pictures side by side. Mark the world that is theirs.'}</Clamp>
      {(['L004', 'L005'] as const).map((frame) => {
        const mine = cols.filter((c) => c.frame === frame);
        return (
          <div key={frame} class="pic-table" data-table={frame} style={{ gridTemplateColumns: `repeat(${mine.length}, minmax(0, 1fr))` }}>
            {mine.map((c) => (
              <button
                key={`c${c.index}`}
                type="button"
                class={`pic-tcircle${col === c.index ? ' marked' : ''}${homeDone && c.index === HOME ? ' home' : ''}`}
                data-column={c.index}
                disabled={homeDone}
                onClick={() => (markedColumn.value = c.index)}
              >
                <Crop frame={c.frame} region={c.circle} label="a circle" scale={c.index === 0 ? 0.6 : 1} maxWidth={110} />
              </button>
            ))}
            {ROW_KEYS.map((row) =>
              mine.map((c) => {
                const v = c.cells[row];
                const on = cell?.column === c.index && cell.row === row;
                return (
                  <button
                    key={`${row}${c.index}`}
                    type="button"
                    class={`pic-tcell${on ? ' marked' : ''}${col === c.index ? ' incol' : ''}`}
                    data-cell={`${c.index}:${row}`}
                    disabled={!slipOpen || !v}
                    onClick={() => (markedCell.value = { column: c.index, row })}
                  >
                    {v ? <Crop frame={c.frame} region={v.region} label={`a cell of the ${row} row`} scale={1} maxWidth={112} /> : <span />}
                  </button>
                );
              }),
            )}
          </div>
        );
      })}
      {!homeDone && col !== null && (
        <button type="button" class="btn small" data-propose-button="pictures.home" onClick={() => send({ type: 'deduction.propose', id: 'pictures.home', answer: { column: col } })}>
          Propose: this world is theirs
        </button>
      )}
      {slipOpen && cell && (
        <button type="button" class="btn small" data-propose-button="pictures.slip" onClick={() => send({ type: 'deduction.propose', id: 'pictures.slip', answer: { column: cell.column, row: cell.row } })}>
          Propose: this cell breaks the order
        </button>
      )}
    </div>
  );
}

// ---- their height --------------------------------------------------------------------------------------

export function HeightView() {
  const cm = heightCm.value;
  const reaches = heightReachesNow();
  const done = confirmedSet.value.has('pictures.height');
  const t = uprightTurns('L039');
  return (
    <div class="pic-work pic-height" data-work="height">
      <div class="pic-height-row">
        <Crop frame="L039" label="the two figures with their scale bars" scale={t ? 0.6 : 0.8} turns={t} />
        <div class="pic-height-tools">
          {TEACHING.L039.heights.map((h) => (
            <Crop key={h.figure} frame="L039" region={h.region} label="a number beside a scale bar" scale={1.6} />
          ))}
          <fieldset class="pic-converter hero-control" disabled={done}>
            <legend>Converter: their centimetres (a 21st of the hydrogen wave) into your reaches</legend>
            <label>
              <input type="number" min="0" value={cm} onInput={(e) => (heightCm.value = Number((e.target as HTMLInputElement).value) || 0)} data-reading="cm" /> cm
            </label>
            <output class="hero-readout" data-converter-reaches={reaches}>= {fmt(reaches)} reaches</output>
          </fieldset>
          {!done && (
            <button type="button" class="btn small" data-propose-button="pictures.height" onClick={() => send({ type: 'deduction.propose', id: 'pictures.height', answer: { reaches } })}>
              Propose: the taller one is this tall
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
