import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { batemanChain, uraniumSpotState } from './clocks';
import { lambdaPerYear, type NuclideId } from './nuclides';

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
