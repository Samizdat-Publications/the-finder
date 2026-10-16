// Player settings (persisted with the save). Pure: no DOM. The human gloss is off by default (D-A07): the
// interface speaks in the alien's units and the English gloss line, and SI units appear only if asked.

export interface Settings {
  /** Show SI units in parentheses beside the alien's hydrogen-based units. */
  humanGloss: boolean;
  /** Master volume, 0 to 1. */
  masterVolume: number;
  /** Cut down motion in the interface (the shell's transitions and pulses). */
  reducedMotion: boolean;
  /** Captions for sounds. */
  soundCaptions: boolean;
  /** Results open with their working (the full message and readings) unfolded under the headline (M4 step 7e). */
  showWorking: boolean;
}

export type SettingName = keyof Settings;

/** One command per setting, so the name and the value always agree (same trick as the bench's knobs). */
export type SettingCommand = { [K in SettingName]: { type: 'settings.set'; name: K; value: Settings[K] } }[SettingName];

export function defaultSettings(prefersReducedMotion = false): Settings {
  return { humanGloss: false, masterVolume: 0.8, reducedMotion: prefersReducedMotion, soundCaptions: false, showWorking: false };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Check one value for one setting. Throws with a readable reason when the value is the wrong kind. */
export function coerceSetting<K extends SettingName>(name: K, value: unknown): Settings[K] {
  switch (name) {
    case 'masterVolume': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('masterVolume must be a number from 0 to 1');
      return clamp01(value) as Settings[K];
    }
    case 'humanGloss':
    case 'reducedMotion':
    case 'soundCaptions':
    case 'showWorking': {
      if (typeof value !== 'boolean') throw new Error(`${name} must be true or false`);
      return value as Settings[K];
    }
    default:
      throw new Error(`unknown setting ${String(name)}`);
  }
}

/** Read settings from a stored value: anything missing or of the wrong kind falls back to the base. */
export function normalizeSettings(raw: unknown, base: Settings = defaultSettings()): Settings {
  const out: Settings = { ...base };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const name of Object.keys(base) as SettingName[]) {
    if (!(name in r)) continue;
    try {
      (out as unknown as Record<string, unknown>)[name] = coerceSetting(name, r[name]);
    } catch {
      // keep the base value for a bad stored one
    }
  }
  return out;
}
