import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { norm, sub } from '../../science/astro';
import { craftStateAt, discoveryState, findHomeStar, starStateAt } from '../../science/epoch';
import { epilogue } from './epilogueData';
import { LY_PER_PC, WINDOW_YEARS, futureDiagram } from './future';

const scenario = loadScenario();
const stars = loadStars();

describe('the slow future: Voyager 1 and Gliese 445', () => {
  const f = futureDiagram(scenario, stars);

  it('computes the pass live and agrees with the published numbers (Bailer-Jones and Farnocchia 2019)', () => {
    const pub = epilogue.gliese445.published[0]!;
    // Tolerances: the published figures are rounded to 0.1 kyr and 0.001 pc and come from Gaia DR2; ours is DR3
    // (docs/research/epilogue.md section 4: ours 0.573 pc at 44,100 years; theirs 0.575 pc at 44.0 kyr).
    expect(Math.abs(f.yearsAfterLaunch - pub.years)).toBeLessThanOrEqual(300);
    expect(Math.abs(f.minDistPc - pub.pc)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(f.minDistLy - pub.lightYears)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(f.relSpeedKmS - pub.kmS)).toBeLessThanOrEqual(0.5);
    // NASA's popular wording is looser: 1.6 to 1.7 ly in about 40,000 years.
    expect(f.minDistLy).toBeGreaterThan(epilogue.gliese445.nasaPopular.lightYearsLow);
    expect(f.minDistLy).toBeLessThan(2.0);
    recordCheck({
      id: 'epilogue.gliese445',
      claim: 'The real pass of Voyager 1 by Gliese 445 is about 0.57 parsecs (1.9 light-years) at about 44,100 years after launch, as the published Gaia-based study says.',
      measured: `${f.minDistPc.toFixed(4)} pc (${f.minDistLy.toFixed(3)} ly), ${f.yearsAfterLaunch.toFixed(0)} years after launch (AD ${Math.round(f.adYear)}), ${f.relSpeedKmS.toFixed(2)} km/s`,
      expected: `${pub.pc} pc, ${pub.lightYears} ly, ${pub.years} years, ${pub.kmS} km/s (${pub.who}); NASA popular: 1.6 to 1.7 ly in about 40,000 years`,
      tolerance: '300 years, 0.01 pc, 0.04 ly, 0.5 km/s (rounding of the published figures and the DR2 to DR3 shift)',
      pass: true,
    });
  });

  it('is the same pass the science core finds, with the AD year from launch plus the flight time', () => {
    const d = discoveryState(scenario, stars);
    expect(f.minDistPc).toBe(d.minDistPc);
    expect(f.adYear).toBe(d.decimalYear);
    expect(f.adYear).toBeGreaterThan(45_500);
    expect(f.adYear).toBeLessThan(46_500);
    expect(LY_PER_PC).toBeCloseTo(3.2616, 3);
  });

  it('draws every Sun distance and every craft-to-star distance true to scale, at closest approach and along the paths', () => {
    const [cx, cy] = f.craftAtApproach;
    const [hx, hy] = f.homeAtApproach;
    const d = discoveryState(scenario, stars);
    // The craft's line of flight runs from within 0.001 pc of the Sun, so its drawn height is under that.
    expect(cy).toBeLessThan(0.002);
    expect(Math.hypot(hx - cx, hy - cy)).toBeCloseTo(f.minDistPc, 2);
    expect(Math.hypot(hx, hy)).toBeCloseTo(norm(d.home.posPc), 6);
    expect(Math.hypot(cx, cy)).toBeCloseTo(norm(d.craft.posPc), 6);
    expect(f.sun).toEqual([0, 0]);
    // Along the whole drawn stretch: the drawn Sun-star and craft-star distances are the 3D ones (the Sun and the
    // craft's line lie on the drawing's axis).
    const home = findHomeStar(scenario, stars);
    expect(f.years).toHaveLength(f.homePath.length);
    expect(f.years[0]).toBeCloseTo(f.adYear - WINDOW_YEARS, 6);
    expect(f.years[f.years.length - 1]).toBeCloseTo(f.adYear + WINDOW_YEARS, 6);
    for (const i of [0, 17, 50, 83, 100]) {
      const t = f.years[i]!;
      const s3 = starStateAt(home, t).posPc;
      const c3 = craftStateAt(scenario, t).posPc;
      const h = f.homePath[i]!;
      const c = f.craftPath[i]!;
      expect(Math.hypot(h[0], h[1]), `Sun-star at sample ${i}`).toBeCloseTo(norm(s3), 6);
      expect(Math.abs(Math.hypot(h[0] - c[0], h[1] - c[1]) - norm(sub(s3, c3))), `craft-star at sample ${i}`).toBeLessThan(0.002);
    }
    // At closest approach the gap is the minimum over the paths.
    const sep = f.craftPath.map((c, i) => Math.hypot(c[0] - f.homePath[i]![0], c[1] - f.homePath[i]![1]));
    expect(Math.min(...sep)).toBeGreaterThanOrEqual(f.minDistPc - 0.01);
    expect(Math.min(...sep)).toBeLessThan(f.minDistPc + 0.02);
    // The drawing is a usable shape: the box holds the Sun and both paths, wider than tall by less than a factor of five.
    expect(f.box.x0).toBe(0);
    expect(f.box.x1 / f.box.y1).toBeLessThan(5);
    expect(f.box.x1 / f.box.y1).toBeGreaterThan(0.2);
  });
});
