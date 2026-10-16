// Does a playthrough seed let every deduction confirm? (D-A28, M4 step 7d.) For one seed, every checker that
// reads the seed is run on the answer a player reaches by following the instrument, the same answers the
// chapters' Node tests and the whole-game bot propose:
//   Arrival: radio, decay, made, the plutonium-238 chain.
//   The Map: a pass-1 anchor line with its documented pulsar (cover.json); the spin-down clock at that line's
//     crossing with the first three anchors matched; the documented identities for every line; the axis the
//     instrument's own sky grid finds (1 deg, refined to 0.05 deg); the region's centre.
//   The Spot: the spot's centre; a one-day count proposed at the age its own ratio gives; a pure start (0).
//     When a pure start is refused (the test is conservative, 2.7% of one-day counts) the counts' own fitted
//     start, which the refusal names, is proposed instead: the deduction (natural uranium rejected) stands.
//   The Trail: the warm-white star (the scenario's truth: the craft left the Sun) for trail.origin and
//     trail.where; the run-back's meeting time; the ruler's distance; the age in the origin star's frame.
// Measured answers are what the instrument shows, never the simulation's truth, so the seed list does not
// select seeds whose intervals happen to hold the truth (that would bias every coverage claim in the game).
// The 14 checkers of The Key, The Player and The Pictures never read the seed (their checkers take no model
// for it), so a seed cannot block them.
// Pure: no DOM. The model of each chapter is built for the seed by the same functions the game uses.

import type { Answer, CheckResult } from '../game/deductions';
import { ageFromU234, acceptedStartRange } from '../science/clocks';
import { arrivalModel } from './arrival/data';
import { checkFuelAge, checkHeat, checkMadeNotMined, checkPurpose } from './arrival/checkers';
import { checkIdentify, checkMotion, checkOld, checkPeriods, checkRegion } from './map/checkers';
import { CLOCK_N, bestAxisOnGrid, clockCrossingYearsAgo, isPass1Anchor, isYoung, skyAges } from './map/mapMath';
import { buildEpochModel, type EpochInputs, type EpochModel } from './shared/epochModel';
import { REJECT_P, checkAge as checkSpotAge, checkFind, checkPurity } from './spot/checkers';
import { SPOT, spotModel } from './spot/data';
import { checkAge, checkNeighbour, checkOrigin, checkWhen, checkWhere } from './trail/checkers';
import { cutRatio, meeting, originRow, rowFor, rulerReading, whereLevel } from './trail/physics';

/** A day of counting on The Spot, s (the Node tests' and the bot's long count). */
const DAY_S = 86_400;

export interface SeedStats {
  /** The warm-white star's measured angle over its 95% cut, and over its 99.9% cut (under 1: inside). */
  originOver95: number;
  originOver999: number;
  /** The warm-white star's region contour at the map epoch (0 to 1), and whether it is inside the 99.9% contour. */
  whereContour: number;
  /** A pure start refused on the one-day count (the fitted start then proposed). */
  pureStartRefused: boolean;
}

export interface SeedVerdict {
  seed: string;
  ok: boolean;
  /** The deductions whose right answer did not confirm, with what the checker said. */
  failed: { id: string; message: string }[];
  stats: SeedStats;
}

/** The documented identities (cover.json; Johnston 2002) as a map.identify answer. */
const truthIdentities = (m: EpochModel): Answer => Object.fromEntries(m.lines.map((l) => [String(l.order), l.jname]));

/** The axis the instrument finds: the smallest misfit on a 1 deg sky grid, refined to 0.05 deg (map.test.ts instrumentAxis). */
function instrumentAxis(m: EpochModel): { lDeg: number; bDeg: number } {
  const pts = skyAges(m);
  const coarse = bestAxisOnGrid(pts, 1);
  const fine = bestAxisOnGrid(pts, 0.05, { lDeg: coarse.lDeg, bDeg: coarse.bDeg, spanDeg: 1.5 });
  return { lDeg: fine.lDeg, bDeg: fine.bDeg };
}

