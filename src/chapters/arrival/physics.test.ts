// The Arrival estimates against independent hand calculations. Each expected value below is worked from
// the published inputs with the formula written out in the comment, not from the module's own functions.
// Tolerance 0.1% relative unless stated: the hand values carry four or more significant figures, and the
// differences are only rounding of constants such as the parsec.

import { describe, expect, it } from 'vitest';
import scenarioJson from '../../../data/scenario.json';
import { loadStars } from '../../../tests/support/data';
import { discoveryState } from '../../science/epoch';
import type { ScenarioData } from '../../science/types';
import { yearsSinceAnyStar } from './model';
import {
  chemicalEstimate, cylinderGeometry, decayEstimate, leftoverEstimate, sailAcceleration, sunlightEstimate, unheatedTemperatureK,
} from './physics';

const rel = (a: number, b: number): number => Math.abs(a / b - 1);
const scenario = scenarioJson as unknown as ScenarioData;
const PC_M = 3.0857e16; // parsec, m (IAU 2015: 3.08568e16), four figures for the hand calculation

describe('arrival physics: hand calculations', () => {
  it('cylinder geometry: 3 x (pi d L + 2 pi r^2) and 3 d L', () => {
    // MHW-RTG 0.406 m x 0.508 m (voyager.md section 2): side 0.64794 + ends 0.25892 = 0.90686 m^2 each.
    const g = cylinderGeometry();
    expect(rel(g.surfaceM2, 3 * 0.90686)).toBeLessThan(1e-4);
    expect(rel(g.crossSectionM2, 3 * 0.406 * 0.508)).toBeLessThan(1e-9);
    expect(g.massKg).toBe(117);
  });

  it('sunlight: L / (4 pi d^2) times the cross-section, plus c u / 4 times the surface', () => {
    // d = 0.7489 pc: 2.3109e16 m; 4 pi d^2 = 6.7106e33 m^2; 3.828e26 / 6.7106e33 = 5.7044e-8 W/m^2.
    const est = sunlightEstimate(0.7489, 4.85);
    expect(rel(est.sunFluxWm2, 3.828e26 / (4 * Math.PI * (0.7489 * PC_M) ** 2))).toBeLessThan(1e-3);
    expect(rel(est.sunFluxWm2, 5.7044e-8)).toBeLessThan(1e-3);
    // u = 0.43 eV/cm^3 = 0.43 x 1.6022e-19 J x 1e6 = 6.8894e-14 J/m^3; c u / 4 = 5.1635e-6 W/m^2.
    expect(rel(est.skyFluxWm2, 5.1635e-6)).toBeLessThan(1e-3);
    // Total: 5.7044e-8 x 0.61871 + 5.1635e-6 x 2.72058 = 3.5294e-8 + 1.40478e-5 = 1.40831e-5 W.
    expect(rel(est.totalW, 1.40831e-5)).toBeLessThan(1e-3);
    expect(est.shortBy).toBeGreaterThan(1e5);
  });

  it('leftover heat: T = (P / sigma A)^(1/4), t_max = C T / (3 P), and a step-by-step cooling run agrees', () => {
    // P = 4.85 W, A = 2.72058 m^2: P / (sigma A) = 4.85 / 1.54269e-7 = 3.14386e7; fourth root 74.88 K.
    const est = leftoverEstimate(4.85);
    expect(rel(est.surfaceK, 74.88)).toBeLessThan(1e-3);
    // C = 117 kg x 1825 J/(kg K) = 213,525 J/K; t_max = 213,525 x 74.88 / 14.55 = 1.0989e6 s = 12.7 days.
    expect(rel(est.maxSecondsAtThisWarmth, 1.0989e6)).toBeLessThan(2e-3);
    // Independent: Euler-integrate dT/dt = -sigma A T^4 / C from 3000 K (hotter than any fuel's melting)
    // down to the surface temperature, 1 s steps until T < 500 K, then 60 s.
    const sA = 5.670374419e-8 * 2.72058;
    let T = 3000;
    let t = 0;
    while (T > est.surfaceK) {
      const dt = T > 500 ? 1 : 60;
      T -= ((sA * T ** 4) / 213_525) * dt;
      t += dt;
    }
    // From 3000 K the time is t_max (1 - (T/3000)^3), 1.6e-5 shorter; Euler steps add under 0.1%.
    expect(rel(t, est.maxSecondsAtThisWarmth)).toBeLessThan(2e-3);
  });

  it('chemistry: 609.4 kJ/mol over 25.011 g/mol, and how long 117 kg lasts', () => {
    // 609,400 / 0.025011 = 2.43653e7 J/kg; 117 x 2.43653e7 / 4.85 = 5.8778e8 s = 18.6 years.
    const est = chemicalEstimate(4.85);
    expect(rel(est.bestJPerKg, 2.43653e7)).toBeLessThan(1e-4);
    expect(rel(est.fullLoadSeconds, 5.8778e8)).toBeLessThan(1e-3);
    // 1,000 years at 4.85 W = 1.5305e11 J; / 2.43653e7 = 6,281 kg.
    expect(rel(est.fuelKgFor(1000 * 3.15576e7), 6281)).toBeLessThan(1e-3);
  });

  it('decay: Q N_A / M for uranium-234', () => {
    // 4.8575 MeV x 1.602177e-13 J x 6.022141e23 / 0.23404095 kg = 2.00254e12 J/kg.
    const est = decayEstimate(8.73);
    expect(rel(est.jPerKg, 2.00254e12)).toBeLessThan(1e-4);
    // 117 kg x 2.00254e12 / 8.73 = 2.68386e13 s = 850,000 years.
    expect(rel(est.fullLoadSeconds, 2.68386e13)).toBeLessThan(1e-3);
  });

  it('sail: flux x pi r^2 / (c m)', () => {
    // 5.7044e-8 x pi x 1.83^2 (10.5209 m^2) / (2.99792e8 x 721.9) = 2.7731e-18 m/s^2.
    expect(rel(sailAcceleration(0.7489, 3.66, 721.9), 2.7731e-18)).toBeLessThan(1e-3);
  });

  it('an unheated plate: T^4 = T_cmb^4 + c u / (4 sigma)', () => {
    // 2.72548^4 = 55.1771; 5.1635e-6 / 5.670374e-8 = 91.061; (146.238)^(1/4) = 3.4775 K.
    expect(rel(unheatedTemperatureK(), 3.4775)).toBeLessThan(1e-3);
  });

  it('time away from every star never exceeds the true time since the craft left the Sun', () => {
    // Truth check: the craft really left the Sun yearsAfterLaunch ago, so a valid lower bound on "time
    // since it was at any star" must not exceed that. Upper reference: Gliese 445, 0.5734 pc away at
    // 115.9 km/s, gives 0.5734 / (115.9 x 1.0227e-6) = 4,838 years; the bound must be at most that.
    const stars = loadStars();
    const d = discoveryState(scenario, stars);
    const bound = yearsSinceAnyStar({ ...stars, sky: [] }, d.craft.posPc, d.craft.velKmS, d.decimalYear);
    expect(bound).toBeLessThanOrEqual(d.yearsAfterLaunch);
    expect(bound).toBeLessThanOrEqual(4838 * 1.001);
    // Leftover heat lasts days and the best chemistry decades: both are far below this bound.
    expect(bound * 3.15576e7).toBeGreaterThan(100 * leftoverEstimate(4.85).maxSecondsAtThisWarmth);
    expect(bound * 3.15576e7).toBeGreaterThan(10 * chemicalEstimate(4.85).fullLoadSeconds);
  });
});
