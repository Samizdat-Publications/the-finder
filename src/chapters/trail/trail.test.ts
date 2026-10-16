// The Trail's checkers and helpers on the shared epoch model, for the default seed and two others. Each right
// answer is compared with an independent truth (the scenario: the craft was launched from the Sun; the time
// since launch; D-A15's neighbour distance and ranks; the map's own epoch from today's dating), and each
// meaningful wrong answer is played once and must report what it computed.

import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars, loadScenario, loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED, type Answer, type CheckResult } from '../../game/deductions';
import { norm, sub } from '../../science/astro';
import { brightestStars, nearestStars } from '../../science/epoch';
import { chiSquareSf } from '../../science/stats';
import { starStateAt } from '../../science/epoch';
import { datePulsar, velocityMahalanobis2 } from '../../science/pulsarAge';
import { dateMapToday } from '../../science/pulsars';
import { CHI2_2DOF_95, CHI2_2DOF_999 } from '../../science/triangulation';
import { SAGAN_HYDROGEN_HZ } from '../../science/units';
import { EPOCH_DRAWS, TRAIL_MAX_DIST_PC, buildEpochModel, type EpochModel } from '../shared/epochModel';
import { AGREE_CHI2_PER_DOF, RULER_SIGMAS, checkOrigin, checkWhere, makeTrailCheckers } from './checkers';
import { agesInFrame, judgedLines, observerRelativeTo, oldSpread } from './frames';
import { fmtDeg } from './format';
import { consistent, consistentRows, homeId, meeting, nextBest, originRow, regionStars, rowFor, rulerReading, separationAt, starById } from './physics';

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
    // The science on catalogue values: the meeting is the time since launch.
    const meet = meeting(m0, row.star, 'catalogue');
    // At the meeting the separation is the miss distance, d sin(angle) (geometry), and the time is d cos(angle) / v.
    expect(meet.missPc).toBeCloseTo(row.distPc * Math.sin((row.angleDeg * Math.PI) / 180), 9);
    expect(meet.yearsAgo).toBeCloseTo(row.distOverSpeedYears * Math.cos((row.angleDeg * Math.PI) / 180), 6);
    expect(separationAt(m0, row.star, 0, 'catalogue')).toBeCloseTo(row.distPc, 9);
    for (const dt of [-500, 500]) expect(separationAt(m0, row.star, meet.yearsAgo + dt, 'catalogue')).toBeGreaterThan(meet.missPc);
    // The instrument runs back on the alien's measurement: the same geometry on the measured values.
    const mm = meeting(m0, row.star);
    expect(mm.yearsAgo).toBeCloseTo(row.measuredDistOverSpeedYears * Math.cos((row.measuredAngleDeg * Math.PI) / 180), 6);
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
    // How many other frames would also fit (M4 science audit finding 10): every catalogue star with a distance
    // and a radial velocity, its frame tested by the 3-component velocity agreement at 95% (chi-square 7.815)
    // between the motion fitted from the pulsars alone and the alien's motion relative to that star.
    const fit = m0.motionFit();
    const scan = [...m0.inputs.stars.near, ...m0.inputs.stars.sky].filter((s) => s.distPc !== null && s.rvKmS !== null && s.id !== 0 && s.id !== homeId(m0));
    const fits = scan.filter((s) => velocityMahalanobis2(fit, observerRelativeTo(m0, s).velKmS) <= 7.815);
    const sunFits = velocityMahalanobis2(fit, observerRelativeTo(m0, sun).velKmS) <= 7.815;
    console.log(`[trail.reframe] other frames that also fit at 95%: ${fits.length} of ${scan.length} (${fits.map((s) => s.name ?? s.gl ?? s.id).join(', ')})`);
    const pass = sunS.chi2PerDof < AGREE_CHI2_PER_DOF && ownS.chi2PerDof > 5 && othS.chi2PerDof > 5 && sunFits && fits.length / scan.length < 0.01;
    recordCheck({
      id: 'trail.reframe',
      claim: "The map's ages agree in the frame of the star the machine came from, and in almost no other: in the alien's own frame, or the frame of the next-best star, they scatter, and of the catalogue's stars with radial velocities only a handful (under 1%) give a frame whose motion fits as well.",
      measured: `old lines' chi-square per degree of freedom ${sunS.chi2PerDof.toFixed(2)} in the warm-white star's frame (spread ${sunS.spread.toFixed(0)} years), ${ownS.chi2PerDof.toFixed(1)} in the alien's own (${ownS.spread.toFixed(0)} years), ${othS.chi2PerDof.toFixed(1)} in ${other.name ?? other.gl ?? other.id}'s (${othS.spread.toFixed(0)} years); other frames that also fit at 95%: ${fits.length} of ${scan.length}`,
      expected: 'agreement within the errors in the origin frame (dating.epoch.reframe, dating.epoch.noReframe); other frames that fit, under 1% of the catalogue',
      tolerance: `chi-square per dof under 2 in the origin frame, over 5 elsewhere; medians and sigmas of ${EPOCH_DRAWS} seeded draws per line (seed "${m0.seed}"); frames counted by the 3-component velocity agreement at 95% (chi-square 7.815)`,
      pass,
      notes: `Other frames that also fit at 95%: ${fits.length} of ${scan.length} catalogue stars with radial velocities (${fits.map((s) => s.name ?? s.gl ?? s.id).join(', ')}); the M4 science audit found 6 of 9,701 before the Birge factor widened the fit's covariance.`,
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
    const [lo, hi] = row.measuredDistOverSpeedInterval95;
    // The measured interval holds the time since launch for these seeds (about 95% of seeds do: trail.ageCoverage).
    expect(lo <= truthAge && truthAge <= hi).toBe(true);
    const nb = run(seed, 'trail.neighbour', { distancePc: rulerReading(m, row.star).distPc });
    expect(nb.ok, nb.message).toBe(true);
    // D-A15's ranks, computed here from the alien's true position (epoch.ts nearestStars and brightestStars at
    // m.truth), not from the measured one the checker uses: the nearest catalogued star and the fifth-brightest.
    const home = homeId(m);
    const rankDist = nearestStars(m.inputs.stars, m.truth.posPc, m.disc.decimalYear, 20, [home]).findIndex((x) => x.star.id === row.star.id) + 1;
    const rankBright = brightestStars(m.inputs.stars, m.truth.posPc, m.disc.decimalYear, 20, [home]).findIndex((x) => x.star.id === row.star.id) + 1;
    expect(nb.result.find((r) => r.key === 'rank by distance')?.value).toBe(rankDist);
    expect(nb.result.find((r) => r.key === 'rank by brightness')?.value).toBe(rankBright);
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
      const rel = observerRelativeTo(m, row.star);
      const d2 = velocityMahalanobis2(m.motionFit(), rel.velKmS);
      const pMis = chiSquareSf(d2, 3);
      const inRegion = regionStars(m).filter((s) => s.inside).length;
      const whereLevel = String(where.result.find((x) => x.key === 'region contour through it')?.value);
      const others = SEEDS.map((sd) => consistentRows(models.get(sd)!).map((x) => x.star.id).join(','));
      console.log(`[trail] origin: ${origin.message}`);
      console.log(`[trail] next: ${nx.row.star.name ?? nx.row.star.gl} measured ${nx.row.measuredAngleDeg.toFixed(3)} deg, cut ${nx.row.nullAngle95Deg.toFixed(3)} (${nx.cuts.toFixed(0)} times)`);
      console.log(`[trail] age: ${age.message}`);
      console.log(`[trail] neighbour: ${nb.message}`);
      console.log(`[trail] where: ${where.message}`);
      console.log(`[trail] when: ${when.message}`);
      recordCheck({
        id: 'trail.check.origin',
        claim: 'In The Trail the player picks the star the machine flies straight away from; the warm-white star (the Sun) is accepted when its measured angle lies inside the 99.9% cut for a star the machine truly flew from (the 95% cut is drawn, and between the two the result says "consistent, at the edge"; D-A28), and every other star is ruled out with its measured angle and cuts.',
        measured: `default seed: Sun measured ${row.measuredAngleDeg.toFixed(3)} deg against a cut of ${row.nullAngle95Deg.toFixed(3)} deg (rms ${row.angleRmsDeg.toFixed(3)} deg per axis); next ${nx.row.star.name ?? nx.row.star.gl} ${nx.row.measuredAngleDeg.toFixed(2)} deg against ${nx.row.nullAngle95Deg.toFixed(3)} (${nx.cuts.toFixed(0)} times its cut); stars inside the cut for seeds ${SEEDS.join(', ')}: ${others.join('; ')}`,
        expected: 'the Sun, the star Voyager 1 was launched from (scenario.json), alone; trail.uniqueWithErrors, trail.originCoverage',
        tolerance: 'accepted at most at the 99.9th percentile of the null (20,000 draws, a truly radial motion at the measured speed, kinematics.ts trailNullQuantile); the stars listed here are those inside the drawn 95% cut',
        pass: consistent(row) && row.star.id === 0 && others.every((x) => x === '0'),
      });
      recordCheck({
        id: 'trail.check.age',
        claim: "The run-back time the player proposes is accepted only inside the 95% interval of distance over speed built around the alien's measurement; that interval holds the time since launch about 95% of the time.",
        measured: `measured distance over speed ${row.measuredDistOverSpeedYears.toFixed(0)} years, 95% ${lo.toFixed(0)} to ${hi.toFixed(0)}; meeting at ${meeting(m, row.star).yearsAgo.toFixed(0)}; the interval holds the time since launch for seeds ${SEEDS.join(', ')}`,
        expected: `${truthAge.toFixed(1)} years since launch (scenario.json); coverage trail.ageCoverage`,
        tolerance: 'the measured interval, basic bootstrap of 2,000 seeded draws about the measured state (kinematics.ts)',
        pass: lo <= truthAge && truthAge <= hi,
      });
      recordCheck({
        id: 'trail.check.neighbour',
        claim: "The ruler's distance to the origin star is accepted within two of its errors, and the result names the twist: it is the alien's nearest catalogued star and the fifth-brightest in its sky.",
        measured: `${r.distPc.toFixed(4)} +/- ${r.sigmaPc.toFixed(4)} pc; rank by distance ${String(nb.result.find((x) => x.key === 'rank by distance')?.value)}; rank by brightness ${String(nb.result.find((x) => x.key === 'rank by brightness')?.value)} (${nb.result.find((x) => x.key === 'magnitude in your sky')?.value} mag)`,
        expected: `D-A15: nearest at 1.024 pc, fifth-brightest at magnitude -0.14 (epoch.neighbours, epoch.sunBrightness); ranks from the alien's true position: ${rankDist} and ${rankBright}`,
        tolerance: `${RULER_SIGMAS} ruler sigmas; ranks exact`,
        pass: nb.ok && rankDist === 1 && rankBright === 5 && Math.abs(r.distPc - norm(m.truth.posPc)) <= RULER_SIGMAS * r.sigmaPc,
      });
      recordCheck({
        id: 'trail.check.where',
        claim: "The star the machine came from lies inside the map's origin region at the map epoch, one of many stars there; the checker accepts only that star, up to the region's 99.9% contour (the 95% region is drawn; D-A28).",
        measured: `Sun inside (contour ${whereLevel}); ${inRegion} near stars inside the region`,
        expected: 'the Sun inside the region (triangulation.epoch, HOW_ITS_CHECKED row 6)',
        tolerance: `accepted inside the 99.9% ellipse, chi-square ${CHI2_2DOF_999.toFixed(2)} for two dimensions; the drawn region is the 95% one, chi-square ${CHI2_2DOF_95.toFixed(3)}`,
        pass: where.ok && inRegion > 1,
      });
      recordCheck({
        id: 'trail.check.when',
        claim: "Proposed in the origin star's rest frame, the map's age is accepted inside the combined 95% interval, which holds the map's true age; the motion fitted from the pulsars agrees with the alien's star's measured motion relative to the origin star.",
        measured: `${sun.estimate.toFixed(0)} years (95% ${sun.lo.toFixed(0)} to ${sun.hi.toFixed(0)}); velocity mismatch chi-square ${d2.toFixed(2)} for 3 components, a mismatch at least this large ${(pMis * 100).toFixed(0)}% of the time`,
        expected: `${truth.toFixed(0)} years, the kept lines' own implied epochs today, weighted as combined (pulsarAge.test.ts truthYears)`,
        tolerance: 'the combined 95% interval (dating.epoch.coverage calibrates it); the velocity agreement as a chi-square probability for 3 degrees of freedom',
        pass: sun.lo <= truth && truth <= sun.hi,
      });
    }
  }, 120_000);

  it('the 99.9% chi-square for two dimensions is -2 ln 0.001', () => {
    // Chi-square tables, 2 degrees of freedom, upper 0.1% point: 13.816.
    expect(CHI2_2DOF_999).toBeCloseTo(13.816, 3);
  });

  it('between the 95% and 99.9% cuts the warm-white star is accepted as consistent, at the edge; beyond the 99.9% cut it is not', () => {
    // The default seed's own rows, with the Sun's measured angle moved: between its two cuts, then beyond the 99.9% one.
    const sun = rowFor(m0, 0)!;
    const cut999 = m0.trailAcceptCut(0);
    expect(cut999).toBeGreaterThan(sun.nullAngle95Deg);
    const withAngle = (deg: number): EpochModel => ({ ...m0, trailRows: () => m0.trailRows().map((r) => (r.star.id === 0 ? { ...r, measuredAngleDeg: deg } : r)) });
    const edge = checkOrigin(withAngle((sun.nullAngle95Deg + cut999) / 2), { starId: 0 });
    expect(edge.ok, edge.message).toBe(true);
    expect(edge.message).toMatch(/between the 95% and 99\.9% cuts: consistent, at the edge/);
    expect(edge.result.find((r) => r.key === 'where the angle falls')?.value).toBe('between the 95% and 99.9% cuts');
    const beyond = checkOrigin(withAngle(cut999 * 1.05), { starId: 0 });
    expect(beyond.ok).toBe(false);
    expect(beyond.message).toMatch(/beyond the 99\.9% one/);
  });

  it("between the region's 95% and 99.9% contours the warm-white star is accepted as consistent, at the edge", () => {
    // The default seed's model with the Sun placed along the region's major axis at a squared Mahalanobis
    // distance of 10 (between 5.99 and 13.82), then 16 (beyond).
    const r = m0.region();
    const phi = (r.majorAxisDeg * Math.PI) / 180;
    const at = (d2: number): [number, number] => {
      const k = Math.sqrt(d2 / CHI2_2DOF_95) * r.semiAxesPc[0];
      return [r.centerPc[0] + k * Math.cos(phi), r.centerPc[1] + k * Math.sin(phi)];
    };
    const placed = (d2: number): EpochModel => ({ ...m0, starInMapPlane: (star, age) => (star.id === 0 ? at(d2) : m0.starInMapPlane(star, age)) });
    const edge = checkWhere(placed(10), { starId: 0 });
    expect(edge.ok, edge.message).toBe(true);
    expect(edge.message).toMatch(/inside the 99\.9% contour, consistent, at the edge/);
    const beyond = checkWhere(placed(16), { starId: 0 });
    expect(beyond.ok).toBe(false);
    // Beyond 99.9% the contour reads as "beyond the 99.9% contour", never "100.000%" (M4 step 7e).
    expect(beyond.message).toMatch(/beyond the 99\.9% contour/);
  });

  it('a nearby star at a large angle is rejected with its computed angle', () => {
    const nx = nextBest(m0).row;
    const r = run(DEFAULT_SEED, 'trail.origin', { starId: nx.star.id });
    expect(r.ok).toBe(false);
    expect(r.message).toContain(fmtDeg(nx.measuredAngleDeg));
    expect(r.message).toContain(fmtDeg(nx.nullAngle95Deg));
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
    const [lo, hi] = originRow(m0).measuredDistOverSpeedInterval95;
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
