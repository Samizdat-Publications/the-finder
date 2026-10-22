// Our Frame's sound: the record plays quietly under the ending, track 27 of the record's music, Beethoven's
// Cavatina, the last piece on it. Everything goes through the command bus (rule 5): load the side that holds the
// track, set the turntable to the true speed and direction, a low volume, and drop the needle at the track's
// start. Leaving lifts the needle and gives the volume back. The track is found in data/record.json by its
// music number; nothing here names a file.

import { dispatch } from '../../game/bus';
import { COVER_PERIOD_S, groove, timeline } from '../../game/model';
import { turntable as T } from '../../game/state';
import { PLAYING_DIRECTION } from '../../record/groove';

/** The last piece of music on the record. */
export const LAST_MUSIC_NUMBER = 27;

/** The record's level under the ending (a design choice: a quiet bed, the beds duck under the needle on top of this). */
export const QUIET_VOLUME = 0.3;

/** Seconds into the track where the needle drops: clear of the join with the piece before it. */
const DROP_INTO_TRACK_S = 0.5;

export interface LastTrack {
  side: number;
  startS: number;
  radiusMm: number;
  musicNumber: number;
  /** "Cavatina": the last part of NASA's title for the piece. */
  shortTitle: string;
  title: string;
}

/** Find the track by its music number in the record's timeline. */
export function lastTrack(): LastTrack {
  for (const side of timeline.sides()) {
    const entry = timeline.entries(side).find((e) => e.item.musicNumber === LAST_MUSIC_NUMBER);
    if (!entry) continue;
    const item = entry.item;
    const nasa = item.nasaTitle ?? item.title;
    return {
      side,
      startS: entry.startS,
      radiusMm: groove.radiusAtTime(side, entry.startS + DROP_INTO_TRACK_S),
      musicNumber: LAST_MUSIC_NUMBER,
      shortTitle: nasa.split(', ').pop() ?? nasa,
      title: item.title,
    };
  }
  throw new Error(`the record has no music number ${LAST_MUSIC_NUMBER}`);
}

let volumeBefore: number | null = null;
/** A run token: moved by every start and stop, so a late step of an older run can tell it was overtaken. */
let run = 0;
/** The restore a stop is still doing; a start waits for it so it never captures the lowered volume. */
let stopping: Promise<void> | null = null;

/** Start the record. Resolves when the needle is down; rejects (quietly, the caller decides) if the audio cannot load. */
export async function startRecord(): Promise<void> {
  const t = lastTrack();
  const mine = ++run;
  if (stopping) await stopping;
  if (mine !== run) return;
  // Only the first start of a run captures the player's volume; it is restored once, by the stop that ends the run.
  if (volumeBefore === null) volumeBefore = T.volume.value;
  // Quiet, and never louder than the player left the turntable.
  await dispatch({ type: 'turntable.setVolume', value: Math.min(QUIET_VOLUME, volumeBefore) });
  if (mine !== run) return;
  await dispatch({ type: 'turntable.setSpeed', secondsPerTurn: COVER_PERIOD_S });
  if (mine !== run) return;
  await dispatch({ type: 'turntable.setDirection', direction: PLAYING_DIRECTION });
  if (mine !== run) return;
  await dispatch({ type: 'turntable.load', side: t.side });
  if (mine !== run) return; // left while loading
  await dispatch({ type: 'turntable.drop', radiusMm: t.radiusMm });
}

/** Lift the needle and put the volume back as it was. */
export function stopRecord(): Promise<void> {
  const mine = ++run;
  const task = (async () => {
    await dispatch({ type: 'turntable.lift' }).catch(() => undefined);
    if (volumeBefore !== null) {
      const v = volumeBefore;
      volumeBefore = null;
      await dispatch({ type: 'turntable.setVolume', value: v }).catch(() => undefined);
    }
  })();
  const tracked = task.finally(() => {
    if (stopping === tracked && mine === run) stopping = null;
  });
  stopping = tracked;
  return tracked;
}
