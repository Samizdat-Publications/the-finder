// Portrait's deduction, portrait.together: the four clocks (the fuel, the uranium spot, the map read from the
// warm-white star, the journey) each from the result the instrument leads a player to, combined, against the
// truth the scenario sets independently of every clock. Each clock starts at its own event, so the truth the
// combination estimates is the weighted sum of each clock's own true time (M6 science audit, finding 2):
//  - the fuel and the spot: years since launch (epoch.ts discoveryState; arrival/model.ts and spot/data.ts build
//    both at that age, so their true event is launch in the simulation);
//  - the journey: years since launch (its event is the launch);
//  - the map: the weighted mean, over the pulsars the combination keeps, of the time since each pulsar ticked at the
//    map's number (dateMapToday, glitch-corrected for Vela and B1727-47, B1240-64 at the published 1970.0), the
//    same truth trail.test.ts mapTruthYears uses; about 9 (8 to 10) years longer than the time since launch.
// Both pulls are recorded: against that combined truth (the claim) and against years since launch (information).
// Check ids: portrait.together, portrait.coverage, portrait.brightBand.
//
// The right answers proposed are the ones the other chapters' tests, the seed check and the bots propose
// (headlines.test.ts confirmedResults; seedCheck.ts verifySeed): pu238 for the fuel, a one-day count at the age
// its own ratio gives for the spot, the run-back's meeting for the journey, the reframed estimate in the warm-white
// star's frame for the map.

import { describe, expect, it } from 'vitest';
import seedsJson from '../../../data/seeds.json';
import { loadCover, loadGlitches, loadPulsars, loadScenario, loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED, type Attempt, type CheckResult } from '../../game/deductions';
import { KM_S_TO_PC_PER_YEAR, add, norm, sub, type Vec3 } from '../../science/astro';
import { ageFromU234 } from '../../science/clocks';
import { Z95, bandHalfWidth, combineClocks } from '../../science/consilience';
import { discoveryState, starStateAt, type Observer } from '../../science/epoch';
import { trail } from '../../science/kinematics';
import { combineAges, datePulsar, type CombinedAge } from '../../science/pulsarAge';
import { dateMapToday } from '../../science/pulsars';
import { lnGamma } from '../../science/stats';
import { JULIAN_YEAR_S, SAGAN_HYDROGEN_HZ } from '../../science/units';
import { checkFuelAge } from '../arrival/checkers';
import { arrivalModel } from '../arrival/data';
import { EPOCH_DRAWS, TRAIL_DRAWS, TRAIL_MAX_DIST_PC, buildEpochModel, type EpochInputs, type EpochModel } from '../shared/epochModel';
import { checkAge as checkSpotAge } from '../spot/checkers';
import { spotModel } from '../spot/data';
import { checkAge, checkWhen } from '../trail/checkers';
import { meeting, originRow } from '../trail/physics';
import { CLOCKS, brightBand, checkTogether, clocksFrom, combine, type PortraitClock } from './checkers';

const DAY_S = 86_400;
const inputs: EpochInputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };
/** The truth, independent of every clock: years from launch to the discovery (epoch.ts). */
const TRUTH = discoveryState(inputs.scenario, inputs.stars).yearsAfterLaunch;

/** When each map line's period was true, decimal years (today's timing; trail.test.ts mapTruthYears' choices). */
const MAP_LINE_EPOCH: Map<string, number> = (() => {
  const byJ = new Map(inputs.catalogue.pulsars.map((p) => [p.jname, p]));
  const today = dateMapToday(inputs.cover.pulsarMap.lines, byJ, loadGlitches().pulsars, SAGAN_HYDROGEN_HZ);
  return new Map(
    today.rows.map((r) => {
      const b = r.line.bname;
      const y = b === 'B1240-64' ? 1970.0 : b === 'B0833-45' || b === 'B1727-47' ? r.corrected.decimalYear : r.raw.decimalYear;
      return [r.line.jname, y] as const;
    }),
  );
})();

