// Radioactive clocks: the uranium spot on the record cover (the RTG fuel clock is in rtg.ts, re-exported).
// Physics and numbers: docs/research/clocks.md sections 4a (uranium spot) and 4b (RTGs).
// Pure and deterministic; randomness only through a passed-in seeded Rng.

import type { Rng } from './random';
import { bisectRoot, chiSquareSf, gridMax, logGrid, normalQuantile, wilsonInterval } from './stats';
import { AVOGADRO, BQ_PER_MICROCURIE, JULIAN_YEAR_S } from './units';
import {
  NUCLIDES, batemanChain, lambdaPerYear, lambdasOf, propagateHalfLives, sigmaOf,
  type AgeInterval, type HalfLifeSet, type HalfLifeSystematic, type NuclideId,
} from './nuclides';

/** The Bateman solver and the half-life helpers live in nuclides.ts; the RTG clock in rtg.ts. Re-exported here. */
export { batemanChain, propagateHalfLives };
export type { AgeInterval, HalfLifeSet, HalfLifeSystematic } from './nuclides';
export * from './rtg';

// ---------------------------------------------------------------------------------------------
// Uranium spot (clocks.md 4a). 0.00026 uCi of U-238 electroplated on a 2 cm spot (NASA-GRC), assumed
// isotopically pure at t = 0 (NASA's "ultra-pure"; a documented assumption). Th-234 (24 d) and
// Pa-234m (1.2 min) reach equilibrium with U-238 within months and change nothing measured here, so
// the chain is modelled as U-238 -> U-234 -> Th-230 -> Ra-226.

/** Initial U-238 activity of the spot, Bq: 0.00026 uCi x 37,000 Bq/uCi = 9.62 Bq (clocks.md 4a). */
export const SPOT_ACTIVITY_BQ = 0.00026 * BQ_PER_MICROCURIE;
const U_CHAIN: readonly NuclideId[] = ['U238', 'U234', 'Th230', 'Ra226'];

export interface UraniumSpotState {
  tYears: number;
  atoms: Record<'U238' | 'U234' | 'Th230' | 'Ra226', number>;
  activityBq: Record<'U238' | 'U234' | 'Th230' | 'Ra226', number>;
  ratios: { a234over238: number; a230over238: number; a226over238: number };
  massU238G: number;
}

export function uraniumSpotState(
  tYears: number,
  opts: { initialA234overA238?: number; halfLives?: HalfLifeSet } = {},
): UraniumSpotState {
  const lam = lambdasOf(U_CHAIN, opts.halfLives);
  const perSecond = lam.map((l) => l / JULIAN_YEAR_S);
  const n238 = SPOT_ACTIVITY_BQ / (perSecond[0] as number);
  const n234 = ((opts.initialA234overA238 ?? 0) * SPOT_ACTIVITY_BQ) / (perSecond[1] as number);
  const N = batemanChain(lam, [n238, n234, 0, 0], tYears);
  const A = N.map((x, i) => x * (perSecond[i] as number));
  const [N1, N2, N3, N4] = N as [number, number, number, number];
  const [A1, A2, A3, A4] = A as [number, number, number, number];
  return {
    tYears,
    atoms: { U238: N1, U234: N2, Th230: N3, Ra226: N4 },
    activityBq: { U238: A1, U234: A2, Th230: A3, Ra226: A4 },
    ratios: { a234over238: A2 / A1, a230over238: A3 / A1, a226over238: A4 / A1 },
    massU238G: (N1 * NUCLIDES.U238.massU) / AVOGADRO,
  };
}

export interface AlphaCounts {
  u238: number;
  u234: number;
  th230: number;
  countingTimeS: number;
  efficiency: number;
}

/**
 * Poisson counts in the U-238, U-234 and Th-230 alpha lines. Assumes uranium and thorium are
 * separated chemically before counting (clocks.md 4a), so Ra-226's 4.784 MeV line cannot sit under
 * U-234's 4.775 MeV line, and that the detector efficiency is the same for all three lines.
 */
export function simulateAlphaCounts(
  state: UraniumSpotState,
  opts: { countingTimeS: number; efficiency: number },
  rng: Rng,
): AlphaCounts {
  const k = opts.countingTimeS * opts.efficiency;
  return {
    u238: rng.poisson(state.activityBq.U238 * k),
    u234: rng.poisson(state.activityBq.U234 * k),
    th230: rng.poisson(state.activityBq.Th230 * k),
    countingTimeS: opts.countingTimeS,
    efficiency: opts.efficiency,
  };
}

/**
 * Age from U-234 ingrowth assuming a pure U-238 start. Conditional on the total of the two uranium
 * lines, the U-234 count is binomial with p = R / (1 + R), R = A234/A238; the Wilson score interval
 * for p is mapped through the monotonic two-member Bateman ratio
 * R(t) = l2 / (l2 - l1) (1 - exp(-(l2 - l1) t)).
 */
export function ageFromU234(
  counts: AlphaCounts,
  conf = 0.95,
  halfLives?: HalfLifeSet,
): AgeInterval & { ratio: number; halfLifeSystematic: HalfLifeSystematic } {
  const tOfWith = (hl: HalfLifeSet | undefined, R: number): number => {
    const l1 = lambdaPerYear('U238', hl);
    const l2 = lambdaPerYear('U234', hl);
    const d = l2 - l1;
    return R * d >= l2 ? Infinity : -Math.log1p((-R * d) / l2) / d;
  };
  const n = counts.u238 + counts.u234;
  const w = wilsonInterval(counts.u234, n, conf);
  const toR = (p: number): number => (p >= 1 ? Infinity : p / (1 - p));
  const R = counts.u238 > 0 ? counts.u234 / counts.u238 : Infinity;
  return {
    ageYears: tOfWith(halfLives, R),
    lo: tOfWith(halfLives, toR(w.lo)),
    hi: tOfWith(halfLives, toR(w.hi)),
    ratio: R,
    // LNHB 1-sigma half-lives of U-234 and U-238 (nuclides.ts), propagated at the central ratio.
    halfLifeSystematic: propagateHalfLives((hl) => tOfWith(hl, R), sigmaOf(['U234', 'U238']), halfLives ?? {}),
  };
}

