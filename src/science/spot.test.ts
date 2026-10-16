import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { ageFromU234, uraniumSpotState } from './clocks';
import { createRng } from './random';
import {
  COUNTING_STANDOFF_MM, DETECTOR_AREA_MM2, DETECTOR_BACKGROUND_PER_S, DETECTOR_RADIUS_MM, DETECTOR_RESOLUTION_KEV, SWEEP_STANDOFF_MM,
  alphaLineMeV, buildSweepModel, clockAges, countingEfficiency, countingSession, discSolidAngle, naturalStartRatio,
  onAxisFraction, spotAlphaBq, sweepRate, sweepSampler, u234RatioAt,
} from './spot';

// The story epoch's age is about 44,100 years (PLAN.md; epoch.ts computes it from the scenario). The tests
// below use that round figure as the spot's true age; nothing here depends on its exact value.
const AGE = 44_100;
const state = uraniumSpotState(AGE);
const total = spotAlphaBq(state);
// data/spot.json: a 20 mm diameter spot (NASA, docs/research/cover.md 1e).
const RS = 10;
const geo = { spotRadiusMm: RS, standoffMm: SWEEP_STANDOFF_MM, detectorRadiusMm: DETECTOR_RADIUS_MM };
const sweep = buildSweepModel(total, geo, { maxMm: 300 });

/** Independent check: seeded Monte Carlo of the sweep geometry (uniform disc source, isotropic emission, detector disc at height h). */
function monteCarloFraction(rMm: number, n: number, seed: string): number {
  const rng = createRng(seed);
  let hits = 0;
  const h = SWEEP_STANDOFF_MM;
  const R2 = DETECTOR_RADIUS_MM ** 2;
  for (let i = 0; i < n; i++) {
    const rho = RS * Math.sqrt(rng.uniform());
    const a = 2 * Math.PI * rng.uniform();
    const sx = rho * Math.cos(a);
    const sy = rho * Math.sin(a);
    const cz = 2 * rng.uniform() - 1; // isotropic: cos(theta) uniform on [-1, 1]
    if (cz <= 0) continue;
    const ph = 2 * Math.PI * rng.uniform();
    const st = Math.sqrt(1 - cz * cz);
    const t = h / cz;
    const x = sx + t * st * Math.cos(ph) - rMm;
    const y = sy + t * st * Math.sin(ph);
    if (x * x + y * y <= R2) hits++;
  }
  return hits / n;
}