/** The map clock's true age at the epoch: the combination's own weighted mean of the time since each kept line's epoch. */
function mapTruthYears(m: EpochModel, comb: CombinedAge): number {
  const T = m.disc.decimalYear;
  let t = 0;
  let w = 0;
  for (const a of comb.kept) {
    const wi = comb.weights.get(a.jname) as number;
    t += wi * (T - (MAP_LINE_EPOCH.get(a.jname) as number));
    w += wi;
  }
  return t / w;
}

/** Each clock's own true time, in band order (fuel, spot, map, journey; see the header). */
const clockTruths = (mapTruth: number): number[] => CLOCKS.map((c) => (c.id === 'map' ? mapTruth : TRUTH));

/** As the game stores a confirmed result. */
const asAttempt = (r: CheckResult): Attempt => ({ answer: null, ok: r.ok, result: r.result, message: r.message, at: 0 });

/** The four clocks' confirmed results for a seed, through the chapters' own checkers (as a player confirms them). */
function confirmedClocks(seed: string, m: EpochModel): Record<string, CheckResult> {
  const s = spotModel(seed);
  const row = originRow(m);
  return {
    'arrival.fuelAge': checkFuelAge('pu238', arrivalModel(seed)),
    'spot.age': checkSpotAge({ countingTimeS: DAY_S, ageYears: ageFromU234(s.session.countsAt(DAY_S)).ageYears }, s),
    'trail.age': checkAge(m, { years: Math.round(meeting(m, row.star).yearsAgo) }),
    'trail.when': checkWhen(m, { yearsAgo: Math.round(m.ages('sun').combined.estimate), frame: row.star.id }),
  };
}

/**
 * The four clocks for a seed without the whole trail: the warm-white star's row alone (kinematics.trail forks a
 * stream per star, so it is the same row the full trail holds) and the map's reframed ages. The default seed's
 * test below checks these equal the clocks read from the checkers' messages, exactly.
 */
function fastClocks(seed: string): { clocks: PortraitClock[]; mapTruth: number } {
  const m = buildEpochModel(inputs, seed);
  const sun = inputs.stars.near.find((x) => x.id === 0)!;
  const [row] = trail(m.disc.craft, { meta: {}, near: [sun], sky: [] }, m.measured, { maxDistPc: TRAIL_MAX_DIST_PC, draws: TRAIL_DRAWS, seed: `${seed}/trail` });
  const map = m.ages('sun').combined;
  const fuel = checkFuelAge('pu238', arrivalModel(seed));
  const s = spotModel(seed);
  const spot = checkSpotAge({ countingTimeS: DAY_S, ageYears: ageFromU234(s.session.countsAt(DAY_S)).ageYears }, s);
  const get = (r: CheckResult, k: string): number => (r.result.find((x) => x.key === k)!.value as number) / JULIAN_YEAR_S;
  const [jlo, jhi] = row!.measuredDistOverSpeedInterval95;
  const v = { fuel: [get(fuel, 'age'), get(fuel, 'age low, 95%'), get(fuel, 'age high, 95%')], spot: [get(spot, 'age'), get(spot, 'age low, 95%'), get(spot, 'age high, 95%')], map: [map.estimate, map.lo, map.hi], journey: [row!.measuredDistOverSpeedYears, jlo, jhi] } as const;
  return { clocks: CLOCKS.map((c) => ({ ...c, estimate: v[c.id][0], lo: v[c.id][1], hi: v[c.id][2] })), mapTruth: mapTruthYears(m, map) };
}

/** The two-sided binomial band holding at least 95% of Binomial(n, p): [kLo, kHi], from exact tail sums. */
function binomialBand(n: number, p: number): [number, number] {
  const pmf = (k: number): number => Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  let lo = 0;
  let below = 0;
  while (below + pmf(lo) <= 0.025) below += pmf(lo++);
  let hi = n;
  let above = 0;
  while (above + pmf(hi) <= 0.025) above += pmf(hi--);
  return [lo, hi];
}

