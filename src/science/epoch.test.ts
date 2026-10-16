import { describe, expect, it } from 'vitest';
import { loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { KM_S_TO_PC_PER_YEAR, dot, norm, scale, sub, unitVector, type Vec3 } from './astro';
import {
  apparentMagnitude,
  asymptoteAngleDeg,
  brightestStars,
  craftRefYear,
  craftStateAt,
  discoveryState,
  findHomeStar,
  homeObserver,
  nearestStars,
  starStateAt,
  SUN_ABS_MAG_V,
} from './epoch';
import { createRng } from './random';
import type { StarCatalogue } from './types';
import { AU_KM, PARSEC_KM } from './units';

const scenario = loadScenario();
const stars = loadStars();
const PC_PER_LY = 0.306601; // 1 light-year in pc (IAU light-year 9.4607e12 km / parsec 3.0857e13 km)
const AU_PER_PC = PARSEC_KM / AU_KM;

describe('epoch: the discovery', () => {
  const d = discoveryState(scenario, stars);

  it('matches the published closest approach of Voyager 1 to Gliese 445', () => {
    // Truth: Bailer-Jones and Farnocchia 2019 (RNAAS 3, 59; Gaia DR2): 44.0 kyr, 0.575 pc, 116.0 km/s;
    // the research's Gaia DR3 recheck (docs/research/voyager.md section 5): 44.1 kyr, 0.573 pc,
    // 115.9 km/s. Our inputs are DR3, so we test against the recheck. Tolerances (spec, from the
    // published rounding and the DR2-to-DR3 shift): 0.3 kyr, 0.01 pc, 0.5 km/s.
    const kyr = d.yearsAfterLaunch / 1000;
    const pass = Math.abs(kyr - 44.1) <= 0.3 && Math.abs(d.minDistPc - 0.573) <= 0.01 && Math.abs(d.relSpeedKmS - 115.9) <= 0.5;
    recordCheck({
      id: 'epoch.discovery',
      claim: 'Voyager 1 passes closest to Gliese 445 about 44,100 years after launch, 0.57 parsecs (1.87 light-years) away, at 116 km/s.',
      measured: `${kyr.toFixed(2)} kyr after launch (year ${Math.round(d.decimalYear)} AD), ${d.minDistPc.toFixed(4)} pc (${(d.minDistPc / PC_PER_LY).toFixed(2)} ly), ${d.relSpeedKmS.toFixed(2)} km/s`,
      expected: 'Gaia DR3 recheck 44.1 kyr, 0.573 pc, 115.9 km/s (voyager.md section 5); Bailer-Jones and Farnocchia 2019 (Gaia DR2) 44.0 kyr, 0.575 pc, 116.0 km/s',
      tolerance: '0.3 kyr, 0.01 pc, 0.5 km/s (published rounding plus the DR2-to-DR3 shift)',
      pass,
      notes: 'Straight-line motion of both bodies from the Gaia DR3 astrometry of Gliese 445 and the Bailer-Jones and Farnocchia asymptote, with no Galactic potential, as in the research DR3 recheck. Bailer-Jones and Farnocchia integrated through a Galactic potential, and their 44.0 kyr counts from about the Gaia epoch (2016 to 2019), not from launch; that offset of about 40 years is inside the 0.3 kyr tolerance.',
    });
    expect(Math.abs(kyr - 44.1)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(d.minDistPc - 0.573)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(d.relSpeedKmS - 115.9)).toBeLessThanOrEqual(0.5);
    // At closest approach the relative velocity is perpendicular to the separation (definition).
    const r = sub(d.craft.posPc, d.home.posPc);
    const v = sub(d.craft.velKmS, d.home.velKmS);
    expect(Math.abs(dot(r, v)) / (norm(r) * norm(v))).toBeLessThan(1e-9); // rounding level
  });

  it('places the craft where Horizons says today, and 2.4 light-years from the Sun at the epoch', () => {
    // 2026: the model starts from the Horizons SSB state, so it reproduces it to rounding.
    const t0 = craftRefYear(scenario);
    const c0 = craftStateAt(scenario, t0);
    const ref = scenario.craft.stateRef.posKm;
    for (let i = 0; i < 3; i++) expect(Math.abs((c0.posPc[i] as number) * PARSEC_KM - ref[i]!)).toBeLessThan(1e-3); // km, rounding
    const auToday = norm(c0.posPc) * AU_PER_PC;
    // Truth: 172.061 AU from the Sun at 2026-10-15 19:00 TDB (Horizons, voyager.md section 4). Our state is
    // barycentric; the Sun is within about 0.01 AU of the SSB, inside the spec's 0.05 AU tolerance.
    const distSunPc = norm(d.craft.posPc);
    const speed = norm(d.craft.velKmS);
    const lyAtEpoch = distSunPc / PC_PER_LY;
    const angle = asymptoteAngleDeg(scenario);
    const pass = Math.abs(auToday - 172.06) <= 0.05 && Math.abs(lyAtEpoch - 2.4) <= 0.05;
    recordCheck({
      id: 'epoch.craft',
      claim: 'Voyager 1 is 172 AU from the Sun today and, coasting at 16.6 km/s, is about 2.4 light-years from the Sun when it reaches Gliese 445.',
      measured: `today ${auToday.toFixed(3)} AU; at the epoch ${distSunPc.toFixed(4)} pc (${lyAtEpoch.toFixed(3)} ly), ${speed.toFixed(4)} km/s from the Sun, ${d.relSpeedKmS.toFixed(2)} km/s relative to Gliese 445; the 2026 position is ${angle.toFixed(2)} deg off the asymptote`,
      expected: '172.06 AU on 2026-10-15 (JPL Horizons, voyager.md section 4); "2.4 light-years behind" (PLAN.md chapter 4); asymptotic speed 16.6048 km/s (Bailer-Jones and Farnocchia 2019)',
      tolerance: '0.05 AU (spec; covers the 0.01 AU Sun-barycentre offset); 0.05 ly (the story rounds to 0.1 ly)',
      pass,
      notes: 'Linear coast along the asymptote from the 2026 Horizons state; the Sun\'s remaining pull shifts the craft by about 20 AU over 150,000 AU (epoch.ts).',
    });
    expect(Math.abs(auToday - 172.06)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(lyAtEpoch - 2.4)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(speed - scenario.craft.asymptote.speedKmS)).toBeLessThan(1e-9);
  });
});

/**
 * For a star without a radial velocity: the smallest |v_r| (km/s) that would bring it within `limit` pc
 * of point P at year t (Infinity if none would). Its possible positions lie on a line along its line of
 * sight, one point per v_r.
 */
function minRvToComeWithin(star: StarCatalogue['near'][number], P: Vec3, t: number, limit: number): number {
  const base = starStateAt({ ...star, rvKmS: 0 }, t).posPc;
  const dir = unitVector(star.raDeg, star.decDeg);
  const span = KM_S_TO_PC_PER_YEAR * (t - star.epoch); // pc per km/s of radial velocity
  const along = dot(sub(P, base), dir);
  const perp = norm(sub(sub(P, base), scale(dir, along)));
  if (perp >= limit) return Infinity;
  const half = Math.sqrt(limit * limit - perp * perp);
  const lo = (along - half) / span;
  const hi = (along + half) / span;
  return lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi));
}

