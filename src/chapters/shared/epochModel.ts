// The story epoch's model, shared by The Map and The Trail: the alien's pulsar catalogue 44,100 years on
// (projectCatalogue), the alien's own measured state relative to the Sun, and, computed on first use and
// cached, the map's identification, its ages in the alien's frame and in the Sun's rest frame, the motion
// fit, the origin region and the craft's trail. Everything comes from the science core on the data files
// (rule 1), seeded by the playthrough's seed (rule 6), with the same calls and draw counts as the science
// tests (pulsarAge, pulsarIdentify, triangulation and kinematics tests), so the game shows what is checked,
// except in two places: the origin region moves the map back by the motion fit's age (fitAgeAndVelocity,
// the age The Map dates from the pulsars alone), where triangulation.test.ts (triangulation.epoch) uses the
// reframed combination of the old lines (combineAges); and the trail is measured from the alien's measured
// observer (drawObserver, with the seed `<seed>/trail`), where kinematics.test.ts uses the true one
// (homeObserver). The two ages agree within their errors (epochModel.test.ts).
//
// The browser loads the large data files on demand: loadEpochModel() resolves once they are in, and the
// checkers call epochModel(), which throws until then, so the bus refuses a proposal instead of recording
// it (the Pictures pattern). Node tests call buildEpochModel() with tests/support/data.
//
// Off the main thread (M4 step 7e): in the browser the heavy parts (the projected catalogue, the
// identification, the origin region with the ages and motion fit it rests on, the trail) are computed by the
// same functions in a Worker (epochWorker.ts, epochCompute.ts) and handed to the model with prime(). Such a
// model is built "deferred": a heavy getter that is not primed yet asks for the part and throws, so a
// checker refuses (the bus records nothing) instead of freezing the page. The light parts (one line's age,
// the ages in a frame, the motion fit, a star's accept cut) stay synchronous. Node builds compute everything
// on first use, as before; structured clone keeps every number exact, so both give the same results.

import { arrivalModel } from '../arrival/data';
import { requestParts, workerAvailable } from './epochClient';
import { KM_S_TO_PC_PER_YEAR, scale, sub, toGalacticCartesian } from '../../science/astro';
import { ageFromTh230U234 } from '../../science/clocks';
import { discoveryState, homeObserver, starStateAt, type DiscoveryState, type Observer } from '../../science/epoch';
import { TRAIL_ACCEPT_DRAWS, TRAIL_ACCEPT_QUANTILE, trail, trailNullQuantile, type TrailEntry } from '../../science/kinematics';
import { combineAges, datePulsar, fitAgeAndVelocity, type AgeVelocityFit, type CombinedAge, type PulsarAge } from '../../science/pulsarAge';
import { drawObserver, projectCatalogue, type AlienPulsar } from '../../science/pulsarEpoch';
import { identifyAtEpoch, rtgAgeModel, type EpochIdentificationResult } from '../../science/pulsarIdentify';
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
  /** The identification's pre-selection age window from the same measurement (rtgAgeModel: the clock's 1e-6 two-sided tails), years. */
  ageWindow: [number, number];
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
  /**
   * A trail row's 99.9% cut, deg: the null's 99.9th percentile from TRAIL_ACCEPT_DRAWS draws, computed on demand
   * for that star only and cached (trail.origin accepts up to it; D-A28). Throws for a star with no trail row.
   */
  trailAcceptCut(starId: number): number;
  /** A star's in-plane position relative to the alien's star at the map epoch (elapsedYears before now), pc, as the alien measures it. */
  starInMapPlane(star: StarRecord, elapsedYears: number): [number, number];
  /** True when a heavy part is computed (always, once used, in Node; once primed, in a deferred browser model). */
  has(part: HeavyPart): boolean;
  /** Hand the model parts computed elsewhere (the Worker): the same numbers its own getters would give. */
  prime(pre: EpochPrecomputed): void;
}

/** The parts computed in the Worker in the browser (each over 100 ms on the main thread, M4 step 7e). */
export type HeavyPart = 'identification' | 'region' | 'trail';

