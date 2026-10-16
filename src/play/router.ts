// Chapter routing for /play/: the hash names the chapter (#arrival, #key, #player, #pictures, #hub). The hash
// and the game's current chapter follow each other; a hash that names a locked or unbuilt chapter is refused
// by the same chapter.enter command the interface uses, and the hash is put back to where the player is.

import { effect } from '@preact/signals';
import { dispatch } from '../game/bus';
import { parseChapterHash } from '../game/graph';
import { game } from '../game/state';

/** Start following the hash. Returns a function that stops it. */
export function startRouter(): () => void {
  const fromHash = (): void => {
    const view = parseChapterHash(window.location.hash);
    if (view === null || view === game.chapter.value) return;
    dispatch({ type: 'chapter.enter', chapter: view }).catch(() => {
      // refused: the game's chapter stays, and the effect below puts the hash back
      window.location.hash = game.chapter.value;
    });
  };
  window.addEventListener('hashchange', fromHash);
  fromHash(); // a link such as /play/#key wins over the saved chapter, when it can be entered
  const stop = effect(() => {
    const want = game.chapter.value;
    if (parseChapterHash(window.location.hash) !== want) window.location.hash = want;
  });
  return () => {
    window.removeEventListener('hashchange', fromHash);
    stop();
  };
}