describe('epoch: the neighbour twist', () => {
  const d = discoveryState(scenario, stars);
  const home = findHomeStar(scenario, stars);
  const P = d.home.posPc;
  const nearest = nearestStars(stars, P, d.decimalYear, 10, [home.id]);
  const sunRank = nearest.findIndex((x) => x.star.id === 0) + 1;
  const sunDist = norm(P); // the Sun is at the origin
  const obs = homeObserver(scenario, stars, d.decimalYear);
  const u = scale(P, 1 / sunDist);
  // Variance of the Sun-Gliese 445 distance: u^T posCov u along the line of sight (the Sun has no error).
  const sunDistSigma = Math.sqrt([0, 1, 2].reduce((acc, i) => acc + u[i]! * [0, 1, 2].reduce((a, j) => a + obs.posCov[i]![j]! * u[j]!, 0), 0));
  const noRv = stars.near.filter((s) => s.rvKmS === null && s.id !== 0);
  // Stars with no radial velocity: which could reach Gliese 445 closer than the Sun, and what |v_r| would
  // that take? Nearby disc stars move at a few tens of km/s relative to the Sun; 150 km/s is a loose cap
  // (Gliese 445's own 111 km/s is unusually fast).
  const needs = noRv
    .map((s) => ({ s, v: minRvToComeWithin(s, P, d.decimalYear, sunDist) }))
    .filter((x) => x.v <= 150)
    .sort((a, b) => a.v - b.v || a.s.id - b.s.id);
  const couldBeCloser = needs.map((x) => x.s);
  const list = nearest.map((x, i) => `${i + 1}. ${x.star.name ?? x.star.gl ?? `HYG ${x.star.id}`} ${x.distPc.toFixed(3)} pc${x.fullVelocity ? '' : ' (no RV)'}`).join('; ');
  const catalogueNotes = `HYG v4.2 within 30 pc is incomplete for faint M dwarfs. ${noRv.length} of ${stars.near.length - 1} stars within 30 pc have no radial velocity and are moved with v_r = 0, so each is uncertain by |v_r| x 44 kyr (about 1.4 pc at 30 km/s); ${couldBeCloser.length} of them could come closer to Gliese 445 than the Sun for some |v_r| <= 150 km/s${needs.length ? ` (with the |v_r| each would need: ${needs.map((x) => `${x.s.name ?? x.s.gl ?? `HYG ${x.s.id}`} ${x.v.toFixed(0)} km/s`).join(', ')})` : ''}.`;

  it('the Sun is among Gliese 445\'s three nearest catalogued stars', () => {
    console.log(`[epoch.neighbours] ${list}`);
    console.log(`[epoch.neighbours] Sun rank ${sunRank}, ${sunDist.toFixed(4)} +/- ${sunDistSigma.toFixed(4)} pc; ${catalogueNotes}`);
    const pass = sunRank >= 1 && sunRank <= 3;
    recordCheck({
      id: 'epoch.neighbours',
      claim: 'When Voyager 1 reaches Gliese 445, the Sun is one of that star\'s three nearest catalogued neighbours.',
      measured: `Sun rank ${sunRank}, ${sunDist.toFixed(3)} +/- ${sunDistSigma.toFixed(3)} pc (${(sunDist / PC_PER_LY).toFixed(2)} ly). Ten nearest: ${list}`,
      expected: 'Rank 1 to 3 (PLAN.md "The story frame"); the story figure about 1.06 pc (3.45 ly) is from Wikipedia\'s Gliese 445 article (voyager.md section 5)',
      tolerance: 'rank <= 3; distance error propagated from the Gaia DR3 errors of Gliese 445 (1 sigma)',
      pass,
      notes: `${catalogueNotes} The DR3 distance differs from the older 1.06 pc figure by ${Math.abs(sunDist - 1.06).toFixed(3)} pc, many times its Gaia DR3 uncertainty of ${sunDistSigma.toFixed(4)} pc; see epoch.neighbourDistance.`,
    });
    expect(sunRank).toBeGreaterThanOrEqual(1);
    expect(sunRank).toBeLessThanOrEqual(3);
  });

  it('the Sun is about 1.02 pc from Gliese 445 at the epoch, as Gaia DR3 implies in closed form', () => {
    // Independent truth: Gliese 445's own closest approach to the Sun, the impact parameter of a straight
    // line, computed here directly from the raw Gaia DR3 values: d_min = d * v_t / |v|, with
    // v_t = 4.740470446 km/s per (arcsec/yr * pc) (IAU AU and Julian year) times the total proper motion
    // times the distance. The craft reaches Gliese 445 a few centuries from that moment, which changes the
    // Sun's distance by under 0.001 pc (the path is at its minimum, so the change is second order).
    // Tolerance: 2 sigma of our propagated distance plus that 0.001 pc.
    // Story note (D-A15): the earlier "about 1.06 pc" (Wikipedia via voyager.md section 5) predates Gaia
    // DR3; the story now says about 1.02 pc (3.3 light-years).
    const distPc = 1000 / home.parallaxMas!;
    const muArcsecYr = Math.hypot(home.pmraMasYr, home.pmdecMasYr) / 1000;
    const vt = 4.740470446 * muArcsecYr * distPc;
    const v = Math.hypot(vt, home.rvKmS!);
    const dMin = (distPc * vt) / v;
    const tol = 2 * sunDistSigma + 0.001;
    const pass = Math.abs(sunDist - dMin) <= tol;
    recordCheck({
      id: 'epoch.neighbourDistance',
      claim: 'When Voyager 1 reaches Gliese 445, the Sun is about 1.02 parsecs (3.3 light-years) from that star, its nearest neighbour.',
      measured: `${sunDist.toFixed(4)} +/- ${sunDistSigma.toFixed(4)} pc (${(sunDist / PC_PER_LY).toFixed(2)} ly)`,
      expected: `${dMin.toFixed(4)} pc: Gliese 445's closest approach to the Sun in closed form from its Gaia DR3 parallax, proper motion and radial velocity`,
      tolerance: `${tol.toFixed(4)} pc (2 sigma propagated from Gaia DR3, plus 0.001 pc for the few centuries between the two moments)`,
      pass,
      notes: `Older pre-Gaia figures (Wikipedia, about 1.06 pc or 3.45 ly) differ by ${Math.abs(sunDist - 1.06).toFixed(3)} pc, many times the Gaia DR3 uncertainty of ${sunDistSigma.toFixed(4)} pc; the story uses the Gaia DR3 value (D-A15).`,
    });
    expect(Math.abs(sunDist - dMin)).toBeLessThanOrEqual(tol);
  });

  it('the Sun is among the ten brightest stars in Gliese 445\'s sky', () => {
    const bright = brightestStars(stars, P, d.decimalYear, 10, [home.id]);
    const sunFromHome = apparentMagnitude(SUN_ABS_MAG_V, sunDist);
    const sunFromCraft = apparentMagnitude(SUN_ABS_MAG_V, norm(d.craft.posPc));
    const sunBrightRank = bright.findIndex((x) => x.star.id === 0) + 1;
    const blist = bright.map((x, i) => `${i + 1}. ${x.star.name ?? x.star.gl ?? `HYG ${x.star.id}`} ${x.appMag.toFixed(2)} (${x.distPc.toFixed(1)} pc)`).join('; ');
    console.log(`[epoch.sunBrightness] ${blist}`);
    console.log(`[epoch.sunBrightness] Sun from Gliese 445 ${sunFromHome.toFixed(2)}, from the craft ${sunFromCraft.toFixed(2)}`);
    const pass = sunBrightRank >= 1 && sunBrightRank <= 10;
    recordCheck({
      id: 'epoch.sunBrightness',
      claim: 'From Gliese 445 at the epoch, the Sun is one of the ten brightest stars in the sky.',
      measured: `Sun magnitude ${sunFromHome.toFixed(2)} from Gliese 445 (rank ${sunBrightRank}), ${sunFromCraft.toFixed(2)} from the craft. Brightest: ${blist}`,
      expected: 'Rank 1 to 10 (PLAN.md "The story frame")',
      tolerance: 'rank <= 10; magnitudes from HYG absolute V magnitudes (the Sun 4.81, Willmer 2018, in place of the HYG value 4.85) and distances at the epoch, no extinction',
      pass,
      notes: `Includes the naked-eye sky list (mag <= 6.5 from Earth) moved to the epoch; ${stars.sky.filter((s) => s.distPc === null).length} sky stars without a distance are skipped (all fainter than mag 3.3 from Earth). Double stars are listed per component. ${catalogueNotes}`,
    });
    expect(sunBrightRank).toBeGreaterThanOrEqual(1);
    expect(sunBrightRank).toBeLessThanOrEqual(10);
  });
});

