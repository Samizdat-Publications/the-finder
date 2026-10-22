// The Start over registry. A chapter's state module (an instrument's own view state: selections, dials,
// the album, flags that say "already set up") registers a function that puts that state back to how a first
// run finds it. resetSave (gameService.ts) runs them all after the save is cleared. Loaded DATA that does not
// depend on the player (a decoded sound, a catalogue) is not progress and is not reset; anything derived from
// the seed or from what the player did is.

const hooks = new Set<() => void>();

/** Register a function to run when the player starts over. Returns a function that removes it. */
export function onStartOver(fn: () => void): () => void {
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}

/**
 * Run every registered function, in the order registered. One that throws does not stop the others; the first
 * error is rethrown after all have run, so a broken reset is loud but never leaves half the state behind.
 */
export function runStartOver(): void {
  let first: unknown = null;
  let failed = false;
  for (const fn of [...hooks]) {
    try {
      fn();
    } catch (e) {
      if (!failed) {
        failed = true;
        first = e;
      }
    }
  }
  if (failed) throw first;
}
