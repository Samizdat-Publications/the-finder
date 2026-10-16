// The Player's instrument: the cover's record drawings (read through the key) on the left; on the right the
// turntable the alien builds to them, the groove microscope, and the four deductions with what each answer
// showed. Commands go through the bus (rule 5); the instrument's own state is only the drop ring, the lamp,
// whether a direction has been picked yet, and how long the needle has played undisturbed. The first sound is
// proposed automatically once the stylus has really heard it (the checker decides, from the bus's state).

import { effect, useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import coverJson from '../../../data/cover.json';
import { dispatch } from '../../game/bus';
import { nodeStatus } from '../../game/deductions';
import { COVER_PERIOD_S } from '../../game/model';
import { confirmedSet, game, turntable as T } from '../../game/state';
import type { Direction } from '../../record/groove';
import { binaryToSeconds, parseCoverBinary } from '../../science/units';
import { BEAT_S, formatNumber, quantity } from '../../ui/units';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { coverModel } from '../shared/coverData';
import { CoverViewer, type StrokeRef } from '../shared/CoverViewer';
import type { Lamp } from '../shared/relief';
import { checkFirstSound } from './checkers';
import { PLAYER_SIDE, SPEED_START_BEATS } from './constants';
import { Controls } from './Controls';
import { Microscope } from './Microscope';
import { Platter } from './Platter';
import { spotAt, type TurntableReading } from './physics';
import { cropModel, recordWindow } from './recordView';
import '../key/key.css';
import './player.css';

/** Where the drop ring starts: the middle of the grooved band (design choice, not the answer). */
const START_TARGET_MM = 100;
/** A jump in the needle's side time beyond this between two updates means a new drop, s (updates come every 50 ms). */
const JUMP_S = 0.5;

const recordModel = cropModel(coverModel, recordWindow(coverModel));
const TURN_S = binaryToSeconds(coverJson.record.rotationPeriod.binary);
const SIDE_S = binaryToSeconds(coverJson.record.playTime.binary);

function Time(p: { s: number }) {
  const q = quantity('time', p.s);
  return (
    <span class="q">
      <span class="num">{q.number}</span> <span class="unitname">{q.unitKey}s</span>
      {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
    </span>
  );
}

/** The turntable state as the checkers read it, with the time the needle has played undisturbed. */
function reading(listenedS: number): TurntableReading {
  const n = T.needle.value;
  return {
    side: T.side.value,
    secondsPerTurn: T.secondsPerTurn.value,
    direction: T.direction.value,
    down: n?.down === true,
    region: n?.down ? n.region : null,
    timeS: n?.down ? n.timeS : null,
    listenedS,
  };
}

export function PlayerInstrument() {
  const [lamp, setLamp] = useState<Lamp>({ azimuthDeg: 135, elevationDeg: 70 });
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<StrokeRef | null>(null);
  const [whole, setWhole] = useState(false);
  const [target, setTarget] = useState(START_TARGET_MM);
  const [ready, setReady] = useState(false);
  const confirmed = confirmedSet.value;
  const [dirChosen, setDirChosen] = useState(confirmed.has('player.direction'));
  const dirKnown = dirChosen || confirmed.has('player.direction');
  const listened = useSignal(0);
  const proposing = useRef(false);
  const reduced = game.settings.value.reducedMotion;

  // Before the speed is found, the platter starts at a speed of its own, not the cover's.
  useEffect(() => {
    const fresh = !confirmedSet.peek().has('player.speed') && T.side.peek() === null && T.secondsPerTurn.peek() === COVER_PERIOD_S;
    const init = fresh ? dispatch({ type: 'turntable.setSpeed', secondsPerTurn: SPEED_START_BEATS * BEAT_S }) : Promise.resolve();
    init.catch(() => undefined).finally(() => setReady(true));
  }, []);

  // How long the needle has played undisturbed, and the first sound proposed once the stylus has really heard it.
  useEffect(() => {
    let settled = performance.now();
    let last: { t: number | null; at: number; down: boolean; s: number; d: Direction } | null = null;
    return effect(() => {
      const n = T.needle.value;
      const s = T.secondsPerTurn.value;
      const d = T.direction.value;
      const now = performance.now();
      const down = n?.down === true;
      const t = down ? (n?.timeS ?? null) : null;
      if (!last || last.down !== down || last.s !== s || last.d !== d) settled = now;
      else if (t !== null && last.t !== null) {
        const expected = last.t + ((d === 'cw' ? 1 : -1) * (COVER_PERIOD_S / s) * (now - last.at)) / 1000;
        if (Math.abs(t - expected) > JUMP_S) settled = now;
      }
      last = { t, at: now, down, s, d };
      const heardS = (now - settled) / 1000;
      listened.value = heardS;
      if (proposing.current || nodeStatus('player.firstSound', confirmedSet.peek()) !== 'open') return;
      const answer = reading(heardS);
      if (!checkFirstSound({ ...answer }).ok) return;
      proposing.current = true;
      dispatch({ type: 'deduction.propose', id: 'player.firstSound', answer: { ...answer } })
        .catch(() => undefined)
        .finally(() => (proposing.current = false));
    });
  }, []);

  const onDirection = (d: Direction): void => {
    setDirChosen(true);
    send({ type: 'turntable.setDirection', direction: d });
  };

  const onDrop = async (): Promise<void> => {
    const r = target;
    const spot = spotAt(r);
    try {
      if (spot === 'label' || spot === 'off') await dispatch({ type: 'turntable.lift' });
      else {
        if (T.side.value !== PLAYER_SIDE) await dispatch({ type: 'turntable.load', side: PLAYER_SIDE });
        await dispatch({ type: 'turntable.drop', radiusMm: r });
      }
      if (nodeStatus('player.start', confirmedSet.value) === 'open') {
        await dispatch({ type: 'deduction.propose', id: 'player.start', answer: { radiusMm: r, secondsPerTurn: T.secondsPerTurn.value } });
      }
    } catch {
      // refused commands already show their reason (game.error, turntable.error)
    }
  };

  const labelFor = useMemo(
    () =>
      (id: string): string | null => {
        const g = coverModel.groups.find((x) => x.id === id);
        if (!g) return null;
        const bin = g.bits.map((b) => (b.kind === 'across' ? '1' : '0')).join('');
        if (id === 'record.rotationPeriod') return `one turn: ${quantity('time', binaryToSeconds(bin)).number} beats`;
        if (id === 'record.playTime') return `one side: ${quantity('time', binaryToSeconds(bin)).number} beats`;
        return formatNumber(parseCoverBinary(bin));
      },
    [],
  );

  const rd = reading(listened.value);
  const fsOpen = nodeStatus('player.firstSound', confirmed) === 'open';
  return (
    <div class="playerinst" data-player-ready={ready ? 'true' : 'false'}>
      <div class="pview">
        <CoverViewer
          key={whole ? 'whole' : 'record'}
          model={whole ? coverModel : recordModel}
          lamp={lamp}
          onLamp={setLamp}
          hoverGroup={hover}
          onHover={setHover}
          selected={selected}
          onSelect={setSelected}
          labelFor={labelFor}
          label={whole ? 'The whole cover, under your lamp' : "The cover's drawings of the disc, under your lamp"}
        >
          <button type="button" class="btn small" onClick={() => setWhole((w) => !w)}>
            {whole ? 'Back to the disc drawings' : 'Whole cover'}
          </button>
        </CoverViewer>
        <dl class="preadings gold" data-cover-turn-s={TURN_S.toFixed(5)}>
          <div>
            <dt>Around the drawn disc, read with the key</dt>
            <dd>
              one turn takes <Time s={TURN_S} />
            </dd>
          </div>
          <div>
            <dt>Beside the disc seen edge-on</dt>
            <dd>
              one side plays for <Time s={SIDE_S} />, {formatNumber(Math.round(SIDE_S / TURN_S))} turns
            </dd>
          </div>
          <div>
            <dt>The stylus</dt>
            <dd>drawn resting at the outer rim of the disc</dd>
          </div>
        </dl>
      </div>

      <div class="ppanels">
        <section class="kpanel pdeck" aria-label="The turntable">
          <div class="pdeckgrid">
            <Platter target={target} onTarget={setTarget} reducedMotion={reduced} />
            <Controls target={target} reading={rd} dirChosen={dirKnown} onDirection={onDirection} onDrop={() => void onDrop()} />
          </div>
          {reduced && (
            <p class="note small" data-rate="">
              The platter turns {T.direction.value === 'cw' ? 'clockwise' : 'counter-clockwise'} once every <Time s={T.secondsPerTurn.value} /> (held still: reduced motion).
            </p>
          )}
        </section>

        <section class="kpanel" aria-label="The groove microscope">
          <header class="khead">
            <span class="plabel">The groove under the microscope, where the needle drops</span>
          </header>
          <Microscope centreMm={target} reducedMotion={reduced} />
        </section>

        {(['player.speed', 'player.start', 'player.direction', 'player.firstSound'] as const).map((id) => (
          <section key={id} class="kpanel pnode" data-panel={id}>
            <PanelHead id={id} />
            {id === 'player.start' && nodeStatus(id, confirmed) === 'open' && <p class="note small">Drop the needle where the side begins: the drop is your answer.</p>}
            {id === 'player.firstSound' && fsOpen && (
              <p class="note small" data-listening={rd.down ? listened.value.toFixed(1) : ''}>
                {rd.down ? `Listening: ${formatNumber(Math.floor((listened.value / BEAT_S) * 10) / 10)} beats undisturbed.` : 'Set the turntable up, drop the needle, and listen.'}
              </p>
            )}
            <LastReading id={id} />
          </section>
        ))}
      </div>
    </div>
  );
}
