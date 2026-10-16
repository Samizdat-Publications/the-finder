import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import {
  ageFromTh230U234, ageFromU234, ageSolutions, fitAgeAndPurity, rtgState, simulateAlphaCounts, simulateRtgMeasurement,
  testStartHypothesis, uraniumSpotState,
} from './clocks';
import { createRng } from './random';

// Coverage acceptance: with N = 1,000 trials the binomial standard error of a 95% coverage is
// sqrt(0.95 x 0.05 / 1000) = 0.69%, so 93% to 97% is about +/- 3 standard errors (spec, M1 step 4).
const N = 1000;
const rel = (a: number, b: number): number => Math.abs(a / b - 1);
const fmt = (y: number): string => (Math.abs(y) >= 10 ? y.toFixed(0) : y.toFixed(2));
const ACCEPT = { lo: 0.93, hi: 0.97 };

function coverage(trial: (i: number) => boolean): number {
  let hits = 0;
  for (let i = 0; i < N; i++) if (trial(i)) hits++;
  return hits / N;
}

describe('clocks: calibration of the uranium-spot clock', () => {
  const cases = [
    { id: 'clocks.uranium.coverage49', t: 49, countingTimeS: 30 * 86_400, label: '49 years, 30-day count' },
    { id: 'clocks.uranium.coverage44k', t: 44_000, countingTimeS: 3600, label: '44,000 years, 1-hour count' },
  ];
  for (const c of cases) {
    it(`95% intervals cover the true age about 95% of the time at ${c.label}`, () => {
      const state = uraniumSpotState(c.t);
      const rng = createRng(c.id);
      const widths: number[] = [];
      const cov = coverage((i) => {
        const counts = simulateAlphaCounts(state, { countingTimeS: c.countingTimeS, efficiency: 0.3 }, rng.fork(`trial${i}`));
        const a = ageFromU234(counts);
        widths.push(a.hi - a.lo);
        return a.lo <= c.t && c.t <= a.hi;
      });
      widths.sort((x, y) => x - y);
      const median = widths[Math.floor(widths.length / 2)] as number;
      const sys = ageFromU234({
        u238: state.activityBq.U238, u234: state.activityBq.U234, th230: 0, countingTimeS: 1, efficiency: 1,
      }).halfLifeSystematic;
      const pass = cov >= ACCEPT.lo && cov <= ACCEPT.hi;
      recordCheck({
        id: c.id,
        claim: `Counting the spot's alpha particles (${c.label}, 30% efficient detector) gives an age range that contains the true age 95% of the time.`,
        measured: `coverage ${(cov * 100).toFixed(1)}% over ${N} seeded trials; median 95% interval width ${median.toPrecision(3)} years`,
        expected: '95% (Wilson score interval on the U-234 fraction, mapped through the Bateman ratio)',
        tolerance: '93% to 97% (3 binomial standard errors for 1,000 trials)',
        pass,
        notes:
          'Pure U-238 start assumed; uranium and thorium separated before counting; same efficiency for every line. ' +
          `Separate half-life systematic (1 sigma, LNHB): +/- ${fmt(sys.totalYears)} y (U-234 ${fmt(sys.parts.U234 ?? 0)} y, U-238 ${(sys.parts.U238 ?? 0).toExponential(1)} y).`,
      });
      expect(cov).toBeGreaterThanOrEqual(ACCEPT.lo);
      expect(cov).toBeLessThanOrEqual(ACCEPT.hi);
    });
  }

  it('tells a pure start from natural uranium using the second isotope', () => {
    // 200 trials at 44,000 y (1-hour count). Under the true (pure) start the LR p-value is at least
    // uniform (conservative at the boundary r0 = 0), so p < 0.01 has probability <= 1%; 98% of 200
    // allows 4 failures (Bin(200, 0.005..0.01) exceeds 4 with probability 0.4% to 5%).
    const state = uraniumSpotState(44_000);
    const rng = createRng('clocks.uranium.purity');
    const trials = 200;
    let accepted = 0;
    let maxNaturalP = 0;
    for (let i = 0; i < trials; i++) {
      const counts = simulateAlphaCounts(state, { countingTimeS: 3600, efficiency: 0.3 }, rng.fork(`trial${i}`));
      if (testStartHypothesis(counts, 0).pValue > 0.01) accepted++;
      maxNaturalP = Math.max(maxNaturalP, testStartHypothesis(counts, 1).pValue);
    }
    const one = simulateAlphaCounts(state, { countingTimeS: 3600, efficiency: 0.3 }, rng.fork('fit'));
    const fit = fitAgeAndPurity(one);
    const young = fitAgeAndPurity(simulateAlphaCounts(uraniumSpotState(49), { countingTimeS: 30 * 86_400, efficiency: 0.3 }, rng.fork('young')));
    const pass = accepted >= 0.98 * trials && maxNaturalP < 1e-6 && fit.determinable && fit.lo <= 44_000 && 44_000 <= fit.hi && !young.determinable;
    recordCheck({
      id: 'clocks.uranium.purity',
      claim: 'Thorium-230 checks the starting assumption: "began as pure uranium-238" passes, "began as purified natural uranium" fails decisively.',
      measured:
        `pure start accepted (p > 0.01) in ${accepted}/${trials} trials; natural-uranium start: largest p ${maxNaturalP.toExponential(1)}; ` +
        `free fit of age and starting U-234 (one trial): ${fit.ageYears.toFixed(0)} y (${fit.lo.toFixed(0)} to ${fit.hi.toFixed(0)}), starting A234/A238 ${fit.initialA234overA238.toPrecision(2)}; ` +
        `at 49 y: ${young.reason}`,
      expected: 'pure start accepted at least 98% of the time; natural uranium (initial A234/A238 = 1) rejected with p < 1e-6 every time',
      tolerance: 'likelihood-ratio test, chi-square 1 dof (conservative at the boundary)',
      pass,
    });
    expect(accepted).toBeGreaterThanOrEqual(0.98 * trials);
    expect(maxNaturalP).toBeLessThan(1e-6);
    expect(fit.determinable).toBe(true);
    expect(fit.lo).toBeLessThanOrEqual(44_000);
    expect(fit.hi).toBeGreaterThanOrEqual(44_000);
    expect(young.determinable).toBe(false);
  });
});