/** Run every seed-reading checker on its right answer for this seed. */
export function verifySeed(inputs: EpochInputs, seed: string): SeedVerdict {
  const failed: { id: string; message: string }[] = [];
  const run = (id: string, f: () => CheckResult): CheckResult | null => {
    try {
      const r = f();
      if (!r.ok) failed.push({ id, message: r.message });
      return r;
    } catch (e) {
      failed.push({ id, message: `refused: ${e instanceof Error ? e.message : String(e)}` });
      return null;
    }
  };

  // ---- Arrival ----
  const a = arrivalModel(seed);
  run('arrival.purpose', () => checkPurpose('radio', a));
  run('arrival.heat', () => checkHeat('decay', a));
  run('arrival.madeNotMined', () => checkMadeNotMined('made', a));
  run('arrival.fuelAge', () => checkFuelAge('pu238', a));

  // ---- The Map ----
  const m = buildEpochModel(inputs, seed);
  const anchors = m.lines.filter((l) => !isYoung(m.byJ.get(l.jname)!) && isPass1Anchor(m, l.order));
  const first = anchors[0];
  if (!first) failed.push({ id: 'map.periods', message: 'no old line is a pass-1 anchor for this seed' });
  else {
    run('map.periods', () => checkPeriods(m, { line: first.order, jname: first.jname }));
    const cross = clockCrossingYearsAgo(m.byJ.get(first.jname)!, first, CLOCK_N);
    const matched = Object.fromEntries(anchors.slice(0, 3).map((l) => [String(l.order), l.jname]));
    if (cross === null) failed.push({ id: 'map.old', message: `line ${first.order}'s clock never crosses the map's number` });
    else run('map.old', () => checkOld(m, { yearsAgo: cross, matched }));
  }
  run('map.identify', () => checkIdentify(m, truthIdentities(m)));
  run('map.motion', () => checkMotion(m, instrumentAxis(m)));
  const c = m.region().centerPc;
  run('map.region', () => checkRegion(m, { x: c[0], y: c[1] }));

  // ---- The Spot ----
  const s = spotModel(seed);
  run('spot.find', () => checkFind({ xMm: SPOT.centreMm[0], yMm: SPOT.centreMm[1] }, s));
  const counts = s.session.countsAt(DAY_S);
  run('spot.age', () => checkSpotAge({ countingTimeS: DAY_S, ageYears: ageFromU234(counts).ageYears }, s));
  const pure = checkPurity({ countingTimeS: DAY_S, startA234overA238: 0 }, s);
  const pureStartRefused = !pure.ok;
  if (pureStartRefused) {
    const fitted = acceptedStartRange(counts, REJECT_P).fitted;
    run('spot.purity', () => checkPurity({ countingTimeS: DAY_S, startA234overA238: fitted }, s));
  }

  // ---- The Trail ----
  const sunRow = rowFor(m, 0);
  const cut999 = sunRow ? m.trailAcceptCut(0) : NaN;
  run('trail.origin', () => checkOrigin(m, { starId: 0 }));
  const row = originRow(m);
  run('trail.age', () => checkAge(m, { years: Math.round(meeting(m, row.star).yearsAgo) }));
  run('trail.neighbour', () => checkNeighbour(m, { distancePc: rulerReading(m, row.star).distPc }));
  run('trail.where', () => checkWhere(m, { starId: 0 }));
  const sunAge = m.ages('sun').combined;
  run('trail.when', () => checkWhen(m, { yearsAgo: Math.round(sunAge.estimate), frame: row.star.id }));

  const sun = inputs.stars.near.find((x) => x.id === 0);
  const wl = sun ? whereLevel(m, sun) : null;
  return {
    seed,
    ok: failed.length === 0,
    failed,
    stats: {
      originOver95: sunRow ? cutRatio(sunRow) : Infinity,
      originOver999: sunRow ? sunRow.measuredAngleDeg / cut999 : Infinity,
      whereContour: wl ? wl.contour : 1,
      pureStartRefused,
    },
  };
}

/** The candidate seeds the builder tries, in order: finder-2, finder-3, ... (finder-1 is DEFAULT_SEED). */
export function candidateSeed(k: number): string {
  return `finder-${k + 2}`;
}
