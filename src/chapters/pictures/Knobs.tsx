// The decoder's knobs for The Pictures: line time (in the alien's beats; the cover's value is not marked on
// it), sync lock, the interlace offset, polarity and rows per picture. Every change is a command on the bus
// (decoder.setParam), followed by a fresh decode so the picture shows what the setting does. Droop
// correction stays on and is not a knob here (the AC coupling is undone by the decoder; it may become a
// puzzle of its own later).

import { useEffect, useState } from 'preact/hooks';
import { dispatch, type Command } from '../../game/bus';
import { LINE_MS_RANGE } from '../../game/model';
import { decoder as D, game } from '../../game/state';
import { BEAT_S, UNIT_KEY, formatSI } from '../../ui/units';

const ROWS = { min: 200, max: 600 } as const;

/** Set a knob, then decode again at once so the change shows (a reveal in progress restarts). */
export function setKnob(cmd: Command): void {
  dispatch(cmd)
    .then(() => dispatch({ type: 'decoder.run', speed: 'fast' }))
    .catch(() => undefined);
}

const toBeats = (ms: number): number => ms / 1000 / BEAT_S;
const fromBeats = (b: number): number => b * BEAT_S * 1000;

function LineTimeKnob() {
  const ms = D.bench.value.lineTimeMs;
  const beats = toBeats(ms);
  const [text, setText] = useState(beats.toPrecision(5));
  useEffect(() => setText(beats.toPrecision(5)), [beats]);
  const set = (b: number): void => {
    const m = fromBeats(b);
    if (!(m > 0)) return;
    setKnob({ type: 'decoder.setParam', name: 'lineTimeMs', value: m });
  };
  const lo = toBeats(LINE_MS_RANGE.min);
  const hi = toBeats(LINE_MS_RANGE.max);
  const nudge = (d: number) => () => set(Number((beats + d).toPrecision(8)));
  return (
    <div class="pic-knob" data-knob="lineTime">
      <label for="pic-linetime">
        <span>Line time</span>
        <output data-line-beats={beats.toPrecision(6)}>
          {beats.toPrecision(5)} {UNIT_KEY.time}s{game.settings.value.humanGloss && <span class="pic-dim"> ({formatSI('time', ms / 1000)})</span>}
        </output>
      </label>
      <input
        id="pic-linetime"
        type="range"
        min={lo}
        max={hi}
        step={(hi - lo) / 2000}
        value={beats}
        onChange={(e) => set(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <div class="pic-row">
        <button type="button" class="btn small" onClick={nudge(-1e-5)} aria-label="Shorter by a hundred-thousandth of a beat">&laquo;</button>
        <button type="button" class="btn small" onClick={nudge(-1e-6)} aria-label="Shorter by a millionth of a beat">&lsaquo;</button>
        <input
          class="pic-num"
          type="text"
          inputMode="decimal"
          value={text}
          aria-label={`Line time in ${UNIT_KEY.time}s`}
          onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && set(Number(text))}
          onBlur={() => Number(text) > 0 && Math.abs(Number(text) - beats) > 1e-12 && set(Number(text))}
        />
        <button type="button" class="btn small" onClick={nudge(1e-6)} aria-label="Longer by a millionth of a beat">&rsaquo;</button>
        <button type="button" class="btn small" onClick={nudge(1e-5)} aria-label="Longer by a hundred-thousandth of a beat">&raquo;</button>
      </div>
    </div>
  );
}

function Toggle(p: { id: string; label: string; on: boolean; onLabel: string; offLabel: string; set: (v: boolean) => void }) {
  return (
    <div class="pic-knob" data-knob={p.id}>
      <span class="pic-klabel">{p.label}</span>
      <div class="pic-seg" role="group" aria-label={p.label}>
        <button type="button" class={!p.on ? 'on' : ''} aria-pressed={!p.on} onClick={() => p.set(false)}>
          {p.offLabel}
        </button>
        <button type="button" class={p.on ? 'on' : ''} aria-pressed={p.on} onClick={() => p.set(true)}>
          {p.onLabel}
        </button>
      </div>
    </div>
  );
}

function RowsKnob() {
  const rows = D.bench.value.rows;
  const set = (n: number): void => setKnob({ type: 'decoder.setParam', name: 'rows', value: Math.round(Math.min(ROWS.max, Math.max(ROWS.min, n))) });
  return (
    <div class="pic-knob" data-knob="rows">
      <label for="pic-rows">
        <span>Rows per picture</span>
        <output>{rows}</output>
      </label>
      <input id="pic-rows" type="range" min={ROWS.min} max={ROWS.max} step={1} value={rows} onChange={(e) => set(Number((e.currentTarget as HTMLInputElement).value))} />
      <div class="pic-row">
        <button type="button" class="btn small" onClick={() => set(rows - 10)} aria-label="Ten rows fewer">&laquo;</button>
        <button type="button" class="btn small" onClick={() => set(rows - 1)} aria-label="One row fewer">&lsaquo;</button>
        <button type="button" class="btn small" onClick={() => set(rows + 1)} aria-label="One row more">&rsaquo;</button>
        <button type="button" class="btn small" onClick={() => set(rows + 10)} aria-label="Ten rows more">&raquo;</button>
      </div>
    </div>
  );
}

export function Knobs() {
  const b = D.bench.value;
  const busy = D.status.value === 'loading' || D.status.value === 'decoding';
  return (
    <div class="pic-knobs" aria-label="The decoder's knobs">
      <LineTimeKnob />
      <Toggle
        id="syncLock"
        label="Line start"
        on={b.syncLock}
        offLabel="Free-running"
        onLabel="Lock to each pulse"
        set={(v) => setKnob({ type: 'decoder.setParam', name: 'syncLock', value: v })}
      />
      <Toggle
        id="interlace"
        label="Stagger between lines"
        on={b.interlace}
        offLabel="Leave"
        onLabel="Undo the stagger"
        set={(v) => setKnob({ type: 'decoder.setParam', name: 'interlace', value: v })}
      />
      <Toggle
        id="polarity"
        label="More signal reads"
        on={b.polarity === 'negative'}
        offLabel="Lighter"
        onLabel="Darker"
        set={(v) => setKnob({ type: 'decoder.setParam', name: 'polarity', value: v ? 'negative' : 'positive' })}
      />
      <RowsKnob />
      <div class="pic-row pic-run">
        <button type="button" class="btn" disabled={busy} onClick={() => void dispatch({ type: 'decoder.run', speed: 'record' }).catch(() => undefined)}>
          Develop at record speed
        </button>
        <button type="button" class="btn small" disabled={busy} onClick={() => void dispatch({ type: 'decoder.run', speed: 'fast' }).catch(() => undefined)}>
          At once
        </button>
      </div>
    </div>
  );
}
