// Our Frame (chapter 9): the quiet ending. The game steps out of the fiction into our own time and units. Six
// short sections, one on screen at a time, moved through with a large Next button (or the arrow keys and Page
// Down), a dot row to go back, and the record playing quietly under all of it (recordSound.ts, through the
// command bus). No deductions here, no glyphs: a plain-type rule at the top marks the break from the story.

import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { soundMuted } from '../../audio/mixer';
import { game, turntable as T } from '../../game/state';
import { Future } from './SlowFuture';
import { Line } from './Line';
import { Listening } from './Listening';
import { MapOlder } from './MapOlder';
import { Now, Turn } from './TurnNow';
import { lastTrack, startRecord, stopRecord } from './recordSound';
import './epilogue.css';

export const SECTIONS = ['turn', 'now', 'listening', 'future', 'map', 'line'] as const;
export type SectionId = (typeof SECTIONS)[number];

/** The section on screen. A signal so the guided tour can turn to the section its stop talks about. */
export const epilogueSection = signal(0);

/** The guided tour: show this section (by id). */
export function showEpilogueSection(id: SectionId): void {
  epilogueSection.value = SECTIONS.indexOf(id);
}

const LABELS: Record<SectionId, string> = {
  turn: 'The turn',
  now: 'Right now',
  listening: 'Still listening',
  future: 'The slow future',
  map: 'The map is older than the machine',
  line: 'The line in the run-out groove',
};

const SECTION_VIEW: Record<SectionId, () => JSX.Element> = { turn: Turn, now: Now, listening: Listening, future: Future, map: MapOlder, line: Line };

/** True when a key press belongs to a form control or a modified shortcut, which the section keys must leave alone. */
function leaveKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/**
 * What is playing and, while it loads, its progress. No sound button of its own: the top bar's is always there
 * (M7 step 1, the V1 critic's "lone Sound button").
 */
function SoundLine() {
  const track = lastTrack();
  const status = T.status.value;
  const { loaded, total } = T.load.value;
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  return (
    <div class="epi-sound">
      <span class="epi-caption" data-epilogue-caption>
        {soundMuted.value ? 'Sound is off. Playing' : 'Playing'}: the record, track {track.musicNumber}, {track.shortTitle}
      </span>
      {status === 'loading' && (
        <span class="epi-loading" data-epilogue-loading role="status">
          Loading the record, {pct}%
        </span>
      )}
    </div>
  );
}

export function EpilogueInstrument() {
  const i = epilogueSection.value;
  const last = SECTIONS.length - 1;
  const touring = game.tour.value.on;
  const setI = (f: (n: number) => number): void => {
    epilogueSection.value = f(epilogueSection.value);
  };
  const go = (n: number): void => {
    epilogueSection.value = Math.min(last, Math.max(0, n));
  };

  // The record plays while the chapter is open and is lifted on leaving; if it cannot load, nothing else is affected.
  useEffect(() => {
    // Free play starts at the first section; the guided tour has already turned to its stop's section.
    if (!game.tour.value.on) epilogueSection.value = 0;
    startRecord().catch(() => undefined);
    return () => {
      void stopRecord();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (leaveKey(e) || game.tour.value.on) return; // the guide sets the section while the tour is on
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        setI((n) => Math.min(last, n + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setI((n) => Math.max(0, n - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const id = SECTIONS[i] as SectionId;
  const View = SECTION_VIEW[id];
  return (
    <div class="epi" data-epilogue data-epilogue-index={i} data-epilogue-current={id}>
      <p class="epi-rule">
        <span>Now, our side of the story</span>
      </p>
      <div class="epi-stage" key={id}>
        <View />
      </div>
      <nav class="epi-nav" aria-label="Sections of Our Frame">
        {!touring && (
          <ol class="epi-dots">
          {SECTIONS.map((s, n) => (
            <li key={s}>
              <button type="button" class={`epi-dot${n === i ? ' here' : ''}`} aria-label={`${n + 1} of ${SECTIONS.length}: ${LABELS[s]}`} aria-current={n === i ? 'step' : undefined} data-epilogue-dot={s} onClick={() => go(n)} />
            </li>
          ))}
          </ol>
        )}
        <SoundLine />
        {!touring && (
          <button type="button" class="btn epi-next" data-epilogue-next disabled={i === last} onClick={() => go(i + 1)}>
            Next
          </button>
        )}
      </nav>
    </div>
  );
}
