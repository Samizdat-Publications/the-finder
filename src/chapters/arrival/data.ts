// The Arrival chapter's data: the scenario and the near-star catalogue (data/, built by tools/data from the
// sources in docs/research), and the model for a seed, cached. The checkers must answer synchronously on
// the command bus, so the data is imported statically (the encounter scene loads the same files).

import scenarioJson from '../../../data/scenario.json';
import starsJson from '../../../data/stars.json';
import type { ScenarioData, StarCatalogue, StarRecord } from '../../science/types';
import { buildArrival, type ArrivalModel } from './model';

const scenario = scenarioJson as unknown as ScenarioData;
// Only the near list (30 pc) is needed: the home star and every star the craft could have come from are in it.
const stars: StarCatalogue = { meta: {}, near: (starsJson as unknown as { near: StarRecord[] }).near, sky: [] };

let cache: ArrivalModel | null = null;

export function arrivalModel(seed: string): ArrivalModel {
  if (cache?.seed !== seed) cache = buildArrival(scenario, stars, seed);
  return cache;
}
