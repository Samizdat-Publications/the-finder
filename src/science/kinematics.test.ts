import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { discoveryState, homeObserver, launchYear } from './epoch';
import type { StarRecord } from './types';
import { TRAIL_NULL_QUANTILE, choleskyPsd, minAngleNoRv, trail, trailCensus, trailConsistent, type TrailEntry } from './kinematics';
import { drawObserver } from './pulsarEpoch';
import { createRng } from './random';

const scenario = loadScenario();
const stars = loadStars();
const d = discoveryState(scenario, stars);
const observer = homeObserver(scenario, stars, d.decimalYear);
// 10 pc: the Trail's catalogue radius (PLAN.md chapter 4, M1.md step 4). 2,000 draws give each
// sigma to about 1.6% (relative standard error of a standard deviation, 1 / sqrt(2 N)).
const OPTS = { maxDistPc: 10, draws: 2000, seed: 'trail.discovery' };
const rows = trail(d.craft, stars, observer, OPTS);
const census = trailCensus(d.craft, stars, OPTS.maxDistPc);
const label = (e: TrailEntry): string => e.star.name ?? e.star.gl ?? `HYG ${e.star.id}`;


/**
 * Stars without a radial velocity are left out of the table, so prove the claim for them separately:
 * for each, minAngleNoRv (kinematics.ts) tries every radial velocity |v_r| <= vmax (0.25 km/s grid, then
 * golden-section refinement around the best grid point), keeping only the values that put the star within
 * 10 pc of the craft, and the smallest possible angle over all of them is returned.
 */
function worstCaseNoRv(vmax: number): { star: StarRecord; vr: number; angleDeg: number; tested: number } {
  let best = { star: stars.near[0]!, vr: 0, angleDeg: Infinity };
  let tested = 0;
  for (const star of [...stars.near, ...stars.sky]) {
    if (star.rvKmS !== null || star.distPc === null || star.id === 0) continue;
    const r = minAngleNoRv(d.craft, star, d.decimalYear, vmax, OPTS.maxDistPc);
    if (!r) continue;
    tested++;
    if (r.angleDeg < best.angleDeg) best = { star, vr: r.vrKmS, angleDeg: r.angleDeg };
  }
  return { ...best, tested };
}

