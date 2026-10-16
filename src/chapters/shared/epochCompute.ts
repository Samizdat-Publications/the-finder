// What the epoch Worker computes (M4 step 7e), as a pure function so Node tests run it without a Worker: the
// same buildEpochModel and getters the main thread would call, for the same inputs and seed, cached per seed.
// Pure: no DOM.

import type { WorkerPart } from './epochClient';
import { buildEpochModel, type EpochInputs, type EpochModel, type EpochPrecomputed } from './epochModel';

let model: EpochModel | null = null;

/** One part of the model for a seed, as plain data to post back. */
export function computePart(inputs: EpochInputs, seed: string, part: WorkerPart): EpochPrecomputed {
  if (model?.seed !== seed || model.inputs !== inputs) model = buildEpochModel(inputs, seed);
  const m = model;
  switch (part) {
    case 'alien':
      return { alien: [...m.alien] };
    case 'identification':
      return { identification: m.identification() };
    case 'region': {
      // The region rests on the motion fit, which rests on the ages in the alien's frame: send all three.
      const region = m.region();
      return { agesOwn: m.ages('own'), motionFit: m.motionFit(), region };
    }
    case 'trail':
      return { trailRows: [...m.trailRows()] };
  }
}