describe('the alpha detector over the spot', () => {
  it('matches the on-axis closed form and an independent Monte Carlo (spot.detector.onAxis)', () => {
    // A point source on the axis: the disc's solid angle is 2 pi (1 - h / sqrt(h^2 + R^2)) exactly.
    const errs: number[] = [];
    for (const h of [1, 5, 24]) {
      const closed = (2 * Math.PI * (1 - h / Math.hypot(h, DETECTOR_RADIUS_MM))) / (4 * Math.PI);
      errs.push(Math.abs(discSolidAngle(0, h, DETECTOR_RADIUS_MM) / (4 * Math.PI) / closed - 1));
      errs.push(Math.abs(discSolidAngle(1e-9, h, DETECTOR_RADIUS_MM) / (4 * Math.PI) / closed - 1));
    }
    // The table built for a tiny source reproduces the closed form at r = 0 (0.01 mm disc: its size changes the fraction by < 1e-6).
    const tiny = buildSweepModel(1, { ...geo, spotRadiusMm: 0.01 }, { maxMm: 10 });
    const tinyErr = Math.abs(sweepRate(tiny, 0) / onAxisFraction(SWEEP_STANDOFF_MM, DETECTOR_RADIUS_MM) - 1);
    // Continuity across the detector's edge (the two branches of discSolidAngle meet there).
    const R = DETECTOR_RADIUS_MM;
    const edgeJump = Math.abs(discSolidAngle(R - 1e-6, 5, R) / discSolidAngle(R + 1e-6, 5, R) - 1);
    // Monte Carlo of the whole geometry (2,000,000 emissions each): 1-sigma relative error sqrt((1 - p) / (p N)), tolerance 4 sigma.
    const N = 2_000_000;
    const mc = [0, 15, 30].map((r) => {
      const p = monteCarloFraction(r, N, `spot-mc-${r}`);
      const model = sweepRate(sweep, r) / total;
      const sigma = Math.sqrt((1 - p) / (p * N));
      return { r, p, model, rel: Math.abs(model / p - 1), tol: 4 * sigma };
    });
    const pass = Math.max(...errs) < 1e-6 && tinyErr < 1e-4 && edgeJump < 1e-4 && mc.every((x) => x.rel < x.tol);
    recordCheck({
      id: 'spot.detector.onAxis',
      claim: 'The detector model counts the right share of the spot\'s alphas: it matches the exact formula for a point on the axis and a brute-force simulation of the whole spot.',
      measured:
        `point on axis: worst relative error ${Math.max(...errs).toExponential(1)} (h = 1, 5, 24 mm); tiny-source table at r = 0: ${tinyErr.toExponential(1)}; ` +
        `edge continuity ${edgeJump.toExponential(1)}; Monte Carlo fraction vs model at r = ${mc.map((x) => `${x.r} mm: ${x.p.toFixed(5)} vs ${x.model.toFixed(5)}`).join(', ')}`,
      expected: 'the closed form (1 - h / sqrt(h^2 + R^2)) / 2 for a point on the axis of a disc; an independent seeded Monte Carlo (uniform disc source, isotropic emission) of the 20 mm spot under the 450 mm^2 detector at 5 mm',
      tolerance: 'closed form 1e-6 (quadrature error); tiny-source table 1e-4 (its 0.01 mm size and interpolation); Monte Carlo 4 standard errors, sqrt((1 - p) / (p N)) with N = 2e6 (about 0.5%)',
      pass,
      notes: `Detector: ${DETECTOR_AREA_MM2} mm^2 (radius ${DETECTOR_RADIUS_MM.toFixed(2)} mm), stand-off ${SWEEP_STANDOFF_MM} mm (D-A24). The deposit is about 0.13 micrometre thick (clocks.md 4a), so no self-absorption.`,
    });
    expect(Math.max(...errs)).toBeLessThan(1e-6);
    expect(tinyErr).toBeLessThan(1e-4);
    expect(edgeJump).toBeLessThan(1e-4);
    for (const x of mc) expect(x.rel).toBeLessThan(x.tol);
  });

  it('falls off as a point source far away (spot.detector.farField)', () => {
    const h = SWEEP_STANDOFF_MM;
    // Far off to the side the detector faces the cover, so the flux through it is A cos(theta) / (4 pi d^2) = A h / (4 pi d^3):
    // 1/r^3 in the lateral offset. The finite sizes of spot and detector add, to second order, (Rs^2 + Rd^2) / 8 times the 2D
    // Laplacian of (r^2 + h^2)^(-3/2) (average of the Taylor term over two uniform discs); the next term is of order 1e-4 at 200 mm.
    const f = (r: number): number => Math.pow(r * r + h * h, -1.5);
    const lap = (r: number): number => -6 * Math.pow(r * r + h * h, -2.5) + 15 * r * r * Math.pow(r * r + h * h, -3.5);
    const rows = [150, 200, 250].map((r) => {
      const point = (total * DETECTOR_AREA_MM2 * h * f(r)) / (4 * Math.PI);
      const corrected = point * (1 + ((RS ** 2 + DETECTOR_RADIUS_MM ** 2) / 8) * (lap(r) / f(r)));
      const model = sweepRate(sweep, r);
      return { r, model, point, rel: Math.abs(model / corrected - 1), relPoint: Math.abs(model / point - 1) };
    });
    // Along the axis, far above: 1/r^2, the solid angle tends to A / H^2 (next term 3 R^2 / (4 H^2), 1.1e-4 at 1 m).
    const H = 1000;
    const axis = discSolidAngle(0, H, DETECTOR_RADIUS_MM) / (DETECTOR_AREA_MM2 / (H * H));
    const pass = rows.every((x) => x.rel < 1e-3) && Math.abs(axis - 1) < 2e-4;
    recordCheck({
      id: 'spot.detector.farField',
      claim: 'Far from the spot the count rate falls off exactly as for a point source: the inverse cube of the distance off to the side (the detector faces the plate), the inverse square straight above.',
      measured: `${rows.map((x) => `r = ${x.r} mm: model ${x.model.toExponential(4)} /s, point source ${x.point.toExponential(4)} /s (${(x.relPoint * 100).toFixed(2)}% apart; ${(x.rel * 100).toFixed(3)}% after the size term)`).join('; ')}; on axis at 1 m, solid angle / (A / H^2) = ${axis.toFixed(6)}`,
      expected: 'point source A h / (4 pi d^3) with the second-order size term (hand derivation, in the test); A / (4 pi H^2) on the axis',
      tolerance: '0.1% with the size term (third order is about 1e-4); 2e-4 on the axis (the next term, 3 R^2 / 4 H^2 = 1.1e-4)',
      pass,
      notes: 'The spec asked for 1/r^2 far away. That holds straight above the detector; off to the side the detector is face-on to the plate, so a cos(theta) = h / d factor makes it 1/r^3. Both are tested.',
    });
    for (const x of rows) expect(x.rel).toBeLessThan(1e-3);
    expect(Math.abs(axis - 1)).toBeLessThan(2e-4);
  });

  it('sweep counts are seeded Poisson with the background', () => {
    const a = sweepSampler(sweep, createRng('s').fork('spot').fork('sweep'));
    const b = sweepSampler(sweep, createRng('s').fork('spot').fork('sweep'));
    const path = [0, 3, 8, 40, 120, 0];
    expect(path.map((r) => a.sample(r, 0.2))).toEqual(path.map((r) => b.sample(r, 0.2)));
    // Mean over 20,000 one-second dwells at the centre within 4 standard errors of rate + background.
    const s = sweepSampler(sweep, createRng('mean'));
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) sum += s.sample(0, 1);
    const mu = sweepRate(sweep, 0) + DETECTOR_BACKGROUND_PER_S;
    expect(Math.abs(sum / n - mu)).toBeLessThan(4 * Math.sqrt(mu / n));
  });
});

