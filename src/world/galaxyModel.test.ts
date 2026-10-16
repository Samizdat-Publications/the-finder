// The galaxy chart's model against the science core and the cover data (never against its own earlier
// output): positions are projectCatalogue's, the map's rays are cover.json's angles after the transform,
// a triangulation fit drawn through mapRays reproduces that fit's own residuals, and the region outline
// is the 95% contour regionMahalanobis2 defines.
import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { angleBetweenDeg, icrsToGalactic, norm, toSpherical, type Vec3 } from '../science/astro';
import { discoveryState, homeObserver } from '../science/epoch';
import { distanceModel, projectCatalogue } from '../science/pulsarEpoch';
import { wrapDeg } from '../science/pulsars';
import { CHI2_2DOF_95, fitMapOrigin, originRegion, regionMahalanobis2, type MapPoint } from '../science/triangulation';
import { GC_DISTANCE_KPC, SGR_A_DEC_DEG, SGR_A_RA_DEG, alphaForDistance, buildGalaxy, mapRays, matchSegments, regionOutline, transformFromFit, type MapTransform } from './galaxyModel';

const galacticVector = (lDeg: number, bDeg: number): Vec3 => {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
};

const cover = loadCover();
const cat = loadPulsars();
const scenario = loadScenario();
const stars = loadStars();
const disc = discoveryState(scenario, stars);
const observer = homeObserver(scenario, stars, disc.decimalYear);
const SEED = 'chart.galaxy';
const alien = projectCatalogue(cat, observer, { seed: SEED });
const model = buildGalaxy(alien, observer);
const byJ = new Map(model.pulsars.map((p) => [p.jname, p]));
const lines = cover.pulsarMap.lines;

// Rounding budget for angles recomputed from doubles: 1e-9 deg is about 1e-11 rad, far above double
// rounding (1e-16 relative) and far below anything a player could see.
const ANGLE_EPS_DEG = 1e-9;

/** The map lines as triangulation inputs, built from the chart's own positions (kpc to pc). */
function mapPointsFromChart(): MapPoint[] {
  return lines.map((l) => {
    const p = byJ.get(l.jname)!;
    return { name: l.bname, angleDeg: l.mapAngleDeg, rOverR0: l.rOverR0, posPc: [p.posKpc[0] * 1000, p.posKpc[1] * 1000, p.posKpc[2] * 1000] as Vec3, distKpc: p.distKpc, distance: distanceModel(cat.pulsars.find((r) => r.jname === l.jname)!) };
  });
}

