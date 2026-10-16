// /play/: the instrument bench. The real turntable and the real picture decoder side by side. This is a
// preview of the instruments, not the game. The test handle (window.__finder) is installed only in the dev
// server or with ?harness=1.

import { render } from 'preact';
import { harnessEnabled, installHarness } from '../harness/api';
import { installBootErrors } from '../ui/boot';
import '../ui/theme.css';
import './play.css';
import { PicturePanel } from './PicturePanel';
import { TurntablePanel } from './TurntablePanel';

installBootErrors();

function Bench() {
  return (
    <div class="bench">
      <header class="bench-head">
        <p class="note">
          <a href="/">The Finder</a>
        </p>
        <h1>The instrument bench</h1>
        <p class="note narrow-only">Best on a bigger screen: the two instruments sit side by side there.</p>
      </header>
      <div class="bench-grid">
        <TurntablePanel />
        <PicturePanel />
      </div>
      <footer class="bench-foot">
        <p>
          Preview build (M2): the instruments, not the game. The pictures are decoded live from the 1977 image master tape; the sound is the Ozma 2017
          remaster.
        </p>
        <p>
          <a href="/">Back to the start</a> | <a href="/checked/">How it's checked</a>
        </p>
      </footer>
    </div>
  );
}

render(<Bench />, document.getElementById('app') as HTMLElement);

if (harnessEnabled(window.location.search, import.meta.env.DEV)) {
  installHarness();
}
