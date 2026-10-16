// The story epoch's model, shared by The Map and The Trail: the alien's pulsar catalogue 44,100 years on
// (projectCatalogue), the alien's own measured state relative to the Sun, and, computed on first use and
// cached, the map's identification, its ages in the alien's frame and in the Sun's rest frame, the motion
// fit, the origin region and the craft's trail. Everything comes from the science core on the data files
// (rule 1), seeded by the playthrough's seed (rule 6), with the same calls and draw counts as the science
// tests (pulsarAge, pulsarIdentify, triangulation and kinematics tests), so the game shows what is checked.
//
// The browser loads the large data files on demand: loadEpochModel() resolves once they are in, and the
// checkers call epochModel(), which throws until then, so the bus refuses a proposal instead of recording
// it (the Pictures pattern). Node tests call buildEpochModel() with tests/support/data.

import { arrivalModel } from '../arrival/data';
import { KM_S_TO_PC_PER_YEAR, scale, sub, toGalacticCartesian } from '../../science/astro';
import { ageFromTh230U234 } from '../../science/clocks';
import { discoveryState, homeObserver, starStateAt, type DiscoveryState, type Observer } from '../../science/epoch';
import { trail, type TrailEntry } from '../../science/kinematics';
import { combineAges, datePulsar, fitAgeAndVelocity, type AgeVelocityFit, type CombinedAge, type PulsarAge } from '../../science/pulsarAge';
import { drawObserver, projectCatalogue, type AlienPulsar } from '../../science/pulsarEpoch';
import { identifyAtEpoch, type EpochIdentificationResult } from '../../science/pulsarIdentify';
import { createRng } from '../../science/random';
import { mapPointsAtEpoch, originRegion, type OriginRegion } from '../../science/triangulation';
import { expandColumnar, type ColumnarStars, type CoverData, type CoverMapLine, type PulsarCatalogue, type ScenarioData, type StarCatalogue, type StarRecord } from '../../science/types';

/** Monte Carlo draws per pulsar and per region, as in the science tests (at least 2,000). */
export const EPOCH_DRAWS = 2000;
/** The Trail's catalogue radius around the craft, pc (PLAN.md chapter 4; kinematics.test.ts). */
export const TRAIL_MAX_DIST_PC = 10;
/** Draws per star for the trail's error bars (kinematics.test.ts uses the same). */
export const TRAIL_DRAWS = 2000;

export interface EpochInputs {
  scenario: ScenarioData;
  stars: StarCatalogue;
  catalogue: PulsarCatalogue;
  cover: CoverData;
}

export interface EpochModel {
  seed: string;
  inputs: EpochInputs;
  disc: DiscoveryState;
  /** The home star's true state relative to the Sun at the epoch (the simulation's truth: tests only). */
  truth: Observer;
  /** The alien's own measurement of that state (truth plus one draw from its covariance). */
  measured: Observer;
  /** The alien's catalogue at the epoch, and by J name. */
  alien: readonly AlienPulsar[];
  byJ: ReadonlyMap<string, AlienPulsar>;
  lines: readonly CoverMapLine[];
  /** The RTG clock's 95% interval from the player's own Arrival measurement, years. */
  rtgInterval: [number, number];
  /** The likelihood identification of the map's lines (D-A16), pass 2. */
  identification(): EpochIdentificationResult;
  /** One line's age for a chosen pulsar, in the alien's own frame or moved into the Sun's rest frame. */
  ageOf(order: number, jname: string, frame: 'own' | 'sun'): PulsarAge;
  /** The correctly identified lines' ages in a frame, in cover order, and the robust combination of the old ones. */
  ages(frame: 'own' | 'sun'): { perLine: PulsarAge[]; combined: CombinedAge };
  /** One age and the alien's velocity relative to the map's makers, from the old lines alone. */
  motionFit(): AgeVelocityFit;
  /** The map's origin region at the map epoch (in-plane, pc from the alien's star then), from the correct identification. */
  region(): OriginRegion;
  /** The craft's trail against every star within TRAIL_MAX_DIST_PC. */
  trailRows(): readonly TrailEntry[];
  /** A star's in-plane position relative to the alien's star at the map epoch (elapsedYears before now), pc, as the alien measures it. */
  starInMapPlane(star: StarRecord, elapsedYears: number): [number, number];
}

function lineByOrder(lines: readonly CoverMapLine[], order: number): CoverMapLine {
  const l = lines.find((x) => x.order === order);
  if (!l) throw new Error(`no map line ${order}`);
  return l;
}

