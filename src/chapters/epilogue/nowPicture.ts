// "Where they are tonight": the picture at the top of Our Frame's "Right now". The Sun at the centre, both Voyagers
// and Earth placed from the JPL Horizons tables (data/ephemeris.json, Sun-centred ICRF km; src/science/ephemeris.ts
// interpolates them), turned into the plane of Earth's orbit (the ecliptic of J2000, the frame Horizons itself
// uses for its ecliptic output), so every direction around the Sun is true. Distances are squeezed so that 1 and
// 172 times Earth's distance fit on one screen; the picture states the squeeze with rings at 1, 10 and 100.
// The planets' orbits are the record's own table of distances (data/teaching.json, the L004 and L005 frames, read
// by src/science/teaching.ts; docs/research/teaching-frames.md "L004 and L005, Solar System parameters"), drawn
// as circles; the one cell that breaks the table's order (Pluto's "591", teaching-frames.md) is left out.
// Pure: no DOM, no clock of its own, no randomness.

import { DEG, norm, toSpherical, type Vec3 } from '../../science/astro';
import { hermiteState } from '../../science/ephemeris';
import { homeColumn, planetColumns, slips, type TeachingData } from '../../science/teaching';
import { AU_KM } from '../../science/units';
import { EARTH_ID, VOYAGER_IDS, tdbJdOf, type EphemerisBodies } from '../../science/voyagerNow';

/**
 * Obliquity of the ecliptic at J2000, the angle between the ICRF equator and the ecliptic plane: 84381.448 arcsec
 * (IAU 1976, Lieske et al. 1977). It is the value Horizons states for its "Ecliptic of J2000.0" frame
 * (docs/research/data/voyager/v1_sun.json, header: "IAU76 obliquity of 84381.448 arcseconds wrt ICRF X-Y plane")
 * and the one tools/data/build_pulsars.py uses. Radians.
 */
export const OBLIQUITY_J2000_RAD = (84381.448 / 3600) * DEG;

/** An ICRF (equatorial) vector turned into ecliptic-of-J2000 axes: a rotation by the obliquity about the x axis (the March equinox). */
export function icrfToEcliptic(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY_J2000_RAD);
  const s = Math.sin(OBLIQUITY_J2000_RAD);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}

/**
 * The squeezed distance used for drawing: log10(1 + r) for r in AU. Zero at the Sun, so the Sun stays at the centre;
 * the rings at 1, 10 and 100 AU fall at 0.30, 1.04 and 2.00. A drawing choice, stated on the picture.
 */
export function squeeze(au: number): number {
  return Math.log10(1 + au);
}

/** The rings the picture draws and labels, AU (times Earth's distance from the Sun). */
export const RINGS_AU = [1, 10, 100] as const;

export interface SkyBody {
  id: string;
  name: string;
  /** Ecliptic longitude, deg in [0, 360): the true direction around the Sun, counted from the March equinox. */
  lonDeg: number;
  /** Ecliptic latitude, deg: how far above (+) or below (-) the plane of Earth's orbit. */
  latDeg: number;
  /** Distance from the Sun, AU (the full distance, not the part in the plane). */
  au: number;
}

export interface PlanetRing {
  /** The table's column (1 = innermost). */
  column: number;
  name: string;
  /** The distance the record's table gives, AU. */
  au: number;
}

export interface SkyTonight {
  craft: SkyBody[];
  earth: SkyBody;
  /** Earth's path over the year up to `at`, as ecliptic longitude (deg) and distance (AU), every 10 days. */
  earthOrbit: { lonDeg: number; au: number }[];
  planets: PlanetRing[];
}

/**
 * The planets in the table's column order, outward from the Sun (docs/research/teaching-frames.md, the table's
 * columns: Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto). Names only; the
 * distances are the table's.
 */
const COLUMN_NAMES = ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const;

