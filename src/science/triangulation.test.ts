import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import {
  KMS_PER_MASYR_PC, KM_S_TO_PC_PER_YEAR, add, mjdToDecimalYear, norm, positionPc, propagateLinear, scale, spaceVelocityKmS, sub,
  toGalacticCartesian, unitVector, type Vec3,
} from './astro';
import { discoveryState, homeObserver } from './epoch';
import { combineAges, datePulsar } from './pulsarAge';
import { distanceModel, drawDistanceKpc, drawObserver, eastNorth, projectPulsar, type AlienPulsar } from './pulsarEpoch';
import { dateMapToday } from './pulsars';
import { createRng } from './random';
import { fitMapOrigin, insideRegion, originRegion, regionLevel, type MapPoint, type OriginRegion } from './triangulation';
import { SAGAN_HYDROGEN_HZ } from './units';

const cover = loadCover();
const cat = loadPulsars();
const byJ = new Map(cat.pulsars.map((p) => [p.jname, p]));
const scenario = loadScenario();
const stars = loadStars();
const disc = discoveryState(scenario, stars);
const observer = homeObserver(scenario, stars, disc.decimalYear);
const lines = cover.pulsarMap.lines;
const mapEpochToday = dateMapToday(lines, byJ, loadGlitches().pulsars, SAGAN_HYDROGEN_HZ).rawMean;
const DRAWS = 2000; // spec: at least 2,000 Monte Carlo draws
const MAS_TO_RAD = Math.PI / 180 / 3.6e6;

/**
 * Today: catalogue positions (SSB frame) moved back by proper motion from the position epoch (PEPOCH)
 * to the map epoch (the mean dating, 1969.7). Radial motion is unknown; over 50 yr it moves a pulsar
 * by under 0.03 pc, which no bearing from near the Sun can feel.
 */
function pointsToday(): MapPoint[] {
  return lines.map((l) => {
    const p = byJ.get(l.jname)!;
    const n0 = unitVector(p.ra, p.dec);
    const [e, q] = eastNorth(p.ra, p.dec);
    const dt = mapEpochToday - mjdToDecimalYear(p.pepoch as number);
    const mu = add(scale(e, (p.pmra ?? 0) * MAS_TO_RAD * dt), scale(q, (p.pmdec ?? 0) * MAS_TO_RAD * dt));
    const n = scale(add(n0, mu), 1 / norm(add(n0, mu)));
    return {
      name: l.bname, angleDeg: l.mapAngleDeg, rOverR0: l.rOverR0, posPc: toGalacticCartesian(scale(n, (p.dist as number) * 1000)),
      distKpc: p.dist as number, distance: distanceModel(p),
    };
  });
}

/**
 * At the epoch, in the alien's own frame: each pulsar's position relative to the observer, moved back
 * over the dated elapsed time by the proper motion the observer measures (relative to itself), so the
 * points are relative to where the observer was at the map epoch. Radial relative velocities are
 * unknown (up to about 110 km/s from the observer's own motion, about 5 pc along each line of sight in
 * 44,000 yr); seen from an origin a few pc away that bends a bearing to a pulsar 200 pc off by under
 * 0.05 deg, against a map sigma of about 1.5 deg.
 */
function pointsEpoch(alien: readonly AlienPulsar[], elapsedYears: number): MapPoint[] {
  return lines.map((l, i) => {
    const a = alien[i] as AlienPulsar;
    const dPc = (a.distKpc as number) * 1000;
    let pos = scale(a.nHat, dPc);
    if (a.pmraObs !== null && a.pmdecObs !== null) {
      const [e, q] = eastNorth(a.raDeg, a.decDeg);
      const vRel = scale(add(scale(e, a.pmraObs), scale(q, a.pmdecObs)), KMS_PER_MASYR_PC * dPc);
      pos = sub(pos, scale(vRel, KM_S_TO_PC_PER_YEAR * elapsedYears));
    }
    return { name: l.bname, angleDeg: l.mapAngleDeg, rOverR0: l.rOverR0, posPc: toGalacticCartesian(pos), distKpc: a.distKpc as number, distance: a.distance };
  });
}

/** In-plane galactic positions of the stars within 30 pc (HYG/Gaia, stars.json near list) at an epoch, SSB frame. */
function starsInPlane(year: number): { id: number; xy: [number, number] }[] {
  return stars.near.flatMap((s) => {
    if (s.distPc === null) return [];
    const pos = positionPc(s.raDeg, s.decDeg, s.distPc);
    const vel = spaceVelocityKmS(s.raDeg, s.decDeg, s.distPc, s.pmraMasYr, s.pmdecMasYr, s.rvKmS ?? 0);
    const g = toGalacticCartesian(propagateLinear(pos, vel, year - s.epoch));
    return [{ id: s.id, xy: [g[0], g[1]] as [number, number] }];
  });
}

