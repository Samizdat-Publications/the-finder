import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { batemanChain, rtgInitialAtoms, rtgPuAtomFractions, rtgState, uraniumSpotState } from './clocks';
import { RA226_PROGENY_HEAT_MEV, lambdaPerYear, type NuclideId } from './nuclides';

// Research numbers: docs/research/clocks.md 4a (uranium spot) and 4b (RTG), computed by
// docs/research/data/clocks/radio.py with LNHB half-lives. Unless stated, tolerances are the
// research's own rounding (1% relative for 3-4 significant figure values, as the spec sets).

const rel = (a: number, b: number): number => Math.abs(a / b - 1);

/**
 * Independent reference: integrate dN/dt = A N (A lower bidiagonal) with 2^s equal steps of an
 * order-30 Taylor propagator, max lambda h <= 1/8. Steps are composed by repeated squaring, which is
 * exact composition for a linear time-invariant system; all propagator entries are non-negative, so
 * squaring adds no cancellation. Shares nothing with the divided-difference solver in clocks.ts.
 */
function odeReference(lambdas: readonly number[], n0: readonly number[], t: number): number[] {
  const n = lambdas.length;
  const lmax = Math.max(...lambdas);
  let s = 0;
  while ((lmax * t) / 2 ** s > 1 / 8) s++;
  const h = t / 2 ** s;
  const A: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? -(lambdas[i] as number) * h : i === j + 1 ? (lambdas[j] as number) * h : 0)),
  );
  const mul = (X: number[][], Y: number[][]): number[][] =>
    X.map((row) => Y[0]!.map((_, j) => row.reduce((acc, x, k) => acc + x * (Y[k]![j] as number), 0)));
  let term: number[][] = A.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
  let P = term.map((r) => r.slice());
  for (let k = 1; k <= 30; k++) {
    term = mul(term, A).map((r) => r.map((x) => x / k));
    P = P.map((r, i) => r.map((x, j) => x + (term[i]![j] as number)));
  }
  for (let k = 0; k < s; k++) P = mul(P, P);
  return P.map((row) => row.reduce((acc, x, j) => acc + x * (n0[j] as number), 0));
}

