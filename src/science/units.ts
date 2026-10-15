// Physical constants and the cover's binary numbers.
// Pure module: no DOM, no randomness. Every constant carries its unit and source.

/** Speed of light, km/s. Exact by the SI definition of the metre (CODATA 2018). */
export const C_KM_S = 299_792.458;

/** Julian year, s (IAU: 365.25 days of 86,400 s). */
export const JULIAN_YEAR_S = 365.25 * 86_400;

/** Astronomical unit, km. Exact by IAU 2012 Resolution B2. */
export const AU_KM = 149_597_870.7;

/** Parsec, km: 648,000 / pi au (IAU 2015 Resolution B2). */
export const PARSEC_KM = (648_000 / Math.PI) * AU_KM;

/** Avogadro constant, 1/mol. Exact in the 2019 SI (CODATA 2018). */
export const AVOGADRO = 6.022_140_76e23;

/** One MeV in joules: 1e6 x elementary charge 1.602176634e-19 C (exact, 2019 SI). */
export const MEV_J = 1.602_176_634e-13;

/** Becquerels per microcurie: 1 Ci = 3.7e10 Bq exactly (CGPM definition), so 1 uCi = 37,000 Bq. */
export const BQ_PER_MICROCURIE = 37_000;

/**
 * Hydrogen hyperfine (21 cm) transition frequency, Hz. Hydrogen maser value 1,420,405,751.768(2) Hz
 * (Hellwig et al. 1970 via ASACUSA; docs/research/clocks.md section 5; cover.md "Units").
 */
export const HYDROGEN_HZ = 1_420_405_751.768;

/** One hydrogen time unit, s: 1 / HYDROGEN_HZ = 0.70402418376 ns (clocks.md section 5). */
export const T_H_SECONDS = 1 / HYDROGEN_HZ;

/** Hydrogen wavelength, m: c / nu = 21.106114054 cm (clocks.md section 5). */
export const LAMBDA_H_METRES = (C_KM_S * 1000) / HYDROGEN_HZ;

/**
 * The value Sagan, Salzman Sagan and Drake (1972, Science 175, 881) used to convert the map's periods,
 * Hz (cover.md "Units"; clocks.md section 5). Differs from the maser value by 1.6e-10 fractionally.
 */
export const SAGAN_HYDROGEN_HZ = 1.420405752e9;

/**
 * Parse a binary string as engraved on the cover (most significant bit first) into an integer.
 * Accepts only '0' and '1', 1 to 53 digits, so the result is exact in a double.
 */
export function parseCoverBinary(s: string): number {
  if (s.length === 0 || s.length > 53) {
    throw new Error(`cover binary must have 1 to 53 digits, got ${s.length}`);
  }
  let v = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch !== 48 && ch !== 49) throw new Error(`cover binary may hold only 0 and 1, got "${s[i]}"`);
    v = v * 2 + (ch - 48);
  }
  return v;
}

/** Read a cover number as a time: N hydrogen periods, in seconds. */
export function binaryToSeconds(s: string, hz: number = HYDROGEN_HZ): number {
  return parseCoverBinary(s) / hz;
}

/** Read a cover number as a length: N hydrogen wavelengths (21.1 cm each), in metres. */
export function binaryToMetres(s: string): number {
  return parseCoverBinary(s) * LAMBDA_H_METRES;
}
