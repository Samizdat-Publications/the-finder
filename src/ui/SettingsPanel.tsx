// Settings: the human gloss (off by default, D-A07), master volume, reduced motion, sound captions, and
// Start over (asks first). Every change is a settings.set command; the save keeps them.

import { useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import type { Command } from '../game/bus';
import type { SettingName } from '../game/settings';
import { game } from '../game/state';
import { GlyphLabel } from './Glyph';
import { useDrawerFocus } from './focus';
import { send } from './send';

function Toggle(p: { name: Exclude<SettingName, 'masterVolume'>; label: string; help: string }) {
  const on = game.settings.value[p.name];
  return (
    <div class="setting">
      <div>
        <span class="lbl" id={`lbl-${p.name}`}>
          {p.label}
        </span>
        <p class="help">{p.help}</p>
      </div>
      <button
        type="button"
        role="switch"
        class={`switch${on ? ' on' : ''}`}
        aria-checked={on}
        aria-labelledby={`lbl-${p.name}`}
        data-setting={p.name}
        onClick={() => send({ type: 'settings.set', name: p.name, value: !on } as Command)}
      >
        <span class="knob" />
        <span class="sr">{on ? 'on' : 'off'}</span>
      </button>
    </div>
  );
}

export function SettingsPanel() {
  const s = game.settings.value;
  const asking = useSignal(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDrawerFocus(closeRef);
  return (
    <aside class="drawer settings" role="dialog" aria-label="Settings" id="settings">
      <header class="drawerhead">
        <h2>
          <GlyphLabel k="settings" gloss="Settings" height={28} />
        </h2>
        <button type="button" class="btn small" ref={closeRef} onClick={() => send({ type: 'settings.panel', open: false })}>
          Close
        </button>
      </header>
      <Toggle name="humanGloss" label="Human gloss" help="Show familiar units (seconds, metres) in parentheses beside the alien's units." />
      <div class="setting col">
        <label class="lbl" for="set-volume">
          Master volume <output>{Math.round(s.masterVolume * 100)}</output>
        </label>
        <input
          id="set-volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={s.masterVolume}
          onInput={(e) => send({ type: 'settings.set', name: 'masterVolume', value: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </div>
      <Toggle name="reducedMotion" label="Reduced motion" help="Hold the interface still: no pulses or slides." />
      <Toggle name="soundCaptions" label="Sound captions" help="Write out what each sound is." />
      <Toggle name="showWorking" label="Show the working" help="Open every result with its full working (the message and the readings) under the headline." />
      <div class="setting col danger">
        <span class="lbl">Start over</span>
        <p class="help">Forget every deduction, hint and attempt, and return to the ring. Your settings stay.</p>
        {!asking.value ? (
          <button type="button" class="btn small" data-start-over onClick={() => (asking.value = true)}>
            Start over...
          </button>
        ) : (
          <div class="confirm" role="alertdialog" aria-label="Confirm start over">
            <p>Erase all progress on this device?</p>
            <button
              type="button"
              class="btn small warn"
              data-confirm-start-over
              onClick={() => {
                asking.value = false;
                send({ type: 'save.reset' });
              }}
            >
              Yes, erase it
            </button>{' '}
            <button type="button" class="btn small" onClick={() => (asking.value = false)}>
              Keep my progress
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
