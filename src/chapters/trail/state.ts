// The Trail's instrument state: which tool is open, the star picked on the chart, the run-back time, the
// ruler's two ends, the reframe's frame and cursor. View state only (like the camera of a chart): the game's
// state changes only through the command bus, when a reading is proposed. Also the epoch model, loaded and
// measured behind a visible "measuring" state so the page paints first.

import { signal } from '@preact/signals';
import { loadEpochModel, type EpochModel } from '../shared/epochModel';
import type { FrameAges, FrameId } from './frames';
import { agesInFrame } from './frames';
import { starById } from './physics';

export type Tool = 'trail' | 'runback' | 'ruler' | 'region' | 'reframe';

export const tool = signal<Tool>('trail');
/** Catalogue id of the star picked on the chart. */
export const picked = signal<number | null>(null);
/** The run-back: years before the epoch. */
export const runYears = signal<number>(0);
/** The ruler's ends, catalogue ids, in the order clicked. */
export const rulerEnds = signal<number[]>([]);
/** The region view's picked star. */
export const regionPick = signal<number | null>(null);
/** The reframe: the frame the ages are read in, and the cursor the player sets on the age axis (years ago). */
export const frame = signal<FrameId>('own');
export const cursorYears = signal<number | null>(null);
/** Tint every star by its trail angle (after trail.origin). */
export const tintAll = signal<boolean>(false);

/** The model once its trail is measured; what is being measured now, for the "measuring" state. */
export const model = signal<EpochModel | null>(null);
export const measuring = signal<string | null>(null);
export const failure = signal<string | null>(null);
/** Ages in the current frame, once measured. */
export const frameAges = signal<FrameAges | null>(null);

/** Let the page paint before a long synchronous measurement. */
export function yieldFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

/** Timings of the long calls, ms (the browser test reads them). */
export const timings: Record<string, number> = {};

async function timed<T>(label: string, what: string, f: () => T): Promise<T> {
  measuring.value = what;
  await yieldFrame();
  const t0 = performance.now();
  try {
    return f();
  } finally {
    timings[label] = Math.max(timings[label] ?? 0, performance.now() - t0); // the longest time this call took
    measuring.value = null;
  }
}

let loadingFor: string | null = null;

/** Load the catalogues and measure the trail for a seed (once per seed). */
export async function ensureModel(seed: string): Promise<EpochModel> {
  const have = model.value;
  if (have && have.seed === seed) return have;
  if (loadingFor === seed) {
    while (loadingFor === seed) await yieldFrame();
    if (model.value) return model.value;
  }
  loadingFor = seed;
  try {
    measuring.value = 'Loading the star catalogues';
    const m = await loadEpochModel(seed);
    await timed('trailRows', 'Measuring every nearby star\'s motion', () => m.trailRows());
    model.value = m;
    failure.value = null;
    return m;
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e);
    measuring.value = null;
    throw e;
  } finally {
    loadingFor = null;
  }
}

/** The map's origin region and the motion fit (computed once, behind the measuring state). */
export async function ensureRegion(m: EpochModel): Promise<void> {
  await timed('motionFit', 'Dating the map\'s lines', () => m.motionFit());
  await timed('region', 'Fitting the map\'s origin region', () => m.region());
}

/** Read the map's ages in a frame (cached in frames.ts), behind the measuring state. */
export async function selectFrame(m: EpochModel, f: FrameId): Promise<void> {
  frame.value = f;
  const star = f === 'own' ? undefined : starById(m, f);
  const label = f === 'own' ? 'your own frame' : 'that star\'s frame';
  const ages = await timed(`frame:${String(f)}`, `Moving the pulsar rates into ${label}`, () => agesInFrame(m, f, star));
  if (frame.value === f) frameAges.value = ages;
}

/** Everything the reframe needs before it draws: the motion fit, and the origin frame's ages (the plot's axis spans it). */
export async function ensureReframe(m: EpochModel): Promise<void> {
  await timed('motionFit', 'Dating the map\'s lines', () => m.motionFit());
  await timed('ages:sun', 'Moving the pulsar rates into the warm-white star\'s frame', () => m.ages('sun'));
  await selectFrame(m, frame.value);
}