describe('the counting session', () => {
  it('is deterministic and only ever adds counts (spot.counting.deterministic)', () => {
    const mk = (seed: string) => countingSession(state, createRng(seed).fork('spot').fork('count'));
    const times = [1, 30, 600, 3599, 3600, 3601, 7300, 86_400, 864_000];
    const a = mk('finder-1');
    const forward = times.map((t) => a.countsAt(t));
    const b = mk('finder-1');
    const backward = [...times].reverse().map((t) => b.countsAt(t)).reverse();
    const sameAnyOrder = JSON.stringify(forward) === JSON.stringify(backward);
    const again = times.map((t) => a.countsAt(t));
    const repeatable = JSON.stringify(forward) === JSON.stringify(again);
    let monotone = true;
    for (let i = 1; i < forward.length; i++) {
      const p = forward[i - 1]!;
      const q = forward[i]!;
      if (q.u238 < p.u238 || q.u234 < p.u234 || q.th230 < p.th230) monotone = false;
    }
    // Fine steps through one quantum's end: never decreasing.
    let prev = a.countsAt(3500);
    for (let t = 3500; t <= 3700; t += 7) {
      const c = a.countsAt(t);
      if (c.u238 < prev.u238 || c.u234 < prev.u234 || c.th230 < prev.th230) monotone = false;
      prev = c;
    }
    const other = mk('finder-2').countsAt(86_400);
    const differs = other.u238 !== forward[7]!.u238;
    // The efficiency is the geometry's: a point source on the axis at the detector's diameter, (1 - 2 / sqrt(5)) / 2.
    const eff = countingEfficiency();
    const effClosed = (1 - 2 / Math.sqrt(5)) / 2;
    // Mean of 400 one-hour sessions within 4 standard errors of activity x efficiency x time (Poisson).
    let s238 = 0;
    for (let i = 0; i < 400; i++) s238 += mk(`mean-${i}`).countsAt(3600).u238;
    const mu = state.activityBq.U238 * eff * 3600;
    const meanOk = Math.abs(s238 / 400 - mu) < 4 * Math.sqrt(mu / 400);
    const pass = sameAnyOrder && repeatable && monotone && differs && Math.abs(eff / effClosed - 1) < 1e-12 && meanOk;
    recordCheck({
      id: 'spot.counting.deterministic',
      claim: 'The alpha counter is honest and repeatable: the same playthrough always gives the same counts at the same counting time, however the player got there, and counting longer only ever adds counts.',
      measured:
        `seed finder-1 at 1 day: ${forward[7]!.u238} U-238, ${forward[7]!.u234} U-234, ${forward[7]!.th230} Th-230; same counts in any order of queries: ${sameAnyOrder}; ` +
        `never decreasing over ${times.length} times and 29 steps across a quantum's end: ${monotone}; another seed differs: ${differs}; efficiency ${eff.toFixed(6)}; ` +
        `mean U-238 in an hour over 400 seeds ${(s238 / 400).toFixed(1)} against ${mu.toFixed(1)}`,
      expected: `efficiency (1 - 2 / sqrt 5) / 2 = ${effClosed.toFixed(6)} (point source at a spacing equal to the detector's diameter, alpha-detector.md); Poisson mean activity x efficiency x time`,
      tolerance: 'exact for determinism and monotonicity; efficiency 1e-12; the mean within 4 standard errors (sqrt(mu / 400))',
      pass,
    });
    expect(sameAnyOrder).toBe(true);
    expect(repeatable).toBe(true);
    expect(monotone).toBe(true);
    expect(differs).toBe(true);
    expect(eff).toBeCloseTo(effClosed, 12);
    expect(meanOk).toBe(true);
  });

  it('gives 95% intervals that contain the true age about 95% of the time (spot.counting.coverage)', () => {
    // N = 1,000 one-hour sessions; binomial standard error of a 95% coverage is 0.69%, so 93% to 97% is about 3 standard errors (as clocks.calibration.test.ts).
    const N = 1000;
    let inside = 0;
    for (let i = 0; i < N; i++) {
      const a = ageFromU234(countingSession(state, createRng(`cov-${i}`).fork('spot').fork('count')).countsAt(3600));
      if (a.lo <= AGE && AGE <= a.hi) inside++;
    }
    const cov = inside / N;
    recordCheck({
      id: 'spot.counting.coverage',
      claim: 'The age interval the counter gives after an hour of counting contains the spot\'s true age about 95% of the time.',
      measured: `${inside} of ${N} one-hour counts contain the true age (${(cov * 100).toFixed(1)}%)`,
      expected: '95% (the interval\'s stated confidence)',
      tolerance: '93% to 97% (3 binomial standard errors for 1,000 trials)',
      pass: cov >= 0.93 && cov <= 0.97,
    });
    expect(cov).toBeGreaterThanOrEqual(0.93);
    expect(cov).toBeLessThanOrEqual(0.97);
  });

  it('derives the alpha lines, the natural start and the clocks from the nuclear data (spot.lines)', () => {
    // Research values (docs/research/clocks.md 4a, LNHB and NNDC): U-238 4.198, U-234 4.775, Th-230 4.687 MeV.
    const research = { U238: 4.198, U234: 4.775, Th230: 4.687 } as const;
    const lines = (Object.keys(research) as (keyof typeof research)[]).map((id) => ({ id, e: alphaLineMeV(id), want: research[id] }));
    const nat = naturalStartRatio();
    // A pure start read back through the clocks: both give the true age. Natural uranium's U-234 clock never reaches 0.117.
    const exact = { u238: 1e9, u234: Math.round(1e9 * state.ratios.a234over238), th230: Math.round(1e9 * state.ratios.a230over238), countingTimeS: 1, efficiency: 1 };
    const pure = clockAges(exact, 0);
    const natural = clockAges(exact, nat);
    // How much the background matters in the counter: 0.05 /h/cm^2 over 3 to 8 MeV, in a +/- 2 FWHM window per line.
    const windowFrac = (4 * DETECTOR_RESOLUTION_KEV) / 5000;
    const bgPerLinePerS = DETECTOR_BACKGROUND_PER_S * windowFrac;
    const th230PerS = state.activityBq.Th230 * countingEfficiency();
    const pass =
      lines.every((l) => Math.abs(l.e - l.want) < 0.001) && Math.abs(nat - 1) < 1e-12 &&
      Math.abs(pure.u234Years! / AGE - 1) < 1e-4 && Math.abs(pure.th230Years! / AGE - 1) < 1e-3 && natural.u234Years === null &&
      Math.abs(u234RatioAt(AGE) / state.ratios.a234over238 - 1) < 1e-9;
    recordCheck({
      id: 'spot.lines',
      claim: 'The counter\'s alpha energies, the natural starting ratio and both clocks come from the nuclear data, not typed in.',
      measured:
        `${lines.map((l) => `${l.id} ${l.e.toFixed(4)} MeV`).join(', ')}; natural start A234/A238 = ${nat.toFixed(12)}; pure start read back: U-234 clock ${pure.u234Years!.toFixed(1)} y, Th-230 clock ${pure.th230Years!.toFixed(1)} y; ` +
        `natural start U-234 clock: ${natural.u234Years === null ? 'never' : natural.u234Years}; background in a line's energy band ${(bgPerLinePerS * 86400).toExponential(2)} counts/day against ${(th230PerS * 86400).toFixed(0)} Th-230 counts/day`,
      expected: `alpha lines 4.198, 4.775, 4.687 MeV (clocks.md 4a); secular equilibrium gives an activity ratio of 1; the true age ${AGE} y`,
      tolerance: '1 keV on the lines (the mass-number approximation is good to about 0.1 keV); 1e-12 on the ratio; 1e-4 and 1e-3 on the clocks (counts rounded to integers of 1e9)',
      pass,
      notes: 'Each line\'s counts include its weaker companion (U-238 4.151, U-234 4.722, Th-230 4.621 MeV): the clocks need only how many alphas each nuclide gives. The background is ignored in the counter: it is under a ten-thousandth of the smallest line.',
    });
    for (const l of lines) expect(Math.abs(l.e - l.want)).toBeLessThan(0.001);
    expect(nat).toBeCloseTo(1, 12);
    expect(pure.u234Years! / AGE).toBeCloseTo(1, 4);
    expect(Math.abs(pure.th230Years! / AGE - 1)).toBeLessThan(1e-3);
    expect(natural.u234Years).toBeNull();
    expect(bgPerLinePerS / th230PerS).toBeLessThan(1e-4);
    expect(COUNTING_STANDOFF_MM).toBeCloseTo(2 * DETECTOR_RADIUS_MM, 12);
  });
});
