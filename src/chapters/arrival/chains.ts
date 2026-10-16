// The decay clock's candidate chains: each predicts the thorium-230 to uranium-234 atom ratio (and the
// radium-226 to thorium-230 and uranium-238 to uranium-234 ratios) as a function of age. Only the
// plutonium-238 chain is the craft's; the others are what an honest finder might try. Pure.
// Physics: docs/research/clocks.md 4b; half-lives from nuclides.ts (LNHB and NNDC).

import { ageFromTh230U234, ageSolutions, type RtgMeasurement } from '../../science/clocks';
import { NUCLIDES, batemanChain, lambdaPerYear, lambdasOf, type NuclideId } from '../../science/nuclides';
import { bisectRoot } from '../../science/stats';

export type ChainId = 'pu238' | 'naturalUranium' | 'u234Start' | 'oldOre';

export interface ChainRatios {
  th230OverU234: number;
  ra226OverTh230: number;
  /** null when the chain says nothing about uranium-238. */
  u238OverU234: number | null;
}

/** Natural uranium's U-238/U-234 atom ratio in secular equilibrium: T238 / T234 (equal activities), about 18,200. */
export const NATURAL_U238_OVER_U234 = NUCLIDES.U238.halfLifeYears / NUCLIDES.U234.halfLifeYears;

const lam = (id: NuclideId): number => lambdaPerYear(id);

/** Model ratios of a chain at age t (years). */
export function chainRatios(chain: ChainId, t: number): ChainRatios {
  switch (chain) {
    case 'pu238': {
      // Pure Pu-238 at t = 0 (the fuel as made).
      const N = batemanChain(lambdasOf(['Pu238', 'U234', 'Th230', 'Ra226']), [1, 0, 0, 0], t);
      return { th230OverU234: N[2]! / N[1]!, ra226OverTh230: N[3]! / N[2]!, u238OverU234: null };
    }
    case 'naturalUranium': {
      // Freshly purified natural uranium: U-234 in equilibrium with U-238, no thorium or radium yet.
      const N = batemanChain(lambdasOf(['U238', 'U234', 'Th230', 'Ra226']), [1, lam('U238') / lam('U234'), 0, 0], t);
      return { th230OverU234: N[2]! / N[1]!, ra226OverTh230: N[3]! / N[2]!, u238OverU234: N[0]! / N[1]! };
    }
    case 'u234Start': {
      // Uranium-234 alone at t = 0, with no parent.
      const N = batemanChain(lambdasOf(['U234', 'Th230', 'Ra226']), [1, 0, 0], t);
      return { th230OverU234: N[1]! / N[0]!, ra226OverTh230: N[2]! / N[1]!, u238OverU234: null };
    }
    case 'oldOre':
      // Ore never processed: the whole series in secular equilibrium, so every ratio is fixed by the
      // half-lives (atoms in proportion to half-life) and does not change with age.
      return {
        th230OverU234: lam('U234') / lam('Th230'),
        ra226OverTh230: lam('Th230') / lam('Ra226'),
        u238OverU234: NATURAL_U238_OVER_U234,
      };
  }
}

/** Age at which the chain's Th-230/U-234 reaches the target, on 1 to 1e7 years; null if it never does. */
export function ageWhereThU(chain: ChainId, target: number): number | null {
  const f = (t: number): number => chainRatios(chain, t).th230OverU234 - target;
  const lo = 1;
  const hi = 1e7;
  const flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  return Math.exp(bisectRoot((u) => f(Math.exp(u)), Math.log(lo), Math.log(hi), 200, 1e-13));
}

/** A curve for the plot: ages (years) and the chain's Th-230/U-234. */
export function chainCurve(chain: ChainId, maxYears: number, n = 121): { t: number; r: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = Math.max(1, (i / (n - 1)) * maxYears);
    return { t, r: chainRatios(chain, t).th230OverU234 };
  });
}

export interface ChainVerdict {
  chain: ChainId;
  /** Where the curve meets the measured Th-230/U-234, years, or null if it never does. */
  ageYears: number | null;
  /** The chain's Ra-226/Th-230 at that age and its distance from the measurement, in measurement sigmas. */
  raThPredicted: number | null;
  raThPull: number | null;
  /** The chain's U-238/U-234 and how many orders of magnitude it is from the measurement. */
  u238Predicted: number | null;
  u238OrdersOff: number | null;
  /** Chi-square check of every ratio the chain predicts (ageSolutions), for the two chains the science module covers. */
  chi2: number | null;
  pValue: number | null;
  /** The plutonium chain's age and its 95% interval, with the half-life systematics (ageFromTh230U234). */
  dating: ReturnType<typeof ageFromTh230U234> | null;
}

/** Everything the decay clock says about one chain against the measurement. */
export function judgeChain(chain: ChainId, m: RtgMeasurement): ChainVerdict {
  const age = ageWhereThU(chain, m.th230OverU234);
  const at = age === null ? null : chainRatios(chain, age);
  const raTh = at?.ra226OverTh230 ?? null;
  const u238 = chainRatios(chain, age ?? 1).u238OverU234;
  const sol = chain === 'pu238' || chain === 'naturalUranium' ? ageSolutions(m, chain === 'pu238' ? 'pu238' : 'naturalUranium') : null;
  return {
    chain,
    ageYears: age,
    raThPredicted: raTh,
    raThPull: raTh === null ? null : (m.ra226OverTh230 / raTh - 1) / m.relativePrecision,
    u238Predicted: u238,
    u238OrdersOff: u238 === null ? null : Math.log10(u238 / m.u238OverU234),
    chi2: sol?.chi2 ?? null,
    pValue: sol?.pValue ?? null,
    dating: chain === 'pu238' ? ageFromTh230U234(m) : null,
  };
}
