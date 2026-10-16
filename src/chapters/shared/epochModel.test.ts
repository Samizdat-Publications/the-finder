// The shared epoch model wires the science together for The Map and The Trail. These tests check the wiring
// for the default seed (the science itself is checked in src/science/*.test.ts): the right pulsar is the
// most likely on every line, the ages scatter in the alien's frame and agree in the Sun's, the motion fit
// matches the measured velocity, the region holds the Sun, and the trail picks out the Sun.

import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../../tests/support/data';
import { DEFAULT_SEED } from '../../game/deductions';
import { velocityMahalanobis2 } from '../../science/pulsarAge';
import { CHI2_2DOF_95, insideRegion } from '../../science/triangulation';
import { buildEpochModel, epochModel, setEpochInputs } from './epochModel';

const inputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };
const m = buildEpochModel(inputs, DEFAULT_SEED);
const truthAge = m.disc.yearsAfterLaunch;

describe('the shared epoch model (default seed)', () => {
  it('identifies every map line as its own pulsar', () => {
    const id = m.identification();
    for (const lm of id.lines) expect(lm.best?.entry.jname, lm.line.bname).toBe(lm.line.jname);
  });

  it('dates the map: scattered in the alien frame, together in the Sun frame, and the motion fit agrees with the measured velocity', () => {
    const own = m.ages('own');
    const sun = m.ages('sun');
    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    const oldOwn = own.perLine.filter((a) => !a.young).map((a) => a.median);
    const oldSun = sun.perLine.filter((a) => !a.young).map((a) => a.median);
    expect(spread(oldOwn)).toBeGreaterThan(3 * spread(oldSun));
    // The map was made a few years before launch, so its age is a little more than the craft's.
    expect(sun.combined.lo).toBeLessThan(truthAge + 10);
    expect(sun.combined.hi).toBeGreaterThan(truthAge);
    const fit = m.motionFit();
    expect(Math.abs(fit.ageYears - sun.combined.estimate)).toBeLessThan(3 * Math.hypot(fit.ageSigma, sun.combined.sigma));
    expect(velocityMahalanobis2(fit, m.measured.velKmS)).toBeLessThan(11.34); // chi-square 3 dof, 99%
  });

  it('puts the Sun inside the origin region at the map epoch', () => {
    const r = m.region();
    const sun = inputs.stars.near.find((s) => s.id === 0)!;
    expect(insideRegion(r, m.starInMapPlane(sun, m.motionFit().ageYears))).toBe(true);
    expect(CHI2_2DOF_95).toBeCloseTo(5.991, 3);
  }, 60_000);

  it('finds the Sun on the trail and nothing else within two sigma', () => {
    const rows = m.trailRows();
    const consistent = rows.filter((e) => e.angleDeg <= 2 * e.angleSigmaDeg && e.star.id !== m.truth.starId);
    expect(consistent.map((e) => e.star.id)).toEqual([0]);
  }, 60_000);

  it('answers the checkers once inputs are installed, the same model for the same seed', () => {
    expect(() => epochModel('unloaded-check')).toThrow(/loading/);
    setEpochInputs(inputs);
    const a = epochModel(DEFAULT_SEED);
    expect(a.alien.length).toBe(m.alien.length);
    expect(a.measured.velKmS).toEqual(m.measured.velKmS);
    expect(epochModel(DEFAULT_SEED)).toBe(a);
  });
});