describe('portrait.together on the default seed', () => {
  it('combines the four clocks, holds the true age, agrees, accepts the combined time and refuses one 1,000 years off', () => {
    const m = buildEpochModel(inputs, DEFAULT_SEED);
    const res = confirmedClocks(DEFAULT_SEED, m);
    for (const [id, r] of Object.entries(res)) expect(r.ok, `${id} confirms on the default seed`).toBe(true);
    const clocks = clocksFrom((id) => (res[id] ? asAttempt(res[id]) : undefined));
    expect(clocks.map((c) => c.id)).toEqual(['fuel', 'spot', 'map', 'journey']);
    const c = combine(clocks);

    // The clocks read from the stored results are the science's own numbers (no rounding on the way).
    const fastRun = fastClocks(DEFAULT_SEED);
    const fast = fastRun.clocks;
    for (const k of fast) {
      const got = clocks.find((x) => x.id === k.id)!;
      // Tolerance: 1e-9 years, floating point (the message tokens carry JavaScript's shortest round-trip SI value).
      expect(Math.abs(got.estimate - k.estimate)).toBeLessThan(1e-9);
      expect(Math.abs(got.lo - k.lo)).toBeLessThan(1e-9);
      expect(Math.abs(got.hi - k.hi)).toBeLessThan(1e-9);
    }

    const lo95 = c.mean - bandHalfWidth(c.sigma, 0.95);
    const hi95 = c.mean + bandHalfWidth(c.sigma, 0.95);
    // The truth the combination estimates: each clock's own true time, weighted as the combination weights it.
    const mapTruth = fastRun.mapTruth;
    const truths = clockTruths(mapTruth);
    const cTruth = truths.reduce((a, t, i) => a + (c.weights[i] as number) * t, 0);
    const contains = cTruth >= lo95 && cTruth <= hi95;
    const pullOwn = (cTruth - c.mean) / c.sigma;
    const pullLaunch = (TRUTH - c.mean) / c.sigma;
    const atMean = checkTogether({ yearsAgo: c.mean }, clocks);
    // Information only (M6 science audit, finding 12): whether each clock's own estimate would be accepted.
    const own = clocks.map((k) => ({ id: k.id, ok: checkTogether({ yearsAgo: k.estimate }, clocks).ok }));
    const far = [checkTogether({ yearsAgo: c.mean + 1000 }, clocks), checkTogether({ yearsAgo: c.mean - 1000 }, clocks)];

    // The correlation the map's reframed age and the journey would share if the Finder's motion relative to the
    // warm-white star were one measurement for both (checkers.ts header): finite differences against that state,
    // half a sigma per step, over the Finder's measured covariance.
    const sun = inputs.stars.near.find((x) => x.id === 0)!;
    const st = starStateAt(sun, m.disc.decimalYear);
    const rel: Observer = { ...m.measured, posPc: sub(m.measured.posPc, st.posPc), velKmS: sub(m.measured.velKmS, st.velKmS) };
    const mapAge = (o: Observer): number => combineAges(m.lines.map((l) => datePulsar(m.byJ.get(l.jname)!, l, { seed: DEFAULT_SEED, draws: EPOCH_DRAWS, reframe: o })).filter((a) => !a.young)).estimate;
    const craft = m.disc.craft;
    const dos = (dp: Vec3, dv: Vec3): number => norm(add(sub(craft.posPc, st.posPc), dp)) / (norm(add(sub(craft.velKmS, st.velKmS), dv)) * KM_S_TO_PC_PER_YEAR);
    const Jm: number[] = [];
    const Jj: number[] = [];
    const cov = (i: number, j: number): number => (i < 3 && j < 3 ? m.measured.posCov[i]![j]! : i >= 3 && j >= 3 ? m.measured.velCov[i - 3]![j - 3]! : 0);
    for (let i = 0; i < 6; i++) {
      const vel = i >= 3;
      const h = Math.sqrt(cov(i, i)) * 0.5;
      const e: Vec3 = [i % 3 === 0 ? h : 0, i % 3 === 1 ? h : 0, i % 3 === 2 ? h : 0];
      const neg: Vec3 = [-e[0], -e[1], -e[2]];
      const z: Vec3 = [0, 0, 0];
      const shift = (d: Vec3): Observer => (vel ? { ...rel, velKmS: add(rel.velKmS, d) } : { ...rel, posPc: add(rel.posPc, d) });
      Jm.push((mapAge(shift(e)) - mapAge(shift(neg))) / (2 * h));
      Jj.push(((vel ? dos(z, e) : dos(e, z)) - (vel ? dos(z, neg) : dos(neg, z))) / (2 * h));
    }
    let cmj = 0;
    let cmm = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      cmj += Jm[i]! * cov(i, j) * Jj[j]!;
      cmm += Jm[i]! * cov(i, j) * Jm[j]!;
    }
    const map = clocks.find((k) => k.id === 'map')!;
    const jour = clocks.find((k) => k.id === 'journey')!;
    const sMap = (map.hi - map.lo) / (2 * Z95);
    const sJour = (jour.hi - jour.lo) / (2 * Z95);
    const rho = cmj / (sMap * sJour);
    const withRho = combineClocks(clocks, [{ a: 2, b: 3, rho }]);

    // The half-life systematics left out (checkers.ts header): the fuel's and the spot's, added in quadrature.
    const sys = (r: CheckResult): number => (r.result.find((x) => x.key === 'half-life systematic')?.value as number) / JULIAN_YEAR_S;
    const sysFuel = sys(res['arrival.fuelAge']!);
    const sysSpot = sys(res['spot.age']!);
    const widen = (k: PortraitClock, s: number): PortraitClock => {
      const lo = k.estimate - Math.hypot((k.estimate - k.lo) / Z95, s) * Z95;
      const hi = k.estimate + Math.hypot((k.hi - k.estimate) / Z95, s) * Z95;
      return { ...k, lo, hi };
    };
    const withSys = combineClocks(clocks.map((k) => (k.id === 'fuel' ? widen(k, sysFuel) : k.id === 'spot' ? widen(k, sysSpot) : k)));

    const fmt = (y: number): string => Math.round(y).toLocaleString('en-US');
    recordCheck({
      id: 'portrait.together',
      claim: 'The four clocks that dated the machine (the fuel, the uranium spot, the map read in the warm-white star\'s frame, the journey) agree within their errors, and their inverse-variance combination holds the true time since launch; Portrait accepts that combined time and refuses a time 1,000 years off.',
      measured:
        `default seed: ${clocks.map((k) => `${k.id} ${fmt(k.estimate)} (95% ${fmt(k.lo)} to ${fmt(k.hi)})`).join('; ')}; combined ${c.mean.toFixed(1)} years, sigma ${c.sigma.toFixed(1)} (95% ${fmt(lo95)} to ${fmt(hi95)}), weights ${c.weights.map((w) => w.toFixed(3)).join(', ')}; chi-square ${c.chi2.toFixed(2)} for 3 dof, p ${c.p.toFixed(3)}; ` +
        `the combined time accepted: ${atMean.ok}; each clock's own estimate accepted: ${own.map((o) => `${o.id} ${o.ok}`).join(', ')}; 1,000 years either side refused: ${far.every((f) => !f.ok)}; ` +
        `map and journey through a shared measurement would correlate at rho ${rho.toFixed(4)} (combined sigma ${withRho.sigma.toFixed(2)} against ${c.sigma.toFixed(2)}); the half-life systematics (${fmt(sysFuel)} and ${fmt(sysSpot)} years) would move the mean by ${(withSys.mean - c.mean).toFixed(1)} years and the sigma by ${(100 * (withSys.sigma / c.sigma - 1)).toFixed(2)}%`,
      expected: `the weighted truth of the four clocks, ${cTruth.toFixed(1)} years (each clock's own true time: years since launch, ${TRUTH.toFixed(1)}, for the fuel, the spot and the journey, from epoch.ts discoveryState independent of every clock; the map's ${mapTruth.toFixed(1)} years since its periods were true, ${(mapTruth - TRUTH).toFixed(1)} years longer), inside the combined 95% interval; pull against it ${pullOwn.toFixed(3)}, against years since launch ${pullLaunch.toFixed(3)}; chi-square p above 0.001`,
      tolerance: '95% interval computed from the clocks\' own 95% intervals (sigma = half-width / 1.96, the side facing the combined value); acceptance band 99.9% two-sided (3.29 sigma; D-A28)',
      pass: contains && c.p > 0.001 && atMean.ok && far.every((f) => !f.ok) && Math.abs(rho) < 0.05,
      notes: 'Each clock starts at its own event (fuel made, spot laid, the map\'s periods true, launch). The map\'s periods were true from 1966.6 to 1971.8 (dateMapToday), so the map clock runs about 9 (8 to 10, over 200 seeds) years longer than the time since launch, its weighted mean depending on which pulsars the combination keeps; the truth compared against is the combination\'s own weighted sum of the four true times, and the pull against years since launch is recorded beside it. Both are far inside the combined sigma of about 68 years. Independence is assumed only after the shared-measurement correlation above is measured to be negligible. Whether each clock\'s own estimate is accepted is information only.',
    });
    expect(contains, `${cTruth} in ${lo95} to ${hi95}`).toBe(true);
    expect(c.p).toBeGreaterThan(0.001);
    expect(atMean.ok).toBe(true);
    expect(atMean.result.find((r) => r.key === 'clocks')?.value).toBe(4);
    for (const f of far) expect(f.ok).toBe(false);
    expect(far[0]!.message).toMatch(/outside \d of the four clocks/);
    // Tolerance: a correlation under 0.05 changes the combined sigma by well under 1% (it is about 0.005 here).
    expect(Math.abs(rho)).toBeLessThan(0.05);
  }, 180_000);
});

