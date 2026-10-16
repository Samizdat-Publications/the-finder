// The story's epoch: where the craft, the home star and every catalogued star are at any time.
// Pure and deterministic: no DOM, no randomness, no file reads (callers pass the parsed data).
//
// Frame: solar-system barycentre (SSB), ICRS Cartesian axes. Positions in pc, velocities in km/s,
// times as decimal Julian years (2000 + (JD - 2451545.0) / 365.25, astro.ts). The Sun is put at the
// origin at rest: its offset from the SSB is about 0.01 AU (a few hundred thousand km, docs/research/
// voyager.md section 3 compares Sun-centred and SSB states), against about 150,000 AU of travel to
// the epoch, and its reflex speed (about 0.01 km/s) moves it a few hundred AU in 44,000 years at
// most, about 0.2% of the craft's 0.75 pc.
//
// Motion is linear (no Galactic potential), as in the research's DR3 recheck (voyager.md section 5).

import {
  KM_S_TO_PC_PER_YEAR,
  add,
  angleBetweenDeg,
  decimalYearToJd,
  dot,
  isoUtcToJd,
  jdToDecimalYear,
  norm,
  positionPc,
  scale,
  spaceVelocityKmS,
  sub,
  unitVector,
  type Vec3,
} from './astro';
import type { ScenarioData, StarCatalogue, StarRecord } from './types';
import { PARSEC_KM } from './units';

export interface BodyState {
  decimalYear: number;
  posPc: Vec3;
  velKmS: Vec3;
}

const ORIGIN: Vec3 = [0, 0, 0];

/** Decimal year of the scenario's Horizons reference state (TDB taken as TT; the < 2 ms difference is irrelevant). */
export function craftRefYear(scenario: ScenarioData): number {
  return jdToDecimalYear(scenario.craft.stateRef.jdTdb);
}

/** Decimal year of launch (UTC; the 48 s TT-UTC of 1977 is 1.5e-6 yr, ignored). */
export function launchYear(scenario: ScenarioData): number {
  return jdToDecimalYear(isoUtcToJd(scenario.craft.launchUtc));
}

/** The craft's asymptotic (escape) velocity, km/s: Bailer-Jones and Farnocchia 2019 RA, Dec and speed (scenario.json). */
export function craftAsymptoteKmS(scenario: ScenarioData): Vec3 {
  const a = scenario.craft.asymptote;
  return scale(unitVector(a.raDeg, a.decDeg), a.speedKmS);
}

/**
 * The craft: the Horizons SSB state at stateRef (km, converted to pc) plus the asymptotic velocity
 * times the time since then; its velocity is the asymptotic velocity.
 *
 * Why linear from 2026 is good enough: the Sun's remaining pull on a hyperbolic orbit displaces the
 * craft, relative to straight-line motion at v_inf, by about (GM_sun / v_inf^2) ln(r / r0). With
 * GM_sun = 1.327e11 km^3/s^2 (IAU nominal) and v_inf = 16.6 km/s that scale is 4.8e8 km = 3.2 AU, and
 * ln(150,000 AU / 172 AU) = 6.8, so about 20 AU by the epoch, against about 150,000 AU of travel
 * (1e-4 of the distance, 1e-4 pc at the closest approach, well inside the 0.01 pc test tolerance).
 * The Horizons speed today (16.92 km/s) is higher than v_inf because the craft is still climbing out
 * of the Sun's well; using v_inf from 2026 on is what Bailer-Jones and Farnocchia's asymptote means.
 */
export function craftStateAt(scenario: ScenarioData, decimalYear: number): BodyState {
  const ref = scenario.craft.stateRef;
  const p0: Vec3 = scale(ref.posKm, 1 / PARSEC_KM);
  const v = craftAsymptoteKmS(scenario);
  const dt = decimalYear - craftRefYear(scenario);
  return { decimalYear, posPc: add(p0, scale(v, KM_S_TO_PC_PER_YEAR * dt)), velKmS: v };
}

/**
 * A star by straight-line motion from its own astrometric epoch (J2000.0 for HYG, J2016.0 for Gaia DR3).
 * Stars with no radial velocity move with v_r = 0 and carry fullVelocity: false. The Sun (id 0) is at
 * the origin at rest. Throws for a star with unknown distance.
 */
export function starStateAt(star: StarRecord, decimalYear: number): BodyState & { fullVelocity: boolean } {
  if (star.id === 0) return { decimalYear, posPc: ORIGIN, velKmS: ORIGIN, fullVelocity: true };
  if (star.distPc === null) throw new Error(`starStateAt: star ${star.id} has no distance`);
  const p0 = positionPc(star.raDeg, star.decDeg, star.distPc);
  const fullVelocity = star.rvKmS !== null;
  const v = spaceVelocityKmS(star.raDeg, star.decDeg, star.distPc, star.pmraMasYr, star.pmdecMasYr, star.rvKmS ?? 0);
  const dt = decimalYear - star.epoch;
  return { decimalYear, posPc: add(p0, scale(v, KM_S_TO_PC_PER_YEAR * dt)), velKmS: v, fullVelocity };
}

