// The decoded pictures on Portrait's plate (rule 2: decoded from the tape, never a clean image). The album keeps
// every frame the decoder developed this session; after a reload it is empty, so the plate develops the frames
// it shows through the album's own path (album.ts developOne: decoder.select and decoder.run on the command bus),
// with the decoder's knobs set to the settings the player's confirmed deductions accepted (pictures/start.ts
// resumeSettings, as The Pictures does on entry). One frame at a time; a frame already in the album is used as it
// is. Browser only.

import { signal } from '@preact/signals';
import { dispatch } from '../../game/bus';
import { decoder as D, game } from '../../game/state';
import { album, developOne, runningSide } from '../pictures/album';
import { FRAME_ROWS } from '../pictures/framesM5';
import { resumeSettings } from '../pictures/start';
import { lastOk } from './state';

/** The figures the heights were measured on (pictures.height; data/teaching.json L039). */
export const FIGURES_FRAME = 'L039';
/** The colour triple of the world seen from space: the record's own frame list (data/frames.json, image "Earth"). */
export const WORLD_FRAMES: readonly string[] = FRAME_ROWS.filter((f) => f.title === 'Earth').sort((a, b) => a.index - b.index).map((f) => f.frame);
/** Its green frame, the grey picture shown when no colour picture of it was composed. */
export const WORLD_GREY = WORLD_FRAMES.find((f) => FRAME_ROWS.find((r) => r.frame === f)?.colourRole === 'G') ?? WORLD_FRAMES[0] ?? 'L014';

/** True when the player composed the world's colour picture (pictures.colour confirmed on those three frames). */
export function worldComposed(): boolean {
  const frames = (lastOk('pictures.colour')?.answer as { frames?: string[] } | undefined)?.frames ?? [];
  return frames.length === WORLD_FRAMES.length && frames.every((f, i) => f === WORLD_FRAMES[i]);
}

/** The frames the plate shows: the figures, and the world in colour (three) or grey (one). */
export function plateFrames(): string[] {
  return [FIGURES_FRAME, ...(worldComposed() ? WORLD_FRAMES : [WORLD_GREY])];
}

/** The frame the plate is developing now, or null. */
export const developingForPlate = signal<string | null>(null);

let busy: Promise<void> | null = null;

/** Develop the plate's frames that the album does not hold yet. Safe to call repeatedly. */
export function ensurePlatePictures(): Promise<void> {
  busy ??= (async () => {
    try {
      const missing = plateFrames().filter((f) => !album.value[f]);
      if (missing.length === 0 || runningSide.value) return;
      const s = resumeSettings(game.records.value);
      const b = D.bench.value;
      const set = async <K extends 'lineTimeMs' | 'syncLock' | 'interlace' | 'polarity' | 'rows'>(name: K, value: (typeof b)[K]): Promise<void> => {
        if (b[name] !== value) await dispatch({ type: 'decoder.setParam', name, value } as Parameters<typeof dispatch>[0]);
      };
      await set('lineTimeMs', s.lineTimeMs);
      await set('syncLock', s.syncLock);
      await set('interlace', s.interlace);
      await set('polarity', s.polarity);
      await set('rows', s.rows);
      if (!b.droop) await dispatch({ type: 'decoder.setParam', name: 'droop', value: true });
      for (const f of missing) {
        if (album.value[f]) continue;
        developingForPlate.value = f;
        await developOne(f);
      }
    } finally {
      developingForPlate.value = null;
      busy = null;
    }
  })();
  return busy;
}
