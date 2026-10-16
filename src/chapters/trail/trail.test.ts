// The Trail's checkers and helpers on the shared epoch model, for the default seed and two others. Each right
// answer is compared with an independent truth (the scenario: the craft was launched from the Sun; the time
// since launch; D-A15's neighbour distance and ranks; the map's own epoch from today's dating), and each
// meaningful wrong answer is played once and must report what it computed.

import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars, loadScenario, loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED, type Answer, type CheckResult } from '../../game/deductions';
import { norm, sub } from '../../science/astro';
import { starStateAt } from '../../science/epoch';
import { datePulsar, velocityMahalanobis2 } from '../../science/pulsarAge';
import { dateMapToday } from '../../science/pulsars';
import { CHI2_2DOF_95 } from '../../science/triangulation';
import { SAGAN_HYDROGEN_HZ } from '../../science/units';
import { EPOCH_DRAWS, TRAIL_MAX_DIST_PC, buildEpochModel, type EpochModel } from '../shared/epochModel';
import { AGREE_CHI2_PER_DOF, RULER_SIGMAS, makeTrailCheckers } from './checkers';
import { agesInFrame, judgedLines, observerRelativeTo, oldSpread } from './frames';
import { consistentRows, homeId, meeting, nextBest, originRow, regionStars, rulerReading, separationAt, starById } from './physics';

const inputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };
const SEEDS = [DEFAULT_SEED, 'trail-seed-2', 'trail-seed-3'];
const models = new Map<string, EpochModel>(SEEDS.map((s) => [s, buildEpochModel(inputs, s)]));
const checkers = makeTrailCheckers((seed) => {
  const m = models.get(seed);
  if (!m) throw new Error(seed);
  return m;
});
const run = (seed: string, id: keyof typeof checkers, answer: Answer): CheckResult => checkers[id](answer, { attempts: 0, confirmed: new Set(), seed });
const m0 = models.get(DEFAULT_SEED)!;
const truthAge = m0.disc.yearsAfterLaunch; // time since launch at the epoch (scenario.json, epoch.ts)

/** The map's true age at the epoch for the kept lines, weighted as the combination weights them (pulsarAge.test.ts truthYears). */
function mapTruthYears(m: EpochModel, kept: { jname: string }[], weights: Map<string, number>): number {
  const today = dateMapToday(m.lines, new Map(inputs.catalogue.pulsars.map((p) => [p.jname, p])), loadGlitches().pulsars, SAGAN_HYDROGEN_HZ);
  const T = m.disc.decimalYear;
  let t = 0;
  for (const a of kept) {
    const row = today.rows.find((r) => r.line.jname === a.jname)!;
    const b = row.line.bname;
    const y = b === 'B1240-64' ? T - 1970.0 : b === 'B0833-45' || b === 'B1727-47' ? T - row.corrected.decimalYear : T - row.raw.decimalYear;
    t += (weights.get(a.jname) as number) * y;
  }
  return t;
}

