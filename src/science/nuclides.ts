// Nuclear data for the decay clocks: half-lives with 1-sigma uncertainties, atomic masses, decay
// modes and the energy each decay leaves behind as heat.
//
// Sources (keys as in docs/research/clocks.md "Sources"):
// - LNHB recommended values (Laboratoire National Henri Becquerel tables, http://www.lnhb.fr/nuclides/),
//   as quoted in clocks.md 4a and 4b for U-238, U-234, Th-230, Ra-226 and Pu-238.
// - NNDC NuDat 3 ENSDF decay datasets (https://www.nndc.bnl.gov/nudat3/decaysearchdirect.jsp?nuc=...),
//   read 2026-10-15, for every other half-life and for all Q values and mean beta/gamma energies.
//   The dataset reference is given per entry.
// - Atomic masses: AME2020 (Wang et al. 2021, Chinese Physics C 45, 030003), in unified atomic mass
//   units; quoted to 1e-6 u, far beyond what any ratio here needs.
// - Alternative half-lives: Cheng et al. 2013, EPSL 371-372, 82 (doi:10.1016/j.epsl.2013.04.006).
//
// Energy model for decay heat ("depositedMeV"): an alpha decay deposits its full Q value locally
// (alpha particle plus recoil nucleus; the few-percent gamma/conversion share also stays in a
// kilogram-scale heat source). A beta decay deposits its mean beta energy plus its mean gamma, X-ray
// and electron energy; the antineutrino's share escapes and is excluded.

export type NuclideId =
  | 'U238' | 'U234' | 'Th230' | 'Ra226'
  | 'Pu238' | 'Pu239' | 'Pu240' | 'Pu241' | 'Pu242'
  | 'Am241' | 'U235' | 'U236' | 'Np237';

export interface Nuclide {
  id: NuclideId;
  name: string;
  /** Half-life, years. */
  halfLifeYears: number;
  /** 1-sigma uncertainty of the half-life, years. */
  halfLifeSigmaYears: number;
  /** Atomic mass, u (AME2020). */
  massU: number;
  decay: 'alpha' | 'beta-';
  /** Ground-state Q value of the listed decay, MeV. */
  qMeV: number;
  /** Heat left in the source per decay of this nuclide alone, MeV (see the energy model above). */
  depositedMeV: number;
  source: string;
}