/** The planets' orbits from the record's table: every column with a distance, except home (drawn from the ephemeris) and the slip. */
export function planetRings(teaching: TeachingData): PlanetRing[] {
  const home = homeColumn(teaching);
  const slipped = new Set(slips(teaching).map((s) => s.column));
  return planetColumns(teaching)
    .filter((c) => c.read.distance !== undefined && c.index !== home && !slipped.has(c.index))
    .map((c) => ({ column: c.index, name: COLUMN_NAMES[c.index] ?? `column ${c.index}`, au: (c.read.distance as number) / AU_KM }));
}

function place(id: string, name: string, posKm: Vec3): SkyBody {
  const e = icrfToEcliptic(posKm);
  const { lonDeg, latDeg } = toSpherical(e);
  return { id, name, lonDeg, latDeg, au: norm(posKm) / AU_KM };
}

/** Days between the samples of Earth's year-long track: the ephemeris's own node spacing for Earth. */
const EARTH_TRACK_STEP_DAYS = 10;

/** Where both Voyagers and Earth are at `at`, in the ecliptic, with Earth's last year and the table's planets. Throws outside the tables. */
export function skyTonight(bodies: EphemerisBodies, teaching: TeachingData, at: Date): SkyTonight {
  const jd = tdbJdOf(at);
  const need = (id: string) => {
    const b = bodies[id];
    if (!b) throw new Error(`skyTonight: the ephemeris has no body ${id}`);
    return b;
  };
  const craft = VOYAGER_IDS.map((id, i) => place(id, i === 0 ? 'Voyager 1' : 'Voyager 2', hermiteState(need(id), jd).posKm));
  const earthBody = need(EARTH_ID);
  const earth = place(EARTH_ID, 'Earth', hermiteState(earthBody, jd).posKm);
  const earthOrbit: { lonDeg: number; au: number }[] = [];
  // One sidereal year back (365.256 days) closes the loop; clamp at the table's first node.
  const yearDays = 365.256;
  const steps = Math.ceil(yearDays / EARTH_TRACK_STEP_DAYS);
  for (let k = steps; k >= 0; k--) {
    const t = Math.max(earthBody.jd0, jd - (k * yearDays) / steps);
    const p = place(EARTH_ID, 'Earth', hermiteState(earthBody, t).posKm);
    earthOrbit.push({ lonDeg: p.lonDeg, au: p.au });
  }
  return { craft, earth, earthOrbit, planets: planetRings(teaching) };
}

/**
 * The picture's turn: the drawing is seen from the north side of Earth's orbit (anticlockwise is the planets'
 * way round, never mirrored) and turned so the two Voyagers, which both left southward of the Sun in the
 * ecliptic's own axes, point the way the screen has room: to the right on a wide screen (`towardDeg` 0), down on a
 * tall phone (-90). Returns the screen angle (deg, anticlockwise from the right) of ecliptic longitude zero, the
 * March equinox, which the picture marks. A turn, never a mirror: every angle between bodies stays true.
 */
export function equinoxScreenDeg(craft: readonly SkyBody[], towardDeg = 0): number {
  // the mean direction of the craft, by unit vectors (safe across 0/360)
  const x = craft.reduce((s, c) => s + Math.cos(c.lonDeg * DEG), 0);
  const y = craft.reduce((s, c) => s + Math.sin(c.lonDeg * DEG), 0);
  const mean = Math.atan2(y, x) / DEG;
  return towardDeg - mean;
}

/**
 * A body's place on the picture, in squeezed units with the Sun at [0, 0] and y pointing down the screen:
 * its ecliptic longitude turned by `equinoxDeg` (the screen angle of longitude zero), anticlockwise on screen as
 * seen from the north side of the ecliptic, at the squeezed distance.
 */
export function toScreen(lonDeg: number, au: number, equinoxDeg: number): [number, number] {
  const a = (lonDeg + equinoxDeg) * DEG;
  const r = squeeze(au);
  return [r * Math.cos(a), -r * Math.sin(a)];
}