/** Parts of a model computed elsewhere for the same inputs and seed. */
export interface EpochPrecomputed {
  alien?: AlienPulsar[];
  identification?: EpochIdentificationResult;
  agesOwn?: { perLine: PulsarAge[]; combined: CombinedAge };
  motionFit?: AgeVelocityFit;
  region?: OriginRegion;
  trailRows?: TrailEntry[];
}

export interface BuildOptions {
  /** Parts already computed (the Worker's), used instead of computing them. */
  pre?: EpochPrecomputed;
  /**
   * Deferred (the browser): a heavy part that is not primed is asked for with this callback and the getter
   * throws "still measuring", so the page never blocks on it.
   */
  request?: (part: HeavyPart) => void;
  /** The identification's age window, when the caller has already computed it (in a task of its own); else computed here. */
  ageWindow?: [number, number];
}

const MEASURING: Record<HeavyPart, string> = {
  identification: 'how well each pulsar fits each line',
  region: "where the map's lines meet",
  trail: "every nearby star's motion",
};

function lineByOrder(lines: readonly CoverMapLine[], order: number): CoverMapLine {
  const l = lines.find((x) => x.order === order);
  if (!l) throw new Error(`no map line ${order}`);
  return l;
}

export function buildEpochModel(inputs: EpochInputs, seed: string, opts: BuildOptions = {}): EpochModel {
  const { scenario, stars, catalogue, cover } = inputs;
  const disc = discoveryState(scenario, stars);
  const truth = homeObserver(scenario, stars, disc.decimalYear);
  const measured = drawObserver(truth, createRng(seed).fork('measure/observer'));
  const alien = opts.pre?.alien ?? projectCatalogue(catalogue, truth, { seed });
  const request = opts.request;
  /** In a deferred model, a heavy part not primed yet: ask for it and refuse (the caller shows "measuring"). */
  const need = (part: HeavyPart, have: unknown): void => {
    if (have !== null || !request) return;
    request(part);
    throw new Error(`Still measuring ${MEASURING[part]}; try again in a moment.`);
  };
  const byJ = new Map(alien.map((a) => [a.jname, a]));
  const lines = cover.pulsarMap.lines;
  const rtgMeasurement = arrivalModel(seed).measurement;
  const rtg = ageFromTh230U234(rtgMeasurement);
  const rtgInterval: [number, number] = [rtg.lo, rtg.hi];
  const ageWindow = opts.ageWindow ?? rtgAgeModel(rtgMeasurement).windowYears;
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
  const acceptCuts = new Map<number, number>();

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
    seed, inputs, disc, truth, measured, alien, byJ, lines, rtgInterval, ageWindow,
    identification() {
      need('identification', ident);
      ident ??= identifyAtEpoch(lines, alien, { seed, rtg: rtgMeasurement, draws: EPOCH_DRAWS });
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
      need('region', region);
      region ??= originRegion(mapPointsAtEpoch(lines, lines.map((l) => entry(l.jname)), model.motionFit().ageYears), { draws: EPOCH_DRAWS, seed: `${seed}/region` });
      return region;
    },
    trailRows() {
      need('trail', rows);
      rows ??= trail(disc.craft, stars, measured, { maxDistPc: TRAIL_MAX_DIST_PC, draws: TRAIL_DRAWS, seed: `${seed}/trail` });
      return rows;
    },
    trailAcceptCut(starId) {
      let c = acceptCuts.get(starId);
      if (c === undefined) {
        const row = model.trailRows().find((r) => r.star.id === starId);
        if (!row) throw new Error(`star ${starId} has no trail row`);
        c = trailNullQuantile(disc.craft, measured, row, { q: TRAIL_ACCEPT_QUANTILE, draws: TRAIL_ACCEPT_DRAWS, seed: `${seed}/trail` });
        acceptCuts.set(starId, c);
      }
      return c;
    },
    starInMapPlane(star, elapsedYears) {
      // The alien's star then: its measured position relative to the Sun, moved back along its measured velocity.
      const homeThen = sub(measured.posPc, scale(measured.velKmS, KM_S_TO_PC_PER_YEAR * elapsedYears));
      const starThen = starStateAt(star, disc.decimalYear - elapsedYears).posPc;
      const g = toGalacticCartesian(sub(starThen, homeThen));
      return [g[0], g[1]];
    },
    has(part) {
      return (part === 'identification' ? ident : part === 'region' ? region : rows) !== null;
    },
    prime(pre) {
      if (pre.identification) ident ??= pre.identification;
      if (pre.agesOwn && !agesCache.has('own')) agesCache.set('own', pre.agesOwn);
      if (pre.motionFit) fit ??= pre.motionFit;
      if (pre.region) region ??= pre.region;
      if (pre.trailRows) rows ??= pre.trailRows;
    },
  };
  if (opts.pre) model.prime(opts.pre);
  return model;
}