/** The home star, by its HYG id, else by its Gliese name "Gl 445"; throws if absent. */
export function findHomeStar(scenario: ScenarioData, stars: StarCatalogue): StarRecord {
  const all = [...stars.near, ...stars.sky];
  const hygId = scenario.homeStar.hygId;
  if (hygId !== null) {
    const hit = all.find((s) => s.id === hygId);
    if (hit) return hit;
  }
  const glNames = [scenario.homeStar.name, ...scenario.homeStar.otherNames]
    .map((n) => n.replace(/^Gliese\s+/i, 'Gl '))
    .filter((n) => /^Gl\s/.test(n));
  for (const g of glNames) {
    const hit = all.find((s) => s.gl === g);
    if (hit) return hit;
  }
  throw new Error(`findHomeStar: ${scenario.homeStar.name} (HYG ${hygId ?? 'none'}) is not in the star catalogue`);
}

export interface DiscoveryState {
  decimalYear: number;
  yearsAfterLaunch: number;
  jdTdb: number;
  craft: BodyState;
  home: BodyState;
  minDistPc: number;
  relSpeedKmS: number;
}

/** The discovery epoch: closest approach of the craft to the home star (linear motion, closed form). */
export function discoveryState(scenario: ScenarioData, stars: StarCatalogue): DiscoveryState {
  const homeStar = findHomeStar(scenario, stars);
  const t0 = craftRefYear(scenario);
  const c0 = craftStateAt(scenario, t0);
  const h0 = starStateAt(homeStar, t0);
  // Relative position r(t) = r0 + w (t - t0), w in pc/yr; |r| is smallest at t0 - (r0 . w) / (w . w).
  const r0 = sub(c0.posPc, h0.posPc);
  const dv = sub(c0.velKmS, h0.velKmS);
  const w = scale(dv, KM_S_TO_PC_PER_YEAR);
  const t = t0 - dot(r0, w) / dot(w, w);
  const craft = craftStateAt(scenario, t);
  const home = starStateAt(homeStar, t);
  return {
    decimalYear: t,
    yearsAfterLaunch: t - launchYear(scenario),
    jdTdb: decimalYearToJd(t),
    craft,
    home: { decimalYear: t, posPc: home.posPc, velKmS: home.velKmS },
    minDistPc: norm(sub(craft.posPc, home.posPc)),
    relSpeedKmS: norm(dv),
  };
}

export interface Observer extends BodyState {
  /** 3x3 covariances (ICRS Cartesian) from the home star's Gaia DR3 errors, propagated; pc^2 and (km/s)^2. */
  posCov: number[][];
  velCov: number[][];
  /**
   * The position covariance of the Gaia measurement itself, at the catalogue epoch (no propagation
   * over time), pc^2. kinematics.ts uses it as the model of a survey's position precision.
   */
  measPosCov?: number[][];
  /** The distance from the Sun at which that measurement was made (the catalogue distance), pc. */
  measDistPc?: number;
  /** Catalogue id of the observer's star. */
  starId?: number;
}

/** Jacobian (rows: output components, cols: parameters) by central differences of step h_j. */
function jacobian(f: (p: number[]) => number[], p: readonly number[], h: readonly number[]): number[][] {
  const cols = p.map((_, j) => {
    const hp = p.slice();
    const hm = p.slice();
    hp[j] = (hp[j] as number) + (h[j] as number);
    hm[j] = (hm[j] as number) - (h[j] as number);
    const fp = f(hp);
    const fm = f(hm);
    return fp.map((x, i) => (x - (fm[i] as number)) / (2 * (h[j] as number)));
  });
  const n = cols[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i] as number));
}

/** J diag(sigma^2) J^T, restricted to rows [r0, r0 + 3). */
function covBlock(J: number[][], sigma: readonly number[], r0: number, c0: number): number[][] {
  return [0, 1, 2].map((i) =>
    [0, 1, 2].map((k) => sigma.reduce((acc, s, j) => acc + (J[r0 + i]![j] as number) * s * s * (J[c0 + k]![j] as number), 0)),
  );
}

/**
 * The alien observatory: the home star's barycentre at an epoch, with its measurement covariance.
 *
 * Inputs are the Gaia DR3 1-sigma errors on parallax, pmra*, pmdec and radial velocity (stars.json,
 * Gaia DR3 query in tools/sources.json). Their published correlations (and the RA, Dec errors, about
 * 0.02 mas, negligible) are not in the data file and are ignored: the covariance is J diag(sigma^2)
 * J^T with J the Jacobian of (position at the epoch, space velocity) with respect to the four
 * parameters, by central differences (the map is smooth; a step of one sigma leaves truncation error
 * of order sigma^2 / value^2 = 1e-8 relative). epoch.test.ts checks it against a 20,000-draw seeded
 * Monte Carlo. posCov includes the growth of the position error over the time from the Gaia epoch.
 */
