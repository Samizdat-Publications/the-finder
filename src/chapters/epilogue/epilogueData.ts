// Our Frame's facts, typed: data/epilogue.json (built by tools/data/build-epilogue.mjs from the pages named in
// docs/research/epilogue.md) and the tables the chapter computes from (the Horizons ephemeris, the scenario, the
// near-star catalogue). The ephemeris and the pulsar tables are large, so they load on demand and are cached.

import epilogueJson from '../../../data/epilogue.json';
import scenarioJson from '../../../data/scenario.json';
import starsJson from '../../../data/stars.json';
import type { CoverData, GlitchData, PulsarCatalogue, ScenarioData, StarCatalogue, StarRecord } from '../../science/types';
import type { EphemerisBodies } from '../../science/voyagerNow';

export interface InstrumentRow {
  code: string;
  name: string;
  on: boolean;
  offDates?: string[];
  reason?: 'power' | 'degraded';
  note?: string;
}

export interface CraftInstruments {
  id: string;
  name: string;
  instruments: InstrumentRow[];
}

export interface PublishedPass {
  id: string;
  who: string;
  /** Years to the encounter, counted from `fromYear` (the paper's "now"), not from launch. */
  years: number;
  fromYear: number;
  /** The paper's 5th and 95th percentiles. */
  yearsLow: number;
  yearsHigh: number;
  pc: number;
  pcLow: number;
  pcHigh: number;
  lightYears: number;
  kmS: number;
}

export interface EpilogueData {
  sources: Record<string, { url: string; read: string; pageUpdated: string | null; title: string }>;
  instruments: {
    asOf: string;
    asOfText: string;
    craft: CraftInstruments[];
    powerLossWattsPerYear: number;
    bigBang: { name: string; date: string; text: string };
  };
  lightDay: { nasaUtc: string; nasaLocal: string; nasaKm: number; fromBody: string };
  gliese445: {
    published: PublishedPass[];
    nasaPopular: { text: string; lightYears: number; years: number };
  };
  map: { periodsEpoch: { text: string; years: number[] }; launchYear: number };
  inscription: { text: string; etched: string; ferris: string; where: string };
  credits: {
    people: { name: string; role: string; check: string }[];
    sources: { name: string; what: string; check: string }[];
  };
}

export const epilogue = epilogueJson as unknown as EpilogueData;
export const scenario = scenarioJson as unknown as ScenarioData;
// Only the near list (30 pc) is needed: Gliese 445 is in it.
export const nearStars: StarCatalogue = { meta: {}, near: (starsJson as unknown as { near: StarRecord[] }).near, sky: [] };

let ephemeris: Promise<EphemerisBodies> | null = null;

/** The Horizons tables for Voyager 1, Voyager 2 and Earth (360 kB), loaded once on first use. */
export function loadEphemeris(): Promise<EphemerisBodies> {
  if (!ephemeris) {
    ephemeris = import('../../../data/ephemeris.json').then((m) => (m.default as unknown as { bodies: EphemerisBodies }).bodies);
    ephemeris.catch(() => (ephemeris = null));
  }
  return ephemeris;
}

export interface PulsarTables {
  cover: CoverData;
  pulsars: PulsarCatalogue;
  glitches: GlitchData;
}

let pulsarTables: Promise<PulsarTables> | null = null;

/** The cover's map lines, the ATNF catalogue (1.8 MB) and the glitch table, loaded once on first use. */
export function loadPulsarTables(): Promise<PulsarTables> {
  if (!pulsarTables) {
    pulsarTables = Promise.all([import('../../../data/cover.json'), import('../../../data/pulsars.json'), import('../../../data/glitches.json')]).then(
      ([c, p, g]) => ({
        cover: c.default as unknown as CoverData,
        pulsars: p.default as unknown as PulsarCatalogue,
        glitches: g.default as unknown as GlitchData,
      }),
    );
    pulsarTables.catch(() => (pulsarTables = null));
  }
  return pulsarTables;
}
