// The Arrival estimates: what each wrong (and the right) source of the cylinders' heat would deliver, and
// what the dish would feel as a sail or show as a radiator. Pure: numbers in, numbers out; tested against
// independent hand calculations in physics.test.ts. Every input's source is in constants.ts.

import { AVOGADRO, JULIAN_YEAR_S, MEV_J, PARSEC_KM } from '../../science/units';
import { NUCLIDES } from '../../science/nuclides';
import {
  BEO_FORMATION_J_PER_MOL, BEO_MOLAR_MASS_KG, BE_SPECIFIC_HEAT_J_KG_K, C_M_S, EV_J, ISRF_STARLIGHT_EV_CM3, L_SUN_W,
  RTG_CYLINDER, SIGMA_SB, T_CMB_K,
} from './constants';

const PC_M = PARSEC_KM * 1000;

/** The cylinders' geometry: side-on cross-section (the largest any light could meet) and outer surface. */
export function cylinderGeometry(c = RTG_CYLINDER): { crossSectionM2: number; surfaceM2: number; massKg: number } {
  const r = c.diameterM / 2;
  return {
    crossSectionM2: c.count * c.diameterM * c.lengthM,
    surfaceM2: c.count * (2 * Math.PI * r * c.lengthM + 2 * Math.PI * r * r),
    massKg: c.count * c.massKg,
  };
}

/** Flux of a star of luminosity L at distance d, W/m^2. */
export const starFlux = (lumW: number, distPc: number): number => lumW / (4 * Math.PI * (distPc * PC_M) ** 2);

/** Flux onto one face from an isotropic field of energy density u (J/m^3): c u / 4. */
export const isotropicFlux = (uJm3: number): number => (C_M_S * uJm3) / 4;

/** Starlight energy density, J/m^3 (0.43 eV/cm^3, MMP 1983). */
export const STARLIGHT_U_J_M3 = ISRF_STARLIGHT_EV_CM3 * EV_J * 1e6;

export interface SunlightEstimate {
  sunFluxWm2: number;
  sunPowerW: number;
  skyFluxWm2: number;
  skyPowerW: number;
  /** Everything absorbed, perfectly black cylinders, W. */
  totalW: number;
  /** How many times too little: heat output over what light could deliver. */
  shortBy: number;
}

/**
 * Sunlight (and all starlight) on perfectly black cylinders: the Sun's luminosity over 4 pi d^2 times the
 * side-on cross-section, plus the whole sky's starlight (c u / 4 on every surface element) times the full
 * surface. Generous: everything absorbed, nothing reflected.
 */
export function sunlightEstimate(sunDistPc: number, heatW: number): SunlightEstimate {
  const g = cylinderGeometry();
  const sunFluxWm2 = starFlux(L_SUN_W, sunDistPc);
  const sunPowerW = sunFluxWm2 * g.crossSectionM2;
  const skyFluxWm2 = isotropicFlux(STARLIGHT_U_J_M3);
  const skyPowerW = skyFluxWm2 * g.surfaceM2;
  const totalW = sunPowerW + skyPowerW;
  return { sunFluxWm2, sunPowerW, skyFluxWm2, skyPowerW, totalW, shortBy: heatW / totalW };
}

export interface LeftoverEstimate {
  surfaceK: number;
  heatCapacityJK: number;
  /** Longest time a body can stay this warm without a source, however hot it started, s. */
  maxSecondsAtThisWarmth: number;
  /** Cooling rate now, K per day. */
  coolingKPerDay: number;
}

/**
 * Leftover heat. A black surface radiating P has T = (P / (sigma A))^(1/4). A body with heat capacity C
 * cooling by radiation, dT/dt = -sigma A T^4 / C, needs t = C / (3 sigma A) (1/T^3 - 1/T0^3) to fall from T0
 * to T; the most it can take, for T0 -> infinity, is C T / (3 P).
 */
export function leftoverEstimate(heatW: number): LeftoverEstimate {
  const g = cylinderGeometry();
  const surfaceK = (heatW / (SIGMA_SB * g.surfaceM2)) ** 0.25;
  const heatCapacityJK = g.massKg * BE_SPECIFIC_HEAT_J_KG_K;
  return {
    surfaceK,
    heatCapacityJK,
    maxSecondsAtThisWarmth: (heatCapacityJK * surfaceK) / (3 * heatW),
    coolingKPerDay: (heatW / heatCapacityJK) * 86_400,
  };
}

export interface ChemicalEstimate {
  bestJPerKg: number;
  /** How long the cylinders' whole mass, all of it the best fuel, could keep this heat, s. */
  fullLoadSeconds: number;
  /** Fuel needed to keep this heat for the given time, kg. */
  fuelKgFor: (seconds: number) => number;
}

/** Chemistry: the best ordinary fuel per mass (beryllium burning) over the heat output. */
export function chemicalEstimate(heatW: number): ChemicalEstimate {
  const g = cylinderGeometry();
  const bestJPerKg = BEO_FORMATION_J_PER_MOL / BEO_MOLAR_MASS_KG;
  return { bestJPerKg, fullLoadSeconds: (g.massKg * bestJPerKg) / heatW, fuelKgFor: (s) => (heatW * s) / bestJPerKg };
}

export interface DecayEstimate {
  jPerKg: number;
  overChemistry: number;
  /** How long the cylinders' mass of such atoms could keep this heat, s. */
  fullLoadSeconds: number;
}

/** Decay: a heavy alpha emitter (uranium-234's Q and mass, nuclides.ts) releases Q N_A / M per kg. */
export function decayEstimate(heatW: number): DecayEstimate {
  const n = NUCLIDES.U234;
  const jPerKg = (n.qMeV * MEV_J * AVOGADRO) / (n.massU / 1000);
  const g = cylinderGeometry();
  return { jPerKg, overChemistry: jPerKg / chemicalEstimate(heatW).bestJPerKg, fullLoadSeconds: (g.massKg * jPerKg) / heatW };
}

/** Radiation-pressure acceleration on a fully absorbing disc facing a star, m/s^2. */
export function sailAcceleration(sunDistPc: number, dishDiameterM: number, craftMassKg: number): number {
  const area = Math.PI * (dishDiameterM / 2) ** 2;
  return (starFlux(L_SUN_W, sunDistPc) * area) / (C_M_S * craftMassKg);
}

/**
 * Temperature of an unheated black plate far from stars: it absorbs the starlight field and the cosmic
 * background on both faces and radiates sigma T^4 from each, so T^4 = T_cmb^4 + c u_star / (4 sigma).
 * The Sun's direct flux (5.7e-8 W/m^2 at 0.75 pc) changes it by under 0.1%.
 */
export function unheatedTemperatureK(): number {
  return (T_CMB_K ** 4 + isotropicFlux(STARLIGHT_U_J_M3) / SIGMA_SB) ** 0.25;
}

export const SECONDS_PER_DAY = 86_400;
export const yearsToSeconds = (y: number): number => y * JULIAN_YEAR_S;
export const secondsToYears = (s: number): number => s / JULIAN_YEAR_S;
