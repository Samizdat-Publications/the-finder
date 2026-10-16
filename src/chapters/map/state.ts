// The Map instrument's own state (the bench, not the game: like the Key's lamp or the Pictures' knobs): the
// epoch model once loaded and measured, the selected line, the player's assignments of pulsars to lines, the
// map's turn, the clock's time, the axis on the sky and the map's origin and scale. Proposals still go
// through the command bus; a returning player gets back what each confirmed deduction accepted.

import { signal } from '@preact/signals';
import type { Answer, Attempt } from '../../game/deductions';
import type { EpochModel } from '../shared/epochModel';
import type { MapNodeId } from './checkers';

export type Phase = 'loading' | 'measuring' | 'ready' | 'error';

export const phase = signal<Phase>('loading');
export const phaseNote = signal<string>('');
export const model = signal<EpochModel | null>(null);
/** Milliseconds each heavy computation held the page (shown to the tests as data attributes). */
export const timings = signal<Record<string, number>>({});

/** The map's starting turn, deg: a game choice, the map simply lies the way the cover was picked up (not aligned). */
export const START_ROTATION_DEG = 140;

export const selectedLine = signal<number | null>(null);
/** Cover order (as a string, JSON-friendly) to J name. */
export const assignments = signal<Record<string, string>>({});
export const rotationDeg = signal<number>(START_ROTATION_DEG);
/** The clock's time, years from now (negative: the past). */
export const clockYears = signal<number>(0);
/** The axis on the sky, galactic deg: it starts at the galactic north pole (a neutral place, not a guess). */
export const axis = signal<{ lDeg: number; bDeg: number }>({ lDeg: 0, bDeg: 90 });
/** The map's origin, pc in the galactic plane from your star at the map epoch: it starts on your own star. */
export const origin = signal<[number, number]>([0, 0]);
/** The map's scale, pc per centre-line length (null: the Galactic centre's distance, set when the chart is ready). */
export const scalePc = signal<number | null>(null);
/** Which deduction's tools are on the bench. */
export const stage = signal<MapNodeId>('map.periods');

type Records = Readonly<Record<string, { confirmed: boolean; attempts: Attempt[] } | undefined>>;

function accepted(records: Records, id: string): Answer | null {
  const r = records[id];
  if (!r?.confirmed) return null;
  return [...r.attempts].reverse().find((x) => x.ok)?.answer ?? null;
}

const isObj = (a: Answer | null): a is Record<string, Answer> => a !== null && typeof a === 'object' && !Array.isArray(a);

/** Restore the bench from the accepted answers (a returning player). */
export function resume(records: Records): void {
  const id = accepted(records, 'map.identify');
  const per = accepted(records, 'map.periods');
  const next: Record<string, string> = {};
  if (isObj(per) && typeof per.line === 'number' && typeof per.jname === 'string') next[String(per.line)] = per.jname;
  if (isObj(id)) for (const [k, v] of Object.entries(id)) if (typeof v === 'string') next[k] = v;
  if (Object.keys(next).length) assignments.value = next;
  const old = accepted(records, 'map.old');
  if (isObj(old) && typeof old.yearsAgo === 'number') clockYears.value = -old.yearsAgo;
  const mo = accepted(records, 'map.motion');
  if (isObj(mo) && typeof mo.lDeg === 'number' && typeof mo.bDeg === 'number') axis.value = { lDeg: mo.lDeg, bDeg: mo.bDeg };
  const re = accepted(records, 'map.region');
  if (isObj(re) && typeof re.x === 'number' && typeof re.y === 'number') origin.value = [re.x, re.y];
}

export function assign(order: number, jname: string): void {
  assignments.value = { ...assignments.value, [String(order)]: jname };
}