// --- the browser's loader -----------------------------------------------------------------------------

let loaded: EpochInputs | null = null;
let loading: Promise<EpochInputs> | null = null;
let cached: EpochModel | null = null;
const building = new Map<string, Promise<EpochModel>>();
/** Set by setEpochInputs (Node tests and tools): everything computes here, synchronously, as before. */
let local = false;

/** The browser computes the heavy parts in the Worker; Node (no Worker) and setEpochInputs compute them here. */
const offloaded = (): boolean => !local && workerAvailable();

/** The data files the model reads, parsed (the browser's dynamic imports; the Worker loads its own copy). */
export async function loadInputs(): Promise<EpochInputs> {
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

/**
 * Make sure a model holds these heavy parts: in a deferred (browser) model, from the Worker; otherwise by
 * computing them here. Resolves, once they are in, with the milliseconds this thread spent on them (computing
 * them here, or only copying them in from the Worker).
 */
export async function ensureParts(m: EpochModel, parts: readonly HeavyPart[]): Promise<number> {
  const missing = parts.filter((p) => !m.has(p));
  if (missing.length === 0) return 0;
  if (!offloaded()) {
    const t0 = performance.now();
    for (const p of missing) {
      if (p === 'identification') m.identification();
      else if (p === 'region') m.region();
      else m.trailRows();
    }
    return performance.now() - t0;
  }
  const pre = await requestParts(m.seed, missing);
  const t0 = performance.now();
  m.prime(pre);
  return performance.now() - t0;
}

/** Loads the data files once and builds (or returns) the model for a seed. */
export async function loadEpochModel(seed: string): Promise<EpochModel> {
  // The Worker starts on its own copy of the catalogues while this thread parses its own.
  const alien = offloaded() && cached?.seed !== seed ? requestParts(seed, ['alien']) : null;
  loading ??= loadInputs().then((i) => (loaded = i));
  const inputs = await loading;
  if (cached?.seed === seed) return cached;
  if (!alien) {
    cached = buildEpochModel(inputs, seed);
    return cached;
  }
  let b = building.get(seed);
  if (!b) {
    b = alien.then(async (pre) => {
      // Build in a task of its own, not in the one that received the catalogue (keeps each task short).
      // The build's three costly steps (the Arrival model, the clock's age window, the rest) each get a task
      // of their own, so none passes about 30 ms (measured: together they were one 55 to 65 ms task).
      const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
      await tick();
      const arrival = arrivalModel(seed);
      await tick();
      const ageWindow = rtgAgeModel(arrival.measurement).windowYears;
      await tick();
      if (cached?.seed === seed) return cached;
      const m: EpochModel = buildEpochModel(inputs, seed, { pre, ageWindow, request: (part) => void ensureParts(m, [part]).catch(() => undefined) });
      cached = m;
      return m;
    });
    building.set(seed, b);
    b.then(() => building.delete(seed), () => building.delete(seed));
  }
  return b;
}

/** The model for a seed, for the checkers. Throws until the data files are loaded (the bus then refuses the proposal). */
export function epochModel(seed: string): EpochModel {
  if (!loaded) throw new Error('The star catalogues are still loading; try again in a moment.');
  if (cached?.seed !== seed) {
    if (offloaded()) {
      void loadEpochModel(seed).catch(() => undefined);
      throw new Error('The star catalogues are still loading; try again in a moment.');
    }
    cached = buildEpochModel(loaded, seed);
  }
  return cached;
}

/** Node tests and tools: install inputs that are already parsed, so epochModel() answers without loading. */
export function setEpochInputs(inputs: EpochInputs): void {
  loaded = inputs;
  loading = Promise.resolve(inputs);
  cached = null;
  local = true;
}
