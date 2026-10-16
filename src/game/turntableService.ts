// The turntable's side of the command bus: owns the Web Audio engine (created on first use, which is
// always after a click in the interface) and writes the turntable signals. Browser only.

import { Turntable, type NeedleState } from '../record/engine';
import type { Direction } from '../record/groove';
import { groove, timeline } from './model';
import { turntable as T } from './state';

let tt: Turntable | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let dropToken = 0;

function fail(e: unknown): never {
  const message = e instanceof Error ? e.message : String(e);
  T.error.value = message;
  T.status.value = 'error';
  throw e instanceof Error ? e : new Error(message);
}

function refresh(): void {
  if (tt) T.needle.value = tt.state();
}

/** Fetch and decode the neighbour the needle is heading toward, quietly, so a track change has no gap. */
function prefetchNeighbour(itemId: string): void {
  if (!tt) return;
  const e = timeline.entryById(itemId);
  const next = timeline.entries(e.side)[e.index + (T.direction.value === 'cw' ? 1 : -1)];
  if (next) tt.store.getBuffer(next.item).catch((err: unknown) => console.warn(`turntable: could not prefetch ${next.item.id}`, err));
}

function engine(): Turntable {
  if (tt) return tt;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = T.volume.value;
  master.connect(ctx.destination);
  tt = new Turntable(ctx, { destination: master });
  tt.setDirection(T.direction.value);
  tt.setSpeed(1 / T.secondsPerTurn.value);
  tt.addEventListener('position', (ev) => {
    T.needle.value = (ev as CustomEvent<NeedleState>).detail;
  });
  tt.addEventListener('itemchange', (ev) => {
    const id = (ev as CustomEvent<NeedleState>).detail.itemId;
    if (id) prefetchNeighbour(id);
  });
  tt.addEventListener('error', (ev) => {
    const d = (ev as CustomEvent<{ itemId: string; error: unknown }>).detail;
    T.error.value = `Could not load ${d.itemId}: ${d.error instanceof Error ? d.error.message : String(d.error)}`;
  });
  return tt;
}

function wake(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export async function loadSide(side: number): Promise<void> {
  try {
    timeline.entries(side); // throws for an unknown side
    const t = engine();
    wake();
    dropToken++;
    await t.load(side, undefined, { prefetch: 'none' });
    T.side.value = side;
    T.load.value = { loaded: 0, total: 0 };
    T.error.value = null;
    T.status.value = 'ready';
    refresh();
  } catch (e) {
    fail(e);
  }
}

export async function dropNeedle(radiusMm: number): Promise<void> {
  try {
    if (!(radiusMm > 0) || !Number.isFinite(radiusMm)) throw new Error('The needle radius must be a positive number of millimetres.');
    const side = T.side.value;
    if (side === null) throw new Error('Load a side first.');
    const t = engine();
    wake();
    const token = ++dropToken;
    // Only the item under the needle and the one it is heading for are fetched (not the whole side).
    const hit = timeline.itemAt(side, groove.timeAtRadius(side, radiusMm));
    const items = hit ? [hit.entry.item] : [];
    const next = hit ? timeline.entries(side)[hit.entry.index + (T.direction.value === 'cw' ? 1 : -1)] : undefined;
    if (next) items.push(next.item);
    const loaded = new Map<string, number>();
    const total = items.reduce((a, i) => a + i.bytes, 0);
    const report = (p: { itemId: string; loaded: number }): void => {
      loaded.set(p.itemId, Math.max(loaded.get(p.itemId) ?? 0, p.loaded));
      if (token === dropToken) T.load.value = { loaded: [...loaded.values()].reduce((a, b) => a + b, 0), total };
    };
    T.load.value = { loaded: 0, total };
    T.status.value = 'loading';
    T.error.value = null;
    if (hit) {
      const item = hit.entry.item;
      if (T.direction.value === 'ccw') await t.store.getReversed(item, report);
      else await t.store.getBuffer(item, report);
      report({ itemId: item.id, loaded: item.bytes });
    }
    if (token !== dropToken) return; // a newer drop or lift took over while this one was loading
    await t.dropNeedle(radiusMm);
    T.status.value = 'ready';
    refresh();
    if (next) {
      const nextItem = next.item;
      const warm = T.direction.value === 'ccw' ? t.store.getReversed(nextItem, report) : t.store.getBuffer(nextItem, report);
      warm.then(
        () => report({ itemId: nextItem.id, loaded: nextItem.bytes }),
        (err: unknown) => console.warn(`turntable: could not prefetch ${nextItem.id}`, err),
      );
    } else if (token === dropToken) {
      T.load.value = { loaded: total, total };
    }
  } catch (e) {
    fail(e);
  }
}

export function lift(): void {
  dropToken++;
  if (tt) tt.lift();
  if (T.status.value === 'loading') T.status.value = T.side.value === null ? 'idle' : 'ready';
  refresh();
}

export function setSpeed(secondsPerTurn: number): void {
  if (!(secondsPerTurn > 0) || !Number.isFinite(secondsPerTurn)) throw new Error('Seconds per turn must be a positive number.');
  T.secondsPerTurn.value = secondsPerTurn;
  if (tt) tt.setSpeed(1 / secondsPerTurn);
  refresh();
}

export function setDirection(direction: Direction): void {
  T.direction.value = direction;
  if (tt) tt.setDirection(direction);
  refresh();
}

export function setVolume(value: number): void {
  const v = Math.min(1, Math.max(0, value));
  T.volume.value = v;
  if (master) master.gain.value = v;
}
