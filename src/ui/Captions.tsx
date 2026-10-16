// Sound captions and the mute switch. When the "Sound captions" setting is on, each cue shows a short line
// ("a soft pluck", "the instruments hush") in a strip at the bottom for a few seconds. The mute switch is
// always there: it silences the interface sounds (the record's own audio is separate).

import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { lastCaption } from '../audio/cues';
import { soundMuted } from '../audio/mixer';
import { game } from '../game/state';
import './captions.css';

const SHOW_MS = 3200;

export function Captions(props: { onToggleMute: () => void }) {
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
  const muted = soundMuted.value;
  return (
    <>
      <div class="captions" role="status" aria-live="polite" data-captions>
        {on && shown.value && <span class="caption">[{shown.value}]</span>}
      </div>
      <button type="button" class="soundtoggle" data-sound-toggle aria-pressed={muted} title="Mute or unmute the instruments' sounds" onClick={props.onToggleMute}>
        {muted ? 'Sound off' : 'Sound on'}
      </button>
    </>
  );
}
