// Portrait's small shared state: the confirmed results the plate reads (the accessors copied from
// src/chapters/moments.ts), the marker "When it left" on the clocks band, and the handle the guided tour uses to
// set the marker without dragging (as The Map's chartHandle()). Browser state only; the checker stays pure.

import { signal } from '@preact/signals';
import type { Attempt } from '../../game/deductions';
import { onStartOver } from '../../game/resetHooks';
import { game } from '../../game/state';
import { clocksFrom, combine, type PortraitClock } from './checkers';

/** The player's latest confirmed attempt at a deduction (src/chapters/moments.ts lastOk). */
export const lastOk = (id: string): Attempt | undefined => [...(game.records.value[id]?.attempts ?? [])].reverse().find((x) => x.ok);
/** A reading of an attempt by its key (src/chapters/moments.ts reading). */
export const reading = (a: Attempt, key: string): number | string | undefined => a.result.find((r) => r.key === key)?.value;

/** The marker "When it left", years before now; null until the band first draws it. */
export const marker = signal<number | null>(null);

onStartOver(() => {
  marker.value = null;
});

/** The four clocks from the player's confirmed results (fewer on an old save). */
export function playerClocks(): PortraitClock[] {
  return clocksFrom(lastOk);
}

export interface PortraitHandle {
  /** Move the marker to a time, years before now (clamped to the band's axis). */
  setMarker(yearsAgo: number): void;
  /** Where the marker is now. */
  marker(): number | null;
  /** The four clocks combined, from the player's own results (null until all four are in). */
  combined(): { mean: number; sigma: number } | null;
}

let mountedAxis: { lo: number; hi: number } | null = null;

/** The band tells the handle its axis while it is on screen (null when it leaves). */
export function setAxis(axis: { lo: number; hi: number } | null): void {
  mountedAxis = axis;
}

/** The clocks band on screen, for the guided tour's "Do it for me" and the browser test; null when it is not mounted. */
export function portraitHandle(): PortraitHandle | null {
  if (!mountedAxis) return null;
  const axis = mountedAxis;
  return {
    setMarker(y) {
      marker.value = Math.min(axis.hi, Math.max(axis.lo, y));
    },
    marker: () => marker.value,
    combined() {
      const k = playerClocks();
      if (k.length !== 4) return null;
      const c = combine(k);
      return { mean: c.mean, sigma: c.sigma };
    },
  };
}