describe('galaxy chart model', () => {
  it('places every pulsar exactly where projectCatalogue says (direction and catalogue distance)', () => {
    let worstDir = 0;
    let worstDist = 0;
    for (const p of model.pulsars) {
      const s = toSpherical(p.posKpc);
      worstDir = Math.max(worstDir, Math.abs(wrapDeg(s.lonDeg - p.entry.lDeg)), Math.abs(s.latDeg - p.entry.bDeg));
      worstDist = Math.max(worstDist, Math.abs(norm(p.posKpc) / (p.entry.distKpc as number) - 1));
    }
    const noDist = alien.filter((a) => a.distKpc === null).length;
    expect(model.counts.catalogue).toBe(alien.length);
    expect(model.counts.noDistance).toBe(noDist);
    expect(model.counts.shown).toBe(alien.length - noDist);
    expect(model.counts.millisecond + model.counts.young + model.counts.old + model.counts.noSpinDown).toBe(model.counts.shown);
    // projectPulsar's own lDeg, bDeg (galactic) against the chart's direction: same numbers, rounding only.
    expect(worstDir).toBeLessThan(ANGLE_EPS_DEG);
    expect(worstDist).toBeLessThan(1e-12);
    // Every map pulsar is drawn (all 14 have catalogue distances).
    for (const l of lines) expect(byJ.has(l.jname)).toBe(true);
  });

  it('marks the Galactic centre at Sgr A* and the modern distance', () => {
    // Sgr A* from the Sun: galactic l 359.9442, b -0.0462 (SIMBAD, from Reid and Brunthaler 2004); 0.001 deg
    // is the rounding of those published values.
    const fromSun = icrsToGalactic(SGR_A_RA_DEG, SGR_A_DEC_DEG);
    expect(Math.abs(wrapDeg(fromSun.lDeg - 359.9442))).toBeLessThan(0.001);
    expect(Math.abs(fromSun.bDeg + 0.0462)).toBeLessThan(0.001);
    // Seen from Gliese 445 instead: the parallax of the centre for an observer |X| pc from the Sun is at
    // most |X| / R0 rad (about 0.007 deg per pc), and the distance changes by at most |X|.
    const xKpc = norm(observer.posPc) / 1000;
    const shiftDeg = angleBetweenDeg(model.gc.posKpc, galacticVector(fromSun.lDeg, fromSun.bDeg));
    expect(shiftDeg).toBeLessThanOrEqual(((xKpc / GC_DISTANCE_KPC) * 180) / Math.PI + 1e-9);
    expect(shiftDeg).toBeGreaterThan(0);
    expect(Math.abs(model.gc.distKpc - GC_DISTANCE_KPC)).toBeLessThanOrEqual(xKpc + 1e-12);
  });

  it('draws the 15 map lines at the cover angles after the transform', () => {
    const t: MapTransform = { originKpc: [0.0123, -0.0045, 0.002], rotationDeg: 37.5, kpcPerR0: 10 };
    const rays = mapRays(cover.pulsarMap, t);
    expect(rays.length).toBe(15);
    const want = [{ a: cover.pulsarMap.gcLine.angleDeg, r: 1 }, ...lines.map((l) => ({ a: l.mapAngleDeg, r: l.rOverR0 }))];
    let worst = 0;
    rays.forEach((ray, i) => {
      const w = want[i]!;
      const drawn = (Math.atan2(ray.end[1] - ray.start[1], ray.end[0] - ray.start[0]) * 180) / Math.PI;
      worst = Math.max(worst, Math.abs(wrapDeg(drawn - (w.a + t.rotationDeg))), Math.abs(wrapDeg(ray.angleDeg - (w.a + t.rotationDeg))));
      expect(Math.hypot(ray.end[0] - ray.start[0], ray.end[1] - ray.start[1]) / (w.r * t.kpcPerR0)).toBeCloseTo(1, 12);
      expect(ray.end[2]).toBe(t.originKpc[2]);
    });
    expect(worst).toBeLessThan(ANGLE_EPS_DEG);
  });

  it("a triangulation fit drawn on the chart reproduces the fit's own residuals, and the region is its 95% contour", () => {
    const pts = mapPointsFromChart();
    const fit = fitMapOrigin(pts);
    const rays = mapRays(cover.pulsarMap, transformFromFit(fit));
    const segs = matchSegments(rays, lines.map((l) => ({ order: l.order, jname: l.jname })), model.pulsars);
    let worst = 0;
    lines.forEach((l, i) => {
      const ray = rays.find((r) => r.order === l.order)!;
      const p = byJ.get(l.jname)!;
      const bearing = (Math.atan2(p.posKpc[1] - ray.start[1], p.posKpc[0] - ray.start[0]) * 180) / Math.PI;
      worst = Math.max(worst, Math.abs(wrapDeg(ray.angleDeg - bearing) - fit.residualsDeg[i]!));
      // The match link's offset is the same residual's size.
      worst = Math.max(worst, Math.abs(segs[i]!.offsetDeg - Math.abs(fit.residualsDeg[i]!)));
    });

    // 200 draws: the outline only has to be the contour of whatever covariance originRegion returns.
    const region = originRegion(pts, { draws: 200, seed: `${SEED}.region` });
    const outline = regionOutline(region, 64);
    let worstLevel = 0;
    for (const q of outline) worstLevel = Math.max(worstLevel, Math.abs(regionMahalanobis2(region, [q[0] * 1000, q[1] * 1000]) / CHI2_2DOF_95 - 1));
    // Residuals: atan2 on pc vs kpc of the same doubles, so ANGLE_EPS_DEG. Contour: the semi-axes come
    // from the closed-form eigenvalues of the 2x2 covariance, so 1e-9 relative.
    const pass = worst < ANGLE_EPS_DEG && worstLevel < 1e-9;
    recordCheck({
      id: 'chart.galaxy',
      claim: "The galaxy chart draws the alien's pulsar catalogue where the projection puts it, the cover map's lines at the cover's angles, and the fitted origin region as the fit's own 95% contour.",
      measured: `${model.counts.shown} of ${model.counts.catalogue} pulsars drawn (${model.counts.noDistance} without a distance; ${model.counts.young} young, ${model.counts.old} old, ${model.counts.millisecond} millisecond, ${model.counts.noSpinDown} without a spin-down); directions within ${ANGLE_EPS_DEG} deg of projectCatalogue's; 15 map rays at cover.json's angles after the transform; a fit drawn through the rays reproduces its ${lines.length} residuals within ${worst.toExponential(1)} deg (rms ${fit.rmsDeg.toFixed(2)} deg); region outline at the 95% level within ${worstLevel.toExponential(1)}; Galactic centre at l ${model.gc.lDeg.toFixed(4)}, b ${model.gc.bDeg.toFixed(4)}, ${model.gc.distKpc.toFixed(3)} +/- ${model.gc.sigmaKpc.toFixed(3)} kpc`,
      expected: "projectCatalogue (pulsarEpoch.ts) for seed 'chart.galaxy'; cover.json mapAngleDeg plus the rotation; fitMapOrigin residuals and regionMahalanobis2 = 5.991 (triangulation.ts); Sgr A* (Reid and Brunthaler 2004) at 8.275 +/- 0.034 kpc (GRAVITY Collaboration 2021)",
      tolerance: '1e-9 deg on angles (double rounding); 1e-9 relative on the contour; 0.001 deg and 0.005 kpc on the centre (published rounding and the observer offset)',
      pass,
      notes: 'Pulsars are placed at their catalogue distances (the alien\'s own measurements); distances from dispersion measures can be off by a factor of 1.3 or more. Brightness and size are display choices (galaxyModel.ts).',
    });
    expect(worst).toBeLessThan(ANGLE_EPS_DEG);
    expect(worstLevel).toBeLessThan(1e-9);
  });

  it('is deterministic for a seed, and the seed matters', () => {
    const again = buildGalaxy(projectCatalogue(cat, observer, { seed: SEED }), observer);
    expect(Array.from(again.positions)).toEqual(Array.from(model.positions));
    expect(again.counts).toEqual(model.counts);
    const other = buildGalaxy(projectCatalogue(cat, observer, { seed: 'another seed' }), observer);
    // Directions depend on the drawn true distances through the parallax term, so another seed moves some point.
    expect(Array.from(other.positions)).not.toEqual(Array.from(model.positions));
  });

  it('dims with distance, never brightens', () => {
    let prev = alphaForDistance(0.01);
    for (let d = 0.02; d < 100; d *= 1.1) {
      const a = alphaForDistance(d);
      expect(a).toBeLessThanOrEqual(prev);
      expect(a).toBeGreaterThan(0.25);
      prev = a;
    }
  });
});
