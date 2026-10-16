// The album (browser): every frame of the picture side as the decoder developed it from the tape with the
// player's own settings (rule 2: decoded pictures only, never a clean published image). Developing goes through
// the command bus exactly as the bench does (decoder.select, decoder.run); each finished picture is copied here
// with the settings that made it, and a small gold thumbnail. The album's checkers read these pictures.

import { effect, signal } from '@preact/signals';
import { dispatch } from '../../game/bus';
import { decoder as D, type Picture } from '../../game/state';
import { ALBUM_FRAMES, type DecodedPicture } from './checkersM5';
import type { PictureSettings } from './measure';
import { paintGold } from './PictureView';

export interface AlbumPicture extends DecodedPicture {
  thumb: string;
}

/** Developed pictures by frame id. */
export const album = signal<Readonly<Record<string, AlbumPicture>>>({});
/** The frame developing now, or null; and whether a run over the side is going. */
export const developing = signal<string | null>(null);
export const runningSide = signal<'record' | 'fast' | null>(null);

export function settingsOf(p: Picture): PictureSettings {
  const b = p.bench;
  return { lineTimeMs: b.lineTimeMs, syncLock: b.syncLock, interlace: b.interlace, polarity: b.polarity, rows: b.rows };
}

/** The decoder's settings as they stand on the bench. */
export function benchSettings(): PictureSettings {
  const b = D.bench.value;
  return { lineTimeMs: b.lineTimeMs, syncLock: b.syncLock, interlace: b.interlace, polarity: b.polarity, rows: b.rows };
}

/** The checkers' view of the album. */
export function albumPicture(frame: string): DecodedPicture | undefined {
  return album.value[frame];
}

/** A gold canvas of a decoded grey picture (the instrument's duotone). */
export function goldCanvas(gray: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(width, height);
    paintGold(gray, width, height, img.data);
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

function thumbOf(gray: Uint8Array, width: number, height: number, w = 120): string {
  const full = goldCanvas(gray, width, height);
  const t = document.createElement('canvas');
  t.width = w;
  t.height = Math.round((w * height) / width);
  t.getContext('2d')?.drawImage(full, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}

const kept = new WeakSet<Picture>();

/** Keep the decoder's finished picture in the album (copied: the decoder drops it on the next run). Once per picture. */
export function keepPicture(p: Picture): void {
  if (kept.has(p)) return;
  kept.add(p);
  const gray = p.gray.slice();
  const pic: AlbumPicture = {
    frame: p.frame, width: p.width, height: p.height, gray, data: gray, levels: [p.levels[0], p.levels[1]], settings: settingsOf(p),
    thumb: thumbOf(gray, p.width, p.height),
  };
  album.value = { ...album.value, [p.frame]: pic };
}

let stopRequested = false;

/** Stop a run over the side after the frame developing now. */
export function stopSide(): void {
  stopRequested = true;
}

/**
 * Develop every frame of the side not yet in the album with the bench's settings, in the order the tape plays
 * them: at the speed the lines come off the record, or each at once. A frame already developed with other
 * settings is developed again. Resolves when the side is done or the run is stopped or interrupted.
 */
export async function developSide(speed: 'record' | 'fast'): Promise<void> {
  if (runningSide.value) return;
  stopRequested = false;
  runningSide.value = speed;
  try {
    for (const f of ALBUM_FRAMES) {
      if (stopRequested) break;
      const have = album.value[f];
      const s = benchSettings();
      if (have && JSON.stringify(have.settings) === JSON.stringify(s)) continue;
      developing.value = f;
      await dispatch({ type: 'decoder.select', frame: f });
      await dispatch({ type: 'decoder.run', speed });
      const p = D.picture.value;
      // interrupted (another frame selected, or a knob turned): stop the run where it is
      if (!p || p.frame !== f || D.status.value !== 'done' || D.revealed.value < p.width) break;
      keepPicture(p);
    }
  } finally {
    developing.value = null;
    runningSide.value = null;
  }
}

/** Develop one frame (or take it from the album when it is already there) and show it on the bench. */
export async function developOne(frame: string): Promise<AlbumPicture | undefined> {
  await dispatch({ type: 'decoder.select', frame });
  await dispatch({ type: 'decoder.run', speed: 'fast' });
  const p = D.picture.value;
  if (p && p.frame === frame && D.status.value === 'done') keepPicture(p);
  return album.value[frame];
}

let tracking = false;

/** Every picture the bench finishes (developed to its last line, at any speed) goes into the album too. Idempotent. */
export function trackAlbum(): void {
  if (tracking) return;
  tracking = true;
  effect(() => {
    const p = D.picture.value;
    if (p && D.status.value === 'done' && D.revealed.value >= p.width) keepPicture(p);
  });
}
