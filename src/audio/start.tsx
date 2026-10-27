// Starts the sound layer: arms the first-gesture start, subscribes the cues to the game state, follows the
// master volume and the mute switch, ticks instrument controls, and mounts the caption strip. Imported once
// by src/play/main.tsx. The subscription starts on the next task, after main.tsx has loaded the save, so the
// deductions already confirmed in a save make no cues.

import { effect } from '@preact/signals';
import { render } from 'preact';
import { game } from '../game/state';
import { Captions } from '../ui/Captions';
import { startCues } from './cues';
import { MUTE_KEY, mixer } from './mixer';
import { LiveSink } from './sink';

const TICKABLE = 'button:not(:disabled), [role="switch"], input[type="range"], summary';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function startSound(): void {
  const store = storage();
  try {
    mixer.setMuted(store?.getItem(MUTE_KEY) === '1');
  } catch {
    // blocked storage: stay unmuted
  }
  mixer.arm(window);
  effect(() => mixer.setVolume(game.settings.value.masterVolume));
  const sink = new LiveSink(mixer, () => game.seed.value);
  const cues = startCues({ sink });

  // A very quiet tick when the pointer or focus arrives at an instrument control (rate-limited in cues.ts).
  let lastTarget: Element | null = null;
  const onEnter = (ev: Event): void => {
    const t = ev.target instanceof Element ? ev.target.closest(TICKABLE) : null;
    if (!t || t === lastTarget) return;
    lastTarget = t;
    cues.fire({ kind: 'tick', chapter: game.chapter.peek() });
  };
  document.addEventListener('pointerover', onEnter);
  document.addEventListener('focusin', onEnter);
  document.addEventListener('pointerout', () => {
    lastTarget = null;
  });

  // A soft knock when a control is pressed (pointer or Enter/Space), and a detent tick as a slider moves, its
  // pitch following the slider (rate-limited in cues.ts), so the instruments answer the hand.
  const pressable = (t: EventTarget | null): boolean => t instanceof Element && t.closest(TICKABLE) !== null && t.closest('input[type="range"]') === null;
  document.addEventListener('pointerdown', (ev) => {
    if (pressable(ev.target)) cues.fire({ kind: 'press', chapter: game.chapter.peek() });
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && !ev.repeat && pressable(ev.target)) cues.fire({ kind: 'press', chapter: game.chapter.peek() });
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'range' || t.closest('.bench-area') === null) return;
    const lo = Number(t.min || 0);
    const hi = Number(t.max || 100);
    const position = hi > lo ? (Number(t.value) - lo) / (hi - lo) : 0.5;
    cues.fire({ kind: 'detent', chapter: game.chapter.peek(), position });
  });

  const host = document.createElement('div');
  host.id = 'sound-layer';
  document.body.appendChild(host);
  render(<Captions />, host);
}

// After the save is loaded and the shell is drawn (main.tsx runs to its end first).
setTimeout(startSound, 0);
