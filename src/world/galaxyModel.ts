// The galaxy chart's model: the alien's pulsar catalogue at the discovery epoch, placed in 3D around the
// alien's own star, plus the cover map's rays, the player's matches and the fitted origin region, all as
// plain numbers. Pure: no three.js, no DOM, no randomness of its own (the catalogue's simulated
// measurements come from projectCatalogue with the playthrough's seed). Tested in galaxyModel.test.ts.
//
// Frame: Galactic Cartesian (x toward the Galactic centre, y toward l = 90 deg, z toward the north
// Galactic pole), origin at the alien's star (Gliese 445) at the discovery epoch, unit kpc. A pulsar's
// position is what the alien itself would plot: its measured direction (AlienPulsar.nHat, from the
// observer) times its catalogue distance (AlienPulsar.distKpc). Pulsars without a catalogue distance
// cannot be placed and are counted, not drawn.

import { angleBetweenDeg, norm, scale, sub, toGalacticCartesian, unitVector, type Vec3 } from '../science/astro';
import { type Observer } from '../science/epoch';
import { OLD_TAU_C_YEARS, type AlienPulsar } from '../science/pulsarEpoch';
import { characteristicAgeYears } from '../science/pulsars';
import type { CoverData } from '../science/types';

/**
 * The modern distance to the Galactic centre (Sgr A*), kpc: 8.275 +/- 0.009 (stat) +/- 0.033 (sys)
 * (GRAVITY Collaboration 2021, A&A 647, A59, Eq. 38; docs/research/galaxy-constants.md). The two
 * errors combined in quadrature give 0.034 kpc.
 */
export const GC_DISTANCE_KPC = 8.275;
export const GC_DISTANCE_SIGMA_KPC = Math.hypot(0.009, 0.033);

/**
 * Sgr A*, J2000 (VLBA): RA 17h45m40.0409s, Dec -29d00m28.118s (Reid and Brunthaler 2004, ApJ 616, 872;
 * docs/research/galaxy-constants.md). The centre's direction is taken from it (l = 359.944, b = -0.046 deg), not assumed at l = b = 0.
 */
export const SGR_A_RA_DEG = (17 + 45 / 60 + 40.0409 / 3600) * 15;
export const SGR_A_DEC_DEG = -(29 + 0 / 60 + 28.118 / 3600);

/**
 * Period below which a pulsar is drawn as millisecond (recycled), s: 30 ms, a common convention (Lorimer,
 * "Binary and Millisecond Pulsars", Living Reviews in Relativity; other papers cut at 16 or 20 ms:
 * docs/research/galaxy-constants.md). A display class only.
 */
export const MSP_PERIOD_S = 0.03;

/** Young or old: the same characteristic-age boundary the dating uses (pulsarEpoch.ts OLD_TAU_C_YEARS, 300,000 yr). */
export const YOUNG_TAU_C_YEARS = OLD_TAU_C_YEARS;

export type PulsarClass = 'millisecond' | 'young' | 'old' | 'noSpinDown';

/**
 * Display size hint by class, CSS px (a display choice): young pulsars largest (the map's Crab and Vela
 * are among them), old medium, millisecond and pulsars without a measured spin-down smallest.
 */
export const CLASS_SIZE_PX: Readonly<Record<PulsarClass, number>> = { young: 5, old: 3.6, millisecond: 2.4, noSpinDown: 2.4 };

/** Class from what the alien measures: the observed period and spin-down at the epoch. */
export function pulsarClass(p: Pick<AlienPulsar, 'pObs' | 'pdotMeas'>): PulsarClass {
  if (p.pObs < MSP_PERIOD_S) return 'millisecond';
  if (p.pdotMeas === null || !(p.pdotMeas > 0)) return 'noSpinDown';
  return characteristicAgeYears(p.pObs, p.pdotMeas) < YOUNG_TAU_C_YEARS ? 'young' : 'old';
}

