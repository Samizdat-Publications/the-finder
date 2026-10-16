// The Spot's model for a playthrough: the spot (data/spot.json, D-A23) and its chain at the discovery epoch
// (the scenario and the star catalogue give the craft's age, epoch.ts), the detector's sweep table, and the
// counting session drawn from the seed (rule 6). The data is imported statically so the checkers answer
// synchronously on the command bus (the Arrival pattern). Pure: no DOM.

import scenarioJson from '../../../data/scenario.json';
import spotJson from '../../../data/spot.json';
import starsJson from '../../../data/stars.json';
import { uraniumSpotState, type UraniumSpotState } from '../../science/clocks';
import { discoveryState } from '../../science/epoch';
import { createRng, type Rng } from '../../science/random';
import {
  DETECTOR_RADIUS_MM, SWEEP_STANDOFF_MM, buildSweepModel, countingSession, spotAlphaBq,
  type CountingSession, type SweepModel,
} from '../../science/spot';
import type { ScenarioData, StarCatalogue, StarRecord } from '../../science/types';

export interface SpotPlace {
  /** Centre in cover millimetres (the cover SVG's coordinates, origin top left). */
  centreMm: [number, number];
  radiusMm: number;
}

export const SPOT: SpotPlace = {
  centreMm: [spotJson.centreMm[0] as number, spotJson.centreMm[1] as number],
  radiusMm: spotJson.diameterMm / 2,
};

export interface SpotModel {
  seed: string;
  /** Years from launch to the discovery (epoch.ts). */
  yearsAfterLaunch: number;
  state: UraniumSpotState;
  sweep: SweepModel;
  session: CountingSession;
}

let shared: { yearsAfterLaunch: number; state: UraniumSpotState; sweep: SweepModel } | null = null;

/** The seed-independent part: the epoch, the spot's chain then, and the sweep table (built once, about 0.3 s). */
function sharedPart(): NonNullable<typeof shared> {
  if (!shared) {
    const scenario = scenarioJson as unknown as ScenarioData;
    const stars: StarCatalogue = { meta: {}, near: (starsJson as unknown as { near: StarRecord[] }).near, sky: [] };
    const yearsAfterLaunch = discoveryState(scenario, stars).yearsAfterLaunch;
    const state = uraniumSpotState(yearsAfterLaunch);
    const sweep = buildSweepModel(spotAlphaBq(state), { spotRadiusMm: SPOT.radiusMm, standoffMm: SWEEP_STANDOFF_MM, detectorRadiusMm: DETECTOR_RADIUS_MM }, { maxMm: 300 });
    shared = { yearsAfterLaunch, state, sweep };
  }
  return shared;
}

/** The seed's stream for one part of The Spot: `spot/sweep` or `spot/count`. */
export function spotStream(seed: string, part: 'sweep' | 'count'): Rng {
  return createRng(seed).fork('spot').fork(part);
}

let cache: SpotModel | null = null;

export function spotModel(seed: string): SpotModel {
  if (cache?.seed !== seed) {
    const s = sharedPart();
    cache = { seed, ...s, session: countingSession(s.state, spotStream(seed, 'count')) };
  }
  return cache;
}

/** Lateral offset of a cover point from the spot's centre, mm. */
export function offsetMm(xMm: number, yMm: number): number {
  return Math.hypot(xMm - SPOT.centreMm[0], yMm - SPOT.centreMm[1]);
}
