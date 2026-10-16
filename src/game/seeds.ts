// The playthrough seeds "Start over" takes (D-A28): data/seeds.json, built by tools/seeds/build-seeds.mjs, lists
// the candidate seeds for which every seed-reading checker's right answer confirms, so no playthrough meets an
// unpassable check. A first playthrough uses DEFAULT_SEED (verified by src/chapters/seedCheck.test.ts); old
// saves keep whatever seed they carry. Pure: no DOM, no clock.

import seedsJson from '../../data/seeds.json';

/** The validated seeds, in the order the builder tried them. */
export const PLAYTHROUGH_SEEDS: readonly string[] = (seedsJson as { seeds: string[] }).seeds;

/**
 * The seed after `current` in the list, cycling to the start after the last; the first seed when `current` is
 * not in the list (DEFAULT_SEED, or a time-based seed from a save written before the list existed).
 */
export function nextSeed(current: string, list: readonly string[] = PLAYTHROUGH_SEEDS): string {
  if (list.length === 0) throw new Error('the seed list is empty');
  const i = list.indexOf(current);
  return list[(i + 1) % list.length] as string;
}
