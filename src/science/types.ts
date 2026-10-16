// Types for the committed data files in data/ (built by tools/data/ from the cited sources).
// The science core never reads files: callers (tests, the game's loaders) parse the JSON and pass
// these objects in, so src/science stays pure and runs the same in Node and the browser.
// Field names and units follow data/README.md; keep the two in step.

export type Vec3 = [number, number, number];

/** One etched binary number on the cover. valueTH is the integer in hydrogen-transition units. */
export interface CoverNumber {
  binary: string;
  bits: number;
  valueTH: number;
  meaning: string;
  location: string;
  provenance: string;
}

export interface CoverMapLine {
  /** 1..14, counter-clockwise map order (increasing angle from the galactic-centre line). */
  order: number;
  label1972: string;
  bname: string;
  jname: string;
  binary: string;
  bits: number;
  valueTH: number;
  /** Angle counter-clockwise from the galactic-centre line, degrees (equals galactic longitude). */
  mapAngleDeg: number;
  /** Solid-line length (in-plane distance) over the centre-line length R0. */
  rOverR0: number;
  /** Distance from the line's outer end back to its tick, over R0; null when too close to resolve. */
  absZOverR0: number | null;
  broken: boolean;
  breakR0: [number, number] | null;
  digitsAlongOwnLine: boolean;
  provenance: string;
}

export interface CoverData {
  record: { rotationPeriod: CoverNumber; playTime: CoverNumber };
  picture: { lineTime: CoverNumber; rasterLines: CoverNumber; lineLabels: CoverNumber[] };
  pulsarMap: { gcLine: { lengthSvg: number; angleDeg: number }; lines: CoverMapLine[] };
}

/** One ATNF v2.9.0 pulsar. Units: s, s/s, Hz, Hz/s, MJD, pc cm^-3, kpc, mas, deg, mas/yr. */
export interface PulsarRecord {
  jname: string;
  bname: string | null;
  p0: number | null;
  p1: number | null;
  f0: number | null;
  f1: number | null;
  f2: number | null;
  f3: number | null;
  pepoch: number | null;
  dm: number | null;
  dist: number | null;
  distDm: number | null;
  px: number | null;
  ra: number;
  dec: number;
  gl: number;
  gb: number;
  /** Includes cos(dec). */
  pmra: number | null;
  pmdec: number | null;
  nglt: number | null;
  assoc: string | null;
  binary: boolean;
  f0Err: number | null;
  f1Err: number | null;
  /** 1-sigma errors; absent or null when the catalogue has none. */
  pxErr?: number | null;
  pmraErr?: number | null;
  pmdecErr?: number | null;
}

export interface PulsarCatalogue {
  meta: { catalogue: string; count: number; citation: string; built: string };
  pulsars: PulsarRecord[];
}

export interface GlitchRecord {
  mjd: number;
  /** Dimensionless fractional frequency jump. */
  dfOverF: number;
  df1OverF1: number | null;
  dfOverFErr?: number | null;
  df1OverF1Err?: number | null;
  mjdErr?: number | null;
  /** Glitch number in the source table. */
  n?: number;
  ref?: string;
}

export interface GlitchData {
  meta: Record<string, unknown>;
  pulsars: Record<string, GlitchRecord[]>;
}

/** One star. Positions in degrees at `epoch` (decimal year), distance in pc, motions in mas/yr and km/s. */
export interface StarRecord {
  id: number;
  name: string | null;
  gl: string | null;
  hip: number | null;
  hd: number | null;
  raDeg: number;
  decDeg: number;
  /** null when HYG gives no distance (stored 100000 = unknown); only `sky` rows can be null (data/README.md). */
  distPc: number | null;
  /** Includes cos(dec) (see data/README.md). */
  pmraMasYr: number;
  pmdecMasYr: number;
  rvKmS: number | null;
  /** True when the radial velocity is the system primary's (a companion without its own; tools/data/build_stars.py). */
  rvFromPrimary?: boolean;
  mag: number;
  absmag: number;
  spect: string | null;
  ci: number | null;
  astrometrySource: 'hyg' | 'gaia-dr3';
  epoch: number;
  /** Gaia DR3 1-sigma errors, present only when astrometrySource is gaia-dr3. */
  parallaxMas?: number | null;
  parallaxErrMas?: number | null;
  pmraErrMasYr?: number | null;
  pmdecErrMasYr?: number | null;
  rvErrKmS?: number | null;
  gaiaDr3SourceId?: string;
}

/** In memory: data/stars.json (near) plus data/sky.json (stored columnar, expanded by the loader). */
export interface StarCatalogue {
  meta: Record<string, unknown>;
  /** Stars within 30 pc, plus the Sun (id 0, at the origin with zero velocity). */
  near: StarRecord[];
  /** Naked-eye stars (mag <= 6.5) beyond 30 pc or with unknown distance. */
  sky: StarRecord[];
}

/** data/sky.json as stored: one row per star, fields named by `columns` (the StarRecord fields). */
export interface ColumnarStars {
  meta: Record<string, unknown>;
  columns: string[];
  rows: unknown[][];
}

/** Expands a columnar star table into StarRecords. */
export function expandColumnar(table: ColumnarStars): StarRecord[] {
  return table.rows.map((row) => {
    const rec: Record<string, unknown> = {};
    table.columns.forEach((col, i) => {
      rec[col] = row[i];
    });
    return rec as unknown as StarRecord;
  });
}

export interface EphemerisBody {
  /** TDB Julian date of the first row. */
  jd0: number;
  stepDays: number;
  /** [x, y, z, vx, vy, vz] in km and km/s, ICRF, Sun-centred. */
  rows: [number, number, number, number, number, number][];
}

export interface EphemerisData {
  meta: Record<string, unknown>;
  bodies: Record<string, EphemerisBody>;
}

export interface EphemerisSpotChecks {
  checks: { body: string; jd: number; x: number; y: number; z: number }[];
}

export interface ScenarioData {
  id: string;
  craft: {
    name: string;
    horizonsId: string;
    launchUtc: string;
    launchSource?: string;
    asymptote: { raDeg: number; decDeg: number; speedKmS: number; frame: string; source: string };
    stateRef: { jdTdb: number; posKm: Vec3; velKmS: Vec3; center: string; frame: string; source: string; query?: string };
  };
  homeStar: { name: string; otherNames: string[]; gaiaDr3SourceId: string; hygId: number | null; hip?: number | null };
  discoveryRule: string;
  alternative: {
    craft: string;
    horizonsId: string;
    asymptote: { raDeg: number; decDeg: number; speedKmS: number };
    homeStar: string;
    homeStarHygId?: number | null;
  };
}