describe('portrait.coverage', () => {
  it('the combined 95% interval holds the clocks\' weighted truth about 95% of the time over at least 200 validated seeds, the truth is accepted in every one, and so is every point of the map clock\'s bar and of the lit band', () => {
    const seeds = (seedsJson as unknown as { seeds: string[] }).seeds.slice(0, 200);
    expect(seeds.length).toBe(200);
    let hits = 0;
    let hitsLaunch = 0;
    const refused: string[] = [];
    const refusedLaunch: string[] = [];
    const pulls: number[] = [];
    const pullsLaunch: number[] = [];
    const mapOffsets: number[] = [];
    const lowP: string[] = [];
    // The bright band (M6 science audit, finding 4): the map clock's own 95% bar and the lit band, all accepted.
    const barOut: string[] = [];
    const litOut: string[] = [];
    const litCut: string[] = [];
    for (const seed of seeds) {
      const { clocks, mapTruth } = fastClocks(seed);
      const c = combine(clocks);
      const cTruth = clockTruths(mapTruth).reduce((a, t, i) => a + (c.weights[i] as number) * t, 0);
      const z = (cTruth - c.mean) / c.sigma;
      const zL = (TRUTH - c.mean) / c.sigma;
      pulls.push(z);
      pullsLaunch.push(zL);
      mapOffsets.push(mapTruth - TRUTH);
      if (Math.abs(z) <= Z95) hits++;
      if (Math.abs(zL) <= Z95) hitsLaunch++;
      if (!checkTogether({ yearsAgo: cTruth }, clocks).ok) refused.push(seed);
      if (!checkTogether({ yearsAgo: TRUTH }, clocks).ok) refusedLaunch.push(seed);
      if (c.p <= 0.001) lowP.push(seed);
      // The acceptance region is one interval about the combined value, so a bar is wholly accepted when both its
      // ends are; the estimate is checked too.
      const map = clocks.find((k) => k.id === 'map')!;
      if (![map.lo, map.estimate, map.hi].every((y) => checkTogether({ yearsAgo: y }, clocks).ok)) barOut.push(seed);
      const lit = brightBand(clocks);
      if (!lit || ![lit.lo, (lit.lo + lit.hi) / 2, lit.hi].every((y) => checkTogether({ yearsAgo: y }, clocks).ok)) litOut.push(seed);
      if (!lit || lit.lo !== map.lo || lit.hi !== map.hi) litCut.push(seed);
    }
    const n = seeds.length;
    const [kLo, kHi] = binomialBand(n, 0.95);
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    const sd = (a: number[]): number => Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1));
    const meanPull = mean(pulls);
    const sdPull = sd(pulls);
    const pass = hits >= kLo && hits <= kHi && refused.length === 0;
    recordCheck({
      id: 'portrait.coverage',
      claim: 'Over many playthroughs, the combined clocks\' 95% interval holds the true time since launch about 95% of the time, and the true time is always accepted.',
      measured: `${hits} of ${n} validated seeds (${((100 * hits) / n).toFixed(1)}%) hold the clocks' weighted truth in the combined 95% interval; it is refused in ${refused.length} seeds${refused.length ? ` (${refused.join(', ')})` : ''}; (truth - combined) / sigma has mean ${meanPull.toFixed(3)} (standard error ${(1 / Math.sqrt(n)).toFixed(3)}) and sd ${sdPull.toFixed(3)}. Against years since launch alone: ${hitsLaunch} of ${n} hold it, refused in ${refusedLaunch.length}, pull mean ${mean(pullsLaunch).toFixed(3)} and sd ${sd(pullsLaunch).toFixed(3)}. The map clock's truth runs ${mean(mapOffsets).toFixed(2)} years longer than the time since launch on average (${Math.min(...mapOffsets).toFixed(2)} to ${Math.max(...mapOffsets).toFixed(2)}); the clocks disagree at p 0.001 or below in ${lowP.length} seeds`,
      expected: `inside the two-sided binomial 95% band around 0.95 for ${n} seeds: ${kLo} to ${kHi} hits (exact binomial tails); the weighted truth accepted (99.9% band) in every seed`,
      tolerance: 'binomial 95% band (exact tail sums of Binomial(n, 0.95))',
      pass,
      notes: 'The first 200 seeds of data/seeds.json. Each seed\'s clocks are the ones a player confirms (the fuel from pu238; a one-day spot count; the map\'s reframed combination in the warm-white star\'s frame; the warm-white star\'s distance over speed), computed with the warm-white star\'s trail row alone (the same numbers, checked exactly on the default seed). The truth is the combination\'s weighted sum of each clock\'s own true time: years since launch for the fuel, the spot and the journey; for the map, the time since its periods were true (about 9, 8 to 10, years longer). The pull against years since launch alone is recorded as information.',
    });
    recordCheck({
      id: 'portrait.brightBand',
      claim: "The bright band Portrait lights, and points the player into, on the short pulsar-map bar holds only accepted times: over many playthroughs every point of the map clock's own 95% bar is accepted.",
      measured: `the map clock's 95% bar (both ends and its estimate) accepted in ${n - barOut.length} of ${n} seeds${barOut.length ? ` (not in ${barOut.join(', ')})` : ''}; the lit band (both ends and its middle) accepted in ${n - litOut.length} of ${n}; the lit band is the whole map bar in ${n - litCut.length} of ${n} (cut to the acceptance band in the rest)`,
      expected: `every seed: the lit band is the map's bar cut to the 99.9% acceptance band (checkers.ts brightBand), so it is accepted by construction; the whole map bar accepted in all ${n} seeds (M6 science audit: 200 of 200)`,
      tolerance: 'none: every seed (the acceptance band is one interval about the combined value, so a bar whose two ends are accepted is accepted throughout)',
      pass: barOut.length === 0 && litOut.length === 0,
      notes: 'The first 200 seeds of data/seeds.json, the clocks as in portrait.coverage.',
    });
    expect(refused).toEqual([]);
    expect(hits).toBeGreaterThanOrEqual(kLo);
    expect(hits).toBeLessThanOrEqual(kHi);
    expect(barOut).toEqual([]);
    expect(litOut).toEqual([]);
  }, 900_000);
});
