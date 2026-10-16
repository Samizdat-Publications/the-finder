// The RTG fuel clock: what the plutonium heat sources turn into, their heat, the Th-230/U-234 age and
// the wrong-decay-chain check. Physics and numbers: docs/research/clocks.md section 4b.
// Pure and deterministic; randomness only through a passed-in seeded Rng. Re-exported by clocks.ts.

import type { Rng } from './random';
import { bisectRoot, chiSquareSf, gridMax, logGrid, normalQuantile } from './stats';
import { AVOGADRO, JULIAN_YEAR_S, MEV_J } from './units';
import {
  CHENG2013_HALF_LIVES, CHENG2013_SIGMA_2, NUCLIDES, OXYGEN_G_PER_MOL, RA226_PROGENY_HEAT_MEV, batemanChain, lambdaPerYear,
  lambdasOf, propagateHalfLives, sigmaOf, type AgeInterval, type HalfLifeSet, type HalfLifeSystematic, type NuclideId,
} from './nuclides';

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
  /**
   * Decay heat per spacecraft, W: alpha Q values, Pu-241 mean beta, Ra-226 progeny in equilibrium
   * with radon retained (the top of heatRangeW).
   */
  heatW: number;
  /**
   * Heat range, W. high: radon retained, so the Ra-226 progeny add their 28 MeV per decay. low: radon
   * escapes, progeny heat lost. Both depend on the Cassini split of the non-238 plutonium, which sets
   * the Pu-239 share (pu239HeatW).
   */
  heatRangeW: { low: number; high: number };
  radonProgenyHeatW: number;
  pu239HeatW: number;
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
  const progenyMeVPerS = activityBq.Ra226 * RA226_PROGENY_HEAT_MEV;
  heatMeVPerS += progenyMeVPerS;
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
    heatRangeW: { low: (heatMeVPerS - progenyMeVPerS) * MEV_J, high: heatMeVPerS * MEV_J },
    radonProgenyHeatW: progenyMeVPerS * MEV_J,
    pu239HeatW: activityBq.Pu239 * NUCLIDES.Pu239.depositedMeV * MEV_J,
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
 * Reported separately, next to that statistical interval: the half-life systematic, propagating the
 * LNHB 1-sigma uncertainties of U-234, Th-230 and Pu-238 (and, as an alternative, the Cheng et al.
 * 2013 set with its 1-sigma, half the quoted 2-sigma). The difference between the LNHB and Cheng
 * central ages is only a cross-check.
 */
export function ageFromTh230U234(
  m: RtgMeasurement,
  conf = 0.95,
): AgeInterval & {
  halfLifeSystematic: HalfLifeSystematic;
  halfLifeSystematicYears: number;
  halfLifeSystematicCheng: HalfLifeSystematic;
  ageChengYears: number;
  chengCrossCheckYears: number;
} {
  const z = normalQuantile(1 - (1 - conf) / 2);
  const ageWith = (hl: HalfLifeSet): number => invertRatio((t) => chainRatios('pu238', t, hl)[0], m.th230OverU234);
  const r = (t: number): number => chainRatios('pu238', t)[0];
  const s = m.relativePrecision;
  const age = ageWith({});
  const ageCheng = ageWith(CHENG2013_HALF_LIVES);
  const lnhb = propagateHalfLives(ageWith, sigmaOf(['U234', 'Th230', 'Pu238']));
  const chengSig = Object.fromEntries(Object.entries(CHENG2013_SIGMA_2).map(([k, v]) => [k, (v as number) / 2]));
  const cheng = propagateHalfLives(ageWith, chengSig, CHENG2013_HALF_LIVES);
  return {
    ageYears: age,
    lo: invertRatio(r, m.th230OverU234 / (1 + z * s)),
    hi: z * s >= 1 ? Infinity : invertRatio(r, m.th230OverU234 / (1 - z * s)),
    halfLifeSystematic: lnhb,
    halfLifeSystematicYears: lnhb.totalYears,
    halfLifeSystematicCheng: cheng,
    ageChengYears: ageCheng,
    chengCrossCheckYears: ageCheng - age,
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