// --- three-line likelihood: unknown age and initial A234/A238 (r0) ---------------------------------

/** Line activities (U-238, U-234, Th-230) at t from a unit pure start (a) and per unit of r0 (b). */
function lineModel(t: number, hl?: HalfLifeSet): { a: number[]; b: number[] } {
  const lam = lambdasOf(U_CHAIN, hl);
  const l1 = lam[0] as number;
  const l2 = lam[1] as number;
  const na = batemanChain(lam, [1, 0, 0, 0], t);
  const nb = batemanChain(lam, [0, l1 / l2, 0, 0], t);
  return { a: [0, 1, 2].map((i) => (na[i] as number) * (lam[i] as number)), b: [0, 1, 2].map((i) => (nb[i] as number) * (lam[i] as number)) };
}

function multinomialLogLik(c: readonly number[], A: readonly number[]): number {
  const S = A.reduce((s, x) => s + x, 0);
  let L = 0;
  for (let i = 0; i < c.length; i++) {
    const ci = c[i] as number;
    if (ci === 0) continue;
    const ai = A[i] as number;
    if (ai <= 0) return -Infinity;
    L += ci * Math.log(ai / S);
  }
  return L;
}

const AGE_GRID = logGrid(1e-2, 1e7, 181); // years
const R0_GRID = logGrid(1e-9, 1e3, 61); // initial A234/A238

function profileR0(c: readonly number[], m: { a: number[]; b: number[] }): number {
  const L = (r: number): number => multinomialLogLik(c, m.a.map((ai, i) => ai + r * (m.b[i] as number)));
  const best = gridMax(L, R0_GRID);
  return Math.max(best.f, L(0));
}

function countsVector(counts: AlphaCounts): number[] {
  return [counts.u238, counts.u234, counts.th230];
}

export interface PurityFit {
  determinable: boolean;
  reason: string;
  ageYears: number;
  lo: number;
  hi: number;
  initialA234overA238: number;
  pureStartPValue: number;
}

/**
 * Two unknowns (age and initial A234/A238) from the three lines by maximum likelihood (multinomial
 * conditional on the total), with a profile-likelihood interval on the age (Wilks: 2 dlnL <= chi2_1).
 * "Not determinable" when that interval reaches age 0 or the edge of the grid (1e7 y): then the
 * Th-230 line holds too few counts to separate the age from the starting U-234.
 */
export function fitAgeAndPurity(counts: AlphaCounts, conf = 0.95): PurityFit {
  const c = countsVector(counts);
  const prof = (t: number): number => profileR0(c, lineModel(t));
  const best = gridMax(prof, AGE_GRID);
  const crit = Math.pow(normalQuantile(1 - (1 - conf) / 2), 2) / 2;
  const excess = (t: number): number => best.f - prof(t) - crit;
  let lo = 0;
  let hi = Infinity;
  const below = AGE_GRID.filter((t) => t < best.x).reverse();
  let prev = best.x;
  for (const t of below) {
    if (excess(t) > 0) { lo = Math.exp(bisectRoot((u) => excess(Math.exp(u)), Math.log(t), Math.log(prev), 60)); break; }
    prev = t;
  }
  prev = best.x;
  for (const t of AGE_GRID.filter((x) => x > best.x)) {
    if (excess(t) > 0) { hi = Math.exp(bisectRoot((u) => excess(Math.exp(u)), Math.log(prev), Math.log(t), 60)); break; }
    prev = t;
  }
  const m = lineModel(best.x);
  const r0fit = gridMax((r) => multinomialLogLik(c, m.a.map((ai, i) => ai + r * (m.b[i] as number))), R0_GRID);
  const r0 = multinomialLogLik(c, m.a) >= r0fit.f ? 0 : r0fit.x;
  const determinable = lo > 0 && Number.isFinite(hi);
  return {
    determinable,
    reason: determinable
      ? 'age and starting U-234 both fixed by the three lines'
      : `not determinable: ${counts.th230} Th-230 counts cannot separate the age from the starting U-234`,
    ageYears: best.x,
    lo,
    hi,
    initialA234overA238: r0,
    pureStartPValue: testStartHypothesis(counts, 0).pValue,
  };
}

/**
 * Likelihood-ratio test of a fixed starting ratio A234/A238 = r0 against the free fit (age and
 * r0 >= 0). The statistic is referred to chi-square with 1 dof; when the true r0 is 0 (on the
 * boundary) the true null distribution is a 50:50 mix of 0 and chi2_1, so this p-value is conservative.
 */
export function testStartHypothesis(counts: AlphaCounts, initialA234overA238: number): { statistic: number; pValue: number; ageYears: number } {
  const c = countsVector(counts);
  const full = gridMax((t) => profileR0(c, lineModel(t)), AGE_GRID);
  const fixed = gridMax((t) => {
    const m = lineModel(t);
    return multinomialLogLik(c, m.a.map((ai, i) => ai + initialA234overA238 * (m.b[i] as number)));
  }, AGE_GRID);
  const stat = Math.max(0, 2 * (full.f - fixed.f));
  return { statistic: stat, pValue: chiSquareSf(stat, 1), ageYears: fixed.x };
}
