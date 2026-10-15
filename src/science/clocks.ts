// Radioactive clocks: the uranium spot on the record cover and the RTG fuel.
// Physics and numbers: docs/research/clocks.md sections 4a (uranium spot) and 4b (RTGs).
// Pure and deterministic; randomness only through a passed-in seeded Rng.

import type { Rng } from './random';
import { bisectRoot, chiSquareSf, gridMax, logGrid, normalQuantile, wilsonInterval } from './stats';
import { AVOGADRO, BQ_PER_MICROCURIE, JULIAN_YEAR_S, MEV_J } from './units';
import {
  CHENG2013_HALF_LIVES, NUCLIDES, OXYGEN_G_PER_MOL, RA226_PROGENY_HEAT_MEV, batemanChain, lambdaPerYear, type NuclideId,
} from './nuclides';

/** The general linear-chain Bateman solver lives in nuclides.ts (file size); re-exported here. */
export { batemanChain };

export type HalfLifeSet = Partial<Record<NuclideId, number>>;

function lambdasOf(ids: readonly NuclideId[], hl?: HalfLifeSet): number[] {
  return ids.map((id) => lambdaPerYear(id, hl));
}

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

export interface AgeInterval {
  ageYears: number;
  lo: number;
  hi: number;
}

/**
 * Age from U-234 ingrowth assuming a pure U-238 start. Conditional on the total of the two uranium
 * lines, the U-234 count is binomial with p = R / (1 + R), R = A234/A238; the Wilson score interval
 * for p is mapped through the monotonic two-member Bateman ratio
 * R(t) = l2 / (l2 - l1) (1 - exp(-(l2 - l1) t)).
 */
