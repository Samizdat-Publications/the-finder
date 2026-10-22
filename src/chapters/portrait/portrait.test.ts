// Portrait's deduction, portrait.together: the four clocks (the fuel, the uranium spot, the map read from the
// warm-white star, the journey) each from the result the instrument leads a player to, combined, against the
// truth the scenario sets independently of every clock (epoch.ts discoveryState: years since launch, from the
// craft's and Gliese 445's catalogue motions alone). Check ids: portrait.together, portrait.coverage.
//
// The right answers proposed are the ones the other chapters' tests, the seed check and the bots propose
// (headlines.test.ts confirmedResults; seedCheck.ts verifySeed): pu238 for the fuel, a one-day count at the age
// its own ratio gives for the spot, the run-back's meeting for the journey, the reframed estimate in the warm-white
// star's frame for the map.

import { describe, expect, it } from 'vitest';
import seedsJson from '../../../data/seeds.json';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED, type Attempt, type CheckResult } from '../../game/deductions';
import { KM_S_TO_PC_PER_YEAR, add, norm, sub, type Vec3 } from '../../science/astro';
import { ageFromU234 } from '../../science/clocks';
import { Z95, bandHalfWidth, combineClocks } from '../../science/consilience';
import { discoveryState, starStateAt, type Observer } from '../../science/epoch';
import { trail } from '../../science/kinematics';
import { combineAges, datePulsar } from '../../science/pulsarAge';
import { lnGamma } from '../../science/stats';
import { JULIAN_YEAR_S } from '../../science/units';
import { checkFuelAge } from '../arrival/checkers';
import { arrivalModel } from '../arrival/data';
import { EPOCH_DRAWS, TRAIL_DRAWS, TRAIL_MAX_DIST_PC, buildEpochModel, type EpochInputs, type EpochModel } from '../shared/epochModel';
import { checkAge as checkSpotAge } from '../spot/checkers';
import { spotModel } from '../spot/data';
import { checkAge, checkWhen } from '../trail/checkers';
import { meeting, originRow } from '../trail/physics';
import { ACCEPT_LEVEL, CLOCKS, checkTogether, clocksFrom, combine, type PortraitClock } from './checkers';

const DAY_S = 86_400;
const inputs: EpochInputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };
/** The truth, independent of every clock: years from launch to the discovery (epoch.ts). */
const TRUTH = discoveryState(inputs.scenario, inputs.stars).yearsAfterLaunch;

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
function fastClocks(seed: string): PortraitClock[] {
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
  return CLOCKS.map((c) => ({ ...c, estimate: v[c.id][0], lo: v[c.id][1], hi: v[c.id][2] }));
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
    const fast = fastClocks(DEFAULT_SEED);
    for (const k of fast) {
      const got = clocks.find((x) => x.id === k.id)!;
      // Tolerance: 1e-9 years, floating point (the message tokens carry JavaScript's shortest round-trip SI value).
      expect(Math.abs(got.estimate - k.estimate)).toBeLessThan(1e-9);
      expect(Math.abs(got.lo - k.lo)).toBeLessThan(1e-9);
      expect(Math.abs(got.hi - k.hi)).toBeLessThan(1e-9);
    }

    const lo95 = c.mean - bandHalfWidth(c.sigma, 0.95);
    const hi95 = c.mean + bandHalfWidth(c.sigma, 0.95);
    const contains = TRUTH >= lo95 && TRUTH <= hi95;
    const atMean = checkTogether({ yearsAgo: c.mean }, clocks);
    const own = clocks.map((k) => ({ id: k.id, estimate: k.estimate, inBand: Math.abs(k.estimate - c.mean) <= bandHalfWidth(c.sigma, ACCEPT_LEVEL), ok: checkTogether({ yearsAgo: k.estimate }, clocks).ok }));
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
      expected: `the true time since launch, ${TRUTH.toFixed(1)} years (epoch.ts discoveryState, from the craft's and Gliese 445's catalogue motions, independent of every clock), inside the combined 95% interval; chi-square p above 0.001; a clock's own estimate is accepted exactly when it lies inside the 99.9% band`,
      tolerance: '95% interval computed from the clocks\' own 95% intervals (sigma = half-width / 1.96, the side facing the combined value); acceptance band 99.9% two-sided (3.29 sigma; D-A28)',
      pass: contains && c.p > 0.001 && atMean.ok && far.every((f) => !f.ok) && own.every((o) => o.ok === o.inBand) && Math.abs(rho) < 0.05,
      notes: 'Each clock starts at its own event (fuel made, spot laid, map periods measured, launch), a few years apart; the map\'s periods were measured about six years before launch (docs/research/epilogue.md), so the map\'s clock runs about six years longer than the truth used here, far inside the combined sigma. Independence is assumed only after the shared-measurement correlation above is measured to be negligible.',
    });
    expect(contains, `${TRUTH} in ${lo95} to ${hi95}`).toBe(true);
    expect(c.p).toBeGreaterThan(0.001);
    expect(atMean.ok).toBe(true);
    expect(atMean.result.find((r) => r.key === 'clocks')?.value).toBe(4);
    for (const o of own) expect(o.ok, o.id).toBe(o.inBand);
    for (const f of far) expect(f.ok).toBe(false);
    expect(far[0]!.message).toMatch(/outside \d of the four clocks/);
    // Tolerance: a correlation under 0.05 changes the combined sigma by well under 1% (it is about 0.005 here).
    expect(Math.abs(rho)).toBeLessThan(0.05);
  }, 180_000);
});

