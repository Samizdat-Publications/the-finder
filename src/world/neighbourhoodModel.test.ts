// The neighbourhood chart's model against the science core (never against its own earlier output):
// the stars are starStateAt's, the chart holds exactly the stars kinematics.trailCensus counts, and the
// trail drawn for the Sun and three other stars makes kinematics.trail's angle.
import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { angleBetweenDeg, galacticToIcrsCartesian, norm, sub } from '../science/astro';
import { discoveryState, homeObserver, starStateAt } from '../science/epoch';
import { trail } from '../science/kinematics';
import { NEIGHBOURHOOD_RADIUS_PC, absMagToRadiusPx, angleTint, appMagToRadiusPx, computeNeighbourhood, trailGeometry } from './neighbourhoodModel';
import { bvToSrgb } from './skyModel';

const scenario = loadScenario();
const stars = loadStars();
const disc = discoveryState(scenario, stars);
const observer = homeObserver(scenario, stars, disc.decimalYear);
const model = computeNeighbourhood(scenario, stars);
// 400 draws: only the sigma columns depend on the draws; the angles compared here are the exact column.
const rows = trail(disc.craft, stars, observer, { maxDistPc: NEIGHBOURHOOD_RADIUS_PC, draws: 400, seed: 'chart.neighbourhood' });

describe('neighbourhood chart model', () => {
  it('holds the stars kinematics counts, at starStateAt positions', () => {
    expect(model.stars.length).toBe(model.census.within);
    expect(model.stars.filter((s) => s.fullVelocity).length).toBe(model.census.fullVelocity);
    expect(model.stars.filter((s) => !s.fullVelocity).length).toBe(model.census.noRadialVelocity);
    let worst = 0;
    for (const s of model.stars) {
      // Back to ICRS and the SSB frame, then against a fresh starStateAt call: rotation rounding only.
      const icrs = galacticToIcrsCartesian(s.posPc);
      const want = sub(starStateAt(s.star, disc.decimalYear).posPc, disc.craft.posPc);
      worst = Math.max(worst, norm(sub(icrs, want)));
      expect(s.distFromCraftPc).toBeLessThanOrEqual(NEIGHBOURHOOD_RADIUS_PC);
    }
    // 1e-12 pc: double rounding on a 3x3 rotation of numbers of order 10 pc.
    expect(worst).toBeLessThan(1e-12);
    expect(model.sunIndex).toBeGreaterThanOrEqual(0);
    expect(model.homeIndex).toBeGreaterThanOrEqual(0);
    // The Sun is |craft| away (0.749 pc, src/world/README.md "The sky, computed").
    expect(Math.abs(model.stars[model.sunIndex]!.distFromCraftPc - norm(disc.craft.posPc))).toBeLessThan(1e-12);
  });

  it("draws kinematics.trail's angle for the Sun and three other stars", () => {
    const sunRow = rows.find((r) => r.star.id === 0)!;
    // Three others: the nearest to the craft with a full velocity, excluding the Sun (deterministic by distance, id).
    const others = rows.filter((r) => r.star.id !== 0).sort((a, b) => a.distPc - b.distPc || a.star.id - b.star.id).slice(0, 3);
    const checked = [sunRow, ...others];
    let worst = 0;
    const report: string[] = [];
    for (const r of checked) {
      const g = trailGeometry(model, r)!;
      expect(g).not.toBeNull();
      // The drawn vectors' own angle, measured here, against the row's angle.
      const drawn = angleBetweenDeg(g.relVelDir, g.awayDir);
      worst = Math.max(worst, Math.abs(drawn - r.angleDeg), Math.abs(g.angleDeg - r.angleDeg));
      // The arc runs from the away line to the velocity.
      if (g.arc.length) {
        expect(angleBetweenDeg(g.arc[0]!, g.awayDir)).toBeLessThan(1e-6);
        expect(angleBetweenDeg(g.arc[g.arc.length - 1]!, g.relVelDir)).toBeLessThan(1e-6);
      }
      report.push(`${model.stars[g.starIndex]!.label} ${r.angleDeg.toFixed(3)} +/- ${r.angleSigmaDeg.toFixed(3)} deg`);
    }
    const pass = worst < 1e-9;
    recordCheck({
      id: 'chart.neighbourhood',
      claim: 'The neighbourhood chart shows the stars the trail table counts, where the epoch model puts them, and the trail it draws for a star makes exactly the angle the kinematics computes.',
      measured: `${model.stars.length} stars within ${NEIGHBOURHOOD_RADIUS_PC} pc of the craft (${model.census.noRadialVelocity} without a radial velocity, drawn as uncertain in depth); drawn angles: ${report.join('; ')}; largest difference ${worst.toExponential(1)} deg`,
      expected: 'kinematics.trailCensus counts, epoch.ts starStateAt positions, kinematics.trail angleDeg',
      tolerance: '1e-9 deg on angles and 1e-12 pc on positions (double rounding of a rotation)',
      pass,
    });
    expect(worst).toBeLessThan(1e-9);
  });

  it('a star without a radial velocity has no trail row and no drawing', () => {
    const noRv = model.stars.find((s) => !s.fullVelocity);
    if (noRv) expect(rows.some((r) => r.star.id === noRv.star.id)).toBe(false);
  });

  it('is deterministic and does not depend on catalogue order', () => {
    const again = computeNeighbourhood(scenario, stars);
    expect(again.stars.map((s) => s.posPc)).toEqual(model.stars.map((s) => s.posPc));
    const shuffled = { ...stars, near: [...stars.near].reverse(), sky: [...stars.sky].reverse() };
    expect(computeNeighbourhood(scenario, shuffled).stars.map((s) => s.star.id)).toEqual(model.stars.map((s) => s.star.id));
  });

  it('display mappings are monotonic', () => {
    for (let m = 20; m > -2; m -= 0.25) expect(absMagToRadiusPx(m - 0.25)).toBeGreaterThanOrEqual(absMagToRadiusPx(m));
    const warmth = (a: number): number => angleTint(a)[0] - angleTint(a)[2];
    for (let a = 0; a < 180; a += 5) expect(warmth(a + 5)).toBeLessThanOrEqual(warmth(a) + 1e-12);
  });

  it('chart stars are coloured from B-V exactly as the encounter scene colours them (D-A21) and sized by apparent brightness (M5 step 0c)', () => {
    for (const s of model.stars) expect(s.colour).toEqual(bvToSrgb(s.star.ci));
    // The size follows the craft's apparent magnitude, never the absolute one: brighter in the craft's sky is never smaller.
    for (let m = 20; m > -2; m -= 0.25) expect(appMagToRadiusPx(m - 0.25)).toBeGreaterThanOrEqual(appMagToRadiusPx(m));
    const byApp = [...model.stars].sort((a, b) => a.appMag - b.appMag);
    for (let i = 1; i < byApp.length; i++) expect(byApp[i]!.radiusPx).toBeLessThanOrEqual(byApp[i - 1]!.radiusPx + 1e-12);
    // The Sun is the brightest of the warm-white stars in this sky and is drawn bigger than a faint red dwarf.
    const faint = byApp[byApp.length - 1]!;
    expect(model.stars[model.sunIndex]!.radiusPx).toBeGreaterThan(faint.radiusPx);
  });
});