describe('clocks: calibration of the RTG clock', () => {
  it('95% intervals from Th-230/U-234 at 1% precision cover the truth about 95% of the time', () => {
    const t = 44_000;
    const state = rtgState(t);
    const rng = createRng('clocks.rtg.coverage');
    const halfWidths: number[] = [];
    const cov = coverage((i) => {
      const m = simulateRtgMeasurement(state, { relativePrecision: 0.01 }, rng.fork(`trial${i}`));
      const a = ageFromTh230U234(m);
      halfWidths.push((a.hi - a.lo) / 2);
      return a.lo <= t && t <= a.hi;
    });
    // Half-life systematic at the true ratio (noise-free measurement).
    const exact = ageFromTh230U234({ th230OverU234: state.ratios.th230OverU234Atoms, ra226OverTh230: 0, u238OverU234: 0, relativePrecision: 0.01 });
    const sys = exact.halfLifeSystematic;
    const sysC = exact.halfLifeSystematicCheng;
    // Science audit (2026-10-15) computed independently about 137 y (LNHB: U-234 +131.5, Th-230 -38.7)
    // and about 29 y (Cheng 2013) at 44,100 y; allow 10% for "about" and the 100-year epoch difference.
    const sysOk = rel(sys.totalYears, 137) < 0.1 && rel(sysC.totalYears, 29) < 0.1;
    const pass = cov >= ACCEPT.lo && cov <= ACCEPT.hi && sysOk;
    recordCheck({
      id: 'clocks.rtg.coverage',
      claim: 'The thorium clock in the heat source, measured to 1%, gives an age range that contains the true age 95% of the time.',
      measured:
        `coverage ${(cov * 100).toFixed(1)}% over ${N} seeded trials; typical 95% statistical half-width ${(halfWidths[0] as number).toFixed(0)} years; ` +
        `separate half-life systematic +/- ${sys.totalYears.toFixed(0)} years (1 sigma, LNHB)`,
      expected: '95% coverage; half-life systematic about 137 y (LNHB) and 29 y (Cheng 2013), science audit',
      tolerance: '93% to 97% (3 binomial standard errors for 1,000 trials); systematic within 10% of the audit value',
      pass,
      notes:
        `Half-life systematic, 1 sigma, propagated per nuclide: LNHB U-234 ${(sys.parts.U234 ?? 0).toFixed(1)} y, Th-230 ${(sys.parts.Th230 ?? 0).toFixed(1)} y, ` +
        `Pu-238 ${(sys.parts.Pu238 ?? 0).toFixed(2)} y, total ${sys.totalYears.toFixed(1)} y; with the Cheng et al. 2013 set (1 sigma = half their 2 sigma) ` +
        `${sysC.totalYears.toFixed(1)} y. Cross-check only: the LNHB and Cheng central ages differ by ${exact.chengCrossCheckYears.toFixed(1)} y, because on ` +
        "the atom ratio the U-234 and Th-230 shifts nearly cancel (the research's 103 y is for the activity ratio).",
    });
    expect(sysOk).toBe(true);
    expect(cov).toBeGreaterThanOrEqual(ACCEPT.lo);
    expect(cov).toBeLessThanOrEqual(ACCEPT.hi);
  });

  it('finds no consistent age for the wrong decay chain', () => {
    const rng = createRng('clocks.rtg.wrongChain');
    const m = simulateRtgMeasurement(rtgState(44_000), { relativePrecision: 0.01 }, rng);
    const right = ageSolutions(m, 'pu238');
    const wrong = ageSolutions(m, 'naturalUranium');
    const pass = right.consistent && !wrong.consistent && wrong.pValue < 1e-6;
    recordCheck({
      id: 'clocks.rtg.wrongChain',
      claim: 'Assume the uranium-234 came from natural uranium and no age fits the measurements; assume it came from plutonium-238 and one age fits them all.',
      measured:
        `plutonium-238 parent: best age ${right.bestAgeYears.toFixed(0)} y, chi2 ${right.chi2.toFixed(2)} (${right.dof} dof), p ${right.pValue.toFixed(2)}; ` +
        `natural uranium: chi2 ${wrong.chi2.toExponential(2)} (${wrong.dof} dof), p ${wrong.pValue.toExponential(1)}`,
      expected: 'true chain consistent (p >= 0.01); natural-uranium hypothesis rejected (p < 1e-6)',
      tolerance: 'chi-square test of the measured atom ratios at 1% precision',
      pass,
      notes:
        'Th-230/U-234 and Ra-226/Th-230 alone barely separate the two chains (both ages land near 44,000 to 48,000 years); ' +
        'the decisive evidence is the missing U-238, which natural uranium would carry at 18,200 times the U-234.',
    });
    expect(right.consistent).toBe(true);
    expect(wrong.consistent).toBe(false);
    expect(wrong.pValue).toBeLessThan(1e-6);
  });
});
