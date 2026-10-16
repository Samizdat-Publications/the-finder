import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { rtgInitialAtoms, rtgPuAtomFractions, rtgState } from './rtg';
import { NUCLIDES, RA226_PROGENY_HEAT_MEV, lambdaPerYear, type NuclideId } from './nuclides';
import { AVOGADRO } from './units';

// Research numbers: docs/research/clocks.md 4b, computed by docs/research/data/clocks/radio.py with
// LNHB half-lives. Tolerances are the research's own rounding unless stated.

const rel = (a: number, b: number): number => Math.abs(a / b - 1);

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
        'The Pu-239, Pu-240, Pu-242, U-235, U-236 and Np-237 amounts below rest on that Cassini split and on no uranium impurity in the fuel. ' +
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

  it('matches the design heat at launch and leaves a few watts at 44,000 years', () => {
    // Independent check at t = 0: LA-5202 design, 24 spheres x 100 W thermal = 2,400 W per MHW-RTG
    // (clocks.md 4b). The design figure is a nominal round 100 W per sphere, so allow 2%.
    const perRtg0 = rtgState(0).heatW / 3;
    const launchOk = rel(perRtg0, 2400) < 0.02;
    const h = s44.heatRangeW;
    const share = (ids: NuclideId[]): number => ids.reduce((acc, id) => acc + s44.activityBq[id], 0);
    recordCheck({
      id: 'clocks.rtg.heat',
      claim:
        `Each heat source started at about 2,400 W; 44,000 years on, the three together still give off ${h.low.toFixed(1)} to ${h.high.toFixed(1)} W, ` +
        'depending on whether radon stays in the fuel.',
      measured:
        `launch ${perRtg0.toFixed(0)} W per RTG; at 44,000 y ${h.low.toFixed(2)} to ${h.high.toFixed(2)} W per spacecraft ` +
        `(radon progeny ${s44.radonProgenyHeatW.toFixed(2)} W, Pu-239 ${s44.pu239HeatW.toFixed(2)} W)`,
      expected: 'design 2,400 W thermal per MHW-RTG at launch (LA-5202: 24 spheres of 100 W); clocks.md 4b estimates about 8 W at 40,000 y, radon retained',
      tolerance: '2% at launch (nominal design figure); the 44,000-year range is reported, not tested against an independent value',
      pass: launchOk,
      notes:
        'Range assumptions: high = radon retained, so the Ra-226 progeny (Rn-222 to Pb-206, ' +
        `${RA226_PROGENY_HEAT_MEV.toFixed(2)} MeV per decay, NNDC; gammas counted, an upper bound by about 1.7 MeV) add their heat; low = radon escapes. ` +
        `About ${s44.pu239HeatW.toFixed(1)} W comes from Pu-239, which rests on the Cassini split of the non-238 plutonium (an assumption). ` +
        'Alpha decays deposit their full Q value; Pu-241 its mean beta energy. ' +
        `Activities at 44,000 y: U-234 ${(s44.activityBq.U234 / 1e12).toFixed(2)} TBq, Th-230 ${(s44.activityBq.Th230 / 1e12).toFixed(2)} TBq, ` +
        `Ra-226 ${(s44.activityBq.Ra226 / 1e12).toFixed(2)} TBq, Pu-239 ${(s44.activityBq.Pu239 / 1e12).toFixed(2)} TBq, others ${(share(['U235', 'U236', 'Np237', 'Pu240', 'Pu242', 'U238']) / 1e12).toFixed(3)} TBq.`,
    });
    expect(launchOk).toBe(true);
    expect(h.low).toBeLessThan(h.high);
  });

  it('shows the uranium-234 has no uranium-238 parent', () => {
    const r = s44.ratios.u238OverU234Atoms;
    // Natural uranium in secular equilibrium: U-234/U-238 atoms = T(U-234)/T(U-238) = 5.49e-5
    // (research: 5.5e-5), i.e. U-238/U-234 = 18,200.
    const natural = lambdaPerYear('U238') / lambdaPerYear('U234');
    const orders = Math.log10(1 / natural / r);
    // Robustness: suppose the fuel carried U-238 impurity equal to 1% of the initial plutonium mass
    // (U-238 barely decays in 44,000 y: 7e-6 of it).
    const puMassG = Object.entries(init.atoms).reduce((acc, [id, n]) => acc + (n * NUCLIDES[id as NuclideId].massU) / AVOGADRO, 0);
    const contamAtoms = ((0.01 * puMassG) / NUCLIDES.U238.massU) * AVOGADRO;
    const rContam = (s44.atoms.U238 + contamAtoms) / s44.atoms.U234;
    const ordersContam = Math.log10(1 / natural / rContam);
    // Pass: below 1e-3 as found, and even with 1% contamination still over 4 orders under natural.
    const pass = r < 1e-3 && rel(natural, 5.5e-5) < 0.01 && ordersContam > 4;
    recordCheck({
      id: 'clocks.rtg.parent',
      claim: 'The heat source holds uranium-234 with almost no uranium-238, so it was not natural uranium: it came from something heavier, made on purpose.',
      measured:
        `U-238/U-234 atom ratio ${r.toExponential(2)} at 44,000 y, ${orders.toFixed(1)} orders of magnitude under natural uranium; ` +
        `with U-238 impurity of 1% of the plutonium mass it would be ${rContam.toExponential(2)}, still ${ordersContam.toFixed(1)} orders under`,
      expected: `natural uranium has U-234/U-238 = ${natural.toExponential(2)}, i.e. U-238/U-234 about ${(1 / natural).toFixed(0)}`,
      tolerance: 'U-238/U-234 below 1e-3; with 1% U-238 contamination still more than 4 orders under natural uranium',
      pass,
      notes:
        'The 1.7e-4 readout (U-238 grown from Pu-242) depends on the Cassini isotopic split assumed for the non-238 plutonium and on ' +
        'no uranium impurity in the fuel; the deduction does not, as the contamination case shows.',
    });
    expect(pass).toBe(true);
  });
});