export function buildEpochModel(inputs: EpochInputs, seed: string): EpochModel {
  const { scenario, stars, catalogue, cover } = inputs;
  const disc = discoveryState(scenario, stars);
  const truth = homeObserver(scenario, stars, disc.decimalYear);
  const measured = drawObserver(truth, createRng(seed).fork('measure/observer'));
  const alien = projectCatalogue(catalogue, truth, { seed });
  const byJ = new Map(alien.map((a) => [a.jname, a]));
  const lines = cover.pulsarMap.lines;
  const rtg = ageFromTh230U234(arrivalModel(seed).measurement);
  const rtgInterval: [number, number] = [rtg.lo, rtg.hi];
  const entry = (jname: string): AlienPulsar => {
    const a = byJ.get(jname);
    if (!a) throw new Error(`${jname} is not in the alien's catalogue`);
    return a;
  };

  let ident: EpochIdentificationResult | null = null;
  const ageCache = new Map<string, PulsarAge>();
  const agesCache = new Map<'own' | 'sun', { perLine: PulsarAge[]; combined: CombinedAge }>();
  let fit: AgeVelocityFit | null = null;
  let region: OriginRegion | null = null;
  let rows: readonly TrailEntry[] | null = null;

  const ageOf = (order: number, jname: string, frame: 'own' | 'sun'): PulsarAge => {
    const key = `${order}/${jname}/${frame}`;
    let a = ageCache.get(key);
    if (!a) {
      a = datePulsar(entry(jname), lineByOrder(lines, order), { seed, draws: EPOCH_DRAWS, ...(frame === 'sun' ? { reframe: measured } : {}) });
      ageCache.set(key, a);
    }
    return a;
  };

  const model: EpochModel = {
    seed, inputs, disc, truth, measured, alien, byJ, lines, rtgInterval,
    identification() {
      ident ??= identifyAtEpoch(lines, alien, { seed, rtgInterval, draws: EPOCH_DRAWS });
      return ident;
    },
    ageOf,
    ages(frame) {
      let out = agesCache.get(frame);
      if (!out) {
        const perLine = lines.map((l) => ageOf(l.order, l.jname, frame));
        out = { perLine, combined: combineAges(perLine.filter((a) => !a.young)) };
        agesCache.set(frame, out);
      }
      return out;
    },
    motionFit() {
      if (!fit) {
        const own = model.ages('own').perLine;
        fit = fitAgeAndVelocity(lines.map((l) => ({ entry: entry(l.jname), line: l })).filter((_, i) => !(own[i] as PulsarAge).young));
      }
      return fit;
    },
    region() {
      region ??= originRegion(mapPointsAtEpoch(lines, lines.map((l) => entry(l.jname)), model.motionFit().ageYears), { draws: EPOCH_DRAWS, seed: `${seed}/region` });
      return region;
    },
    trailRows() {
      rows ??= trail(disc.craft, stars, measured, { maxDistPc: TRAIL_MAX_DIST_PC, draws: TRAIL_DRAWS, seed: `${seed}/trail` });
      return rows;
    },
    starInMapPlane(star, elapsedYears) {
      // The alien's star then: its measured position relative to the Sun, moved back along its measured velocity.
      const homeThen = sub(measured.posPc, scale(measured.velKmS, KM_S_TO_PC_PER_YEAR * elapsedYears));
      const starThen = starStateAt(star, disc.decimalYear - elapsedYears).posPc;
      const g = toGalacticCartesian(sub(starThen, homeThen));
      return [g[0], g[1]];
    },
  };
  return model;
}

// --- the browser's loader -----------------------------------------------------------------------------

let loaded: EpochInputs | null = null;
let loading: Promise<EpochInputs> | null = null;
let cached: EpochModel | null = null;

async function loadInputs(): Promise<EpochInputs> {
  const [sc, st, sk, ps, cv] = await Promise.all([
    import('../../../data/scenario.json'),
    import('../../../data/stars.json'),
    import('../../../data/sky.json'),
    import('../../../data/pulsars.json'),
    import('../../../data/cover.json'),
  ]);
  return {
    scenario: sc.default as unknown as ScenarioData,
    stars: { meta: {}, near: (st.default as unknown as { near: StarRecord[] }).near, sky: expandColumnar(sk.default as unknown as ColumnarStars) },
    catalogue: ps.default as unknown as PulsarCatalogue,
    cover: cv.default as unknown as CoverData,
  };
}

/** Loads the data files once and builds (or returns) the model for a seed. */
export async function loadEpochModel(seed: string): Promise<EpochModel> {
  loading ??= loadInputs().then((i) => (loaded = i));
  const inputs = await loading;
  if (cached?.seed !== seed) cached = buildEpochModel(inputs, seed);
  return cached;
}

/** The model for a seed, for the checkers. Throws until the data files are loaded (the bus then refuses the proposal). */
export function epochModel(seed: string): EpochModel {
  if (!loaded) throw new Error('The star catalogues are still loading; try again in a moment.');
  if (cached?.seed !== seed) cached = buildEpochModel(loaded, seed);
  return cached;
}

/** Node tests and tools: install inputs that are already parsed, so epochModel() answers without loading. */
export function setEpochInputs(inputs: EpochInputs): void {
  loaded = inputs;
  loading = Promise.resolve(inputs);
  cached = null;
}
