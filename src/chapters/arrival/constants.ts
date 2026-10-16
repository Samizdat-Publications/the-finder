// Physical constants and craft facts for the Arrival estimates. Every value carries its unit and source.
// Values from docs/research are cited by file and section; the few general physics constants the
// research does not hold are cited to their primary source (listed for How it's checked).

/** Nominal solar luminosity, W. IAU 2015 Resolution B3 (exact nominal value, 3.828e26 W). */
export const L_SUN_W = 3.828e26;

/** Stefan-Boltzmann constant, W m^-2 K^-4. CODATA 2018 (exact in the 2019 SI, 5.670374419e-8). */
export const SIGMA_SB = 5.670_374_419e-8;

/** Speed of light, m/s. Exact by the SI definition of the metre (units.ts holds it in km/s). */
export const C_M_S = 299_792_458;

/** Electron volt, J (exact, 2019 SI). */
export const EV_J = 1.602_176_634e-19;

/**
 * Energy density of starlight near the Sun, eV per cm^3: 0.43 (Mathis, Mezger and Panagia 1983, A&A 128,
 * 212, the "MMP" interstellar radiation field, as quoted by arXiv:1608.01587). At 0.75 pc from the Sun
 * the field is the same to within the Sun's own small share (its direct flux is added separately).
 */
export const ISRF_STARLIGHT_EV_CM3 = 0.43;

/** Cosmic microwave background temperature, K: 2.72548 (Fixsen 2009, ApJ 707, 916). */
export const T_CMB_K = 2.725_48;

/**
 * The craft's heat sources, as the scan sees them: three cylinders of the MHW-RTG, 40.6 cm in diameter and
 * 50.8 cm long, 39 kg each, beryllium case (NSSDC, docs/research/voyager.md section 2; Wikipedia gives
 * 37.7 kg). The fins are not counted in the area: fins add area, which lowers the surface temperature and
 * shortens the leftover-heat time, so leaving them out is generous to that wrong answer.
 */
export const RTG_CYLINDER = { diameterM: 0.406, lengthM: 0.508, massKg: 39, count: 3 } as const;

/** High-gain antenna diameter, m: 3.66 (NSSDC, docs/research/voyager.md section 2). */
export const DISH_DIAMETER_M = 3.66;

/** Magnetometer boom length, m: 13 (docs/research/voyager.md section 2). */
export const MAG_BOOM_M = 13;

/** Craft mass, kg: 721.9 (NSSDC launch mass, docs/research/voyager.md section 2; PDS 815, about 825 also quoted). */
export const CRAFT_MASS_KG = 721.9;

/**
 * Specific heat of beryllium at 25 C, J kg^-1 K^-1: 1825 (CRC Handbook of Chemistry and Physics, "Heat
 * capacity of the elements at 25 C", 1.825 J/g K). The case is beryllium; the fuel inside is a heavy
 * oxide and holds far less heat per kilogram, so using beryllium's value for the whole mass is generous to
 * "leftover heat".
 */
export const BE_SPECIFIC_HEAT_J_KG_K = 1825;

/**
 * The most energetic ordinary chemical fuel per mass we allow: beryllium burning to BeO, standard enthalpy
 * of formation -609.4 kJ/mol (NIST-JANAF Thermochemical Tables, 4th ed., 1998, BeO crystal) over the molar
 * mass of BeO, 9.0122 + 15.999 g/mol (IUPAC standard atomic weights). 2.44e7 J/kg, above hydrogen with
 * oxygen (285.83 kJ/mol over 18.015 g/mol, 1.59e7 J/kg, CODATA key values 1989). Counting the oxygen
 * as free fuel too, so this is generous to "chemistry".
 */
export const BEO_FORMATION_J_PER_MOL = 609_400;
export const BEO_MOLAR_MASS_KG = (9.0122 + 15.999) / 1000;

/**
 * Upper bound on any bound star's speed, km/s: the Galactic escape speed at the Sun, 533 km/s (Piffl et
 * al. 2014, A&A 562, A91). Used only for catalogued stars with no measured radial velocity, so the
 * "time away from every star" bound cannot be too long.
 */
export const GALACTIC_ESCAPE_KM_S = 533;

/**
 * The isotope measurement's relative precision per atom ratio (1 sigma): 1%, the precision the clocks
 * module's calibration test uses for the Th-230/U-234 clock (clocks.calibration.test.ts, check
 * clocks.rtg.coverage). A stated model input, not a measured instrument property.
 */
export const ISOTOPE_RELATIVE_PRECISION = 0.01;
