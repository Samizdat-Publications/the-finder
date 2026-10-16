// Small shared interface pieces for the bench: a labelled slider with the reference value marked, an on/off
// (or two-way) switch, and number formatting. Presentational only: they call back, they never touch state.

import type { ComponentChildren } from 'preact';

export function fmtTime(s: number): string {
  const sign = s < 0 ? '-' : '';
  const a = Math.abs(s);
  const m = Math.floor(a / 60);
  const sec = Math.floor(a % 60);
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtMB(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

export function fmtSigned(x: number, digits = 2): string {
  return `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(digits)}`;
}

interface SliderProps {
  id: string;
  label: ComponentChildren;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Where the reference value sits; drawn as a tick under the slider. */
  mark?: number;
  markLabel?: string;
  disabled?: boolean;
  readout: ComponentChildren;
  onInput: (v: number) => void;
  /** Called when the thumb is released (a drag has finished). */
  onCommit?: (v: number) => void;
}

export function Slider(p: SliderProps) {
  const pct = p.mark === undefined ? 0 : ((p.mark - p.min) / (p.max - p.min)) * 100;
  return (
    <div class={`ctl${p.disabled ? ' off' : ''}`}>
      <label for={p.id}>
        <span>{p.label}</span>
        <output>{p.readout}</output>
      </label>
      <input
        id={p.id}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        disabled={p.disabled}
        onInput={(e) => p.onInput(Number((e.currentTarget as HTMLInputElement).value))}
        onChange={(e) => p.onCommit?.(Number((e.currentTarget as HTMLInputElement).value))}
      />
      {p.mark !== undefined && (
        <div class="mark" aria-hidden="true">
          <i style={{ left: `${pct}%` }} />
          <span style={{ left: `${Math.min(88, Math.max(12, pct))}%` }}>{p.markLabel}</span>
        </div>
      )}
    </div>
  );
}

interface SwitchProps<T extends string | boolean> {
  label: ComponentChildren;
  help?: ComponentChildren;
  value: T;
  options: { value: T; text: string }[];
  disabled?: boolean;
  onPick: (v: T) => void;
}

export function Switch<T extends string | boolean>(p: SwitchProps<T>) {
  return (
    <div class="ctl">
      <div class="switchrow">
        <span class="lbl">{p.label}</span>
        <div class="seg" role="group">
          {p.options.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              class={o.value === p.value ? 'on' : ''}
              aria-pressed={o.value === p.value}
              disabled={p.disabled}
              onClick={() => p.onPick(o.value)}
            >
              {o.text}
            </button>
          ))}
        </div>
      </div>
      {p.help && <p class="help">{p.help}</p>}
    </div>
  );
}
