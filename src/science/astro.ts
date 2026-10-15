// Coordinates, motion and dates. Pure; used by the epoch and kinematics modules.

import { AU_KM, JULIAN_YEAR_S, PARSEC_KM } from './units';

export type Vec3 = readonly [number, number, number];

export const DEG = Math.PI / 180;

/**
 * Defining angles of the galactic frame in ICRS, deg (Hipparcos catalogue, ESA 1997, vol. 1,
 * section 1.5.3; the same definition astropy uses): north galactic pole RA, Dec, and the galactic
 * longitude of the ascending node of the galactic plane on the equator.
 */
export const NGP_RA_DEG = 192.85948;
export const NGP_DEC_DEG = 27.12825;
export const L_OMEGA_DEG = 32.93192;

/**
 * km/s per (mas/yr x pc): 1 au per Julian year in km/s, divided by 1000 for milliarcseconds.
 * = 4.740470464e-3 (IAU au and Julian year; see units.ts).
 */
export const KMS_PER_MASYR_PC = AU_KM / JULIAN_YEAR_S / 1000;

/** Parsecs per year travelled at 1 km/s: Julian year (s) / parsec (km) = 1.0227e-6. */
export const KM_S_TO_PC_PER_YEAR = JULIAN_YEAR_S / PARSEC_KM;

export function unitVector(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Angle between two vectors, deg (atan2 form, accurate for small and large angles). */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  return Math.atan2(norm(cross(a, b)), dot(a, b)) / DEG;
}

/** Angular separation of two sky positions, deg. */
export function separationDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  return angleBetweenDeg(unitVector(ra1, dec1), unitVector(ra2, dec2));
}

/** Longitude and latitude (deg, longitude in [0, 360)) of a vector. */
export function toSpherical(v: Vec3): { lonDeg: number; latDeg: number } {
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  if (lon >= 360) lon -= 360;
  return { lonDeg: lon, latDeg: Math.atan2(v[2], Math.hypot(v[0], v[1])) / DEG };
}

/**
 * ICRS-to-galactic rotation matrix (rows = galactic x, y, z axes in ICRS), built from the Hipparcos
 * defining angles. The test compares it with the 10-decimal matrix printed in ESA 1997.
 */
function buildGalacticMatrix(): readonly [Vec3, Vec3, Vec3] {
  const z = unitVector(NGP_RA_DEG, NGP_DEC_DEG);
  const node = unitVector(NGP_RA_DEG + 90, 0); // ascending node of the galactic plane on the equator
  const lo = L_OMEGA_DEG * DEG;
  const x = sub(scale(node, Math.cos(lo)), scale(cross(z, node), Math.sin(lo)));
  const y = cross(z, x);
  return [x, y, z];
}

export const ICRS_TO_GALACTIC: readonly [Vec3, Vec3, Vec3] = buildGalacticMatrix();

/** Rotate an ICRS Cartesian vector into galactic Cartesian (x to the centre, z to the NGP). */
export function toGalacticCartesian(v: Vec3): Vec3 {
  const [x, y, z] = ICRS_TO_GALACTIC;
  return [dot(x, v), dot(y, v), dot(z, v)];
}

/** Rotate a galactic Cartesian vector back into ICRS (transpose of the rotation). */
export function galacticToIcrsCartesian(g: Vec3): Vec3 {
  const [x, y, z] = ICRS_TO_GALACTIC;
  return add(add(scale(x, g[0]), scale(y, g[1])), scale(z, g[2]));
}

export function icrsToGalactic(raDeg: number, decDeg: number): { lDeg: number; bDeg: number } {
  const s = toSpherical(toGalacticCartesian(unitVector(raDeg, decDeg)));
  return { lDeg: s.lonDeg, bDeg: s.latDeg };
}

export function galacticToIcrs(lDeg: number, bDeg: number): { raDeg: number; decDeg: number } {
  const s = toSpherical(galacticToIcrsCartesian(unitVector(lDeg, bDeg)));
  return { raDeg: s.lonDeg, decDeg: s.latDeg };
}

/** Heliocentric ICRS position, pc. */
export function positionPc(raDeg: number, decDeg: number, distPc: number): Vec3 {
  return scale(unitVector(raDeg, decDeg), distPc);
}

/**
 * ICRS Cartesian space velocity, km/s, from proper motion (pmra includes cos dec), distance and
 * radial velocity: v = vr r + 4.74047e-3 d (mu_a* p + mu_d q), with p and q the local east and north
 * unit vectors (standard astrometric relation, e.g. ESA 1997 vol. 1 section 1.5.5).
 */
export function spaceVelocityKmS(
  raDeg: number,
  decDeg: number,
  distPc: number,
  pmraMasYr: number,
  pmdecMasYr: number,
  rvKmS: number,
): Vec3 {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const r = unitVector(raDeg, decDeg);
  const p: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const q: Vec3 = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const k = KMS_PER_MASYR_PC * distPc;
  return add(scale(r, rvKmS), add(scale(p, k * pmraMasYr), scale(q, k * pmdecMasYr)));
}

/** Straight-line motion: position (pc) after dtYears at velocity (km/s). */
export function propagateLinear(posPc: Vec3, velKmS: Vec3, dtYears: number): Vec3 {
  return add(posPc, scale(velKmS, KM_S_TO_PC_PER_YEAR * dtYears));
}

/** Julian Date of J2000.0 (2000 January 1, 12h TT). */
export const JD_J2000 = 2_451_545.0;
/** MJD = JD - 2,400,000.5. */
export const MJD_OFFSET = 2_400_000.5;

/** Decimal year in Julian years from J2000: 2000 + (JD - 2451545.0) / 365.25. */
export function jdToDecimalYear(jd: number): number {
  return 2000 + (jd - JD_J2000) / 365.25;
}

export function decimalYearToJd(year: number): number {
  return JD_J2000 + (year - 2000) * 365.25;
}

export function mjdToDecimalYear(mjd: number): number {
  return jdToDecimalYear(mjd + MJD_OFFSET);
}

/**
 * ISO 8601 UTC timestamp to Julian Date (UTC scale; the 69 s TT-UTC offset is below 3e-6 yr and is
 * ignored). Unix epoch 1970-01-01T00:00Z is JD 2440587.5.
 */
export function isoUtcToJd(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`isoUtcToJd: cannot parse "${iso}"`);
  return ms / 86_400_000 + 2_440_587.5;
}