describe('epoch: the observer and its covariance', () => {
  const t = discoveryState(scenario, stars).decimalYear;
  const home = findHomeStar(scenario, stars);
  const obs = homeObserver(scenario, stars, t);

  it('propagates the Gaia DR3 errors by Jacobian, agreeing with a 20,000-draw Monte Carlo', () => {
    const N = 20_000;
    const rng = createRng('epoch.observer.mc');
    const samples: number[][] = [];
    for (let i = 0; i < N; i++) {
      const plx = home.parallaxMas! + home.parallaxErrMas! * rng.normal();
      const s = starStateAt(
        {
          ...home,
          distPc: 1000 / plx,
          pmraMasYr: home.pmraMasYr + home.pmraErrMasYr! * rng.normal(),
          pmdecMasYr: home.pmdecMasYr + home.pmdecErrMasYr! * rng.normal(),
          rvKmS: home.rvKmS! + home.rvErrKmS! * rng.normal(),
        },
        t,
      );
      samples.push([...s.posPc, ...s.velKmS]);
    }
    const m = [0, 1, 2, 3, 4, 5].map((j) => samples.reduce((a, r) => a + (r[j] as number), 0) / N);
    const cov = (a: number, b: number): number => samples.reduce((acc, r) => acc + ((r[a] as number) - m[a]!) * ((r[b] as number) - m[b]!), 0) / (N - 1);
    // A sample variance from N draws has relative standard error sqrt(2 / N) = 1%; allow 5 of those.
    const tol = 5 * Math.sqrt(2 / N);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(cov(i, i) / obs.posCov[i]![i]! - 1)).toBeLessThan(tol);
      expect(Math.abs(cov(3 + i, 3 + i) / obs.velCov[i]![i]! - 1)).toBeLessThan(tol);
    }
    // Total position and velocity spread (traces).
    const trP = obs.posCov[0]![0]! + obs.posCov[1]![1]! + obs.posCov[2]![2]!;
    const trV = obs.velCov[0]![0]! + obs.velCov[1]![1]! + obs.velCov[2]![2]!;
    console.log(`[epoch.observer] position sigma ${Math.sqrt(trP).toFixed(5)} pc at the epoch, velocity sigma ${Math.sqrt(trV).toFixed(4)} km/s; measurement position sigma ${Math.sqrt(obs.measPosCov![0]![0]! + obs.measPosCov![1]![1]! + obs.measPosCov![2]![2]!).toExponential(3)} pc`);
    // Velocity error is dominated by the radial-velocity error, 0.153 km/s (Gaia DR3).
    expect(Math.abs(Math.sqrt(trV) - home.rvErrKmS!)).toBeLessThan(0.01 * home.rvErrKmS!); // pm terms add < 1%
  });

  it('is deterministic and finds the home star by Gliese name when the HYG id is missing', () => {
    expect(discoveryState(scenario, stars)).toEqual(discoveryState(scenario, stars));
    expect(homeObserver(scenario, stars, t)).toEqual(obs);
    const byGl = findHomeStar({ ...scenario, homeStar: { ...scenario.homeStar, hygId: null } }, stars);
    expect(byGl.id).toBe(home.id);
    expect(() => findHomeStar({ ...scenario, homeStar: { ...scenario.homeStar, hygId: -5, name: 'Nowhere', otherNames: [] } }, stars)).toThrow();
  });

  it('moves stars without radial velocity with v_r = 0 and flags them', () => {
    const s = stars.near.find((x) => x.rvKmS === null && x.id !== 0)!;
    const st = starStateAt(s, 2000 + 10_000);
    expect(st.fullVelocity).toBe(false);
    const sun = starStateAt(stars.near[0]!, 46_000);
    expect(sun.posPc).toEqual([0, 0, 0]);
    expect(sun.fullVelocity).toBe(true);
  });
});
