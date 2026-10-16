// The Pictures' notebook: one panel per deduction, each proposing the decoder's current settings through the
// command bus (the checker then decodes the real tape with them and measures the picture). Locked panels
// stay small; confirmed ones keep their reading. After the circle, the pictures that follow, ready to
// develop, and the gold thumbnails of what has been seen.

import type { ComponentChildren } from 'preact';
import { nodeStatus, type Answer } from '../../game/deductions';
import { dispatch } from '../../game/bus';
import { confirmedSet, decoder as D } from '../../game/state';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { FIRST_FRAMES, FRAMES_TO_WATCH, sliceInfo, type PictureNodeId } from './checkers';
import { thumbs, watched } from './seen';

/** The answer each deduction proposes, from the knobs as they stand. */
export function answerFor(id: PictureNodeId): Answer {
  const b = D.bench.value;
  const settings = { lineTimeMs: b.lineTimeMs, syncLock: b.syncLock, interlace: b.interlace, polarity: b.polarity, rows: b.rows };
  switch (id) {
    case 'pictures.lineTime':
      return { lineTimeMs: b.lineTimeMs };
    case 'pictures.sync':
      return { lineTimeMs: b.lineTimeMs, syncLock: b.syncLock };
    case 'pictures.interlace':
      return { interlace: b.interlace };
    case 'pictures.polarity':
      return { polarity: b.polarity };
    case 'pictures.aspect':
      return { rows: b.rows };
    case 'pictures.circle':
      return settings;
    case 'pictures.firstFrames':
      return { watched: [...watched.value], settings };
  }
}

const TEXT: Record<PictureNodeId, { how: string; button: string }> = {
  'pictures.lineTime': {
    how: 'With the line start free-running, turn the line time until the picture stops slanting and tearing. The cover gives a time for one line.',
    button: 'Propose this line time',
  },
  'pictures.sync': {
    how: 'Every line opens with a sharp falling edge (watch the oscilloscope). Start each line at its own edge instead of on a fixed clock.',
    button: 'Propose this line start',
  },
  'pictures.interlace': {
    how: 'Look at the circle\'s left and right sides: neighbouring lines are offset. The cover draws the lines staggered.',
    button: 'Propose this stagger',
  },
  'pictures.polarity': {
    how: 'Each picture is a photograph of a slide in its mount. Which reading makes the mount at the edges dark?',
    button: 'Propose this reading',
  },
  'pictures.aspect': {
    how: 'The record\'s first picture is a circle. Set the rows until it is as tall as it is wide.',
    button: 'Propose these rows',
  },
  'pictures.circle': {
    how: 'With everything set, the circle should come out true.',
    button: 'Propose: the circle is true',
  },
  'pictures.firstFrames': {
    how: `Keep the settings and develop the pictures that follow, at record speed. Watch at least ${FRAMES_TO_WATCH}.`,
    button: 'Propose: the settings read them',
  },
};

function Panel(p: { id: PictureNodeId; children?: ComponentChildren }) {
  const status = nodeStatus(p.id, confirmedSet.value);
  return (
    <section class={`kpanel pic-panel ${status}`} data-panel={p.id} data-status={status}>
      <PanelHead id={p.id} />
      {status === 'open' && <p class="note">{TEXT[p.id].how}</p>}
      {p.children}
      {status === 'open' && (
        <button type="button" class="btn small" data-propose-button={p.id} onClick={() => send({ type: 'deduction.propose', id: p.id, answer: answerFor(p.id) })}>
          {TEXT[p.id].button}
        </button>
      )}
      {status !== 'locked' && <LastReading id={p.id} />}
    </section>
  );
}

async function develop(frame: string): Promise<void> {
  await dispatch({ type: 'decoder.select', frame });
  await dispatch({ type: 'decoder.run', speed: 'record' });
}

async function playOn(): Promise<void> {
  for (const f of FIRST_FRAMES) {
    if (watched.value.includes(f)) continue;
    await develop(f);
    if (!watched.value.includes(f)) return; // interrupted by the player
  }
}

function FollowingFrames() {
  const seen = watched.value;
  const busy = D.status.value === 'revealing' || D.status.value === 'loading' || D.status.value === 'decoding';
  return (
    <div class="pic-follow">
      <div class="pic-row">
        <button type="button" class="btn small" disabled={busy} onClick={() => void playOn().catch(() => undefined)} data-play-on="">
          Play on
        </button>
        {FIRST_FRAMES.map((f) => (
          <button
            key={f}
            type="button"
            class={`btn small pic-frame-btn${seen.includes(f) ? ' seen' : ''}`}
            disabled={busy}
            data-develop={f}
            onClick={() => void develop(f).catch(() => undefined)}
          >
            {f}
          </button>
        ))}
      </div>
      <p class="note">
        Watched: {seen.length} of {FRAMES_TO_WATCH} needed.
      </p>
    </div>
  );
}

export function Seen() {
  const t = thumbs.value;
  const ids = ['L000', ...FIRST_FRAMES].filter((f) => t[f]);
  if (!ids.length) return null;
  return (
    <section class="pic-seen" aria-label="What you have seen">
      <h3 class="pic-h">What you have seen</h3>
      <ul>
        {ids.map((f) => (
          <li key={f} data-seen={f}>
            <img src={t[f]} alt={`Frame ${f}, decoded from the tape`} title={sliceInfo(f).title} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Notebook() {
  const confirmed = confirmedSet.value;
  return (
    <div class="pic-notebook">
      <Panel id="pictures.lineTime" />
      <Panel id="pictures.sync" />
      <Panel id="pictures.interlace" />
      <Panel id="pictures.polarity" />
      <Panel id="pictures.aspect" />
      <Panel id="pictures.circle" />
      <Panel id="pictures.firstFrames">{confirmed.has('pictures.circle') && <FollowingFrames />}</Panel>
    </div>
  );
}
