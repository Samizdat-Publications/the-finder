// The test and bot handle: window.__finder = { dispatch, state(), waitFor() }. Installed only in the dev
// server or when the URL has ?harness=1 (src/play/main.tsx decides), never on an ordinary visit. It
// is the same bus the interface uses: a bot cannot do anything a player cannot.

import { dispatch, type Command } from '../game/bus';
import { snapshot, type Snapshot } from '../game/state';

export interface FinderHarness {
  dispatch: (cmd: Command) => Promise<void>;
  state: () => Snapshot;
  /** Resolves true when predicate() is true (checked every 50 ms), or rejects after timeoutMs. */
  waitFor: (predicate: () => boolean, timeoutMs?: number) => Promise<boolean>;
}

declare global {
  interface Window {
    __finder?: FinderHarness;
  }
}

export function harnessEnabled(search: string, dev: boolean): boolean {
  return dev || new URLSearchParams(search).get('harness') === '1';
}

export function installHarness(): FinderHarness {
  const api: FinderHarness = {
    dispatch,
    state: snapshot,
    waitFor: (predicate, timeoutMs = 30_000) =>
      new Promise<boolean>((resolve, reject) => {
        const t0 = Date.now();
        const tick = (): void => {
          let ok = false;
          try {
            ok = predicate();
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
            return;
          }
          if (ok) resolve(true);
          else if (Date.now() - t0 > timeoutMs) reject(new Error(`waitFor timed out after ${timeoutMs} ms`));
          else setTimeout(tick, 50);
        };
        tick();
      }),
  };
  window.__finder = api;
  return api;
}
