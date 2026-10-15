import { describe, expect, it } from 'vitest';
import { CHENG2013_HALF_LIVES, NUCLIDES, RA226_PROGENY_HEAT_MEV, lambdaPerYear, type NuclideId } from './nuclides';
import { AVOGADRO, JULIAN_YEAR_S, MEV_J } from './units';

describe('nuclides', () => {
  it('uses the half-lives the research quotes (clocks.md 4a, 4b; LNHB)', () => {
    // These are the research's recommended values; exact equality because they are the same numbers.
    const research: Partial<Record<NuclideId, number>> = { U238: 4.468e9, U234: 2.455e5, Th230: 7.538e4, Ra226: 1600, Pu238: 87.74 };
    for (const [id, t] of Object.entries(research)) expect(NUCLIDES[id as NuclideId].halfLifeYears).toBe(t);
    expect(CHENG2013_HALF_LIVES).toEqual({ U234: 245_620, Th230: 75_584 });
    // Every entry has a positive uncertainty below 1% of the half-life and a source string.
    for (const n of Object.values(NUCLIDES)) {
      expect(n.halfLifeSigmaYears).toBeGreaterThan(0);
      expect(n.halfLifeSigmaYears / n.halfLifeYears).toBeLessThan(0.01);
      expect(n.source.length).toBeGreaterThan(10);
    }
  });

  it('reproduces the specific activity and specific power in clocks.md', () => {
    // U-238 specific activity 12,440 Bq/g (clocks.md 4a, 4 significant figures).
    const sa = ((lambdaPerYear('U238') / JULIAN_YEAR_S) * AVOGADRO) / NUCLIDES.U238.massU;
    expect(Math.abs(sa / 12_440 - 1)).toBeLessThan(5e-4);
    // Pu-238 specific power 0.5675 W/g with Q = 5.593 MeV (clocks.md 4b, 4 significant figures).
    const sp = (((lambdaPerYear('Pu238') / JULIAN_YEAR_S) * AVOGADRO) / NUCLIDES.Pu238.massU) * NUCLIDES.Pu238.qMeV * MEV_J;
    expect(Math.abs(sp / 0.5675 - 1)).toBeLessThan(5e-4);
  });

  it('gives the Ra-226 progeny heat as the sum of its NNDC components', () => {
    // Four alphas (Rn-222, Po-218, Po-214, Po-210) carry 24.95 MeV; betas and gammas about 3.3 MeV.
    const alphas = 5.5904 + 6.11475 + 7.83346 + 5.40753;
    expect(RA226_PROGENY_HEAT_MEV).toBeGreaterThan(alphas);
    expect(RA226_PROGENY_HEAT_MEV - alphas).toBeGreaterThan(3);
    expect(RA226_PROGENY_HEAT_MEV - alphas).toBeLessThan(3.5);
  });
});