export const NUCLIDES: Readonly<Record<NuclideId, Nuclide>> = {
  U238: { id: 'U238', name: 'uranium-238', halfLifeYears: 4.468e9, halfLifeSigmaYears: 0.005e9, massU: 238.050787, decay: 'alpha', qMeV: 4.2697, depositedMeV: 4.2697,
    source: 'T1/2 LNHB 4.468(5)e9 y (clocks.md 4a); NNDC 4.468(3)e9; Q 4269.7(29) keV NNDC (NDS 108, 681, 2007)' },
  U234: { id: 'U234', name: 'uranium-234', halfLifeYears: 2.455e5, halfLifeSigmaYears: 0.006e5, massU: 234.040950, decay: 'alpha', qMeV: 4.8575, depositedMeV: 4.8575,
    source: 'T1/2 LNHB 2.455(6)e5 y (clocks.md 4a), same in NNDC (NDS 197, 259, 2024); Q 4857.5(7) keV NNDC' },
  Th230: { id: 'Th230', name: 'thorium-230', halfLifeYears: 7.538e4, halfLifeSigmaYears: 30, massU: 230.033132, decay: 'alpha', qMeV: 4.7700, depositedMeV: 4.7700,
    source: 'T1/2 LNHB/NNDC 7.538(30)e4 y (clocks.md 4a; NDS 77, 433, 1996); Q 4770.0(15) keV NNDC' },
  Ra226: { id: 'Ra226', name: 'radium-226', halfLifeYears: 1600, halfLifeSigmaYears: 7, massU: 226.025408, decay: 'alpha', qMeV: 4.8707, depositedMeV: 4.8707,
    source: 'T1/2 LNHB 1600(7) y (clocks.md 4a); NNDC 1603(8) y (NDS 192, 315, 2023); Q 4870.70(25) keV NNDC' },
  Pu238: { id: 'Pu238', name: 'plutonium-238', halfLifeYears: 87.74, halfLifeSigmaYears: 0.03, massU: 238.049558, decay: 'alpha', qMeV: 5.5932, depositedMeV: 5.5932,
    source: 'T1/2 LNHB 87.74(3) y (clocks.md 4b); NNDC 87.7(1) y; Q 5593.20(19) keV NNDC (NDS 108, 681, 2007)' },
  Pu239: { id: 'Pu239', name: 'plutonium-239', halfLifeYears: 24_110, halfLifeSigmaYears: 30, massU: 239.052162, decay: 'alpha', qMeV: 5.2445, depositedMeV: 5.2445,
    source: 'NNDC 24110(30) y, Q 5244.50(21) keV (NDS 122, 205, 2014)' },
  Pu240: { id: 'Pu240', name: 'plutonium-240', halfLifeYears: 6561, halfLifeSigmaYears: 7, massU: 240.053812, decay: 'alpha', qMeV: 5.25582, depositedMeV: 5.25582,
    source: 'NNDC 6561(7) y, Q 5255.82(14) keV (NDS 182, 2, 2022)' },
  // Pu-241 also alpha-decays to U-237 with branching 2.47e-3 %; ignored (its daughter is not tracked).
  Pu241: { id: 'Pu241', name: 'plutonium-241', halfLifeYears: 14.329, halfLifeSigmaYears: 0.029, massU: 241.056850, decay: 'beta-', qMeV: 0.02078, depositedMeV: 0.005227,
    source: 'NNDC 14.329(29) y (dataset 2; dataset 1 gives 14.290(6) y), beta Q 20.78 keV, mean beta 5.227 keV' },
  Pu242: { id: 'Pu242', name: 'plutonium-242', halfLifeYears: 3.73e5, halfLifeSigmaYears: 0.03e5, massU: 242.058741, decay: 'alpha', qMeV: 4.9847, depositedMeV: 4.9847,
    source: 'NNDC 3.73(3)e5 y, Q 4984.7(10) keV (NDS 127, 191, 2015)' },
  Am241: { id: 'Am241', name: 'americium-241', halfLifeYears: 432.6, halfLifeSigmaYears: 0.6, massU: 241.056827, decay: 'alpha', qMeV: 5.63782, depositedMeV: 5.63782,
    source: 'NNDC 432.6(6) y, Q 5637.82(12) keV (NDS 107, 3323, 2006)' },
  U235: { id: 'U235', name: 'uranium-235', halfLifeYears: 7.04e8, halfLifeSigmaYears: 0.01e8, massU: 235.043928, decay: 'alpha', qMeV: 4.6781, depositedMeV: 4.6781,
    source: 'NNDC 7.04(1)e8 y, Q 4678.1(7) keV (NDS 185, 560, 2022)' },
  U236: { id: 'U236', name: 'uranium-236', halfLifeYears: 2.342e7, halfLifeSigmaYears: 0.004e7, massU: 236.045566, decay: 'alpha', qMeV: 4.5731, depositedMeV: 4.5731,
    source: 'NNDC 2.342(4)e7 y, Q 4573.1(9) keV (NDS 107, 2579, 2006)' },
  Np237: { id: 'Np237', name: 'neptunium-237', halfLifeYears: 2.144e6, halfLifeSigmaYears: 0.007e6, massU: 237.048172, decay: 'alpha', qMeV: 4.9573, depositedMeV: 4.9573,
    source: 'NNDC 2.144(7)e6 y, Q 4957.3(7) keV (NDS 170, 499, 2020)' },
};

/** Decay constant, 1/year. */
export function lambdaPerYear(id: NuclideId, halfLives?: Partial<Record<NuclideId, number>>): number {
  const t = halfLives?.[id] ?? NUCLIDES[id].halfLifeYears;
  return Math.LN2 / t;
}

/**
 * Cheng et al. 2013 half-lives, years (clocks.md 4a): U-234 245,620 +/- 260 and Th-230 75,584 +/- 110
 * (the paper quotes these as 2-sigma). Used only to report the half-life systematic.
 */
export const CHENG2013_HALF_LIVES: Readonly<Partial<Record<NuclideId, number>>> = { U234: 245_620, Th230: 75_584 };
export const CHENG2013_SIGMA_2: Readonly<Partial<Record<NuclideId, number>>> = { U234: 260, Th230: 110 };

