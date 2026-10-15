// Loads the committed data files for tests. Only tests and tools read files; src/science takes the
// parsed objects as arguments (see src/science/types.ts).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CoverData,
  EphemerisData,
  EphemerisSpotChecks,
  GlitchData,
  PulsarCatalogue,
  ScenarioData,
  StarCatalogue,
} from '../../src/science/types';

const DATA_DIR = resolve(process.cwd(), 'data');
const cache = new Map<string, unknown>();

function load<T>(file: string): T {
  const hit = cache.get(file);
  if (hit !== undefined) return hit as T;
  const parsed = JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf8')) as T;
  cache.set(file, parsed);
  return parsed;
}

export const loadCover = (): CoverData => load<CoverData>('cover.json');
export const loadPulsars = (): PulsarCatalogue => load<PulsarCatalogue>('pulsars.json');
export const loadGlitches = (): GlitchData => load<GlitchData>('glitches.json');
export const loadStars = (): StarCatalogue => load<StarCatalogue>('stars.json');
export const loadEphemeris = (): EphemerisData => load<EphemerisData>('ephemeris.json');
export const loadSpotChecks = (): EphemerisSpotChecks => load<EphemerisSpotChecks>('ephemeris_spotchecks.json');
export const loadScenario = (): ScenarioData => load<ScenarioData>('scenario.json');