/**
 * Brightness by distance from the alien's star (a display choice, monotonic non-increasing): alpha 0.8 at
 * 0.1 kpc or closer, falling linearly in log distance to 0.3 at 30 kpc and beyond (0.8, not 1, so the
 * thousands of points near the Sun's side of the galaxy do not add up to a white blob).
 */
export function alphaForDistance(distKpc: number): number {
  const f = Math.min(1, Math.max(0, Math.log10(distKpc / 0.1) / Math.log10(300)));
  return 0.8 - 0.5 * f;
}

export interface ChartPulsar {
  jname: string;
  bname: string | null;
  /** Position from the alien's star, Galactic Cartesian, kpc. */
  posKpc: Vec3;
  distKpc: number;
  cls: PulsarClass;
  /** The catalogue entry the alien holds (projectCatalogue's output, unchanged). */
  entry: AlienPulsar;
}

export interface GalaxyModel {
  decimalYear: number;
  /** Shown pulsars (those with a distance), in catalogue order. */
  pulsars: ChartPulsar[];
  counts: { catalogue: number; shown: number; noDistance: number } & Record<PulsarClass, number>;
  /** The Galactic centre from the alien's star. */
  gc: { posKpc: Vec3; distKpc: number; sigmaKpc: number; lDeg: number; bDeg: number };
  /** Packed for the GPU (shown pulsars, same order): xyz kpc, size px, alpha. */
  positions: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
}

/** Builds the chart from the alien's catalogue (projectCatalogue output) and the observer it was projected for. */
export function buildGalaxy(alien: readonly AlienPulsar[], observer: Observer): GalaxyModel {
  const shown: ChartPulsar[] = [];
  for (const a of alien) {
    if (a.distKpc === null) continue;
    shown.push({ jname: a.jname, bname: a.bname, posKpc: scale(toGalacticCartesian(a.nHat), a.distKpc), distKpc: a.distKpc, cls: pulsarClass(a), entry: a });
  }
  const counts = { catalogue: alien.length, shown: shown.length, noDistance: alien.length - shown.length, millisecond: 0, young: 0, old: 0, noSpinDown: 0 };
  const n = shown.length;
  const positions = new Float32Array(3 * n);
  const sizes = new Float32Array(n);
  const alphas = new Float32Array(n);
  shown.forEach((p, i) => {
    counts[p.cls]++;
    positions.set(p.posKpc, 3 * i);
    sizes[i] = CLASS_SIZE_PX[p.cls];
    alphas[i] = alphaForDistance(p.distKpc);
  });
  // The centre: Sgr A* at the modern distance from the Sun, seen from the observer (a few pc away).
  const gcFromSun = scale(toGalacticCartesian(unitVector(SGR_A_RA_DEG, SGR_A_DEC_DEG)), GC_DISTANCE_KPC);
  const gcPos = sub(gcFromSun, scale(toGalacticCartesian(observer.posPc), 1e-3));
  const d = norm(gcPos);
  return {
    decimalYear: observer.decimalYear,
    pulsars: shown,
    counts,
    gc: {
      posKpc: gcPos,
      distKpc: d,
      sigmaKpc: GC_DISTANCE_SIGMA_KPC,
      lDeg: wrapDeg360((Math.atan2(gcPos[1], gcPos[0]) * 180) / Math.PI),
      bDeg: (Math.asin(gcPos[2] / d) * 180) / Math.PI,
    },
    positions,
    sizes,
    alphas,
  };
}

const wrapDeg360 = (x: number): number => ((x % 360) + 360) % 360;

// ---- The cover map overlay ----

/**
 * Where the player has put the map on the chart: the point all lines start from (Galactic Cartesian,
 * kpc), the map's rotation (deg, counter-clockwise seen from the north Galactic pole; a map angle a is
 * drawn at Galactic bearing a + rotationDeg, the same convention as triangulation.ts alpha) and its
 * scale (kpc per R0, the centre line's length). The map is drawn in the plane z = origin z.
 */
export interface MapTransform {
  originKpc: Vec3;
  rotationDeg: number;
  kpcPerR0: number;
}

