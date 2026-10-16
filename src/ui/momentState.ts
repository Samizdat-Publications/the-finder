// When the staged moments play (M4 step 7e): the five big discoveries each get a short full-screen moment
// when their deduction is confirmed. Triggered from game state (one subscription to the confirmed set, like
// the sound cues), so a bot sees exactly what a player sees, and skips it through the same control. The first
// run only records the current state, so loading a save plays no moment; deductions confirmed together
// queue their moments in play order. A moment never changes game state: it only reads it. Pure logic over
// signals (no DOM), so Node tests drive it.

import { effect, signal } from '@preact/signals';
import { confirmedSet } from '../game/state';

/** The deductions with a staged moment, in the order they would queue. */
export const MOMENT_IDS = ['map.region', 'spot.age', 'trail.origin', 'trail.neighbour', 'trail.when'] as const;
export type MomentId = (typeof MOMENT_IDS)[number];

/** How long a moment holds before returning on its own, ms (a player can skip it at once). */
export const MOMENT_MS = 7000;

export type MomentEnd = 'button' | 'click' | 'key' | 'timeout';

export interface MomentLogEntry {
  n: number;
  id: MomentId;
  /** How it ended, or null while it shows. */
  ended: MomentEnd | null;
}

/** The moment on screen, or null. A new object for every moment shown. */
export const activeMoment = signal<{ n: number; id: MomentId } | null>(null);

const queue: MomentId[] = [];
const log: MomentLogEntry[] = [];
let counter = 0;

export function momentLog(): readonly MomentLogEntry[] {
  return log;
}

function showNext(): void {
  const id = queue.shift();
  if (!id) {
    activeMoment.value = null;
    return;
  }
  counter++;
  log.push({ n: counter, id, ended: null });
  activeMoment.value = { n: counter, id };
}

/** End the moment on screen (skip, or its time is up); the next queued one, if any, follows. */
export function endMoment(how: MomentEnd): void {
  const a = activeMoment.value;
  if (!a) return;
  const e = log.find((x) => x.n === a.n);
  if (e) e.ended = how;
  showNext();
}

let stop: (() => void) | null = null;

/** Start watching the confirmed set (once). Returns a function that stops it and clears the queue. */
export function startMoments(): () => void {
  if (stop) return stop;
  let seen: ReadonlySet<string> | null = null;
  const dispose = effect(() => {
    const now = confirmedSet.value;
    const prev = seen;
    seen = now;
    if (!prev) return;
    const added = MOMENT_IDS.filter((id) => now.has(id) && !prev.has(id));
    if (added.length === 0) return;
    queue.push(...added);
    if (!activeMoment.peek()) showNext();
  });
  stop = () => {
    dispose();
    queue.length = 0;
    activeMoment.value = null;
    stop = null;
  };
  return stop;
}

/** Tests: forget the log and any queued moment. */
export function resetMoments(): void {
  stop?.();
  log.length = 0;
  counter = 0;
}