describe('kinematics: The Trail', () => {
  it('prints the table head and the census', () => {
    console.log(`[trail] ${census.within} stars within 10 pc of the craft; ${census.noRadialVelocity} lack a radial velocity and are excluded; ${rows.length} rows`);
    for (const e of rows.slice(0, 5)) {
      console.log(
        `[trail] ${label(e)}: ${e.distPc.toFixed(3)} pc, angle ${e.angleDeg.toFixed(4)} +/- ${e.angleSigmaDeg.toFixed(4)} deg, distance/speed ${e.distOverSpeedYears.toFixed(0)} +/- ${e.distOverSpeedSigmaYears.toFixed(0)} yr`,
      );
    }
    expect(census.fullVelocity).toBe(rows.length);
  });

  it('exactly one star, the Sun, has the craft moving straight away from it', () => {
    const under = rows.filter((e) => e.angleDeg < 0.1); // 0.1 deg: the M1 plan's threshold (M1.md step 4)
    const next = rows.find((e) => e.star.id !== 0)!;
    const sun = rows.find((e) => e.star.id === 0)!;
    const pass = under.length === 1 && under[0]!.star.id === 0;
    recordCheck({
      id: 'trail.unique',
      claim: 'Of all catalogued stars within 10 parsecs of the craft, exactly one, the Sun, has the craft flying straight away from it.',
      measured: `Sun ${sun.angleDeg.toFixed(4)} deg; next smallest ${label(next)} ${next.angleDeg.toFixed(2)} deg; ${census.within} stars within 10 pc, ${census.noRadialVelocity} without a radial velocity excluded`,
      expected: 'One star under 0.1 deg, the Sun (PLAN.md chapter 4)',
      tolerance: '0.1 deg (M1.md step 4)',
      pass,
      notes: 'Catalogue values (HYG v4.2, Gaia DR3 for Gliese 445), straight-line motion. The Sun\'s small residual angle comes from the craft\'s early, planet-bent path (its 2026 position lies 3.8 deg off the asymptote).',
    });
    expect(under.length).toBe(1);
    expect(under[0]!.star.id).toBe(0);
  });

  it('measured with errors, the Sun passes the 95% cut of a truly radial motion and every other star is far outside it', () => {
    const sun = rows.find((e) => e.star.id === 0)!;
    const others = rows.filter((e) => e.star.id !== 0 && e.star.id !== observer.starId);
    const margins = others.map((e) => ({ e, x: e.measuredAngleDeg / e.nullAngle95Deg })).sort((a, b) => a.x - b.x);
    const worst = margins[0]!;
    // The cut is the null distribution's 95th percentile (kinematics.ts, WHAT THE ALIEN SEES); every other
    // star must be refused, here by a factor of at least 5 (the margin the old 5-sigma rule asked for).
    const pass = trailConsistent(sun) && others.every((e) => !trailConsistent(e)) && worst.x > 5;
    recordCheck({
      id: 'trail.uniqueWithErrors',
      claim: 'Even with realistic measurement errors, only the Sun fits: its measured angle lies inside the 95% range of angles a star the craft truly flew from would show, and every other star lies far outside its own.',
      measured: `Sun measured ${sun.measuredAngleDeg.toFixed(3)} deg against a 95% cut of ${sun.nullAngle95Deg.toFixed(3)} deg (one-dimensional rms ${sun.angleRmsDeg.toFixed(3)} deg); the closest other star, ${label(worst.e)}, measured ${worst.e.measuredAngleDeg.toFixed(2)} deg against a cut of ${worst.e.nullAngle95Deg.toFixed(3)} deg (${worst.x.toFixed(0)} times the cut); ${others.length} other stars, all refused`,
      expected: 'The Sun inside its 95% cut; every other star outside its own by more than 5 times (the scenario: the craft was launched from the Sun)',
      tolerance: `The cut is the ${TRAIL_NULL_QUANTILE * 100}th percentile of ${OPTS.draws} seeded angles with the star's relative velocity made exactly radial at the measured speed (seed "${OPTS.seed}"); its calibration is trail.originCoverage`,
      pass,
      notes: "Measurement model (kinematics.ts): every star measured with Gaia DR3's precision for Gliese 445 (radial velocity 0.15 km/s; parallax distance error growing with distance squared), aimed along the alien's line of sight; the craft's own state is exact; the alien sees one seeded measurement. The angle's error is two-dimensional, so a 2-sigma cut on a one-dimensional spread would be an 84% cut; the percentile is used instead (M4 science audit finding 2). A model, labelled as one.",
    });
    expect(pass).toBe(true);
  });

  it('over 1,000 seeded measurements the Sun is accepted about 95% of the time and the measured interval holds the travel time about 95% of the time', () => {
    // Each trial redraws the alien's own measured state (drawObserver, as the epoch model does) and the
    // Sun's measured row; the truth is the catalogue's exact distance over speed, which the science test
    // trail.age puts within a year of the time since launch.
    const N = 1000;
    const sunStar = stars.near.find((s) => s.id === 0)!;
    let accepted = 0;
    let covered = 0;
    const widths: number[] = [];
    for (let r = 0; r < N; r++) {
      const obs = drawObserver(observer, createRng(`trail.coverage/${r}`).fork('measure/observer'));
      const row = trail(d.craft, { meta: {}, near: [sunStar], sky: [] }, obs, { maxDistPc: OPTS.maxDistPc, draws: OPTS.draws, seed: `trail.coverage/${r}/trail` })[0]!;
      if (trailConsistent(row)) accepted++;
      const [lo, hi] = row.measuredDistOverSpeedInterval95;
      if (lo <= row.distOverSpeedYears && row.distOverSpeedYears <= hi) covered++;
      widths.push(hi - lo);
    }
    widths.sort((a, b) => a - b);
    // Three binomial standard errors of a 95% rate over 1,000 trials: 3 sqrt(0.95 x 0.05 / 1000) = 0.0207.
    const tol = 3 * Math.sqrt((0.95 * 0.05) / N);
    const passO = Math.abs(accepted / N - 0.95) <= tol;
    const passA = Math.abs(covered / N - 0.95) <= tol;
    console.log(`[trail.coverage] Sun accepted ${accepted} of ${N}; measured interval holds the exact distance over speed ${covered} of ${N}; median width ${widths[N >> 1]!.toFixed(0)} yr`);
    recordCheck({
      id: 'trail.originCoverage',
      claim: "The Trail's cut is calibrated: when the alien measures the star the craft truly flew from, its measured angle passes the 95% cut about 95% of the time.",
      measured: `the Sun accepted in ${accepted} of ${N} seeded measurements (${((accepted / N) * 100).toFixed(1)}%)`,
      expected: "95% (the null distribution's 95th percentile, by construction)",
      tolerance: `3 binomial standard errors (${(tol * 100).toFixed(2)} points)`,
      pass: passO,
      notes: 'In the rest, about 1 seed in 20, the truth is refused: an honest 95% test does that. Seeds: trail.coverage/0 to /999.',
    });
    recordCheck({
      id: 'trail.ageCoverage',
      claim: "The measured distance-over-speed interval, built around the alien's one measurement, holds the true travel time about 95% of the time.",
      measured: `${covered} of ${N} (${((covered / N) * 100).toFixed(1)}%); median width ${widths[N >> 1]!.toFixed(0)} years`,
      expected: "The catalogue's exact distance over speed (within a year of the time since launch, trail.age)",
      tolerance: `3 binomial standard errors (${(tol * 100).toFixed(2)} points) of 95%`,
      pass: passA,
      notes: 'Basic bootstrap: 2,000 draws about the measured state, interval 2 m - q97.5 to 2 m - q2.5 (kinematics.ts).',
    });
    expect(passO).toBe(true);
    expect(passA).toBe(true);
  }, 120_000);

  it('over 100 seeded measurements every other star within 10 pc is refused every time', () => {
    // 400 draws per star per trial fix the 95th percentile to a few per cent, far inside the margins here.
    const N = 100;
    let worst = { x: Infinity, name: '', seed: -1 };
    let refusedAll = true;
    let tested = 0;
    for (let r = 0; r < N; r++) {
      const obs = drawObserver(observer, createRng(`trail.others/${r}`).fork('measure/observer'));
      for (const e of trail(d.craft, stars, obs, { maxDistPc: OPTS.maxDistPc, draws: 400, seed: `trail.others/${r}/trail` })) {
        if (e.star.id === 0 || e.star.id === observer.starId) continue;
        tested++;
        if (trailConsistent(e)) refusedAll = false;
        const x = e.measuredAngleDeg / e.nullAngle95Deg;
        if (x < worst.x) worst = { x, name: label(e), seed: r };
      }
    }
    console.log(`[trail.others] ${tested} star measurements over ${N} seeds; smallest measured angle over its cut ${worst.x.toFixed(1)} (${worst.name}, seed ${worst.seed})`);
    recordCheck({
      id: 'trail.othersRefused',
      claim: 'No other star within 10 parsecs of the craft is ever mistaken for its origin: in every seeded measurement each lies outside its 95% cut.',
      measured: `${tested} star measurements over ${N} seeds, all refused; the closest, ${worst.name}, at ${worst.x.toFixed(1)} times its cut`,
      expected: 'Every star other than the Sun refused in every seed (the scenario: the craft left the Sun)',
      tolerance: 'Exact count (no star accepted); 400 draws per star per trial for the cut',
      pass: refusedAll,
    });
    expect(refusedAll).toBe(true);
  }, 120_000);

  it('stars without a radial velocity cannot mimic the Sun for any plausible radial velocity', () => {
    const sun = rows.find((e) => e.star.id === 0)!;
    const sunLimit = sun.angleDeg + 5 * sun.angleSigmaDeg; // the Sun's angle plus 5 of its sigma
    const w100 = worstCaseNoRv(100);
    const w300 = worstCaseNoRv(300);
    // The worst case at 300 km/s, measured with the same model as everything else (its own sigma).
    const mimic = { ...w300.star, rvKmS: w300.vr };
    const own = trail(d.craft, { meta: {}, near: [mimic], sky: [] }, observer, { ...OPTS, seed: 'trail.noRv' })[0]!;
    const ownZ = own.angleDeg / own.angleSigmaDeg;
    const name = (s: StarRecord): string => s.name ?? s.gl ?? `HYG ${s.id}`;
    console.log(`[trail.unique] no-RV worst case: |v_r| <= 100: ${name(w100.star)} ${w100.angleDeg.toFixed(2)} deg at ${w100.vr.toFixed(1)} km/s (${w100.tested} stars); |v_r| <= 300: ${name(w300.star)} ${w300.angleDeg.toFixed(2)} deg at ${w300.vr.toFixed(1)} km/s, ${ownZ.toFixed(0)} of its own sigma (${w300.tested} stars); Sun limit ${sunLimit.toFixed(2)} deg`);
    // Thresholds: 100 km/s bounds nearly all nearby disc stars (Gliese 445's 111 km/s is exceptional);
    // 300 km/s is beyond halo speeds, and there a star is tested against its own simulated sigma (5, the
    // same margin as trail.uniqueWithErrors).
    const pass = w100.angleDeg > sunLimit && ownZ > 5;
    recordCheck({
      id: 'trail.uniqueNoRv',
      claim: `Of ${w300.tested + census.fullVelocity} stars tested in total, the ${w300.tested} with no measured radial velocity that could lie within 10 parsecs of the craft (the other ${census.fullVelocity} have full velocities) cannot fake the Sun's straight-away signature for any radial velocity up to 300 km/s.`,
      measured: `smallest possible angle ${w100.angleDeg.toFixed(2)} deg for |v_r| <= 100 km/s (${name(w100.star)} at ${w100.vr.toFixed(1)} km/s); ${w300.angleDeg.toFixed(2)} deg for |v_r| <= 300 km/s (${name(w300.star)} at ${w300.vr.toFixed(1)} km/s, ${ownZ.toFixed(0)} sigma from zero by its own simulated measurement); tested ${w300.tested} stars without and ${census.fullVelocity} with radial velocities`,
      expected: `above the Sun's angle plus 5 sigma (${sunLimit.toFixed(2)} deg) for |v_r| <= 100 km/s; more than 5 of its own sigma for |v_r| <= 300 km/s`,
      tolerance: 'radial velocities scanned on a 0.25 km/s grid with golden-section refinement; only values that put the star within 10 pc of the craft count',
      pass,
    });
    expect(w100.angleDeg).toBeGreaterThan(sunLimit);
    expect(ownZ).toBeGreaterThan(5);
  });

  it('minAngleNoRv never does worse than the true radial velocity, and refuses stars it cannot bring near', () => {
    // A star with a measured radial velocity, searched as if it had none: the search over |v_r| <= 150 km/s
    // must find an angle no larger than the exact angle at its catalogue v_r (the true value is in range).
    const row = rows.find((e) => e.star.id !== 0 && e.star.id !== observer.starId && Math.abs(e.star.rvKmS ?? 999) < 150)!;
    const r = minAngleNoRv(d.craft, row.star, d.decimalYear, 150, OPTS.maxDistPc)!;
    expect(r.angleDeg).toBeLessThanOrEqual(row.angleDeg + 1e-9);
    expect(Math.abs(r.vrKmS)).toBeLessThanOrEqual(150);
    // Within 1e-3 pc of the craft no star can be brought for any |v_r| <= 1 km/s: null.
    expect(minAngleNoRv(d.craft, row.star, d.decimalYear, 1, 1e-3)).toBeNull();
  });

  it('distance over speed for the Sun is the time since launch', () => {
    const sun = rows.find((e) => e.star.id === 0)!;
    const truth = d.decimalYear - launchYear(scenario);
    const [lo, hi] = sun.measuredDistOverSpeedInterval95;
    // 1 year: the spec's tolerance; the model coasts from 2026 at 16.6048 km/s, and 172.06 AU / 16.6048 km/s
    // is 49.1 years, the craft's age today (voyager.md sections 4 and 5), so the residual is the early path.
    // The measured interval holds the truth about 95% of the time (trail.ageCoverage); here, for this seed, it does.
    const pass = Math.abs(sun.distOverSpeedYears - truth) <= 1 && lo <= truth && truth <= hi;
    recordCheck({
      id: 'trail.age',
      claim: 'Distance divided by speed from the Sun gives the time since the craft left: a third clock.',
      measured: `${sun.distOverSpeedYears.toFixed(1)} years from catalogue values; the alien's measurement ${sun.measuredDistOverSpeedYears.toFixed(0)} years, 95% ${lo.toFixed(0)} to ${hi.toFixed(0)} (sigma ${sun.distOverSpeedSigmaYears.toFixed(0)})`,
      expected: `${truth.toFixed(1)} years since launch (${scenario.craft.launchUtc}) at the epoch`,
      tolerance: '1 year for the exact value (spec); the interval is built around the measured value (calibrated by trail.ageCoverage)',
      pass,
      notes: 'The interval is set almost entirely by the 0.15 km/s radial-velocity error on the relative speed.',
    });
    expect(Math.abs(sun.distOverSpeedYears - truth)).toBeLessThanOrEqual(1);
    expect(lo).toBeLessThanOrEqual(truth);
    expect(hi).toBeGreaterThanOrEqual(truth);
  });

  it('the craft is at closest approach to Gliese 445 (angle 90 deg)', () => {
    const home = rows.find((e) => e.star.id === observer.starId)!;
    expect(Math.abs(home.angleDeg - 90)).toBeLessThan(1e-6); // sanity: definition of closest approach
    expect(home.angleSigmaDeg).toBe(0); // the observer has no error relative to itself
  });

  it('is deterministic for a seed and independent of catalogue order', () => {
    const again = trail(d.craft, stars, observer, OPTS);
    expect(again).toEqual(rows);
    const shuffled = { ...stars, near: stars.near.slice().reverse(), sky: stars.sky.slice().reverse() };
    expect(trail(d.craft, shuffled, observer, OPTS)).toEqual(rows);
  });

  it('factors a rank-deficient covariance', () => {
    const L = choleskyPsd(observer.measPosCov!);
    const back = [0, 1, 2].map((i) => [0, 1, 2].map((j) => L[i]![0] * L[j]![0] + L[i]![1] * L[j]![1] + L[i]![2] * L[j]![2]));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      expect(Math.abs(back[i]![j]! - observer.measPosCov![i]![j]!)).toBeLessThan(1e-12 * observer.measPosCov![2]![2]! + 1e-20);
    }
  });
});
