// The physics behind The Key: the alien's atlas of hydrogen transitions, and how fast a metal disc can spin
// before it tears itself apart. Pure: no DOM, no randomness. Every constant carries its unit and source.
//
// The hyperfine line is the project's maser value (src/science/units.ts, docs/research/clocks.md section 5).
// The optical and ionization lines are not in docs/research: they are computed here from the Rydberg
// formula with CODATA 2022 constants, and the tests compare them with NIST Atomic Spectra Database
// wavelengths (vacuum). Every value and its source: docs/research/key-physics.md. The Bohr levels leave out fine structure and the Lamb shift, which move these
// lines by parts in 1e5 (order alpha squared), far below anything the game reads.

import { C_KM_S, HYDROGEN_HZ } from '../../science/units';

/** Rydberg constant R_inf, 1/m. CODATA 2022: 10,973,731.568157(12) m^-1 (key-physics.md section 1). */
export const RYDBERG_INF_PER_M = 10_973_731.568_157;

/** Electron to proton mass ratio, dimensionless. CODATA 2022: 5.446170214889(94)e-4 (key-physics.md section 1). */
export const ELECTRON_PROTON_MASS_RATIO = 5.446_170_214_889e-4;

/** Rydberg constant for hydrogen (reduced-mass correction), 1/m: R_inf / (1 + m_e/m_p). */
export const RYDBERG_H_PER_M = RYDBERG_INF_PER_M / (1 + ELECTRON_PROTON_MASS_RATIO);

/** Fine-structure constant, dimensionless. CODATA 2022: 7.2973525643(11)e-3 (key-physics.md section 1). */
export const FINE_STRUCTURE = 7.297_352_564_3e-3;

const C_M_S = C_KM_S * 1000;

export type TransitionId = 'hyperfine' | 'lymanAlpha' | 'balmerAlpha' | 'paschenAlpha' | 'ionization';

export interface Transition {
  id: TransitionId;
  /** English key, also the glyph label. */
  key: string;
  /** What changes in the atom, in plain words (no spoiler: every entry is described the same way). */
  gloss: string;
  /** Frequency, Hz. */
  hz: number;
}

/** Frequency of a Bohr transition between levels n1 < n2 (n2 = Infinity for the ionization limit), Hz. */
export function bohrHz(n1: number, n2: number): number {
  const inv2 = Number.isFinite(n2) ? 1 / (n2 * n2) : 0;
  return RYDBERG_H_PER_M * C_M_S * (1 / (n1 * n1) - inv2);
}

/** The alien's atlas: hydrogen's best-known lines, lowest frequency first. */
export const TRANSITIONS: readonly Transition[] = [
  { id: 'hyperfine', key: 'spin flip', gloss: 'ground state: the electron\'s spin turns over against the proton\'s', hz: HYDROGEN_HZ },
  { id: 'paschenAlpha', key: 'level three to four', gloss: 'the electron moves between the third and fourth levels', hz: bohrHz(3, 4) },
  { id: 'balmerAlpha', key: 'level two to three', gloss: 'the electron moves between the second and third levels', hz: bohrHz(2, 3) },
  { id: 'lymanAlpha', key: 'level one to two', gloss: 'the electron moves between the first and second levels', hz: bohrHz(1, 2) },
  { id: 'ionization', key: 'escape', gloss: 'the electron leaves the atom from the lowest level', hz: bohrHz(1, Infinity) },
];

export function transition(id: string): Transition | undefined {
  return TRANSITIONS.find((t) => t.id === id);
}

/** Period of a transition, s. */
export const periodS = (t: Transition): number => 1 / t.hz;
/** Wavelength of a transition, m. */
export const wavelengthM = (t: Transition): number => C_M_S / t.hz;

// ---- a spinning disc ----
// The record is a 12-inch gold-plated copper disc (docs/research/voyager.md "Record"). A uniform solid disc
// spinning with rim speed v has its largest stress at the centre, sigma = (3 + nu) / 8 x rho x v^2
// (Timoshenko and Goodier, Theory of Elasticity, 3rd ed. 1970, rotating disc of uniform thickness; key-physics.md
// section 3). It bursts when that reaches the tensile strength, so the fastest rim speed it can survive is
// sqrt(8 sigma / ((3 + nu) rho)). Copper values: Copper Development Association, alloy C11000 (key-physics.md 2).

const KSI_PA = 6_894_757.293; // one ksi in Pa (1000 lbf/in^2, exact from the international pound and inch)
/** Tensile strength of annealed copper C11000 (temper OS050, typical), Pa: 32 ksi = 220.6 MPa (CDA). */
export const COPPER_TENSILE_PA = 32 * KSI_PA;
/** Density of copper C11000, kg/m^3: specific gravity 8.91 (CDA). */
export const COPPER_DENSITY = 8910;
/** Poisson's ratio of copper C11000 from the CDA's moduli: E / (2 G) - 1 = 17,000 / (2 x 6,400) - 1 = 0.328. */
export const COPPER_POISSON = 17_000 / (2 * 6_400) - 1;

/** The fastest rim speed a uniform copper disc survives, m/s (about 244 m/s, independent of its size). */
export function burstRimSpeed(): number {
  return Math.sqrt((8 * COPPER_TENSILE_PA) / ((3 + COPPER_POISSON) * COPPER_DENSITY));
}

/** Rim speed of a disc of this radius turning once every turnS seconds, m/s. */
export function rimSpeed(radiusM: number, turnS: number): number {
  return (2 * Math.PI * radiusM) / turnS;
}