export function ageFromU234(counts: AlphaCounts, conf = 0.95, halfLives?: HalfLifeSet): AgeInterval & { ratio: number } {
  const l1 = lambdaPerYear('U238', halfLives);
  const l2 = lambdaPerYear('U234', halfLives);
  const d = l2 - l1;
  const tOf = (R: number): number => (R * d >= l2 ? Infinity : -Math.log1p((-R * d) / l2) / d);
  const n = counts.u238 + counts.u234;
  const w = wilsonInterval(counts.u234, n, conf);
  const toR = (p: number): number => (p >= 1 ? Infinity : p / (1 - p));
  const R = counts.u238 > 0 ? counts.u234 / counts.u238 : Infinity;
  return { ageYears: tOf(R), lo: tOf(toR(w.lo)), hi: tOf(toR(w.hi)), ratio: R };
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

// ---------------------------------------------------------------------------------------------
// RTG fuel (clocks.md 4b). Three MHW-RTGs per spacecraft, 24 PuO2 spheres each of 251.5 g, plutonium
// 80 at.% Pu-238 (LA-5202). The other 20 at.% is a documented assumption: split in the proportions of
// the Cassini RTG fuel, "Isotopic Concentration of RTG Fuel" (Pu wt%: Pu-238 83.88, Pu-239 13.49,
// Pu-240 1.9, Pu-241 0.379, Pu-242 0.124; Pu-236 < 1e-6 and "other TRU" 0.228 not modelled),
// https://fti.neep.wisc.edu/fti.neep.wisc.edu/neep602/SPRING00/lecture6.pdf (read 2026-10-15).

export const RTG_DESIGN = { rtgsPerSpacecraft: 3, spheresPerRtg: 24, sphereMassG: 251.5, pu238AtomFraction: 0.8 } as const;
export const CASSINI_PU_WT_PERCENT = { Pu239: 13.49, Pu240: 1.9, Pu241: 0.379, Pu242: 0.124 } as const;

type PuId = 'Pu238' | 'Pu239' | 'Pu240' | 'Pu241' | 'Pu242';
const RTG_CHAINS: readonly (readonly NuclideId[])[] = [
  ['Pu238', 'U234', 'Th230', 'Ra226'], ['Pu239', 'U235'], ['Pu240', 'U236'], ['Pu241', 'Am241', 'Np237'], ['Pu242', 'U238'],
];

/** Plutonium atom fractions: Pu-238 0.80 (LA-5202); the rest in Cassini wt% converted to atoms. */
export function rtgPuAtomFractions(): Record<PuId, number> {
  const rest = Object.entries(CASSINI_PU_WT_PERCENT).map(([id, wt]) => [id, wt / NUCLIDES[id as PuId].massU] as const);
  const sum = rest.reduce((s, [, v]) => s + v, 0);
  const out = { Pu238: RTG_DESIGN.pu238AtomFraction } as Record<PuId, number>;
  for (const [id, v] of rest) out[id as PuId] = ((1 - RTG_DESIGN.pu238AtomFraction) * v) / sum;
  return out;
}

/** Initial plutonium atoms per spacecraft, from sphere mass and the PuO2 molar mass of the mix. */
export function rtgInitialAtoms(): { atoms: Record<PuId, number>; puo2MolarMassG: number; pu238Kg: number } {
  const f = rtgPuAtomFractions();
  const ids = Object.keys(f) as PuId[];
  const puMolar = ids.reduce((s, id) => s + f[id] * NUCLIDES[id].massU, 0);
  const puo2MolarMassG = puMolar + 2 * OXYGEN_G_PER_MOL;
  const moles = (RTG_DESIGN.rtgsPerSpacecraft * RTG_DESIGN.spheresPerRtg * RTG_DESIGN.sphereMassG) / puo2MolarMassG;
  const atoms = {} as Record<PuId, number>;
  for (const id of ids) atoms[id] = moles * f[id] * AVOGADRO;
  return { atoms, puo2MolarMassG, pu238Kg: (atoms.Pu238 * NUCLIDES.Pu238.massU) / AVOGADRO / 1000 };
}

export interface RtgState {
  tYears: number;
  atoms: Record<NuclideId, number>;
  massKg: Record<NuclideId, number>;
  activityBq: Record<NuclideId, number>;
  ratios: {
    th230OverU234Activity: number; th230OverU234Atoms: number; ra226OverTh230Atoms: number;
    u234OverPu238Atoms: number; u238OverU234Atoms: number;
  };
  /** Decay heat per spacecraft, W: alpha Q values, Pu-241 mean beta, Ra-226 progeny in equilibrium. */
  heatW: number;
}

export function rtgState(tYears: number, halfLives?: HalfLifeSet): RtgState {
  const init = rtgInitialAtoms().atoms;
  const atoms = {} as Record<NuclideId, number>;
  for (const chain of RTG_CHAINS) {
    const n0 = chain.map((id, i) => (i === 0 ? init[id as PuId] : 0));
    batemanChain(lambdasOf(chain, halfLives), n0, tYears).forEach((x, i) => { atoms[chain[i] as NuclideId] = x; });
  }
  const massKg = {} as Record<NuclideId, number>;
  const activityBq = {} as Record<NuclideId, number>;
  let heatMeVPerS = 0;
  for (const id of Object.keys(atoms) as NuclideId[]) {
    massKg[id] = (atoms[id] * NUCLIDES[id].massU) / AVOGADRO / 1000;
    activityBq[id] = (atoms[id] * lambdaPerYear(id, halfLives)) / JULIAN_YEAR_S;
    heatMeVPerS += activityBq[id] * NUCLIDES[id].depositedMeV;
  }
  // Progeny of Ra-226 assumed in secular equilibrium (true after about a century; before that the
  // Ra-226 activity is under 1e-6 of the total, so the overestimate is negligible).
  heatMeVPerS += activityBq.Ra226 * RA226_PROGENY_HEAT_MEV;
  return {
    tYears,
    atoms,
    massKg,
    activityBq,
    ratios: {
      th230OverU234Activity: activityBq.Th230 / activityBq.U234,
      th230OverU234Atoms: atoms.Th230 / atoms.U234,
      ra226OverTh230Atoms: atoms.Ra226 / atoms.Th230,
      u234OverPu238Atoms: atoms.U234 / atoms.Pu238,
      u238OverU234Atoms: atoms.U238 / atoms.U234,
    },
    heatW: heatMeVPerS * MEV_J,
  };
}

export interface RtgMeasurement {
  th230OverU234: number;
  ra226OverTh230: number;
  u238OverU234: number;
  relativePrecision: number;
}

/** Mass-spectrometry atom ratios with independent Gaussian relative errors of the given size. */
export function simulateRtgMeasurement(state: RtgState, opts: { relativePrecision: number }, rng: Rng): RtgMeasurement {
  const s = opts.relativePrecision;
  return {
    th230OverU234: state.ratios.th230OverU234Atoms * (1 + s * rng.normal()),
    ra226OverTh230: state.ratios.ra226OverTh230Atoms * (1 + s * rng.normal()),
    u238OverU234: state.ratios.u238OverU234Atoms * (1 + s * rng.normal()),
    relativePrecision: s,
  };
}

export type ChainHypothesis = 'pu238' | 'naturalUranium';

/**
 * Model atom ratios at t: [Th230/U234, Ra226/Th230, U238/U234 or null]. Natural uranium starts with
 * U-234 in secular equilibrium with U-238 (equal activities, so U238/U234 atoms = T238/T234, about
 * 18,200) and no Th or Ra. The Pu-238 hypothesis says nothing about U-238 (other plutonium isotopes,
 * such as Pu-242, may make a little), so it predicts no U238/U234 value.
 */
function chainRatios(h: ChainHypothesis, t: number, hl?: HalfLifeSet): [number, number, number | null] {
  const ids: NuclideId[] = h === 'pu238' ? ['Pu238', 'U234', 'Th230', 'Ra226'] : ['U238', 'U234', 'Th230', 'Ra226'];
  const lam = lambdasOf(ids, hl);
  const n0 = h === 'pu238' ? [1, 0, 0, 0] : [1, (lam[0] as number) / (lam[1] as number), 0, 0];
  const N = batemanChain(lam, n0, t) as [number, number, number, number];
  return [N[2] / N[1], N[3] / N[2], h === 'pu238' ? null : N[0] / N[1]];
}

/** Invert a monotone ratio r(t) on [1, 1e8] years; Infinity above the range, 0 below. */
function invertRatio(r: (t: number) => number, target: number): number {
  const lo = Math.log(1);
  const hi = Math.log(1e8);
  if (target <= r(1)) return 0;
  if (target >= r(1e8)) return Infinity;
  return Math.exp(bisectRoot((u) => r(Math.exp(u)) - target, lo, hi, 200, 1e-13));
}

/**
 * Age from the Th-230/U-234 atom ratio, Pu-238 parent, pure start. The measured ratio is m = R (1 + s z),
 * so R lies in [m / (1 + z s), m / (1 - z s)] with probability conf exactly; mapped through R(t).
 * The half-life systematic is reported separately by re-inverting with the Cheng et al. 2013 set.
 */
export function ageFromTh230U234(m: RtgMeasurement, conf = 0.95): AgeInterval & { ageChengYears: number; halfLifeSystematicYears: number } {
  const z = normalQuantile(1 - (1 - conf) / 2);
  const r = (t: number): number => chainRatios('pu238', t)[0];
  const rC = (t: number): number => chainRatios('pu238', t, CHENG2013_HALF_LIVES)[0];
  const s = m.relativePrecision;
  const age = invertRatio(r, m.th230OverU234);
  const ageCheng = invertRatio(rC, m.th230OverU234);
  return {
    ageYears: age,
    lo: invertRatio(r, m.th230OverU234 / (1 + z * s)),
    hi: z * s >= 1 ? Infinity : invertRatio(r, m.th230OverU234 / (1 - z * s)),
    ageChengYears: ageCheng,
    halfLifeSystematicYears: ageCheng - age,
  };
}

export interface ChainSolution {
  hypothesis: ChainHypothesis;
  /** True when one age fits every ratio the hypothesis predicts (chi-square p-value >= alpha). */
  consistent: boolean;
  bestAgeYears: number;
  chi2: number;
  dof: number;
  pValue: number;
  /** The age each ratio gives on its own; null when no age in 1 to 1e8 years reproduces it. */
  agesByRatio: { th230OverU234: number | null; ra226OverTh230: number | null; u238OverU234: number | null };
}

/**
 * Is there one age that fits all the measured ratios a decay-chain hypothesis predicts?
 * chi2(t) = sum_j ((m_j / f_j(t) - 1) / s)^2 minimised over t, with (number of ratios - 1) dof.
 * Th/U and Ra/Th alone barely separate the hypotheses (once Pu-238 is gone, both are U-234 decaying
 * into Th-230); the decisive ratio is U-238/U-234, which natural uranium fixes at about 18,200.
 */
export function ageSolutions(m: RtgMeasurement, hypothesis: ChainHypothesis, alpha = 0.01): ChainSolution {
  const s = m.relativePrecision;
  const meas = [m.th230OverU234, m.ra226OverTh230, m.u238OverU234];
  const chi2 = (t: number): number =>
    chainRatios(hypothesis, t).reduce<number>((acc, f, j) => (f === null ? acc : acc + (((meas[j] as number) / f - 1) / s) ** 2), 0);
  const best = gridMax((t) => -chi2(t), logGrid(1, 1e8, 321));
  const dof = (hypothesis === 'pu238' ? 2 : 3) - 1;
  const p = chiSquareSf(-best.f, dof);
  const single = (j: number): number | null => {
    if (chainRatios(hypothesis, 1)[j] === null) return null;
    const a = invertRatio((t) => chainRatios(hypothesis, t)[j] as number, meas[j] as number);
    return a > 0 && Number.isFinite(a) ? a : null;
  };
  return {
    hypothesis,
    consistent: p >= alpha,
    bestAgeYears: best.x,
    chi2: -best.f,
    dof,
    pValue: p,
    agesByRatio: { th230OverU234: single(0), ra226OverTh230: single(1), u238OverU234: single(2) },
  };
}