describe('The Trail: helpers', () => {
  it('the run-back meets the Sun at distance over speed, and the separation is smallest there', () => {
    const row = originRow(m0);
    const meet = meeting(m0, row.star);
    // At the meeting the separation is the miss distance, d sin(angle) (geometry), and the time is d cos(angle) / v.
    expect(meet.missPc).toBeCloseTo(row.distPc * Math.sin((row.angleDeg * Math.PI) / 180), 9);
    expect(meet.yearsAgo).toBeCloseTo(row.distOverSpeedYears * Math.cos((row.angleDeg * Math.PI) / 180), 6);
    expect(separationAt(m0, row.star, 0)).toBeCloseTo(row.distPc, 9);
    for (const dt of [-500, 500]) expect(separationAt(m0, row.star, meet.yearsAgo + dt)).toBeGreaterThan(meet.missPc);
    const pass = Math.abs(meet.yearsAgo - truthAge) <= 1 && meet.missPc < 1e-3;
    recordCheck({
      id: 'trail.runBack',
      claim: 'Run back together along their straight lines, the machine and the warm-white star meet at the time since launch.',
      measured: `meeting ${meet.yearsAgo.toFixed(1)} years ago at a separation of ${(meet.missPc * 206265).toFixed(0)} AU`,
      expected: `${truthAge.toFixed(1)} years since launch (scenario.json); the Sun's trail angle ${row.angleDeg.toFixed(4)} deg puts the miss at d sin(angle)`,
      tolerance: '1 year (trail.age, voyager.md sections 4 and 5: the early, planet-bent path); separation under 0.001 pc',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('the ruler measures the Sun as D-A15 does, with the projected position error', () => {
    const r = rulerReading(m0, starById(m0, 0)!);
    const truthDist = norm(m0.truth.posPc);
    // D-A15: 1.024 pc (epoch.neighbourDistance). The measured value is one draw from the alien's covariance,
    // so it must lie within 4 of its own sigma of the truth (a 6e-5 chance otherwise).
    expect(Math.abs(r.distPc - truthDist)).toBeLessThan(4 * r.sigmaPc);
    expect(truthDist).toBeCloseTo(1.024, 3);
    recordCheck({
      id: 'trail.ruler',
      claim: "The alien's ruler puts its nearest neighbour, the star the machine came from, about 1.02 parsecs away, with the error of its own position measurement.",
      measured: `default seed: ${r.distPc.toFixed(4)} +/- ${r.sigmaPc.toFixed(4)} pc (the measured position covariance projected on the line)`,
      expected: `${truthDist.toFixed(4)} pc, the true distance (D-A15: 1.024 pc, epoch.neighbourDistance)`,
      tolerance: '4 ruler sigmas (one draw from the measurement covariance)',
      pass: Math.abs(r.distPc - truthDist) < 4 * r.sigmaPc,
    });
  });

  it("another star's frame: the alien's measured state minus the star's, dated with the model's seed and draws, cached", () => {
    const sun = starById(m0, 0)!;
    const rel = observerRelativeTo(m0, sun);
    expect(rel.posPc).toEqual(m0.measured.posPc.map((x) => x + 0)); // the Sun sits at the origin
    expect(agesInFrame(m0, 0).combined).toBe(m0.ages('sun').combined);
    expect(agesInFrame(m0, 'own').combined).toBe(m0.ages('own').combined);
    // The star with the next-smallest trail angle (the most plausible wrong origin by eye).
    const other = m0.trailRows().find((r) => r.star.id !== 0 && r.star.id !== homeId(m0))!.star;
    const a = agesInFrame(m0, other.id);
    expect(agesInFrame(m0, other.id)).toBe(a); // cached
    const l = m0.lines[3]!;
    const direct = datePulsar(m0.byJ.get(l.jname)!, l, { seed: m0.seed, draws: EPOCH_DRAWS, reframe: observerRelativeTo(m0, other) });
    expect(a.perLine[3]!.median).toBe(direct.median);
    expect(Array.from(a.perLine[3]!.samples)).toEqual(Array.from(direct.samples));
    const set = judgedLines(agesInFrame(m0, 0));
    const sunS = oldSpread(agesInFrame(m0, 0), set);
    const ownS = oldSpread(agesInFrame(m0, 'own'), set);
    const othS = oldSpread(a, set);
    console.log(`[trail.reframe] kept ${sunS.count}/${ownS.count}/${othS.count}, chi2/dof: Sun ${sunS.chi2PerDof.toFixed(2)}, own ${ownS.chi2PerDof.toFixed(1)}, ${other.name ?? other.gl} ${othS.chi2PerDof.toFixed(1)}; spreads ${sunS.spread.toFixed(0)}, ${ownS.spread.toFixed(0)}, ${othS.spread.toFixed(0)} years`);
    // The ages snap together only in the origin star's frame (dating.epoch.reframe): there they agree within
    // their errors (chi-square per degree of freedom under 2, the 95% point for 9 to 11 dof is 1.8 to 1.9);
    // in the alien's own frame and the next-best star's they do not (more than 5, far beyond the 99.9% point).
    const pass = sunS.chi2PerDof < AGREE_CHI2_PER_DOF && ownS.chi2PerDof > 5 && othS.chi2PerDof > 5;
    recordCheck({
      id: 'trail.reframe',
      claim: "The map's ages agree only in the frame of the star the machine came from: in the alien's own frame, or the frame of the next-best star, they scatter.",
      measured: `old lines' chi-square per degree of freedom ${sunS.chi2PerDof.toFixed(2)} in the warm-white star's frame (spread ${sunS.spread.toFixed(0)} years), ${ownS.chi2PerDof.toFixed(1)} in the alien's own (${ownS.spread.toFixed(0)} years), ${othS.chi2PerDof.toFixed(1)} in ${other.name ?? other.gl ?? other.id}'s (${othS.spread.toFixed(0)} years)`,
      expected: 'agreement within the errors only in the origin frame (dating.epoch.reframe, dating.epoch.noReframe)',
      tolerance: `chi-square per dof under 2 in the origin frame, over 5 elsewhere; medians and sigmas of ${EPOCH_DRAWS} seeded draws per line (seed "${m0.seed}")`,
      pass,
    });
    expect(pass).toBe(true);
  }, 60_000);
});

describe('The Trail: checkers', () => {
  it.each(SEEDS)('right answers confirm for seed %s', (seed) => {
    const m = models.get(seed)!;
    expect(consistentRows(m).map((r) => r.star.id)).toEqual([0]); // the scenario's truth: launched from the Sun
    const origin = run(seed, 'trail.origin', { starId: 0 });
    expect(origin.ok, origin.message).toBe(true);
    const row = originRow(m);
    const age = run(seed, 'trail.age', { years: Math.round(meeting(m, row.star).yearsAgo) });
    expect(age.ok, age.message).toBe(true);
    const [lo, hi] = row.distOverSpeedInterval95!;
    expect(lo <= truthAge && truthAge <= hi).toBe(true); // the interval holds the time since launch
    const nb = run(seed, 'trail.neighbour', { distancePc: rulerReading(m, row.star).distPc });
    expect(nb.ok, nb.message).toBe(true);
    // D-A15: the nearest catalogued star and the fifth-brightest in the alien's sky.
    expect(nb.result.find((r) => r.key === 'rank by distance')?.value).toBe(1);
    expect(nb.result.find((r) => r.key === 'rank by brightness')?.value).toBe(5);
    const where = run(seed, 'trail.where', { starId: 0 });
    expect(where.ok, where.message).toBe(true);
    const sun = m.ages('sun').combined;
    const when = run(seed, 'trail.when', { yearsAgo: Math.round(sun.estimate), frame: 0 });
    expect(when.ok, when.message).toBe(true);
    const truth = mapTruthYears(m, sun.kept, sun.weights);
    expect(sun.lo <= truth && truth <= sun.hi, `map truth ${truth} in [${sun.lo}, ${sun.hi}]`).toBe(true);
    if (seed === DEFAULT_SEED) {
      const r = rulerReading(m, row.star);
      const nx = nextBest(m);
      const d2 = velocityMahalanobis2(m.motionFit(), m.measured.velKmS);
      const inRegion = regionStars(m).filter((s) => s.inside).length;
      console.log(`[trail] origin: ${origin.message}`);
      console.log(`[trail] next: ${nx.row.star.name ?? nx.row.star.gl} ${nx.row.angleDeg.toFixed(3)} +/- ${nx.row.angleSigmaDeg.toFixed(3)} deg (${nx.sigmas.toFixed(0)} sigma)`);
      console.log(`[trail] age: ${age.message}`);
      console.log(`[trail] neighbour: ${nb.message}`);
      console.log(`[trail] where: ${where.message}`);
      console.log(`[trail] when: ${when.message}`);
      recordCheck({
        id: 'trail.check.origin',
        claim: 'In The Trail the player picks the star the machine flies straight away from; only the warm-white star (the Sun) is accepted, and every other star is ruled out with its computed angle.',
        measured: `Sun ${row.angleDeg.toFixed(4)} +/- ${row.angleSigmaDeg.toFixed(4)} deg; next ${nx.row.star.name ?? nx.row.star.gl} ${nx.row.angleDeg.toFixed(2)} +/- ${nx.row.angleSigmaDeg.toFixed(3)} deg (${nx.sigmas.toFixed(0)} sigma); seeds ${SEEDS.join(', ')} all pick the Sun alone`,
        expected: 'the Sun, the star Voyager 1 was launched from (scenario.json); trail.uniqueWithErrors',
        tolerance: 'angle within 2 of its own sigma (TRAIL_CONSISTENT_SIGMA, kinematics.ts)',
        pass: true,
      });
      recordCheck({
        id: 'trail.check.age',
        claim: 'The run-back time the player proposes is accepted only inside the 95% interval of distance over speed, which holds the time since launch.',
        measured: `distance over speed ${row.distOverSpeedYears.toFixed(0)} years, 95% ${lo.toFixed(0)} to ${hi.toFixed(0)}; meeting at ${meeting(m, row.star).yearsAgo.toFixed(0)}`,
        expected: `${truthAge.toFixed(1)} years since launch (scenario.json)`,
        tolerance: 'the 95% interval from 2,000 seeded simulated measurements (kinematics.ts)',
        pass: lo <= truthAge && truthAge <= hi,
      });
      recordCheck({
        id: 'trail.check.neighbour',
        claim: "The ruler's distance to the origin star is accepted within two of its errors, and the result names the twist: it is the alien's nearest catalogued star and the fifth-brightest in its sky.",
        measured: `${r.distPc.toFixed(4)} +/- ${r.sigmaPc.toFixed(4)} pc; rank by distance 1; rank by brightness 5 (${nb.result.find((x) => x.key === 'magnitude in your sky')?.value} mag)`,
        expected: 'D-A15: nearest at 1.024 pc, fifth-brightest at magnitude -0.14 (epoch.neighbours, epoch.sunBrightness)',
        tolerance: `${RULER_SIGMAS} ruler sigmas; ranks exact`,
        pass: true,
      });
      recordCheck({
        id: 'trail.check.where',
        claim: "The star the machine came from lies inside the map's 95% origin region at the map epoch, one of many stars there; the checker accepts only that star.",
        measured: `Sun inside (contour ${where.result.find((x) => x.key === 'region contour through it')?.value}); ${inRegion} near stars inside the region`,
        expected: 'the Sun inside the region (triangulation.epoch, HOW_ITS_CHECKED row 6)',
        tolerance: `the 95% ellipse, chi-square ${CHI2_2DOF_95.toFixed(3)} for two dimensions`,
        pass: true,
      });
      recordCheck({
        id: 'trail.check.when',
        claim: "Proposed in the origin star's rest frame, the map's age is accepted inside the combined 95% interval, which holds the map's true age; the fitted motion agrees with the measured one.",
        measured: `${sun.estimate.toFixed(0)} years (95% ${sun.lo.toFixed(0)} to ${sun.hi.toFixed(0)}); velocity agreement ${Math.sqrt(d2).toFixed(2)} sigma (Mahalanobis, 3 components)`,
        expected: `${truth.toFixed(0)} years, the kept lines' own implied epochs today, weighted as combined (pulsarAge.test.ts truthYears)`,
        tolerance: 'the combined 95% interval (dating.epoch.coverage calibrates it)',
        pass: sun.lo <= truth && truth <= sun.hi,
      });
    }
  }, 120_000);

  it('a nearby star at a large angle is rejected with its computed angle', () => {
    const nx = nextBest(m0).row;
    const r = run(DEFAULT_SEED, 'trail.origin', { starId: nx.star.id });
    expect(r.ok).toBe(false);
    expect(r.message).toContain(`${nx.angleDeg.toFixed(nx.angleDeg < 10 ? 2 : 1)}`);
    const far = m0.trailRows().find((x) => x.angleDeg > 30 && x.star.id !== homeId(m0))!;
    expect(run(DEFAULT_SEED, 'trail.origin', { starId: far.star.id }).ok).toBe(false);
  });

  it('a star without a radial velocity is rejected with its best possible angle', () => {
    // A star without a radial velocity on the chart (within 10 pc of the craft, placed with v_r = 0).
    const noRv = [...m0.inputs.stars.near, ...m0.inputs.stars.sky]
      .filter((s) => s.rvKmS === null && s.distPc !== null && s.id !== 0)
      .find((s) => norm(sub(starStateAt(s, m0.disc.decimalYear).posPc, m0.disc.craft.posPc)) <= TRAIL_MAX_DIST_PC);
    expect(noRv).toBeTruthy();
    const r = run(DEFAULT_SEED, 'trail.origin', { starId: noRv!.id });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no measured radial velocity/);
    expect(r.result.some((x) => /up to 100 km\/s/.test(x.key))).toBe(true);
  });

  it("the alien's own star is rejected: the machine is passing it", () => {
    const r = run(DEFAULT_SEED, 'trail.origin', { starId: homeId(m0) });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/your own star/);
  });

  it('a run-back time outside the interval is rejected with the interval', () => {
    const [lo, hi] = originRow(m0).distOverSpeedInterval95!;
    for (const y of [lo - 2000, hi + 2000]) {
      const r = run(DEFAULT_SEED, 'trail.age', { years: y });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/95% between/);
    }
  });

  it('a wrong distance is rejected with the measured one', () => {
    const nx = nextBest(m0).row.star;
    const r = run(DEFAULT_SEED, 'trail.neighbour', { distancePc: rulerReading(m0, nx).distPc });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Your ruler puts/);
  });

  it('another star inside the region, and a star outside it, are rejected', () => {
    const stars = regionStars(m0);
    const inside = stars.find((s) => s.inside && s.star.id !== 0 && s.star.id !== homeId(m0))!;
    const ri = run(DEFAULT_SEED, 'trail.where', { starId: inside.star.id });
    expect(ri.ok).toBe(false);
    expect(ri.message).toMatch(/inside the region too, one of \d+ stars there/);
    const outside = stars.find((s) => !s.inside)!;
    const ro = run(DEFAULT_SEED, 'trail.where', { starId: outside.star.id });
    expect(ro.ok).toBe(false);
    expect(ro.message).toMatch(/outside the map's region/);
  });

  it("an age proposed in a wrong star's frame, or outside the interval, is rejected with the spread there", () => {
    const sun = m0.ages('sun').combined;
    const other = nextBest(m0).row.star;
    const r = run(DEFAULT_SEED, 'trail.when', { yearsAgo: Math.round(sun.estimate), frame: other.id });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/spread from/);
    const own = run(DEFAULT_SEED, 'trail.when', { yearsAgo: Math.round(sun.estimate), frame: 'own' });
    expect(own.ok).toBe(false);
    const out = run(DEFAULT_SEED, 'trail.when', { yearsAgo: Math.round(sun.hi + 3000), frame: 0 });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/outside that/);
  }, 60_000);
});
