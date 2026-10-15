import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { discoveryState, homeObserver, launchYear } from './epoch';
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
