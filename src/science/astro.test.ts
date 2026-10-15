import { describe, expect, it } from 'vitest';
import {
  ICRS_TO_GALACTIC, KM_S_TO_PC_PER_YEAR, decimalYearToJd, galacticToIcrs, icrsToGalactic, isoUtcToJd, jdToDecimalYear,
  mjdToDecimalYear, norm, propagateLinear, separationDeg, spaceVelocityKmS, toGalacticCartesian, unitVector,
} from './astro';

describe('astro: galactic coordinates', () => {
  it('matches the matrix printed in the Hipparcos catalogue (ESA 1997 vol. 1 eq. 1.5.11)', () => {
    // 10-decimal values as printed; tolerance is half a unit in the 10th decimal plus rounding.
    const printed = [
      [-0.0548755604, -0.8734370902, -0.4838350155],
      [0.4941094279, -0.444829630, 0.7469822445],
      [-0.867666149, -0.1980763734, 0.4559837762],
    ];
    ICRS_TO_GALACTIC.forEach((row, i) =>
      row.forEach((v, j) => expect(Math.abs(v - (printed[i]?.[j] as number))).toBeLessThan(1.1e-9)),
    );
  });

  it('places the Crab at l = 184.5575, b = -5.7843', () => {
    // Crab: RA 83.633083, Dec +22.014500 (ATNF J0534+2200); l, b from astropy / ATNF GL, GB
    // (clocks.md table 2B gives 184.557, -5.784). Tolerance 0.001 deg, the precision of the quoted values.
    const g = icrsToGalactic(83.633083, 22.0145);
    expect(Math.abs(g.lDeg - 184.5575)).toBeLessThan(0.001);
    expect(Math.abs(g.bDeg + 5.7843)).toBeLessThan(0.001);
  });

  it('puts the north galactic pole at b = 90 and round-trips', () => {
    expect(Math.abs(icrsToGalactic(192.85948, 27.12825).bDeg - 90)).toBeLessThan(1e-4);
    for (const [ra, dec] of [[10, 20], [263.7, 12.56], [359.9, -80], [180, 0]] as const) {
      const g = icrsToGalactic(ra, dec);
      const back = galacticToIcrs(g.lDeg, g.bDeg);
      expect(separationDeg(ra, dec, back.raDeg, back.decDeg)).toBeLessThan(1e-9);
    }
  });

  it("puts Voyager 1's asymptote 0.87 deg from Rasalhague", () => {
    // voyager.md section 5: V1 asymptote RA 262.8760, Dec +12.3199 "0.87 deg from Rasalhague";
    // Rasalhague (alpha Oph) Hipparcos RA 263.733627, Dec +12.560035. Tolerance 0.02 deg: the research
    // quotes two significant figures.
    const sep = separationDeg(262.876, 12.3199, 263.733627, 12.560035);
    expect(Math.abs(sep - 0.87)).toBeLessThan(0.02);
  });
});

describe('astro: motion and dates', () => {
  it('converts proper motion to velocity with 4.74047 km/s per (arcsec/yr x pc)', () => {
    // A star at 1000 pc moving 1 mas/yr due east has v_t = 4.740470 km/s (IAU au and Julian year).
    const v = spaceVelocityKmS(0, 0, 1000, 1, 0, 0);
    expect(Math.abs(v[1] - 4.740470464)).toBeLessThan(1e-8);
    expect(Math.abs(v[0])).toBeLessThan(1e-12);
    const vr = spaceVelocityKmS(45, 30, 10, 0, 0, 20);
    expect(Math.abs(norm(vr) - 20)).toBeLessThan(1e-12);
    // 1 km/s for 977,792 years is 1 pc (pc / (km/s x Julian year)).
    expect(Math.abs(KM_S_TO_PC_PER_YEAR * 977_792.2 - 1)).toBeLessThan(1e-6);
    const p = propagateLinear([0, 0, 0], [1, 0, 0], 1e6);
    expect(Math.abs(p[0] - 1.02271216505)).toBeLessThan(1e-10); // 1e6 Julian years at 1 km/s, 11 digits
    const gv = toGalacticCartesian(unitVector(192.85948, 27.12825));
    expect(Math.abs(gv[2] - 1)).toBeLessThan(1e-12);
  });

  it('converts dates', () => {
    expect(jdToDecimalYear(2_451_545.0)).toBe(2000);
    expect(decimalYearToJd(2000)).toBe(2_451_545.0);
    expect(mjdToDecimalYear(51_544.5)).toBe(2000);
    // Voyager 1 launch 1977-09-05T12:56:00Z = JD 2443392.03889 (JPL).
    expect(Math.abs(isoUtcToJd('1977-09-05T12:56:00Z') - 2_443_392.038_889)).toBeLessThan(1e-6);
  });
});