export interface MapRay {
  /** 0 for the Galactic-centre line, 1 to 14 for the pulsar lines (cover.json order). */
  order: number;
  /** The pulsar the cover's line stands for (cover.json), null for the centre line. Only tests and the matches read it. */
  jname: string | null;
  /** Drawn bearing, deg in [0, 360): the map angle plus the rotation. */
  angleDeg: number;
  start: Vec3;
  end: Vec3;
  /** The height tick (absZOverR0 back from the outer end), when the cover has one. */
  tick: Vec3 | null;
}

/** The cover's 15 lines (the centre line and 14 pulsars) as rays on the chart. */
export function mapRays(map: CoverData['pulsarMap'], t: MapTransform): MapRay[] {
  const o = t.originKpc;
  const ray = (order: number, jname: string | null, angleDeg: number, rOverR0: number, absZ: number | null): MapRay => {
    const a = wrapDeg360(angleDeg + t.rotationDeg);
    const u: Vec3 = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), 0];
    const at = (r: number): Vec3 => [o[0] + u[0] * r * t.kpcPerR0, o[1] + u[1] * r * t.kpcPerR0, o[2]];
    return { order, jname, angleDeg: a, start: [o[0], o[1], o[2]], end: at(rOverR0), tick: absZ === null ? null : at(Math.max(0, rOverR0 - absZ)) };
  };
  // The centre line's tick sits at its end (z = 0; cover.json gcLine.meaning).
  return [ray(0, null, map.gcLine.angleDeg, 1, 0), ...map.lines.map((l) => ray(l.order, l.jname, l.mapAngleDeg, l.rOverR0, l.absZOverR0))];
}

/** The transform a triangulation fit implies: origin (pc to kpc, in the plane), rotation alpha, scale exp(lnScale) pc per R0. */
export function transformFromFit(fit: { originPc: readonly [number, number]; alphaDeg: number; lnScale: number }, zKpc = 0): MapTransform {
  return { originKpc: [fit.originPc[0] / 1000, fit.originPc[1] / 1000, zKpc], rotationDeg: fit.alphaDeg, kpcPerR0: Math.exp(fit.lnScale) / 1000 };
}

export interface MatchSegment {
  order: number;
  jname: string;
  from: Vec3;
  to: Vec3;
  /** Angle between the map line and the direction from the map's origin to the assigned pulsar, deg. */
  offsetDeg: number;
}

/** A link from each map line (by order) to the pulsar the player assigned to it. Unknown names are skipped. */
export function matchSegments(rays: readonly MapRay[], pairs: readonly { order: number; jname: string }[], pulsars: readonly ChartPulsar[]): MatchSegment[] {
  const byName = new Map(pulsars.map((p) => [p.jname, p]));
  const out: MatchSegment[] = [];
  for (const pr of pairs) {
    const r = rays.find((x) => x.order === pr.order);
    const p = byName.get(pr.jname);
    if (!r || !p) continue;
    const toP = sub(p.posKpc, r.start);
    out.push({ order: pr.order, jname: pr.jname, from: r.end, to: p.posKpc, offsetDeg: angleBetweenDeg(sub(r.end, r.start), [toP[0], toP[1], 0]) });
  }
  return out;
}

/** The fitted origin region (triangulation.ts OriginRegion: centre, 95% semi-axes, major-axis direction). */
export interface RegionEllipse {
  centerPc: readonly [number, number];
  semiAxesPc: readonly [number, number];
  majorAxisDeg: number;
}

/** The region's boundary as a closed polygon of n points in the plane z = zKpc, kpc. */
export function regionOutline(r: RegionEllipse, n = 96, zKpc = 0): Vec3[] {
  const phi = (r.majorAxisDeg * Math.PI) / 180;
  const [a, b] = r.semiAxesPc;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const u = a * Math.cos(t);
    const v = b * Math.sin(t);
    out.push([(r.centerPc[0] + u * Math.cos(phi) - v * Math.sin(phi)) / 1000, (r.centerPc[1] + u * Math.sin(phi) + v * Math.cos(phi)) / 1000, zKpc]);
  }
  return out;
}
