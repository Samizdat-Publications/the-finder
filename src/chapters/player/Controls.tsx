// The turntable's controls: the speed in the alien's beats per turn (its steppers and typed box folded under "Fine
// tune"), the direction of turn, Drop and Lift, the control the next open deduction needs leading as the hero;
// and what the stylus hears right now (computed by physics.ts from the bus's state, never typed). Every control
// issues a command on the bus (rule 5); this file holds no game state.

import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game, turntable as T } from '../../game/state';
import type { Direction } from '../../record/groove';
import { BEAT_S, formatNumber, quantity } from '../../ui/units';
import { Fine } from '../../ui/Fine';
import { send } from '../../ui/send';
import { SPEED_RANGE_BEATS, SPEED_STEP_BEATS } from './constants';
import { hear, semitones, spotAt, type Heard, type TurntableReading } from './physics';

const round = (beats: number): number => Math.round(beats / SPEED_STEP_BEATS) * SPEED_STEP_BEATS;
const clampBeats = (b: number): number => Math.min(SPEED_RANGE_BEATS.max, Math.max(SPEED_RANGE_BEATS.min, b));

function T_(p: { s: number }) {
  const q = quantity('time', p.s);
  return (
    <span class="q">
      <span class="num">{q.number}</span> <span class="unitname">{q.number === '1' ? q.unitKey : `${q.unitKey}s`}</span>
      {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
    </span>
  );
}

/** What the stylus picks up, in words, from the computed hearing. */
export function heardText(h: Heard): { text: string; detail: string | null } {
  const shifted = Math.abs(h.k - 1) > 1e-9 ? `Everything is ${h.k > 1 ? 'fast and high' : 'slow and low'} by ${formatNumber(h.k)} times (${formatNumber(Math.abs(semitones(h.k)))} twelfths of a doubling ${h.k > 1 ? 'up' : 'down'}).` : null;
  const back = h.backward ? 'It runs backward.' : null;
  const detail = [shifted, back].filter(Boolean).join(' ') || null;
  switch (h.kind) {
    case 'nothing':
      return { text: 'Silence.', detail: null };
    case 'silentGroove':
      return { text: 'A faint hiss of empty groove.', detail };
    case 'clicks':
      return { text: 'A single click, once every turn.', detail: back };
    case 'opening':
      return { text: 'Quiet, then a long steady tone.', detail };
    case 'lines':
      return { text: 'A steady buzz: one short shape repeating, over and over.', detail };
    default:
      return { text: 'Sound, but from partway into the side.', detail };
  }
}

/** Which control the next open deduction needs: it leads the panel as the hero (the hero-control pass, 2026-10-28). */
export type HeroControl = 'speed' | 'direction' | 'needle';

export function heroFor(confirmed: ReadonlySet<string>): HeroControl {
  if (nodeStatus('player.speed', confirmed) === 'open') return 'speed';
  if (nodeStatus('player.direction', confirmed) === 'open') return 'direction';
  return 'needle';
}

export function Controls(p: { target: number; dirChosen: boolean; onDirection: (d: Direction) => void; onDrop: () => void }) {
  const beats = T.secondsPerTurn.value / BEAT_S;
  const setBeats = (b: number): void => send({ type: 'turntable.setSpeed', secondsPerTurn: round(clampBeats(b)) * BEAT_S });
  const confirmed = confirmedSet.value;
  const down = T.needle.value?.down === true;
  const loading = T.status.value === 'loading';
  const spot = spotAt(p.target);
  const speedOpen = nodeStatus('player.speed', confirmed) === 'open';
  const dirOpen = nodeStatus('player.direction', confirmed) === 'open';
  const hero = heroFor(confirmed);
  const cls = (h: HeroControl): string => `pctl${hero === h ? ' hero-control' : ''}`;
  const dirs: { d: Direction; label: string; short: string; path: string }[] = [
    { d: 'cw', label: 'Clockwise, seen from above', short: 'Clockwise', path: 'M 12 3 A 9 9 0 1 1 3.6 9 M 12 3 L 8.5 0.5 M 12 3 L 8.6 6' },
    { d: 'ccw', label: 'Counter-clockwise, seen from above', short: 'Counter-clockwise', path: 'M 8 3 A 9 9 0 1 0 16.4 9 M 8 3 L 11.5 0.5 M 8 3 L 11.4 6' },
  ];
  const turn = quantity('time', T.secondsPerTurn.value);
  return (
    <div class="pcontrols" data-hero={hero}>
      <div class={cls('speed')} role="group" aria-label="Speed">
        <label for="pspeed" class="plabel pspeedlabel">
          <span>Time for one turn</span>{' '}
          <span class="hero-readout" data-speed-readout="">
            {turn.number} <span class="unitname">{turn.number === '1' ? turn.unitKey : `${turn.unitKey}s`}</span>
          </span>
          {game.settings.value.humanGloss && <span class="si"> ({turn.si})</span>}
        </label>
        <input
          id="pspeed"
          type="range"
          min={SPEED_RANGE_BEATS.min}
          max={SPEED_RANGE_BEATS.max}
          step={SPEED_STEP_BEATS}
          value={beats}
          data-speed-beats={beats.toFixed(3)}
          onInput={(e) => setBeats(Number((e.currentTarget as HTMLInputElement).value))}
        />
        <div class="pfoot">
          {speedOpen && (
            <button type="button" class="btn small" data-propose-button="player.speed" onClick={() => send({ type: 'deduction.propose', id: 'player.speed', answer: { secondsPerTurn: T.secondsPerTurn.value } })}>
              This is the time of one turn
            </button>
          )}
          <Fine>
            <div class="prow">
              <button type="button" class="btn small" aria-label="One step slower" onClick={() => setBeats(beats + SPEED_STEP_BEATS)}>-</button>
              <input
                type="number"
                class="pnum"
                aria-label="Beats per turn"
                min={SPEED_RANGE_BEATS.min}
                max={SPEED_RANGE_BEATS.max}
                step={SPEED_STEP_BEATS}
                value={beats.toFixed(3)}
                onChange={(e) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (Number.isFinite(v) && v > 0) setBeats(v);
                }}
              />
              <button type="button" class="btn small" aria-label="One step faster" onClick={() => setBeats(beats - SPEED_STEP_BEATS)}>+</button>
            </div>
            <p class="note small">
              {T.secondsPerTurn.value > 0 && `${formatNumber(BEAT_S / T.secondsPerTurn.value)} turns per beat; the control moves in steps of ${formatNumber(SPEED_STEP_BEATS)} beat.`}
            </p>
          </Fine>
        </div>
      </div>

      <div class={cls('direction')} role="group" aria-label="Direction of turn">
        <span class="plabel">Which way it turns, seen from above</span>
        <div class="prow pdirs">
          {dirs.map((x) => {
            const on = p.dirChosen && T.direction.value === x.d;
            return (
              <button key={x.d} type="button" class={`btn small pdir${on ? ' on' : ''}`} aria-pressed={on} aria-label={x.label} data-direction={x.d} onClick={() => p.onDirection(x.d)}>
                <svg viewBox="-1 -1 22 22" width="18" height="18" aria-hidden="true">
                  <path d={x.path} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
                {x.short}
              </button>
            );
          })}
        </div>
        {dirOpen && p.dirChosen && (
          <button type="button" class="btn small" data-propose-button="player.direction" onClick={() => send({ type: 'deduction.propose', id: 'player.direction', answer: { direction: T.direction.value } })}>
            This is the way it turns
          </button>
        )}
      </div>

      <div class={cls('needle')} role="group" aria-label="Needle">
        {/* The drop point's distance is a readout for the curious (the ring on the platter shows it): in the title. */}
        <span
          class="plabel"
          data-drop-reaches={quantity('length', p.target / 1000).number}
          title={`${quantity('length', p.target / 1000).number} reaches from the centre${game.settings.value.humanGloss ? ` (${p.target.toFixed(1)} mm)` : ''}`}
        >
          The needle drops on <strong class="pspot" data-spot={spot}>{SPOT_TEXT[spot]}</strong>
        </span>
        <div class="prow">
          <button type="button" class="btn primary" data-drop="" disabled={!p.dirChosen || loading} onClick={p.onDrop}>
            Drop the needle
          </button>
          <button type="button" class="btn" data-lift="" disabled={!down && !loading} onClick={() => send({ type: 'turntable.lift' })}>
            Lift
          </button>
          {!p.dirChosen && <span class="note small">Choose which way it turns first.</span>}
          {loading && <span class="note small">Reading the groove...</span>}
        </div>
      </div>
      {T.error.value && <p class="error" role="alert">{T.error.value}</p>}
    </div>
  );
}

/** What the stylus picks up right now, computed from the bus's state (physics.ts), never typed. */
export function StylusHears(p: { reading: TurntableReading }) {
  const h = hear(p.reading);
  const heard = heardText(h);
  return (
    <div class={`pheard ${h.kind}`} data-heard={h.kind} aria-live="polite">
      <span class="plabel">The stylus hears</span>
      <p class="pheardtext">{heard.text}</p>
      {heard.detail && <p class="note small">{heard.detail}</p>}
      {h.kind === 'clicks' && h.periodS !== null && (
        <p class="note small">
          One click every <T_ s={h.periodS} />.
        </p>
      )}
    </div>
  );
}

const SPOT_TEXT: Record<ReturnType<typeof spotAt>, string> = {
  off: 'past the edge of the disc',
  rim: 'the smooth rim',
  leadin: 'the outermost groove',
  music: 'the grooved band',
  runout: 'the wide groove near the centre',
  label: 'the smooth centre',
};
