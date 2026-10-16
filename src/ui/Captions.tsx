// Sound captions and the mute switch. When the "Sound captions" setting is on, each cue shows a short line
// ("a soft pluck", "the instruments hush") in a strip at the bottom for a few seconds. The mute switch lives
// in the top bar (Shell.tsx), so it never floats over another button.

import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { lastCaption } from '../audio/cues';
import { game } from '../game/state';
import './captions.css';

const SHOW_MS = 3200;

export function Captions() {
  const cap = lastCaption.value;
  const shown = useSignal<string | null>(null);
  useEffect(() => {
    if (!cap) return;
    shown.value = cap.text;
    const t = setTimeout(() => {
      shown.value = null;
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, [cap, shown]);
  const on = game.settings.value.soundCaptions;
  return (
    <>
      <div class="captions" role="status" aria-live="polite" data-captions>
        {on && shown.value && <span class="caption">[{shown.value}]</span>}
      </div>
    </>
  );
}
