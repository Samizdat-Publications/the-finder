// The guided tour's pure helpers: where the tour starts, which stops are finished, the part dots, the saved
// tour state, and the tiny text formatter's parser. No DOM, no Preact; the game state is passed in.

import type { Attempt } from '../game/deductions';
import { PARTS, STOPS } from './script';
import type { PartDef, PartId, Stop } from './types';

export interface TourState {
  on: boolean;
  /** The stop the guide is showing. */
  step: number;
  /** The furthest stop reached so far; the part dots up to it are clickable. */
  furthest: number;
}

export const TOUR_OFF: TourState = { on: false, step: 0, furthest: 0 };

/** A step number held to the script: a whole number from 0 to the last stop. */
export function clampStep(step: number, stops: readonly Stop[] = STOPS): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(0, stops.length - 1), Math.max(0, Math.floor(step)));
}

/** A story stop is finished once passed; a do or watch stop once its deduction is confirmed. */
export function stopDone(stop: Stop, index: number, furthest: number, confirmed: ReadonlySet<string>): boolean {
  if (stop.node !== undefined) return confirmed.has(stop.node);
  return index < furthest;
}

/** The first stop that is not finished (the last stop when every one is). */
export function firstUnfinished(confirmed: ReadonlySet<string>, furthest: number, stops: readonly Stop[] = STOPS): number {
  const i = stops.findIndex((s, k) => !stopDone(s, k, furthest, confirmed));
  return i < 0 ? Math.max(0, stops.length - 1) : i;
}

/** Where `tour.start` begins: the asked-for step, else the stored one (when there is history), else the first unfinished stop. */
export function startStep(tour: TourState, confirmed: ReadonlySet<string>, requested?: number, stops: readonly Stop[] = STOPS): number {
  if (requested !== undefined) return clampStep(requested, stops);
  if (tour.step > 0) return clampStep(tour.step, stops);
  return firstUnfinished(confirmed, tour.furthest, stops);
}

/** A Next button is enabled on a story stop, and on a do or watch stop once its deduction is confirmed. */
export function nodeUnlocked(stop: Stop, confirmed: ReadonlySet<string>): boolean {
  return stop.kind === 'story' || stop.node === undefined || confirmed.has(stop.node);
}

/** True when the deduction's latest attempt was refused. */
export function lastRefused(attempts: readonly Attempt[] | undefined): boolean {
  const last = attempts?.[attempts.length - 1];
  return last !== undefined && last.ok === false;
}

export function partFirstStop(part: PartId, stops: readonly Stop[] = STOPS): number {
  return stops.findIndex((s) => s.part === part);
}

export type DotState = 'done' | 'current' | 'ahead';

export interface PartDot {
  id: PartId;
  title: string;
  /** Index of the part's first stop. */
  first: number;
  state: DotState;
  /** A dot of a part at or before `furthest` can be clicked. */
  reachable: boolean;
}

/** One dot per part that has stops. */
export function partDots(step: number, furthest: number, stops: readonly Stop[] = STOPS, parts: readonly PartDef[] = PARTS): PartDot[] {
  const here = stops[step]?.part;
  const hereFirst = here === undefined ? -1 : partFirstStop(here, stops);
  const dots: PartDot[] = [];
  for (const p of parts) {
    const first = partFirstStop(p.id, stops);
    if (first < 0) continue;
    const state: DotState = p.id === here ? 'current' : first < hereFirst ? 'done' : 'ahead';
    dots.push({ id: p.id, title: p.title, first, state, reachable: first <= furthest });
  }
  return dots;
}

/** How far through the whole tour the current stop is, 0 to 1. */
export function progressFraction(step: number, stops: readonly Stop[] = STOPS): number {
  return stops.length === 0 ? 0 : Math.min(1, (clampStep(step, stops) + 1) / stops.length);
}

/** A saved tour value, cleaned; undefined when there is nothing usable (the save loads as off, 0, 0). */
export function cleanTour(raw: unknown, stops: readonly Stop[] = STOPS): TourState | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? clampStep(v, stops) : 0);
  const step = whole(r.step);
  return { on: r.on === true, step, furthest: Math.max(step, whole(r.furthest)) };
}

/** A run of text: plain, or bold. */
export interface TextRun {
  text: string;
  bold: boolean;
}

/** The formatter: paragraphs split on a blank line, `**bold**` marks bold. Nothing else is interpreted. */
export function parseText(text: string): TextRun[][] {
  return text
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) =>
      p
        .split(/\*\*/)
        .map((part, i): TextRun => ({ text: part, bold: i % 2 === 1 }))
        .filter((run) => run.text.length > 0),
    );
}
