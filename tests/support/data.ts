// Loads the committed data files for tests. Only tests and tools read files; src/science takes the
// parsed objects as arguments (see src/science/types.ts).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandColumnar } from '../../src/science/types';
import type {
  ColumnarStars,
  CoverData,
  EphemerisData,
  EphemerisSpotChecks,
  GlitchData,
  PulsarCatalogue,
  ScenarioData,
  StarCatalogue,
  StarRecord,
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
/** Near stars from stars.json plus the expanded sky list from sky.json (or, in older builds, stars.json's own columnar sky). */
export function loadStars(): StarCatalogue {
  const hit = cache.get('stars+sky');
  if (hit !== undefined) return hit as StarCatalogue;
  const raw = load<{ meta: Record<string, unknown>; near: StarRecord[]; sky?: ColumnarStars }>('stars.json');
  const skyTable = existsSync(resolve(DATA_DIR, 'sky.json')) ? load<ColumnarStars>('sky.json') : raw.sky;
  const cat: StarCatalogue = { meta: raw.meta, near: raw.near, sky: skyTable ? expandColumnar(skyTable) : [] };
  cache.set('stars+sky', cat);
  return cat;
}
export const loadEphemeris = (): EphemerisData => load<EphemerisData>('ephemeris.json');
export const loadSpotChecks = (): EphemerisSpotChecks => load<EphemerisSpotChecks>('ephemeris_spotchecks.json');
export const loadScenario = (): ScenarioData => load<ScenarioData>('scenario.json');
