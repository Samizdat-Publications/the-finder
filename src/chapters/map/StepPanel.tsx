// The Map's deductions, one at a time: a row of the five steps (each opens its tools on the bench when it is
// open or done), the current step's question, what to do, the proposal (sent through the command bus with
// exactly the answer shapes the checkers take) and the last reading it gave.

import { useEffect, useRef } from 'preact/hooks';
import { nodeStatus, type Answer } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet } from '../../game/state';
import { alignOpenPanel } from '../../ui/notebook';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { MAP_NODE_IDS, type MapNodeId } from './checkers';
import { OLD_LINES_FOR_AGE } from './LinePanel';
import { assignments, axis, clockYears, model, origin, phase, phaseNote, selectedLine, stage } from './state';

const TEXT: Record<MapNodeId, { how: string; button: string }> = {
  'map.periods': {
    how: 'Turn the map with the dial until its long line points at the galaxy\'s centre. Choose a line, then click on the chart the pulsar it points to whose period is nearly the line\'s number. Propose a line whose match stands out clearly.',
    button: 'Propose: this line is this pulsar',
  },
  'map.old': {
    how: 'Run the clock. When did the pulsars you matched tick at the map\'s numbers?',
    button: 'Propose: the map is from this time',
  },
  'map.identify': {
    how: `Put a pulsar on every line. Old lines first: the young ones change too fast to match by period until the map's age is known (${OLD_LINES_FOR_AGE} old lines matched).`,
    button: 'Propose these pulsars for every line',
  },
  'map.motion': {
    how: 'The old lines\' ages disagree. Drag the axis across the sky until, beside it, the ages fall on one straight line.',
    button: 'Propose this axis',
  },
  'map.region': {
    how: 'Slide the map\'s origin across the plane until its lines point best at their pulsars.',
    button: 'Propose this origin',
  },
};

/** The answer the current bench gives for a step, or the reason it cannot give one yet. */
export function answerFor(id: MapNodeId): { answer: Answer } | { why: string } {
  const given = assignments.value;
  switch (id) {
    case 'map.periods': {
      const line = selectedLine.value;
      if (line === null) return { why: 'Choose a line first.' };
      const jname = given[String(line)];
      return jname ? { answer: { line, jname } } : { why: `Put a pulsar on line ${line} first.` };
    }
    case 'map.old':
      return { answer: { yearsAgo: -clockYears.value, matched: { ...given } } };
    case 'map.identify': {
      const n = Object.keys(given).length;
      const total = model.value?.lines.length ?? 14;
      return n < total ? { why: `${n} of ${total} lines have a pulsar.` } : { answer: { ...given } };
    }
    case 'map.motion':
      return { answer: { lDeg: axis.value.lDeg, bDeg: axis.value.bDeg } };
    case 'map.region':
      return { answer: { x: origin.value[0], y: origin.value[1] } };
  }
}

export function StepPanel() {
  const confirmed = confirmedSet.value;
  const id = stage.value;
  const status = nodeStatus(id, confirmed);
  const a = answerFor(id);
  const busy = phase.value !== 'ready';
  const col = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = col.current;
    if (el) requestAnimationFrame(() => alignOpenPanel(el));
  }, [confirmed.size, id]);
  return (
    <div class="map-steps" ref={col}>
      <nav class="map-chips" aria-label="The Map's deductions">
        {MAP_NODE_IDS.map((n) => {
          const s = nodeStatus(n, confirmed);
          return (
            <button key={n} type="button" class={`map-chip ${s}${n === id ? ' on' : ''}`} disabled={s === 'locked'} aria-pressed={n === id} data-step={n} data-status={s} onClick={() => (stage.value = n)}>
              {nodeDef(n)?.key}
            </button>
          );
        })}
      </nav>
      {busy && (
        <p class="map-measuring" role="status" data-measuring={phase.value}>
          {phaseNote.value || 'Measuring.'}
        </p>
      )}
      <section class={`kpanel map-panel ${status}`} data-panel={id} data-status={status}>
        <PanelHead id={id} />
        {status === 'open' && <p class="note">{TEXT[id].how}</p>}
        {status === 'open' && (
          <div class="map-propose">
            <button
              type="button"
              class="btn small"
              disabled={busy || !('answer' in a)}
              data-propose-button={id}
              onClick={() => 'answer' in a && send({ type: 'deduction.propose', id, answer: a.answer })}
            >
              {TEXT[id].button}
            </button>
            {'why' in a && <span class="map-k">{a.why}</span>}
          </div>
        )}
        {status !== 'locked' && <LastReading id={id} />}
      </section>
    </div>
  );
}