/**
 * Heat per Ra-226 decay from its short-lived progeny to stable Pb-206, MeV, once they are in secular
 * equilibrium (Pb-210, 22.2 y, sets the time: equilibrium within about a century). Radon is assumed
 * retained in the fuel. Excludes Ra-226's own alpha (in NUCLIDES) and all antineutrino energy.
 * Every value from NNDC NuDat 3, read 2026-10-15:
 *   Rn-222 alpha Q 5.5904 (NDS 160, 405, 2019); Po-218 alpha Q 6.11475 (NDS 175, 1, 2021);
 *   Pb-214 mean beta 0.224 + gamma/X 0.238 + electrons 0.0602 (NDS 175, 1);
 *   Bi-214 mean beta 0.641 + gamma 1.4748 (our sum of every listed gamma dose entry; electrons
 *     not totalled by NNDC and omitted, a few keV) (NDS 175, 1); its 0.021 % alpha branch ignored;
 *   Po-214 alpha Q 7.83346 (NDS 121, 561, 2014);
 *   Pb-210 mean beta 0.0061 + gamma/X 0.00443 + electrons 0.02814 (NDS 121, 561);
 *   Bi-210 mean beta 0.389, no gamma (NDS 121, 561); Po-210 alpha Q 5.40753 (NDS 201, 346, 2025).
 * Gamma rays are counted as deposited, an upper bound: about 1.7 MeV of the 28 MeV may escape.
 */
export const RA226_PROGENY_HEAT_MEV =
  5.5904 + 6.11475 + (0.224 + 0.238 + 0.0602) + (0.641 + 1.4748) + 7.83346 + (0.0061 + 0.00443 + 0.02814) + 0.389 + 5.40753;

/** Standard atomic weight of oxygen, g/mol (IUPAC conventional value). */
export const OXYGEN_G_PER_MOL = 15.999;

// ---------------------------------------------------------------------------------------------
// Bateman solver for a linear chain 1 -> 2 -> ... -> n with distinct decay constants.
//
// N_n(t) = sum_k N_k(0) (prod_{j=k}^{n-1} lambda_j) D[lambda_k..lambda_n], where D is the divided
// difference of exp(-x t) with sign (-1)^m, i.e. D[x0,x1] = (e^{-x0 t} - e^{-x1 t}) / (x1 - x0).
// The textbook sum of exponentials loses up to 8 digits to cancellation when every lambda t is
// small (Th-230 from U-238 at 49 years); instead D is computed with a shifted Taylor series whenever
// the points span (max - min) t <= 1, and by the divided-difference recursion otherwise, which keeps
// near full double precision. The test checks it against high-order numerical integration.

/** D[xs] for xs sorted ascending. */
function expKernel(xs: readonly number[], t: number): number {
  const m = xs.length - 1;
  const x0 = xs[0] as number;
  if (m === 0) return Math.exp(-x0 * t);
  const xm = xs[m] as number;
  if ((xm - x0) * t <= 1) {
    // D = e^{-x0 t} t^m sum_p (-1)^p h_p(u) / (p + m)!, with u_i = (x_i - x0) t in [0, 1] and h_p the
    // complete homogeneous symmetric polynomial; terms fall faster than 1/(p+m)!.
    const P = 40;
    const h = new Array<number>(P + 1).fill(0);
    h[0] = 1;
    for (let i = 1; i <= m; i++) {
      const u = ((xs[i] as number) - x0) * t;
      for (let p = 1; p <= P; p++) h[p] = (h[p] as number) + u * (h[p - 1] as number);
    }
    let fact = 1;
    for (let j = 2; j <= m; j++) fact *= j;
    let sum = 0;
    for (let p = 0; p <= P; p++) {
      if (p > 0) fact *= p + m;
      const term = (h[p] as number) / fact;
      sum += p % 2 === 0 ? term : -term;
      if (term < 1e-18 * Math.abs(sum)) break;
    }
    return Math.exp(-x0 * t) * Math.pow(t, m) * sum;
  }
  return (expKernel(xs.slice(0, m), t) - expKernel(xs.slice(1), t)) / (xm - x0);
}

/**
 * Atoms of every chain member at time t (same time unit as 1/lambda), from any initial amounts.
 * The last member decays with its own lambda (pass 0 for a stable end member).
 */
export function batemanChain(lambdas: readonly number[], n0: readonly number[], t: number): number[] {
  const n = lambdas.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = lambdas[i] as number;
      const b = lambdas[j] as number;
      if (Math.abs(a - b) <= 1e-12 * Math.max(a, b)) throw new Error('batemanChain: decay constants must be distinct');
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let total = 0;
    for (let k = 0; k <= i; k++) {
      const start = n0[k] ?? 0;
      if (start === 0) continue;
      let prod = 1;
      for (let j = k; j < i; j++) prod *= lambdas[j] as number;
      const pts = lambdas.slice(k, i + 1).sort((x, y) => x - y);
      total += start * prod * expKernel(pts, t);
    }
    out.push(total);
  }
  return out;
}
