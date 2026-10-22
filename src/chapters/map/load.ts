// Loading and measuring without freezing the page: the data files load asynchronously, and each heavy
// computation (the identification, about 0.2 to 0.4 s; the origin region, about 0.4 to 0.7 s in Node) runs in
// the epoch Worker behind the "measuring" state (M4 step 7e) and is primed into the model. The times kept for
// the tests are what the main thread spent (copying the part in), not the Worker's.

import { onStartOver } from '../../game/resetHooks';
import { ensureParts, loadEpochModel, type EpochModel, type HeavyPart } from '../shared/epochModel';
import { model, phase, phaseNote, timings } from './state';

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

let preparing: Promise<void> | null = null;
let preparedSeed: string | null = null;
let regionDone = false;

// Start over: the next entry prepares the new seed afresh; a preparation still running for the old seed is dropped.
onStartOver(() => {
  preparing = null;
  preparedSeed = null;
  regionDone = false;
});

async function measure(label: string, note: string, m: EpochModel, part: HeavyPart): Promise<void> {
  phase.value = 'measuring';
  phaseNote.value = note;
  await nextFrame();
  const t0 = performance.now();
  const here = await ensureParts(m, [part]);
  timings.value = { ...timings.value, [label]: Math.round(here), [`${label}Wall`]: Math.round(performance.now() - t0) };
  phase.value = 'ready';
  phaseNote.value = '';
}

/** Load the catalogues and measure the identification for a seed (once). */
export function prepare(seed: string): Promise<void> {
  if (preparing && preparedSeed === seed) return preparing;
  preparedSeed = seed;
  regionDone = false;
  phase.value = 'loading';
  phaseNote.value = 'Loading your catalogues of pulsars and stars.';
  preparing = (async () => {
    const t0 = performance.now();
    const m = await loadEpochModel(seed);
    timings.value = { ...timings.value, load: Math.round(performance.now() - t0) };
    // The instrument draws the model in a task of its own (M4 step 7e: no long task on entering).
    await nextFrame();
    if (preparedSeed !== seed) return; // started over meanwhile
    model.value = m;
    await measure('identify', 'Measuring how well each pulsar fits each line.', m, 'identification');
  })().catch((e: unknown) => {
    phase.value = 'error';
    phaseNote.value = e instanceof Error ? e.message : String(e);
  });
  return preparing;
}

/** The origin region (and the motion fit and the ages it rests on), measured once when the region's tools open. */
export async function prepareRegion(): Promise<void> {
  const m = model.value;
  if (!m || regionDone) return;
  regionDone = true;
  await measure('region', 'Fitting where the map was drawn from.', m, 'region');
}
