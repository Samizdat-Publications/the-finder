// The turntable panel: the record, where to drop the needle, speed, direction, what is playing.
// Every control dispatches a command on the bus; nothing here changes state any other way.

import { useSignal } from '@preact/signals';
import { dispatch, type Command } from '../game/bus';
import { COVER_PERIOD_S, SPEED_RANGE_S, groove, radiusAtItemStart, timeline } from '../game/model';
import { turntable as T } from '../game/state';
import type { Region } from '../record/groove';
import { Disc } from './Disc';
import { Slider, Switch, fmtMB, fmtTime } from './ui';

const REGION_TEXT: Record<Region, string> = {
  rim: 'the smooth rim (no groove, no sound)',
  leadin: 'the lead-in (silent groove before the music)',
  music: 'the music',
  runout: 'the run-out (a locked groove, one click every turn)',
};

/** Run a command from a control: errors are already shown in the panel, so they are not re-thrown here. */
function send(cmd: Command): void {
  dispatch(cmd).catch(() => undefined);
}

export function TurntablePanel() {
  const target = useSignal(radiusAtItemStart(1, 'ozma-11', 1));
  const side = T.side.value;
  const needle = T.needle.value;
  const speed = T.secondsPerTurn.value;
  const ratio = COVER_PERIOD_S / speed;
  const load = T.load.value;
  const targetRegion = groove.regionAtRadius(target.value);
  const down = needle?.down === true;

  const drop = (r: number): void => send({ type: 'turntable.drop', radiusMm: r });
  const putOn = (n: number): void => send({ type: 'turntable.load', side: n });

  let playing = 'Needle up.';
  let detail = '';
  if (side === null) playing = 'Put a side on the platter to begin.';
  else if (down && needle) {
    const e = needle.itemId ? timeline.entryById(needle.itemId) : null;
    if (e) {
      playing = e.item.title;
      detail = [e.item.performer, e.item.origin].filter(Boolean).join(' - ');
    } else if (needle.region) {
      playing = REGION_TEXT[needle.region][0]!.toUpperCase() + REGION_TEXT[needle.region].slice(1);
    }
  }

  return (
    <section class="panel bench-panel" aria-labelledby="tt-h">
      <h2 id="tt-h">The record</h2>
      <p class="help">
        Side 1 faces the spacecraft; where side 1 ends is an inference (D-A17).
      </p>

      <div class="row">
        <div class="seg" role="group" aria-label="Side">
          {timeline.sides().map((n) => (
            <button type="button" key={n} class={side === n ? 'on' : ''} aria-pressed={side === n} onClick={() => putOn(n)}>
              Side {n}
            </button>
          ))}
        </div>
        <span class="help">{side === null ? 'Nothing is downloaded until the needle drops.' : 'Only the track under the needle and the next one are downloaded.'}</span>
      </div>

      <div class="disc-wrap">
        <Disc target={target.value} onTarget={(r) => (target.value = r)} onDrop={(r) => side !== null && drop(r)} />
      </div>
      <p class="help center">Click or drag on the record to choose where the needle drops. The dashed ring is the chosen radius.</p>

      <Slider
        id="radius"
        label="Needle radius"
        value={target.value}
        min={10}
        max={150}
        step={0.05}
        readout={`${target.value.toFixed(2)} mm: ${REGION_TEXT[targetRegion]}`}
        onInput={(v) => (target.value = v)}
      />

      <div class="row">
        <button type="button" class="btn primary" disabled={side === null} onClick={() => drop(target.value)}>
          Drop needle
        </button>
        <button type="button" class="btn" disabled={!down && T.status.value !== 'loading'} onClick={() => send({ type: 'turntable.lift' })}>
          Lift
        </button>
        <label class="inline">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={T.volume.value}
            aria-label="Volume"
            onInput={(e) => send({ type: 'turntable.setVolume', value: Number((e.currentTarget as HTMLInputElement).value) })}
          />
        </label>
      </div>

      <div class="loadbar" aria-live="polite">
        <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={load.total} aria-valuenow={load.loaded}>
          <i style={{ width: load.total > 0 ? `${Math.min(100, (load.loaded / load.total) * 100)}%` : '0%' }} />
        </div>
        <span>
          {load.total > 0 ? `${fmtMB(load.loaded)} of ${fmtMB(load.total)} downloaded` : 'No download pending'}
          {T.status.value === 'loading' ? ' ...' : ''}
        </span>
      </div>
      {T.error.value && <p class="error" role="alert">{T.error.value}</p>}

      <Slider
        id="speed"
        label="Speed, seconds per turn"
        value={speed}
        min={SPEED_RANGE_S.min}
        max={SPEED_RANGE_S.max}
        step={0.01}
        mark={COVER_PERIOD_S}
        markLabel={`cover: ${COVER_PERIOD_S.toFixed(3)} s`}
        readout={`${speed.toFixed(2)} s (pitch and tempo x ${ratio.toFixed(3)})`}
        onInput={(v) => send({ type: 'turntable.setSpeed', secondsPerTurn: v })}
      />
      <Switch
        label="Direction"
        value={T.direction.value}
        options={[
          { value: 'cw', text: 'Clockwise' },
          { value: 'ccw', text: 'Counter-clockwise' },
        ]}
        onPick={(v) => send({ type: 'turntable.setDirection', direction: v })}
      />

      <div class="nowplaying" aria-live="polite">
        <div class="np-title">{playing}</div>
        {detail && <div class="np-detail">{detail}</div>}
        {down && needle && (
          <div class="np-detail">
            {needle.region ? `Needle on ${REGION_TEXT[needle.region]}` : ''}
            {needle.timeS !== null && needle.region !== 'rim' ? `. Time into the side: ${fmtTime(needle.timeS)}` : ''}
            {needle.radiusMm !== null ? `. Radius ${needle.radiusMm.toFixed(2)} mm` : ''}
          </div>
        )}
      </div>

      {side !== null && (
        <ol class="tracks" aria-label={`Items on side ${side}`}>
          {timeline.entries(side).map((e) => (
            <li key={e.item.id} class={needle?.down && needle.itemId === e.item.id ? 'now' : ''}>
              <button type="button" onClick={() => { target.value = radiusAtItemStart(side, e.item.id, 0.5); drop(target.value); }}>
                <span class="n">{e.item.musicNumber ?? '-'}</span>
                <span class="t">{e.item.title}</span>
                <span class="d">{fmtTime(e.item.durationS)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
