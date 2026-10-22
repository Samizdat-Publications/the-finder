import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import {
  acceptedStartRange, ageFromTh230U234, ageFromU234, ageSolutions, fitAgeAndPurity, rtgState, simulateAlphaCounts, simulateRtgMeasurement,
  startCriticalValue, testStartHypothesis, uraniumSpotState,
} from './clocks';
import { createRng } from './random';
import { wilsonInterval } from './stats';
import { countingSession, naturalStartRatio } from './spot';

// Coverage acceptance: with N = 1,000 trials the binomial standard error of a 95% coverage is
// sqrt(0.95 x 0.05 / 1000) = 0.69%, so 93% to 97% is about +/- 3 standard errors (spec, M1 step 4).
const N = 1000;
const rel = (a: number, b: number): number => Math.abs(a / b - 1);
const fmt = (y: number): string => (Math.abs(y) >= 10 ? y.toFixed(0) : y.toFixed(2));
const ACCEPT = { lo: 0.93, hi: 0.97 };

// --- Independent half-life systematic (does not use the module's propagateHalfLives or solver) ---
// LNHB 1-sigma half-lives, years (docs/research/clocks.md 4a, 4b): U-238 4.468(5)e9, U-234 2.455(6)e5,
// Th-230 7.538(30)e4, Pu-238 87.74(3). Cheng et al. 2013: U-234 245,620, Th-230 75,584, 1 sigma = half
// the quoted 2 sigma (260 and 110 y).
const LNHB = { U238: [4.468e9, 0.005e9], U234: [2.455e5, 600], Th230: [7.538e4, 300], Pu238: [87.74, 0.03] } as const;
const Z95 = 1.959963984540054; // two-sided 95% normal quantile

function bisect(f: (x: number) => number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  const fa = Math.sign(f(a));
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (a + b);
    if (Math.sign(f(m)) === fa) a = m;
    else b = m;
  }
  return 0.5 * (a + b);
}

/** Textbook Bateman (sum of exponentials) Th-230/U-234 atom ratio from pure Pu-238; fine at t >> 100 y. */
function puThU(t: number, T1: number, T2: number, T3: number): number {
  const l1 = Math.LN2 / T1;
  const l2 = Math.LN2 / T2;
  const l3 = Math.LN2 / T3;
  const N2 = (l1 / (l2 - l1)) * (Math.exp(-l1 * t) - Math.exp(-l2 * t));
  const N3 =
    l1 * l2 *
    (Math.exp(-l1 * t) / ((l2 - l1) * (l3 - l1)) + Math.exp(-l2 * t) / ((l1 - l2) * (l3 - l2)) + Math.exp(-l3 * t) / ((l1 - l3) * (l2 - l3)));
  return N3 / N2;
}

type HL = Record<string, number>;
const hl = (T: HL, k: string): number => T[k] as number;

/** Age from a Th/U atom ratio with given half-lives, by bisection on [1,000, 1e6] y. */
function puAge(ratio: number, T: HL): number {
  return bisect((t) => puThU(t, hl(T, 'Pu238'), hl(T, 'U234'), hl(T, 'Th230')) - ratio, 1e3, 1e6);
}

/** U-234 ingrowth age from A234/A238 by the closed-form two-member inversion. */
function uAge(R: number, T: HL): number {
  const l1 = Math.LN2 / hl(T, 'U238');
  const l2 = Math.LN2 / hl(T, 'U234');
  return -Math.log(1 - (R * (l2 - l1)) / l2) / (l2 - l1);
}

