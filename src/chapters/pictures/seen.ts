// What the player has watched develop in The Pictures: the frames after the circle that were decoded at
// record speed to the last line, and their gold thumbnails (what was seen, decoded from the tape; never a
// clean published image, rule 2). Browser only (signals, canvas).

import { effect, signal } from '@preact/signals';
import { onStartOver } from '../../game/resetHooks';
import { decoder as D } from '../../game/state';
import { FIRST_FRAMES } from './checkers';
import { goldThumb } from './PictureView';

/** Frames after the circle watched to the last line at record speed, in the order watched. */
export const watched = signal<string[]>([]);
/** Gold thumbnails by frame id. */
export const thumbs = signal<Record<string, string>>({});

export function keepThumb(): void {
  const p = D.picture.value;
  if (p && D.revealed.value >= p.width) thumbs.value = { ...thumbs.value, [p.frame]: goldThumb(p) };
}

// Start over: nothing has been watched. (The tracking effect stays; it is the instrument's wiring, not progress.)
onStartOver(() => {
  watched.value = [];
  thumbs.value = {};
});

let stop: (() => void) | null = null;

/** Follow the decoder: a record-speed reveal that reaches the last line counts as watched. Idempotent. */
export function trackWatching(): void {
  if (stop) return;
  let revealing: string | null = null;
  stop = effect(() => {
    const status = D.status.value;
    const p = D.picture.value;
    const n = D.revealed.value;
    if (status === 'loading' || status === 'decoding' || status === 'idle' || status === 'error') revealing = null;
    else if (status === 'revealing' && p) revealing = p.frame;
    else if (status === 'done' && p && revealing === p.frame && n >= p.width) {
      revealing = null;
      if (FIRST_FRAMES.includes(p.frame) && !watched.value.includes(p.frame)) {
        watched.value = [...watched.value, p.frame];
        thumbs.value = { ...thumbs.value, [p.frame]: goldThumb(p) };
      }
    }
  });
}
