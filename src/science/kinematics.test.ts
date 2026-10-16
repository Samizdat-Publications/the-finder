import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { KM_S_TO_PC_PER_YEAR, add, angleBetweenDeg, norm, scale, sub, unitVector } from './astro';
import { discoveryState, homeObserver, launchYear, starStateAt } from './epoch';
import { goldenMax } from './stats';
import type { StarRecord } from './types';
import { choleskyPsd, trail, trailCensus, type TrailEntry } from './kinematics';

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
 * for each, every radial velocity |v_r| <= vmax is tried (0.25 km/s grid, then golden-section refinement
 * around the best grid point), keeping only the values that put the star within 10 pc of the craft, and
 * the smallest possible angle is returned.
 */
function worstCaseNoRv(vmax: number): { star: StarRecord; vr: number; angleDeg: number; tested: number } {
  const t = d.decimalYear;
  let best = { star: stars.near[0]!, vr: 0, angleDeg: Infinity };
  let tested = 0;
  for (const star of [...stars.near, ...stars.sky]) {
    if (star.rvKmS !== null || star.distPc === null || star.id === 0) continue;
    const s0 = starStateAt(star, t); // v_r = 0
    const dir = unitVector(star.raDeg, star.decDeg);
    const span = KM_S_TO_PC_PER_YEAR * (t - star.epoch); // pc of displacement per km/s of v_r
    const at = (vr: number): { angle: number; dist: number } => {
      const p = add(s0.posPc, scale(dir, vr * span));
      const v = add(s0.velKmS, scale(dir, vr));
      const sep = sub(d.craft.posPc, p);
      return { angle: angleBetweenDeg(sub(d.craft.velKmS, v), sep), dist: norm(sep) };
    };
    let local = { vr: 0, angle: Infinity };
    for (let vr = -vmax; vr <= vmax + 1e-9; vr += 0.25) {
      const r = at(vr);
      if (r.dist <= OPTS.maxDistPc && r.angle < local.angle) local = { vr, angle: r.angle };
    }
    if (local.angle === Infinity) continue;
    tested++;
    const lo = Math.max(-vmax, local.vr - 0.25);
    const hi = Math.min(vmax, local.vr + 0.25);
    const g = goldenMax((vr) => (at(vr).dist <= OPTS.maxDistPc ? -at(vr).angle : -Infinity), lo, hi);
    const refined = -g.f < local.angle ? { vr: g.x, angle: -g.f } : local;
    if (refined.angle < best.angleDeg) best = { star, vr: refined.vr, angleDeg: refined.angle };
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

  it('with simulated measurement errors the Sun stays consistent with zero and every other star is excluded', () => {
    const sun = rows.find((e) => e.star.id === 0)!;
    const others = rows.filter((e) => e.star.id !== 0 && e.star.id !== observer.starId);
    const margins = others.map((e) => ({ e, z: e.angleDeg / e.angleSigmaDeg })).sort((a, b) => a.z - b.z);
    const worst = margins[0]!;
    const sunZ = sun.angleDeg / sun.angleSigmaDeg;
    // 2 sigma and 5 sigma: the spec's thresholds (step4c spec, "trail.uniqueWithErrors").
    const pass = sunZ <= 2 && worst.z > 5;
    recordCheck({
      id: 'trail.uniqueWithErrors',
      claim: 'Even with realistic measurement errors, only the Sun fits: its angle is consistent with zero and every other star is ruled out.',
      measured: `Sun ${sun.angleDeg.toFixed(4)} +/- ${sun.angleSigmaDeg.toFixed(4)} deg (${sunZ.toFixed(2)} sigma); smallest other margin ${label(worst.e)} ${worst.e.angleDeg.toFixed(2)} +/- ${worst.e.angleSigmaDeg.toFixed(3)} deg (${worst.z.toFixed(0)} sigma)`,
      expected: 'Sun within 2 sigma of zero; every other star more than 5 sigma from zero',
      tolerance: `sigma from ${OPTS.draws} seeded simulated measurements per star (seed "${OPTS.seed}")`,
      pass,
      notes: 'Measurement model (kinematics.ts): every star measured with Gaia DR3\'s precision for Gliese 445 (radial velocity 0.15 km/s; parallax distance error growing with distance squared), aimed along the alien\'s line of sight; the craft\'s own state is exact. A model, labelled as one.',
    });
    expect(sunZ).toBeLessThanOrEqual(2);
    expect(worst.z).toBeGreaterThan(5);
  });

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

  it('distance over speed for the Sun is the time since launch', () => {
    const sun = rows.find((e) => e.star.id === 0)!;
    const truth = d.decimalYear - launchYear(scenario);
    const [lo, hi] = sun.distOverSpeedInterval95!;
    // 1 year: the spec's tolerance; the model coasts from 2026 at 16.6048 km/s, and 172.06 AU / 16.6048 km/s
    // is 49.1 years, the craft's age today (voyager.md sections 4 and 5), so the residual is the early path.
    const pass = Math.abs(sun.distOverSpeedYears - truth) <= 1 && lo <= truth && truth <= hi;
    recordCheck({
      id: 'trail.age',
      claim: 'Distance divided by speed from the Sun gives the time since the craft left: a third clock.',
      measured: `${sun.distOverSpeedYears.toFixed(1)} years exactly; measured 95% interval ${lo.toFixed(0)} to ${hi.toFixed(0)} years (sigma ${sun.distOverSpeedSigmaYears.toFixed(0)})`,
      expected: `${truth.toFixed(1)} years since launch (${scenario.craft.launchUtc}) at the epoch`,
      tolerance: '1 year for the exact value (spec); the interval comes from the simulated measurements',
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