const fmtRegion = (r: OriginRegion): string =>
  `about ${(2 * r.semiAxesPc[0]).toFixed(0)} by ${(2 * r.semiAxesPc[1]).toFixed(0)} pc across; centre (${r.centerPc[0].toFixed(1)}, ${r.centerPc[1].toFixed(1)}) pc, 95% semi-axes ${r.semiAxesPc[0].toFixed(1)} x ${r.semiAxesPc[1].toFixed(1)} pc (major axis toward l = ${r.majorAxisDeg.toFixed(0)} deg), sigma_theta ${r.fit.sigmaThetaDeg.toFixed(2)} deg, rms ${r.fit.rmsDeg.toFixed(2)} deg`;

describe('triangulation today', () => {
  const pts = pointsToday();
  const region = originRegion(pts, { draws: DRAWS, seed: 'triangulation.today' });
  const regionNoLen = originRegion(pts, { draws: DRAWS, seed: 'triangulation.today.noLengths', useLengths: false });

  it('the 95% region contains the Sun', () => {
    const sun: [number, number] = [0, 0];
    const inside = insideRegion(region, sun);
    const count = starsInPlane(mapEpochToday).filter((s) => s.id !== 0 && insideRegion(region, s.xy)).length;
    recordCheck({
      id: 'triangulation.today',
      claim: `The map's ${pts.length} directions, fitted onto today's pulsar positions, point back to a region of the galactic plane about ${(2 * region.semiAxesPc[0]).toFixed(0)} by ${(2 * region.semiAxesPc[1]).toFixed(0)} pc across that contains the Sun.`,
      measured: `with lengths: ${fmtRegion(region)}; Sun at the ${(regionLevel(region, sun) * 100).toFixed(0)}% contour; ${count} catalogued stars within 30 pc fall inside it. Without lengths: ${fmtRegion(regionNoLen)}`,
      expected: "the Sun (origin of the SSB frame); Sagan's design claim about 20 pc, '1 in 10^3 stars' (cover.md section 3)",
      tolerance: 'Sun inside the 95% region (Monte Carlo over angle noise and distances, 2,000 draws)',
      pass: inside,
      notes: 'Star count is a lower bound: HYG within 30 pc is incomplete for faint stars, and the region may extend beyond 30 pc.',
    });
    expect(inside).toBe(true);
    expect(insideRegion(regionNoLen, sun)).toBe(true);
  });

  it('the 95% region is honest: it contains the true origin about 95% of the time', () => {
    // Simulated maps drawn from today's catalogue positions with the Sun (0, 0) as the true origin and
    // no rotation: angles = true bearings + N(0, sigma_theta) at the fitted sigma_theta; the identifier's
    // distances drawn from their error models; lengths = true in-plane distance x exp(N(0, gamma)) at
    // the fitted length scale. 200 realizations (binomial s.e. 1.5% at 95%), 200 bootstrap draws inside
    // each (the 2x2 covariance then carries about 10% error per variance, about 5% on the ellipse radius,
    // a coverage shift of about 1 point), to stay within the time budget.
    const N = 200;
    const sig = region.fit.sigmaThetaDeg;
    const gam = region.fit.lengthScale;
    const rng = createRng('triangulation.coverage');
    let hits = 0;
    const sigmas: number[] = [];
    for (let k = 0; k < N; k++) {
      const sim = pts.map((p) => {
        const f = drawDistanceKpc(p.distKpc, p.distance, rng) / p.distKpc;
        const r = Math.hypot(p.posPc[0], p.posPc[1]);
        const bearing = (Math.atan2(p.posPc[1], p.posPc[0]) * 180) / Math.PI;
        return {
          ...p,
          angleDeg: bearing + sig * rng.normal(),
          rOverR0: (r / 10_000) * Math.exp(gam * rng.normal()),
          posPc: [p.posPc[0] * f, p.posPc[1] * f, p.posPc[2] * f] as Vec3,
        };
      });
      const reg = originRegion(sim, { draws: 200, seed: `triangulation.coverage/${k}` });
      if (insideRegion(reg, [0, 0])) hits++;
      sigmas.push(reg.fit.sigmaThetaDeg);
    }
    const cov = hits / N;
    recordCheck({
      id: 'triangulation.coverage',
      claim: 'Under the stated model, the size of the map-origin region is honest: in simulated maps it contains the true origin about 95% of the time.',
      measured: `coverage ${(cov * 100).toFixed(1)}% over ${N} simulated maps (sigma_theta ${sig.toFixed(2)} deg; mean re-estimated ${(sigmas.reduce((a, b) => a + b, 0) / N).toFixed(2)})`,
      expected: '95%',
      tolerance: '90% to 99% (about 3 binomial standard errors of 1.5% for 200 trials)',
      pass: cov >= 0.9 && cov <= 0.99,
      notes: `Under the stated model: simulation with Gaussian angle noise at the fitted sigma_theta and the catalogue distance errors; real map errors may not be Gaussian. The re-estimated sigma_theta averages ${(sigmas.reduce((a, b) => a + b, 0) / N).toFixed(2)} deg against a true ${sig.toFixed(2)} deg in these runs.`,
    });
    expect(cov).toBeGreaterThanOrEqual(0.9);
    expect(cov).toBeLessThanOrEqual(0.99);
  });

  it('the mirrored reading fits far worse', () => {
    const mirrored = pts.map((p) => ({ ...p, angleDeg: 360 - p.angleDeg }));
    const fm = fitMapOrigin(mirrored);
    const ratio = fm.rmsDeg / region.fit.rmsDeg;
    recordCheck({
      id: 'triangulation.mirror',
      claim: 'Reading the map as if seen from the other side of the galaxy (mirrored) makes the lines refuse to meet.',
      measured: `rms ${fm.rmsDeg.toFixed(2)} deg mirrored vs ${region.fit.rmsDeg.toFixed(2)} deg correct (ratio ${ratio.toFixed(1)})`,
      expected: 'mirror ambiguity resolved by the fit (SSD72: it resolves once one pulsar is identified)',
      tolerance: 'mirrored rms at least 5 times the correct one (spec)',
      pass: ratio >= 5,
    });
    expect(ratio).toBeGreaterThanOrEqual(5);
  });

  it('a wrong identification (B0950+08 and B1929+10 swapped) wrecks the fit', () => {
    const i1 = pts.findIndex((p) => p.name === 'B0950+08');
    const i2 = pts.findIndex((p) => p.name === 'B1929+10');
    const swapped = pts.map((p, i) => {
      if (i !== i1 && i !== i2) return p;
      const o = pts[i === i1 ? i2 : i1] as MapPoint;
      return { ...p, posPc: o.posPc, distKpc: o.distKpc, distance: o.distance };
    });
    const fw = fitMapOrigin(swapped);
    const ratio = fw.rmsDeg / region.fit.rmsDeg;
    recordCheck({
      id: 'triangulation.wrongId',
      claim: 'Swapping the two nearest pulsars makes the map fit visibly poor, so a wrong match shows.',
      measured: `rms ${fw.rmsDeg.toFixed(2)} deg swapped vs ${region.fit.rmsDeg.toFixed(2)} deg correct (ratio ${ratio.toFixed(1)}); largest residual ${Math.max(...fw.residualsDeg.map(Math.abs)).toFixed(1)} deg`,
      expected: "residuals far above the map's 3 deg accuracy",
      tolerance: 'rms at least 3 times the correct fit (spec)',
      pass: ratio >= 3,
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

describe('triangulation at the story epoch', () => {
  it("the 95% region, in the alien's frame, contains the Sun", () => {
    const seed = 'triangulation.epoch';
    const alien = lines.map((l) => projectPulsar(byJ.get(l.jname)!, observer, { seed }) as AlienPulsar);
    // The dated elapsed time: the reframed old-pulsar combination (pulsarAge.ts) for this realization.
    const measured = drawObserver(observer, createRng(seed).fork('measure/observer'));
    const ages = lines.map((l, i) => datePulsar(alien[i] as AlienPulsar, l, { seed, draws: DRAWS, reframe: measured }));
    const elapsed = combineAges(ages.filter((a) => !a.young)).estimate;
    const pts = pointsEpoch(alien, elapsed);
    const region = originRegion(pts, { draws: DRAWS, seed });
    const regionNoLen = originRegion(pts, { draws: DRAWS, seed: `${seed}.noLengths`, useLengths: false });
    // Where the observer was at the map epoch (truth, SSB frame) and so where the Sun sits in the alien's frame.
    const xMap = sub(observer.posPc, scale(observer.velKmS, KM_S_TO_PC_PER_YEAR * elapsed)) as Vec3;
    const xMapG = toGalacticCartesian(xMap);
    const sun: [number, number] = [-xMapG[0], -xMapG[1]];
    const home: [number, number] = [0, 0];
    const inside = insideRegion(region, sun);
    const homeInside = insideRegion(region, home);
    const count = starsInPlane(disc.decimalYear - elapsed).filter((s) => s.id !== 0 && insideRegion(region, [s.xy[0] - xMapG[0], s.xy[1] - xMapG[1]])).length;
    recordCheck({
      id: 'triangulation.epoch',
      claim: `${Math.round(disc.yearsAfterLaunch).toLocaleString('en-US')} years after launch, the alien's own fit of the map still points to a region that contains the Sun.`,
      measured: `elapsed ${elapsed.toFixed(0)} yr; ${fmtRegion(region)} (alien frame, origin = Gliese 445 at the map epoch); Sun at (${sun[0].toFixed(1)}, ${sun[1].toFixed(1)}) pc, at the ${(regionLevel(region, sun) * 100).toFixed(0)}% contour; Gliese 445's own map-epoch position ${homeInside ? 'inside' : 'outside'} the region (at the ${(regionLevel(region, home) * 100).toFixed(0)}% contour); ${count} catalogued stars within 30 pc of the Sun inside. Without lengths: ${fmtRegion(regionNoLen)}`,
      expected: "the Sun; Sagan's design claim about 20 pc (cover.md section 3)",
      tolerance: 'Sun inside the 95% region',
      pass: inside,
      notes: `Gliese 445 was ${norm(xMap).toFixed(2)} pc from the Sun at the map epoch, so the region cannot tell the two apart if it is larger than that.`,
    });
    expect(inside).toBe(true);
  });
});
