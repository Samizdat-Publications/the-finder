// The Pictures' signal store (browser): the 96 kHz slices this chapter's checkers and oscilloscope read,
// fetched whole and decoded at their own rate (src/media/frames.ts fetchSlice), each turned into tape units
// with its sync found once on the main thread (about 45 ms a frame). The checkers read it synchronously
// through `getSignal`; a frame not loaded yet makes a checker refuse.

import { signal } from '@preact/signals';
import { cachedSamples } from '../../game/decoderService';
import { fetchSlice, frameEntry } from '../../media/frames';
import { frameSignal, type FrameSignal } from './measure';

const store = new Map<string, FrameSignal>();
const pending = new Map<string, Promise<FrameSignal>>();

/** Bumped when a frame lands, so the interface redraws. */
export const signalsLoaded = signal(0);

export function getSignal(frame: string): FrameSignal | undefined {
  return store.get(frame);
}

/** Load a frame's signal (once; concurrent callers share the fetch). */
export function ensureSignal(frame: string): Promise<FrameSignal> {
  const hit = store.get(frame);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(frame);
  if (!p) {
    const entry = frameEntry(frame);
    p = (async () => {
      const samples = cachedSamples(frame) ?? (await fetchSlice(entry));
      const sig = frameSignal(entry, samples);
      store.set(frame, sig);
      signalsLoaded.value++;
      return sig;
    })().finally(() => pending.delete(frame));
    pending.set(frame, p);
  }
  return p;
}

/** Load several frames one after another (keeps the network and the main thread calm). */
export async function ensureSignals(frames: readonly string[]): Promise<void> {
  for (const f of frames) await ensureSignal(f);
}
