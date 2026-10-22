import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { norm, sub } from '../../science/astro';
import { craftStateAt, discoveryState, findHomeStar, starStateAt } from '../../science/epoch';
import { normalQuantile } from '../../science/stats';
import type { StarCatalogue, StarRecord } from '../../science/types';
import { epilogue } from './epilogueData';
import { LY_PER_PC, WINDOW_YEARS, futureDiagram } from './future';

const scenario = loadScenario();
const stars = loadStars();

describe('the slow future: Voyager 1 and Gliese 445', () => {
  const f = futureDiagram(scenario, stars);

  it('computes the pass live and agrees with the published numbers (Bailer-Jones and Farnocchia 2019)', () => {
    const pub = epilogue.gliese445.published[0]!;
    // Our own 1-sigma, from Gaia DR3's 1-sigma errors on Gliese 445 (data/stars.json: parallax, both proper motions,
    // radial velocity), propagated linearly through the closest approach by central differences (one sigma each
    // way, each error independent; DR3's correlations are not in the table). The craft's asymptote is
    // Bailer-Jones and Farnocchia's own (scenario.json), shared with theirs, so it adds nothing to the difference.
    const home = findHomeStar(scenario, stars);
    const withStar = (st: StarRecord): StarCatalogue => ({ ...stars, near: stars.near.map((x) => (x.id === home.id ? st : x)) });
    const plx = home.parallaxMas!;
    const params: ((k: number) => StarRecord)[] = [
      (k) => ({ ...home, distPc: 1000 / (plx + k * home.parallaxErrMas!) }),
      (k) => ({ ...home, pmraMasYr: home.pmraMasYr + k * home.pmraErrMasYr! }),
      (k) => ({ ...home, pmdecMasYr: home.pmdecMasYr + k * home.pmdecErrMasYr! }),
      (k) => ({ ...home, rvKmS: home.rvKmS! + k * home.rvErrKmS! }),
    ];
    let varPc = 0;
    let varYr = 0;
    for (const at of params) {
      const up = discoveryState(scenario, withStar(at(1)));
      const dn = discoveryState(scenario, withStar(at(-1)));
      varPc += ((up.minDistPc - dn.minDistPc) / 2) ** 2;
      varYr += ((up.decimalYear - dn.decimalYear) / 2) ** 2;
    }
    // Theirs: the 5th to 95th percentile range of Table 1 over 2 x 1.645 (normal), and the rounding of the printed
    // value (uniform over one last digit: step / sqrt(12)). Their time is counted from about 2019 (the paper's
    // "now", RNAAS of 3 April 2019), so ours is compared from the same year; a year's doubt in their "now" is
    // added as 1 year, 1 sigma.
    const z90 = normalQuantile(0.95);
    const sTheirPc = Math.hypot((pub.pcHigh - pub.pcLow) / (2 * z90), 0.001 / Math.sqrt(12));
    const sTheirYr = Math.hypot((pub.yearsHigh - pub.yearsLow) / (2 * z90), 100 / Math.sqrt(12), 1);
    const sOursPc = Math.sqrt(varPc);
    const sOursYr = Math.sqrt(varYr);
    const sPc = Math.hypot(sOursPc, sTheirPc);
    const sYr = Math.hypot(sOursYr, sTheirYr);
    const oursFrom = f.adYear - pub.fromYear;
    const zPc = (f.minDistPc - pub.pc) / sPc;
    const zYr = (oursFrom - pub.years) / sYr;
    // Tolerance: 99.9% two-sided (3.29 sigma) of the combined DR3 and published uncertainties above (D-A28's level).
    // Gaia DR2 against DR3 for the same star is a further difference these errors do not hold; if it showed, the
    // check would fail rather than be widened by hand.
    const k = normalQuantile(0.9995);
    console.log(
      `[epilogue.gliese445] ours ${f.minDistPc.toFixed(4)} pc (DR3 1 sigma ${sOursPc.toFixed(5)}), theirs ${pub.pc} (1 sigma ${sTheirPc.toFixed(5)}): z ${zPc.toFixed(2)}; ` +
        `ours ${oursFrom.toFixed(0)} yr from ${pub.fromYear} (DR3 1 sigma ${sOursYr.toFixed(1)}), theirs ${pub.years} (1 sigma ${sTheirYr.toFixed(1)}): z ${zYr.toFixed(2)}`,
    );
    expect(Math.abs(zPc)).toBeLessThanOrEqual(k);
    expect(Math.abs(zYr)).toBeLessThanOrEqual(k);
    // Light-years follow from parsecs (LY_PER_PC), so the same tolerance scaled.
    expect(Math.abs(f.minDistLy - pub.pc * LY_PER_PC)).toBeLessThanOrEqual(k * sPc * LY_PER_PC);
    // Speed: the paper prints 0.1 km/s; 0.5 km/s allows its rounding and DR2 to DR3 (information, not a deduction).
    expect(Math.abs(f.relSpeedKmS - pub.kmS)).toBeLessThanOrEqual(0.5);
    // NASA's popular wording (about 1.7 ly in 40,000 years, older data) is shown on the page, not tested against.
    const nasa = epilogue.gliese445.nasaPopular;
    recordCheck({
      id: 'epilogue.gliese445',
      claim: 'The real pass of Voyager 1 by Gliese 445 is about 0.57 parsecs (1.9 light-years) about 44,100 years after launch, as the published Gaia-based study says (its time counted from about 2019).',
      measured: `${f.minDistPc.toFixed(4)} pc (${f.minDistLy.toFixed(3)} ly; Gaia DR3 1 sigma ${sOursPc.toFixed(5)} pc), ${f.yearsAfterLaunch.toFixed(0)} years after launch (AD ${Math.round(f.adYear)}), ${oursFrom.toFixed(0)} years after ${pub.fromYear} (DR3 1 sigma ${sOursYr.toFixed(1)}), ${f.relSpeedKmS.toFixed(2)} km/s; z ${zPc.toFixed(2)} in distance and ${zYr.toFixed(2)} in time against the published values`,
      expected: `${pub.pc} pc (5 to 95% ${pub.pcLow} to ${pub.pcHigh}), ${pub.lightYears} ly, ${pub.years} years from about ${pub.fromYear} (5 to 95% ${pub.yearsLow} to ${pub.yearsHigh}), ${pub.kmS} km/s (${pub.who}); NASA's popular wording, shown only: about ${nasa.lightYears} ly in ${nasa.years} years`,
      tolerance: "3.29 sigma (99.9% two-sided) of our Gaia DR3 errors propagated linearly and the paper's 5 to 95% range and rounding, in quadrature; speed within 0.5 km/s (information)",
      pass: Math.abs(zPc) <= k && Math.abs(zYr) <= k,
      notes: 'Bailer-Jones and Farnocchia count time from their "now" (about 2019); we count from launch (1977); the comparison uses the same year. Ours lies just outside their 5 to 95% range in distance (M6 science audit), which the combined errors measure.',
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