describe('clocks: Bateman solver', () => {
  it('agrees with independent numerical integration to 1e-9 relative', () => {
    const chains: { name: string; ids: NuclideId[]; n0: number[] }[] = [
      { name: 'U-238 spot, pure', ids: ['U238', 'U234', 'Th230', 'Ra226'], n0: [1, 0, 0, 0] },
      { name: 'U-238 spot, natural start', ids: ['U238', 'U234', 'Th230', 'Ra226'], n0: [1, 5.5e-5, 0, 0] },
      { name: 'RTG Pu-238', ids: ['Pu238', 'U234', 'Th230', 'Ra226'], n0: [1, 0, 0, 0] },
      { name: 'RTG Pu-241', ids: ['Pu241', 'Am241', 'Np237'], n0: [1, 0, 0] },
    ];
    let worst = 0;
    let worstAt = '';
    for (const c of chains) {
      const lam = c.ids.map((id) => lambdaPerYear(id));
      for (const t of [49, 1000, 44_000, 1_000_000]) {
        const a = batemanChain(lam, c.n0, t);
        const b = odeReference(lam, c.n0, t);
        a.forEach((x, i) => {
          const y = b[i] as number;
          if (y < 1e-280) return expect(x).toBeLessThan(1e-270); // fully decayed (e.g. Pu-238 at 1e6 y)
          const e = rel(x, y);
          if (e > worst) { worst = e; worstAt = `${c.name}, ${c.ids[i]} at ${t} y`; }
        });
      }
    }
    // 1e-9: the spec's requirement; both methods are near double precision, so this is generous.
    const pass = worst < 1e-9;
    recordCheck({
      id: 'clocks.bateman',
      claim: 'The decay-chain solver gives the same amounts as a brute-force step-by-step integration.',
      measured: `largest relative difference ${worst.toExponential(2)} (${worstAt})`,
      expected: 'order-30 Taylor integration with small equal steps, for the uranium and plutonium chains at 49, 1,000, 44,000 and 1,000,000 years',
      tolerance: '1e-9 relative',
      pass,
    });
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('clocks: uranium spot (clocks.md 4a)', () => {
  it('reproduces the research amounts and ratios', () => {
    const s49 = uraniumSpotState(49);
    const s40 = uraniumSpotState(40_000);
    const s44 = uraniumSpotState(44_000);
    const checks: [string, number, number, number][] = [
      // [label, computed, research, relative tolerance]
      ['U-238 mass (mg)', s49.massU238G * 1000, 0.774, 0.005],
      ['U-238 atoms', s49.atoms.U238, 1.96e18, 0.005],
      ['A234/A238 at 49 y', s49.ratios.a234over238, 1.383e-4, 0.01],
      ['A230/A238 at 49 y', s49.ratios.a230over238, 3.12e-8, 0.01],
      ['A234/A238 at 40,000 y', s40.ratios.a234over238, 0.1068, 0.01],
      ['A230/A238 at 40,000 y', s40.ratios.a230over238, 0.0177, 0.01],
      ['A226/A238 at 40,000 y', s40.ratios.a226over238, 0.0159, 0.01],
      ['A234/A238 at 44,000 y', s44.ratios.a234over238, 0.117, 0.01],
    ];
    const bad = checks.filter(([, a, b, tol]) => rel(a, b) > tol);
    recordCheck({
      id: 'clocks.uranium.ratios',
      claim: 'The uranium spot holds 0.77 mg of uranium-238, and its daughters grow in at the rates the research computed.',
      measured: checks.map(([l, a]) => `${l} ${a.toPrecision(4)}`).join('; '),
      expected: 'clocks.md 4a: 0.774 mg, 1.96e18 atoms; 1.383e-4 and 3.12e-8 at 49 y; 0.1068, 0.0177, 0.0159 at 40,000 y; about 0.117 at 44,000 y',
      tolerance: '0.5% for mass and atoms, 1% for ratios (the research rounding)',
      pass: bad.length === 0,
      notes: 'Assumes isotopically pure U-238 at plating (NASA: "ultra-pure"); 9.62 Bq from NASA\'s 0.00026 microcurie.',
    });
    expect(bad.map((b) => b[0])).toEqual([]);
  });
});

describe('clocks: RTG fuel (clocks.md 4b)', () => {
  const s49 = rtgState(49.1);
  const s40 = rtgState(40_000);
  const s44 = rtgState(44_000);
  const init = rtgInitialAtoms();

  it('derives the inventory and its evolution', () => {
    const checks: [string, number, number, number][] = [
      ['Pu-238 at launch (kg)', init.pu238Kg, 12.8, 0.02], // research derivation, +/- 2%
      ['U-234 at 40,000 y (kg)', s40.massKg.U234, 11.2, 0.03],
      ['Th-230 at 40,000 y (kg)', s40.massKg.Th230, 1.1, 0.03],
      ['Ra-226 at 40,000 y (kg)', s40.massKg.Ra226, 0.022, 0.03],
    ];
    const bad = checks.filter(([, a, b, tol]) => rel(a, b) > tol);
    const puLeft = init.atoms.Pu238 > 0 ? s44.atoms.Pu238 / init.atoms.Pu238 : 0;
    const f = rtgPuAtomFractions();
    recordCheck({
      id: 'clocks.rtg.inventory',
      claim: 'Each Voyager carried about 12.8 kg of plutonium-238; 40,000 years later it has become about 11 kg of uranium-234, 1.1 kg of thorium-230 and 22 g of radium-226.',
      measured: checks.map(([l, a]) => `${l} ${a.toPrecision(4)}`).join('; ') + `; Pu-238 left at 44,000 y: ${puLeft.toExponential(1)} of the start`,
      expected: 'clocks.md 4b: 12.8 kg Pu-238 (from 3 x 24 spheres of 251.5 g PuO2, 80 at.% Pu-238, LA-5202); 11.2 kg, 1.1 kg, 22 g at 40,000 y',
      tolerance: '2% for the launch inventory, 3% for the 40,000-year inventory (research rounding)',
      pass: bad.length === 0 && puLeft < 1e-100,
      notes:
        `PuO2 molar mass ${init.puo2MolarMassG.toFixed(2)} g/mol. Non-238 plutonium (20 at.%) split as Cassini fuel: atom fractions ` +
        `Pu-239 ${f.Pu239.toFixed(4)}, Pu-240 ${f.Pu240.toFixed(4)}, Pu-241 ${f.Pu241.toFixed(5)}, Pu-242 ${f.Pu242.toFixed(5)} (an assumption). ` +
        `At 44,000 y per spacecraft: Pu-239 ${s44.massKg.Pu239.toFixed(3)} kg, Pu-240 ${(s44.massKg.Pu240 * 1000).toFixed(2)} g, ` +
        `Pu-242 ${(s44.massKg.Pu242 * 1000).toFixed(1)} g, Pu-241 none, U-235 ${s44.massKg.U235.toFixed(2)} kg, U-236 ${s44.massKg.U236.toFixed(3)} kg, Np-237 ${(s44.massKg.Np237 * 1000).toFixed(0)} g.`,
    });
    expect(bad.map((b) => b[0])).toEqual([]);
    expect(puLeft).toBeLessThan(1e-100);
  });

  it('gives the dating ratios', () => {
    const checks: [string, number, number, number][] = [
      ['U-234/Pu-238 atoms at 49.1 y', s49.ratios.u234OverPu238Atoms, 0.474, 0.005], // research +/- 0.5%
      ['Th-230/U-234 activity at 40,000 y', s40.ratios.th230OverU234Activity, 0.324, 0.01], // +/- 1%
      ['Th-230/U-234 atoms at 40,000 y', s40.ratios.th230OverU234Atoms, 0.099, 0.01], // research 0.099
      ['Th-230/U-234 activity at 44,000 y', s44.ratios.th230OverU234Activity, 0.35, 0.03], // "about 0.35"
    ];
    const bad = checks.filter(([, a, b, tol]) => rel(a, b) > tol);
    recordCheck({
      id: 'clocks.rtg.ratio',
      claim: 'The thorium-230 to uranium-234 ratio in the heat source grows steadily with age: 0.32 at 40,000 years, 0.35 at 44,000.',
      measured: checks.map(([l, a]) => `${l} ${a.toPrecision(4)}`).join('; '),
      expected: 'clocks.md 4b: 0.474 at 49.1 y; 0.324 (atoms 0.099) at 40,000 y; about 0.35 at 44,000 y',
      tolerance: '0.5% at 49 y, 1% at 40,000 y, 3% at 44,000 y (research rounding)',
      pass: bad.length === 0,
    });
    expect(bad.map((b) => b[0])).toEqual([]);
  });

  it('leaves a few watts of heat at 44,000 years', () => {
    const w = s44.heatW;
    const pass = w > 3 && w < 20; // research estimate about 8 W; the spec asks only for 3 to 20 W
    const share = (ids: NuclideId[]): number => ids.reduce((s, id) => s + s44.activityBq[id], 0);
    recordCheck({
      id: 'clocks.rtg.heat',
      claim: 'Forty-four thousand years on, the three heat sources together still give off a few watts.',
      measured: `${w.toFixed(2)} W per spacecraft (launch: ${rtgState(0).heatW.toFixed(0)} W)`,
      expected: 'clocks.md 4b estimates about 8 W per spacecraft, radon retained',
      tolerance: 'between 3 and 20 W (order-of-magnitude check of an estimate)',
      pass,
      notes:
        'Energy model: alpha decays deposit their full Q value; Pu-241 its mean beta energy; each Ra-226 decay adds its progeny chain to ' +
        `Pb-206 in secular equilibrium with radon retained (${RA226_PROGENY_HEAT_MEV.toFixed(2)} MeV, NNDC; gammas counted, an upper bound by about 1.7 MeV per chain). ` +
        `Activities at 44,000 y: U-234 ${(s44.activityBq.U234 / 1e12).toFixed(2)} TBq, Th-230 ${(s44.activityBq.Th230 / 1e12).toFixed(2)} TBq, ` +
        `Ra-226 ${(s44.activityBq.Ra226 / 1e12).toFixed(2)} TBq, Pu-239 ${(s44.activityBq.Pu239 / 1e12).toFixed(2)} TBq, others ${(share(['U235', 'U236', 'Np237', 'Pu240', 'Pu242', 'U238']) / 1e12).toFixed(3)} TBq.`,
    });
    expect(pass).toBe(true);
  });

  it('shows the uranium-234 has no uranium-238 parent', () => {
    const r = s44.ratios.u238OverU234Atoms;
    // Natural uranium in secular equilibrium: U-234/U-238 atoms = T(U-234)/T(U-238) = 5.49e-5
    // (research: 5.5e-5), i.e. U-238/U-234 = 18,200.
    const natural = lambdaPerYear('U238') / lambdaPerYear('U234');
    const pass = r < 1e-3 && rel(natural, 5.5e-5) < 0.01;
    recordCheck({
      id: 'clocks.rtg.parent',
      claim: 'The heat source holds uranium-234 with almost no uranium-238, so it was not natural uranium: it came from something heavier, made on purpose.',
      measured: `U-238/U-234 atom ratio ${r.toExponential(2)} at 44,000 y (the little U-238 comes from Pu-242)`,
      expected: `natural uranium has U-234/U-238 = ${natural.toExponential(2)}, i.e. U-238/U-234 about ${(1 / natural).toFixed(0)}`,
      tolerance: 'U-238/U-234 below 1e-3, seven orders of magnitude under natural uranium',
      pass,
    });
    expect(pass).toBe(true);
  });
});
