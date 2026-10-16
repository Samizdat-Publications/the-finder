// The Arrival chapter's world, computed from the scenario, the star catalogue and the playthrough's seed:
// where the craft is, what its cylinders put out, and what the alien's instruments measure. The truth (the
// craft's real age, the true isotope amounts) stays inside; panels show only measurements and estimates.
// Pure and deterministic: the same inputs and seed give the same model.

import { KM_S_TO_PC_PER_YEAR, angleBetweenDeg, norm, scale, sub, type Vec3 } from '../../science/astro';
import { rtgState, simulateRtgMeasurement, type RtgMeasurement } from '../../science/clocks';
import { discoveryState, starStateAt, type DiscoveryState } from '../../science/epoch';
import { NUCLIDES, type NuclideId } from '../../science/nuclides';
import { createRng } from '../../science/random';
import type { ScenarioData, StarCatalogue } from '../../science/types';
import { CRAFT_MASS_KG, DISH_DIAMETER_M, GALACTIC_ESCAPE_KM_S, ISOTOPE_RELATIVE_PRECISION } from './constants';
import {
  chemicalEstimate, decayEstimate, leftoverEstimate, sailAcceleration, sunlightEstimate, unheatedTemperatureK,
  type ChemicalEstimate, type DecayEstimate, type LeftoverEstimate, type SunlightEstimate,
} from './physics';

export interface SpectrumLine {
  /** Mass number. */
  mass: number;
  /** Measured atom fraction of the sample. */
  fraction: number;
}

export interface ArrivalModel {
  seed: string;
  discovery: DiscoveryState;
  /** The Sun from the craft (the bright star the dish faces): unit vector and distance, pc. */
  sunDirIcrs: Vec3;
  sunDistPc: number;
  /** Angle between the dish axis (pointed at the Sun, the scene's composition) and the craft's path back, deg. */
  dishVsPathBackDeg: number;
  /** The craft's speed past the home star, km/s (the alien matched it). */
  passSpeedKmS: number;
  /** Heat of the three cylinders together, W: low (radon escapes) and high (radon retained). */
  heatW: { low: number; high: number };
  /** Plutonium-239's share of the heat, W (it depends on the assumed plutonium mix). */
  pu239HeatW: number;
  /** Shortest time since the craft could have been at any catalogued star, years. */
  darkYears: number;
  estimates: {
    sunlight: SunlightEstimate;
    leftover: LeftoverEstimate;
    chemical: ChemicalEstimate;
    decay: DecayEstimate;
    sailAccelMs2: number;
    dishK: number;
  };
  measurement: RtgMeasurement;
  spectrum: SpectrumLine[];
}

/** The isotopes the mass spectrometer resolves, by mass number (isobars add: Pu-238 and U-238 at 238). */
const SPECTRUM: readonly (readonly NuclideId[])[] = [
  ['Ra226'], ['Th230'], ['U234'], ['U235'], ['U236'], ['Np237'], ['Pu238', 'U238'], ['Pu239'], ['Pu240'], ['Pu241', 'Am241'], ['Pu242'],
];

/**
 * Shortest time since the craft could have passed through any catalogued star: straight-line motion means
 * that if it was ever at star i, that was |r_i| / |v_i| ago (relative position and velocity now). For stars
 * with no measured radial velocity the relative speed is maximised over radial velocities up to the
 * Galactic escape speed, so the bound cannot be too long.
 */
export function yearsSinceAnyStar(stars: StarCatalogue, craftPosPc: Vec3, craftVelKmS: Vec3, year: number): number {
  let best = Infinity;
  for (const s of stars.near) {
    if (s.distPc === null) continue;
    // Unknown radial velocity: scan -533 to +533 km/s in 41 steps (13 km/s) and keep the shortest time.
    const variants = s.rvKmS === null ? Array.from({ length: 41 }, (_, i) => -GALACTIC_ESCAPE_KM_S + (i * GALACTIC_ESCAPE_KM_S) / 20) : [s.rvKmS];
    for (const rv of variants) {
      const st = starStateAt({ ...s, rvKmS: rv }, year);
      const t = norm(sub(st.posPc, craftPosPc)) / (norm(sub(craftVelKmS, st.velKmS)) * KM_S_TO_PC_PER_YEAR);
      if (t < best) best = t;
    }
  }
  return best;
}

function measuredSpectrum(atoms: Record<NuclideId, number>, m: RtgMeasurement, seed: string): SpectrumLine[] {
  const rng = createRng(seed).fork('arrival').fork('spectrum');
  const u234 = atoms.U234;
  const measured: Partial<Record<NuclideId, number>> = {
    U234: u234,
    Th230: u234 * m.th230OverU234,
    U238: u234 * m.u238OverU234,
  };
  measured.Ra226 = (measured.Th230 as number) * m.ra226OverTh230;
  const lines = SPECTRUM.map((ids) => {
    const isMeasured = ids.some((id) => measured[id] !== undefined);
    const n = isMeasured
      ? ids.reduce((s, id) => s + (measured[id] ?? 0), 0)
      : ids.reduce((s, id) => s + atoms[id], 0) * (1 + m.relativePrecision * rng.normal());
    return { mass: Math.round(NUCLIDES[ids[0] as NuclideId].massU), n: Math.max(0, n) };
  });
  const total = lines.reduce((s, l) => s + l.n, 0);
  return lines.map((l) => ({ mass: l.mass, fraction: l.n / total }));
}

export function buildArrival(scenario: ScenarioData, stars: StarCatalogue, seed: string): ArrivalModel {
  const discovery = discoveryState(scenario, stars);
  const craft = discovery.craft;
  // The Sun sits at the origin at rest (epoch.ts), so its direction from the craft is -position.
  const sunDistPc = norm(craft.posPc);
  const sunDirIcrs = scale(craft.posPc, -1 / sunDistPc);
  const state = rtgState(discovery.yearsAfterLaunch);
  const heatW = state.heatRangeW;
  const measurement = simulateRtgMeasurement(state, { relativePrecision: ISOTOPE_RELATIVE_PRECISION }, createRng(seed).fork('arrival').fork('isotopes'));
  return {
    seed,
    discovery,
    sunDirIcrs,
    sunDistPc,
    dishVsPathBackDeg: angleBetweenDeg(sunDirIcrs, scale(craft.velKmS, -1)),
    passSpeedKmS: discovery.relSpeedKmS,
    heatW,
    pu239HeatW: state.pu239HeatW,
    darkYears: yearsSinceAnyStar(stars, craft.posPc, craft.velKmS, discovery.decimalYear),
    estimates: {
      // Generous to each wrong answer: the lowest heat it must explain.
      sunlight: sunlightEstimate(sunDistPc, heatW.low),
      leftover: leftoverEstimate(heatW.low),
      chemical: chemicalEstimate(heatW.low),
      decay: decayEstimate(heatW.high),
      sailAccelMs2: sailAcceleration(sunDistPc, DISH_DIAMETER_M, CRAFT_MASS_KG),
      dishK: unheatedTemperatureK(),
    },
    measurement,
    spectrum: measuredSpectrum(state.atoms, measurement, seed),
  };
}
