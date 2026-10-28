// /play/: the game. The alien shell (top bar, ring of chapters, workbench, codex, settings) over the deduction
// graph. Saves go to localStorage. The test handle (window.__finder) is installed only in the dev server or
// with ?harness=1; test checkers only when the test handle is on and the URL has ?testcheckers=1. The M2 instrument
// bench lives at /play/bench/.

import { render } from 'preact';
import { effect } from '@preact/signals';
import { installTestCheckers, testCheckersEnabled } from '../game/deductions';
import { defaultSettings } from '../game/settings';
import { loadFromStorage, startAutosave } from '../game/save';
import { game } from '../game/state';
import { harnessEnabled, installHarness } from '../harness/api';
import { installBootErrors } from '../ui/boot';
import { Shell } from '../ui/Shell';
import '../ui/theme.css';
import '../ui/shell.css';
import '../ui/codex.css';
import '../ui/results.css';
import '../ui/moment.css';
import '../tour/tour.css';
import { dispatch } from '../game/bus';
import { startRouter } from './router';
import '../chapters/index';
import '../audio/start';

installBootErrors();

/**
 * /play/?tour=1 (or /play/#tour) starts the guided tour once the save is loaded, then the parameter is removed.
 * /play/?tour=fresh erases the progress first (Start over) and starts the tour from its first stop: a bookmark for
 * watching the whole tour again.
 */
function startTourFromUrl(): void {
  const url = new URL(window.location.href);
  const fresh = url.searchParams.get('tour') === 'fresh';
  const asked = fresh || url.searchParams.get('tour') === '1' || url.hash === '#tour';
  if (!asked) return;
  url.searchParams.delete('tour');
  if (url.hash === '#tour') url.hash = '';
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  const start = fresh
    ? dispatch({ type: 'save.reset' }).then(() => dispatch({ type: 'tour.start', step: 0 }))
    : dispatch({ type: 'tour.start' });
  start.catch(() => undefined); // a refusal is already in the shell's notice
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: the game still plays, it just does not save
  }
}

const harness = harnessEnabled(window.location.search, import.meta.env.DEV);
const store = storage();

// First run: honour the system's reduced-motion preference; a save, if there is one, overrides it.
game.settings.value = defaultSettings(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
if (store) {
  loadFromStorage(store);
  startAutosave(store);
}
if (testCheckersEnabled(window.location.search, harness)) installTestCheckers();

effect(() => {
  document.documentElement.classList.toggle('calm', game.settings.value.reducedMotion);
});
startRouter();
startTourFromUrl();
render(<Shell />, document.getElementById('app') as HTMLElement);

if (harness) installHarness();
