// axisDeltaChi2: how far an axis on the sky is from the velocity fitted to the map's ages (The Map,
// map.motion). Truth: plain geometry (under an isotropic covariance the best speed along the axis is the
// projection, and the leftover is |v|^2 sin^2(theta) / sigma^2), a brute-force minimum over the speed, and
// the chi-square law itself: over many seeded draws of a fit around a known velocity, the 95% cut contains
// the true axis about 95% of the time. Never the code's own earlier output.
import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { cross, dot, norm, scale, type Vec3 } from './astro';
import { discoveryState, homeObserver } from './epoch';
import { axisDeltaChi2, fitAgeAndVelocity, velocityMahalanobis2, type AgeVelocityFit } from './pulsarAge';
import { OLD_TAU_C_YEARS, mvnDraw, projectPulsar } from './pulsarEpoch';
import { characteristicAgeYears } from './pulsars';
import { createRng } from './random';
import { CHI2_2DOF_95 } from './triangulation';

const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));
/** Turn a about the unit axis k by deg (Rodrigues). */
function turn(a: Vec3, k: Vec3, deg: number): Vec3 {
  const t = (deg * Math.PI) / 180;
  const kxa = cross(k, a);
  return [0, 1, 2].map((i) => (a[i] as number) * Math.cos(t) + (kxa[i] as number) * Math.sin(t) + (k[i] as number) * dot(k, a) * (1 - Math.cos(t))) as unknown as Vec3;
}

// The real fit: the old map lines of the default playthrough's catalogue, as the epoch model fits them.
const cover = loadCover();
const byJ = new Map(loadPulsars().pulsars.map((p) => [p.jname, p]));
const scenario = loadScenario();
const stars = loadStars();
const observer = homeObserver(scenario, stars, discoveryState(scenario, stars).decimalYear);
const entries = cover.pulsarMap.lines
  .map((line) => ({ line, entry: projectPulsar(byJ.get(line.jname)!, observer, { seed: 'finder-1' })! }))
  .filter(({ entry }) => characteristicAgeYears(entry.pObs, entry.pdotMeas as number) >= OLD_TAU_C_YEARS);
const real = fitAgeAndVelocity(entries);

describe('axisDeltaChi2', () => {
  it('is zero along the fitted velocity, rises as the axis turns, matches geometry and a brute-force minimum, and covers 95%', () => {
    const v = real.velKmS as Vec3;
    const along = unit(v);
    const perp = unit(cross(along, [0, 0, 1]));
    const atFit = axisDeltaChi2(real, along);
    const atAnti = axisDeltaChi2(real, scale(along, -1));
    // Rising: strictly increasing from 0 to 45 deg away (beyond that an anisotropic covariance need not keep rising), turning in two different planes.
    const steps = [0, 1, 2, 5, 10, 20, 45];
    let rising = true;
    for (const k of [perp, unit(cross(along, perp))]) {
      const vals = steps.map((d) => axisDeltaChi2(real, turn(along, k, d)));
      rising &&= vals.every((x, i) => i === 0 || x > (vals[i - 1] as number));
    }

    // Isotropic covariance sigma^2 I: the best speed is the projection and the leftover is |v|^2 sin^2 / sigma^2.
    const sigma = 7;
    const iso: AgeVelocityFit = { ...real, velCov: [[sigma ** 2, 0, 0], [0, sigma ** 2, 0], [0, 0, sigma ** 2]] };
    let isoErr = 0;
    for (const d of [3, 11, 37, 90, 140]) {
      const a = turn(along, perp, d);
      const geo = (dot(v, v) * Math.sin((d * Math.PI) / 180) ** 2) / sigma ** 2;
      const proj = velocityMahalanobis2(iso, scale(a, dot(a, v)));
      isoErr = Math.max(isoErr, Math.abs(axisDeltaChi2(iso, a) - geo) / geo, Math.abs(axisDeltaChi2(iso, a) - proj) / proj);
    }

    // The real (anisotropic) covariance: the closed form equals the minimum over a fine grid of speeds.
    let bruteErr = 0;
    for (const d of [4, 15, 60]) {
      const a = turn(along, perp, d);
      let min = Infinity;
      for (let s = -400; s <= 400; s += 0.01) min = Math.min(min, velocityMahalanobis2(real, scale(a, s)));
      bruteErr = Math.max(bruteErr, Math.abs(axisDeltaChi2(real, a) - min) / min);
    }

    // Calibration: fits drawn around a known velocity with the real covariance; the true axis passes the 95% cut.
    const rng = createRng('map.motionAxis/coverage');
    const trials = 4000;
    let inside = 0;
    for (let k = 0; k < trials; k++) {
      const dv = mvnDraw(real.velCov, rng);
      const drawn: AgeVelocityFit = { ...real, velKmS: [v[0] + dv[0], v[1] + dv[1], v[2] + dv[2]] };
      if (axisDeltaChi2(drawn, along) <= CHI2_2DOF_95) inside++;
    }
    const coverage = inside / trials;
    // Three binomial standard errors of a 95% rate over 4,000 trials: 3 sqrt(0.95 x 0.05 / 4000) = 0.0103.
    const tol = 3 * Math.sqrt((0.95 * 0.05) / trials);
    const sig = real.velCov.map((r, i) => Math.sqrt(r[i] as number));
    console.log(`axisDeltaChi2: ${atFit.toExponential(2)} at the fit, ${atAnti.toExponential(2)} at its antipode; iso error ${isoErr.toExponential(2)}; brute error ${bruteErr.toExponential(2)}; coverage ${coverage.toFixed(4)}; velocity sigmas ${sig.map((x) => x.toFixed(1)).join(', ')} km/s`);
    // 1e-9: rounding in a 3x3 inverse of (km/s)^2 numbers; 1e-6 relative: the brute grid's 0.01 km/s step.
    const pass = atFit < 1e-9 && atAnti < 1e-9 && rising && isoErr < 1e-9 && bruteErr < 1e-6 && Math.abs(coverage - 0.95) <= tol;
    recordCheck({
      id: 'map.motionAxis',
      claim: 'The Map judges an axis the player drags on the sky by how far it is from the velocity fitted to the map\'s ages: the smallest chi-square over the speed along the axis.',
      measured: `0 along the fitted velocity and its antipode (${atFit.toExponential(1)}), rising as the axis turns away in two planes; ${(coverage * 100).toFixed(1)}% of ${trials} seeded fits keep the true axis inside the 95% cut`,
      expected: 'Geometry: under an isotropic covariance the value is |v|^2 sin^2(angle) / sigma^2 and equals the Mahalanobis distance of the projected velocity; a brute-force minimum over the speed; the chi-square law with 2 degrees of freedom (95%)',
      tolerance: `Relative error under 1e-9 against geometry, under 1e-6 against a 0.01 km/s speed grid; coverage within 3 binomial standard errors (${(tol * 100).toFixed(2)} points) of 95%`,
      pass,
      notes: `The covariance is the real fit's (velocity sigmas ${sig.map((x) => x.toFixed(1)).join(', ')} km/s, ICRS axes); the cut is the 2-degree-of-freedom 95% chi-square, ${CHI2_2DOF_95.toFixed(3)}, because an axis has two angles.`,
    });
    expect(pass).toBe(true);
  });
});