describe('portrait.coverage', () => {
  it('the combined 95% interval holds the true age about 95% of the time over at least 200 validated seeds, and the truth is accepted in every one', () => {
    const seeds = (seedsJson as unknown as { seeds: string[] }).seeds.slice(0, 200);
    expect(seeds.length).toBe(200);
    let hits = 0;
    const refused: string[] = [];
    const pulls: number[] = [];
    const lowP: string[] = [];
    for (const seed of seeds) {
      const clocks = fastClocks(seed);
      const c = combine(clocks);
      const z = (TRUTH - c.mean) / c.sigma;
      pulls.push(z);
      if (Math.abs(z) <= Z95) hits++;
      if (!checkTogether({ yearsAgo: TRUTH }, clocks).ok) refused.push(seed);
      if (c.p <= 0.001) lowP.push(seed);
    }
    const n = seeds.length;
    const [kLo, kHi] = binomialBand(n, 0.95);
    const meanPull = pulls.reduce((a, b) => a + b, 0) / n;
    const sdPull = Math.sqrt(pulls.reduce((a, b) => a + (b - meanPull) ** 2, 0) / (n - 1));
    const pass = hits >= kLo && hits <= kHi && refused.length === 0;
    recordCheck({
      id: 'portrait.coverage',
      claim: 'Over many playthroughs, the combined clocks\' 95% interval holds the true time since launch about 95% of the time, and the true time is always accepted.',
      measured: `${hits} of ${n} validated seeds (${((100 * hits) / n).toFixed(1)}%) hold the truth in the combined 95% interval; the truth is refused in ${refused.length} seeds${refused.length ? ` (${refused.join(', ')})` : ''}; (truth - combined) / sigma has mean ${meanPull.toFixed(3)} and sd ${sdPull.toFixed(3)}; the clocks disagree at p 0.001 or below in ${lowP.length} seeds`,
      expected: `inside the two-sided binomial 95% band around 0.95 for ${n} seeds: ${kLo} to ${kHi} hits (exact binomial tails); the truth accepted (99.9% band) in every seed`,
      tolerance: 'binomial 95% band (exact tail sums of Binomial(n, 0.95))',
      pass,
      notes: 'The first 200 seeds of data/seeds.json. Each seed\'s clocks are the ones a player confirms (the fuel from pu238; a one-day spot count; the map\'s reframed combination in the warm-white star\'s frame; the warm-white star\'s distance over speed), computed with the warm-white star\'s trail row alone (the same numbers, checked exactly on the default seed). The truth is years since launch; the map dates the measurement of its periods, about six years earlier.',
    });
    expect(refused).toEqual([]);
    expect(hits).toBeGreaterThanOrEqual(kLo);
    expect(hits).toBeLessThanOrEqual(kHi);
  }, 900_000);
});