/** 1-sigma systematic: half the age change for T +/- sigma, per nuclide, in quadrature. */
function fdSystematic(ageOf: (T: HL) => number, base: HL, sig: HL): number {
  let s2 = 0;
  for (const [k, sg] of Object.entries(sig)) {
    const d = (ageOf({ ...base, [k]: hl(base, k) + sg }) - ageOf({ ...base, [k]: hl(base, k) - sg })) / 2;
    s2 += d * d;
  }
  return Math.sqrt(s2);
}

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
      const R = state.ratios.a234over238;
      const indep = fdSystematic((T) => uAge(R, T), { U238: LNHB.U238[0], U234: LNHB.U234[0] }, { U238: LNHB.U238[1], U234: LNHB.U234[1] });
      // Module and independent recomputation must agree to 1% (same definition, different code).
      const sysOk = rel(sys.totalYears, indep) < 0.01;
      const stat95 = median / 2;
      const sys95 = Z95 * sys.totalYears;
      const pass = cov >= ACCEPT.lo && cov <= ACCEPT.hi && sysOk;
      recordCheck({
        id: c.id,
        claim: `Counting the spot's alpha particles (${c.label}, 30% efficient detector) gives an age range that contains the true age 95% of the time.`,
        measured:
          `coverage ${(cov * 100).toFixed(1)}% over ${N} seeded trials; at 95%: statistical half-width ${fmt(stat95)} y (median), ` +
          `half-life systematic ${fmt(sys95)} y, combined in quadrature ${fmt(Math.hypot(stat95, sys95))} y`,
        expected:
          `95% coverage (Wilson score interval mapped through the Bateman ratio); half-life systematic ${fmt(indep)} y (1 sigma) by ` +
          'independent finite-difference recomputation from the LNHB half-life uncertainties',
        tolerance: '93% to 97% coverage (3 binomial standard errors for 1,000 trials); systematic within 1% of the recomputation',
        pass,
        notes:
          'Pure U-238 start assumed; uranium and thorium separated before counting; same efficiency for every line. ' +
          `Half-life systematic 1 sigma (LNHB): ${fmt(sys.totalYears)} y (U-234 ${fmt(sys.parts.U234 ?? 0)} y, U-238 ${(sys.parts.U238 ?? 0).toExponential(1)} y); x 1.96 for 95%.`,
      });
      expect(sysOk).toBe(true);
      expect(cov).toBeGreaterThanOrEqual(ACCEPT.lo);
      expect(cov).toBeLessThanOrEqual(ACCEPT.hi);
    });
  }

  it('tells a pure start from natural uranium using the second isotope', () => {
    // 200 trials at 44,000 y (1-hour count). Under the true (pure) start the boundary p-value (Chernoff
    // mixture, clocks.ts startPValue) is asymptotically uniform, so p < 0.01 has probability about 1%; 98% of 200
    // allows 4 failures (Bin(200, 0.01) exceeds 4 with probability 5%).
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
      tolerance: 'likelihood-ratio test; pure start on the boundary: Chernoff mixture 1/2 chi2_0 + 1/2 chi2_1',
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

describe('clocks: the purity test is calibrated at the boundary (Chernoff mixture)', () => {
  it('refuses a truly pure start at its stated rate (5% and 0.1%), never accepts natural uranium, and the 95% range matches the test', () => {
    // The Spot's own counting (spot.ts countingSession: the real detector's efficiency, hour quanta), one day,
    // TRIALS seeded sessions of a truly pure spot 44,100 years old. A pure start sits on the boundary r0 = 0, where the
    // likelihood-ratio statistic follows 1/2 chi2_0 + 1/2 chi2_1 (Chernoff 1954); clocks.ts startPValue uses that
    // mixture, so a level-alpha test should refuse the truth at alpha. Both levels the game uses are checked on the
    // same sessions: 5% (the drawn range) and 0.1% (acceptance, D-A28 amended 2026-10-22). Referred to plain chi2_1
    // (the old p-value) the 5% test refused 2.7% (half its level), which the 5% band below excludes.
    const state = uraniumSpotState(44_100);
    const DAY = 86_400;
    const TRIALS = 20_000;
    const NATURAL_TRIALS = 2_000;
    const crit95 = startCriticalValue(0.05, true); // 2.706: chi2_1 at 0.90
    const crit999 = startCriticalValue(0.001, true); // 9.550: chi2_1 at 0.998
    let refused95 = 0;
    let refused999 = 0;
    let pAgrees = true;
    let naturalAccepted = 0;
    let naturalStatMin = Infinity;
    const his: number[] = [];
    let rangeOk = true;
    let openAtZero = 0;
    for (let i = 0; i < TRIALS; i++) {
      const c = countingSession(state, createRng(`clocks.uranium.purity05/${i}`)).countsAt(DAY);
      const t = testStartHypothesis(c, 0);
      if (t.statistic > crit95) refused95++;
      if (t.statistic > crit999) refused999++;
      // The p-value and the critical value say the same thing (away from the cut itself).
      if (Math.abs(t.statistic - crit999) > 1e-6) pAgrees &&= (t.pValue < 0.001) === (t.statistic > crit999);
      if (i < NATURAL_TRIALS) {
        const n = testStartHypothesis(c, naturalStartRatio());
        if (n.pValue >= 0.001) naturalAccepted++;
        naturalStatMin = Math.min(naturalStatMin, n.statistic);
      }
      if (i < 20) {
        // The 95% range's edges against the test itself: just inside accepted, just outside refused (1e-5 in r0).
        const r = acceptedStartRange(c, 0.05);
        his.push(r.hi);
        rangeOk &&= testStartHypothesis(c, r.hi - 1e-5).pValue >= 0.05 && testStartHypothesis(c, r.hi + 1e-5).pValue < 0.05;
        rangeOk &&= r.zeroAccepted === (t.pValue >= 0.05);
        if (r.lo === 0 && !r.zeroAccepted) openAtZero++;
        rangeOk &&= r.lo === 0 ? testStartHypothesis(c, 1e-7).pValue >= 0.05 : testStartHypothesis(c, r.lo - 1e-5).pValue < 0.05;
      }
    }
    // Binomial bands: TRIALS x alpha expected, +/- 3 binomial standard errors sqrt(TRIALS alpha (1 - alpha)).
    const band = (alpha: number): [number, number] => {
      const mu = TRIALS * alpha;
      const sd = Math.sqrt(mu * (1 - alpha));
      return [mu - 3 * sd, mu + 3 * sd];
    };
    const b95 = band(0.05);
    const b999 = band(0.001);
    const w999 = wilsonInterval(refused999, TRIALS, 0.95);
    // Natural uranium's p-value underflows double precision; its log10 from the statistic (chi2_1 tail
    // 2 Phi(-z) ~ 2 phi(z) / z, z = sqrt(statistic), the leading term of the Mills ratio, good to 1/z^2 this far out).
    const zN = Math.sqrt(naturalStatMin);
    const log10NatP = (Math.log(2) - (zN * zN) / 2 - 0.5 * Math.log(2 * Math.PI) - Math.log(zN)) / Math.LN10;
    his.sort((x, y) => x - y);
    const ok95 = refused95 >= b95[0] && refused95 <= b95[1];
    const ok999 = refused999 >= b999[0] && refused999 <= b999[1];
    const pass = ok95 && ok999 && pAgrees && naturalAccepted === 0 && rangeOk;
    console.log(
      `[purity] pure start refused at 5%: ${refused95}/${TRIALS} (band ${b95[0].toFixed(0)} to ${b95[1].toFixed(0)}); at 0.1%: ${refused999}/${TRIALS} ` +
        `(band ${b999[0].toFixed(1)} to ${b999[1].toFixed(1)}; Wilson 95% ${(w999.lo * 100).toFixed(3)}% to ${(w999.hi * 100).toFixed(3)}%); ` +
        `natural accepted ${naturalAccepted}/${NATURAL_TRIALS}, smallest statistic ${naturalStatMin.toFixed(0)} (p about 10^${log10NatP.toFixed(0)}); ` +
        `95% range upper edge median ${his[10]!.toFixed(4)}; open at 0 in ${openAtZero}/20`,
    );
    const common = `The Spot's counting session (spot.ts countingSession, detector efficiency 0.0528), one day at 44,100 years; seeds clocks.uranium.purity05/0 to /${TRIALS - 1} (the first ${NATURAL_TRIALS} also test natural uranium).`;
    recordCheck({
      id: 'clocks.uranium.purity05',
      claim: 'The purity test\'s drawn 95% range is calibrated at the boundary: with the Chernoff mixture p-value it refuses a truly pure spot 5% of the time, and the range of starts it accepts is computed exactly.',
      measured: `pure start outside the 95% range in ${refused95} of ${TRIALS} one-day counts (${((refused95 / TRIALS) * 100).toFixed(2)}%); accepted starts run from 0 up to ${his[0]!.toFixed(3)} to ${his[19]!.toFixed(3)} (median ${his[10]!.toFixed(3)}) over 20 sessions, open at 0 in ${openAtZero}`,
      expected: '5% refused (boundary critical value 2.706 = chi2_1 at 0.90, Chernoff 1954; plain chi2_1 would give 2.5%); each range edge where the test\'s p-value crosses 0.05',
      tolerance: `${b95[0].toFixed(0)} to ${b95[1].toFixed(0)} refusals (5% of ${TRIALS} +/- 3 binomial standard errors); edges to 1e-5 in the starting ratio`,
      pass: ok95 && rangeOk,
      notes: common,
    });
    recordCheck({
      id: 'clocks.uranium.purity999',
      claim: 'The purity test accepts a start consistent with the counts at the 99.9% level (D-A28): a truly pure spot is refused about 1 time in 1,000, and natural uranium never passes after a day\'s count.',
      measured: `pure start refused in ${refused999} of ${TRIALS} one-day counts (${((refused999 / TRIALS) * 100).toFixed(3)}%, Wilson 95% ${(w999.lo * 100).toFixed(3)}% to ${(w999.hi * 100).toFixed(3)}%); natural uranium (A234/A238 ${naturalStartRatio().toFixed(3)}) accepted in ${naturalAccepted} of ${NATURAL_TRIALS}, smallest statistic ${naturalStatMin.toFixed(0)}, p about 10^${log10NatP.toFixed(0)}`,
      expected: '0.1% refused (boundary critical value 9.550 = chi2_1 at 0.998, Chernoff 1954); natural uranium refused (p < 0.001) every time',
      tolerance: `${b999[0].toFixed(1)} to ${b999[1].toFixed(1)} refusals (0.1% of ${TRIALS} +/- 3 binomial standard errors)`,
      pass: ok999 && pAgrees && naturalAccepted === 0,
      notes: common,
    });
    expect(pass).toBe(true);
  }, 900_000);
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
    // Independent recomputation: textbook Bateman ratio, bisection, half-lives moved by +/- 1 sigma.
    const ratio = state.ratios.th230OverU234Atoms;
    const ageOf = (T: HL): number => puAge(ratio, T);
    const base = { Pu238: LNHB.Pu238[0], U234: LNHB.U234[0], Th230: LNHB.Th230[0] };
    const indep = fdSystematic(ageOf, base, { Pu238: LNHB.Pu238[1], U234: LNHB.U234[1], Th230: LNHB.Th230[1] });
    const indepC = fdSystematic(ageOf, { Pu238: LNHB.Pu238[0], U234: 245_620, Th230: 75_584 }, { U234: 130, Th230: 55 });
    // Module and independent recomputation must agree to 1% (same definition, different code).
    const sysOk = rel(sys.totalYears, indep) < 0.01 && rel(sysC.totalYears, indepC) < 0.01;
    halfWidths.sort((x, y) => x - y);
    const stat95 = halfWidths[Math.floor(halfWidths.length / 2)] as number;
    const sys95 = Z95 * sys.totalYears;
    const pass = cov >= ACCEPT.lo && cov <= ACCEPT.hi && sysOk;
    recordCheck({
      id: 'clocks.rtg.coverage',
      claim: 'The thorium clock in the heat source, measured to 1%, gives an age range that contains the true age 95% of the time.',
      measured:
        `coverage ${(cov * 100).toFixed(1)}% over ${N} seeded trials; at 95%: statistical half-width ${stat95.toFixed(0)} y (median), ` +
        `half-life systematic ${sys95.toFixed(0)} y, combined in quadrature ${Math.hypot(stat95, sys95).toFixed(0)} y`,
      expected:
        `95% coverage; half-life systematic ${indep.toFixed(1)} y (1 sigma, LNHB) and ${indepC.toFixed(1)} y (Cheng et al. 2013) by ` +
        'independent finite-difference recomputation (textbook Bateman ratio, half-lives moved by +/- 1 sigma)',
      tolerance: '93% to 97% coverage (3 binomial standard errors for 1,000 trials); systematic within 1% of the recomputation',
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