export function homeObserver(scenario: ScenarioData, stars: StarCatalogue, decimalYear: number): Observer {
  const star = findHomeStar(scenario, stars);
  const st = starStateAt(star, decimalYear);
  const plx = star.parallaxMas ?? null;
  const errs = [star.parallaxErrMas, star.pmraErrMasYr, star.pmdecErrMasYr, star.rvErrKmS];
  if (plx === null || star.rvKmS === null || errs.some((e) => e === undefined || e === null)) {
    throw new Error(`homeObserver: ${scenario.homeStar.name} has no Gaia DR3 parallax, radial velocity and errors in the catalogue`);
  }
  const sigma = errs as number[];
  const p = [plx, star.pmraMasYr, star.pmdecMasYr, star.rvKmS];
  const stateFor = (q: number[], year: number): number[] => {
    const s = starStateAt(
      { ...star, distPc: 1000 / (q[0] as number), pmraMasYr: q[1] as number, pmdecMasYr: q[2] as number, rvKmS: q[3] as number },
      year,
    );
    return [...s.posPc, ...s.velKmS];
  };
  const J = jacobian((q) => stateFor(q, decimalYear), p, sigma);
  const Jm = jacobian((q) => stateFor(q, star.epoch), p, sigma);
  return {
    decimalYear,
    posPc: st.posPc,
    velKmS: st.velKmS,
    posCov: covBlock(J, sigma, 0, 0),
    velCov: covBlock(J, sigma, 3, 3),
    measPosCov: covBlock(Jm, sigma, 0, 0),
    measDistPc: 1000 / plx,
    starId: star.id,
  };
}

function allWithDistance(stars: StarCatalogue): StarRecord[] {
  return [...stars.near, ...stars.sky].filter((s) => s.distPc !== null);
}

/** Order by key, ties by catalogue id, so results never depend on input order. */
function byKeyThenId<T extends { star: StarRecord }>(key: (x: T) => number): (a: T, b: T) => number {
  return (a, b) => key(a) - key(b) || a.star.id - b.star.id;
}

/** The k catalogued stars nearest a point at an epoch (near and sky lists; stars without a distance skipped). */
export function nearestStars(
  stars: StarCatalogue,
  centerPc: Vec3,
  decimalYear: number,
  k: number,
  excludeIds: number[] = [],
): { star: StarRecord; distPc: number; fullVelocity: boolean }[] {
  const skip = new Set(excludeIds);
  return allWithDistance(stars)
    .filter((s) => !skip.has(s.id))
    .map((star) => {
      const st = starStateAt(star, decimalYear);
      return { star, distPc: norm(sub(st.posPc, centerPc)), fullVelocity: st.fullVelocity };
    })
    .sort(byKeyThenId((x) => x.distPc))
    .slice(0, k);
}

/**
 * The Sun's absolute V magnitude, 4.81 (Willmer 2018, ApJS 236, 47, Table 3, on the IAU 2015 Resolution
 * B3 solar zero point). Used for the Sun in place of HYG's 4.85 (stars.json), a 0.04 mag difference.
 */
export const SUN_ABS_MAG_V = 4.81;

/** Absolute V magnitude used for a star: the modern solar value for the Sun, the catalogue's otherwise. */
export function absMagV(star: StarRecord): number {
  return star.id === 0 ? SUN_ABS_MAG_V : star.absmag;
}

/** Apparent magnitude from absolute magnitude and distance (distance modulus, no extinction within a few pc). */
export function apparentMagnitude(absmag: number, distPc: number): number {
  return absmag + 5 * Math.log10(distPc / 10);
}

/**
 * Brightest stars seen from a point at an epoch (near and sky lists), by apparent magnitude. Stars
 * closer than 1e-6 pc (the observer's own star) and stars without a catalogued distance are skipped;
 * the latter are all fainter than mag 3.3 from the Sun (sky.json) and far away, so they cannot reach a
 * top-ten list. Extinction is ignored (negligible within tens of pc).
 */
export function brightestStars(
  stars: StarCatalogue,
  observerPc: Vec3,
  decimalYear: number,
  k: number,
  excludeIds: number[] = [],
): { star: StarRecord; distPc: number; appMag: number }[] {
  const skip = new Set(excludeIds);
  const out: { star: StarRecord; distPc: number; appMag: number }[] = [];
  for (const star of allWithDistance(stars)) {
    if (skip.has(star.id)) continue;
    const d = norm(sub(starStateAt(star, decimalYear).posPc, observerPc));
    if (d < 1e-6) continue;
    out.push({ star, distPc: d, appMag: apparentMagnitude(absMagV(star), d) });
  }
  return out.sort(byKeyThenId((x) => x.appMag)).slice(0, k);
}

/** Angle between the craft's 2026 SSB position vector and its asymptote, deg. */
export function asymptoteAngleDeg(scenario: ScenarioData): number {
  return angleBetweenDeg(scenario.craft.stateRef.posKm, craftAsymptoteKmS(scenario));
}
