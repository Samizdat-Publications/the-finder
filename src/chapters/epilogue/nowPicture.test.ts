// "Where they are tonight" against independent truth: Horizons' own ecliptic-of-J2000 vectors for 2026-10-15
// 00:00 TDB (docs/research/data/voyager/v1_sun.json and v2_sun.json, fetched for the research note, not used to
// build data/ephemeris.json, which is ICRF on 30-day nodes), the plane of Earth's orbit, and the record's table of
// planet distances as docs/research/teaching-frames.md reads it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ephemerisJson from '../../../data/ephemeris.json';
import teachingJson from '../../../data/teaching.json';
import { DEG, toSpherical, type Vec3 } from '../../science/astro';
import { hermiteState } from '../../science/ephemeris';
import type { TeachingData } from '../../science/teaching';
import { AU_KM } from '../../science/units';
import { utcMsOfTdbJd, type EphemerisBodies } from '../../science/voyagerNow';
import { RINGS_AU, equinoxScreenDeg, icrfToEcliptic, planetRings, skyTonight, squeeze, toScreen } from './nowPicture';

const bodies = (ephemerisJson as unknown as { bodies: EphemerisBodies }).bodies;
const teaching = teachingJson as unknown as TeachingData;

/** The first state row of a Horizons vector table saved by the research (CSV between $$SOE and $$EOE). */
function horizonsRow(file: string): { jd: number; pos: Vec3 } {
  // v1_sun.json was saved with the HTTP response headers in front of the JSON body; read from the body's first brace
  const text = readFileSync(resolve(process.cwd(), 'docs', 'research', 'data', 'voyager', file), 'utf8');
  const raw = JSON.parse(text.slice(text.indexOf('{'))) as { result: string };
  expect(raw.result).toContain('Reference frame : Ecliptic of J2000.0');
  const body = raw.result.split('$$SOE')[1]!.split('$$EOE')[0]!.trim();
  const cols = body.split('\n')[0]!.split(',').map((s) => s.trim());
  return { jd: Number(cols[0]), pos: [Number(cols[2]), Number(cols[3]), Number(cols[4])] };
}

const angleDeg = (a: Vec3, b: Vec3): number => {
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return Math.acos(Math.min(1, Math.max(-1, d))) / DEG;
};

describe('where they are tonight: the Voyagers in the plane of Earth\'s orbit', () => {
  const truth = { '-31': horizonsRow('v1_sun.json'), '-32': horizonsRow('v2_sun.json') } as const;

  it("turns the ICRF tables into Horizons' own ecliptic frame", () => {
    for (const id of ['-31', '-32'] as const) {
      const t = truth[id];
      const ours = icrfToEcliptic(hermiteState(bodies[id]!, t.jd).posKm);
      const miss = Math.hypot(ours[0] - t.pos[0], ours[1] - t.pos[1], ours[2] - t.pos[2]);
      // 10 km: the 30-day Hermite nodes are good to 1.9 km for Voyager 1 over 2000-2100 (docs/research/voyager.md,
      // the "Recommendation" line); the rotation uses the obliquity Horizons states for this frame, so it adds nothing.
      expect(miss).toBeLessThan(10);
    }
  });

  it('places each craft at its true direction and distance', () => {
    const at = new Date(utcMsOfTdbJd(truth['-31'].jd));
    const sky = skyTonight(bodies, teaching, at);
    for (const c of sky.craft) {
      const t = truth[c.id as '-31' | '-32'];
      const want = toSpherical(t.pos);
      // 1e-6 deg is about 0.5 km at 172 AU, well inside the 10 km position check above; 1e-3 deg is a loose
      // bound that still catches a wrong turn of the frame (the obliquity is 23.4 deg).
      expect(Math.abs(c.lonDeg - want.lonDeg)).toBeLessThan(1e-3);
      expect(Math.abs(c.latDeg - want.latDeg)).toBeLessThan(1e-3);
      // 1e-6 AU = 150 km: the interpolation bound again, with room.
      expect(Math.abs(c.au - Math.hypot(...t.pos) / AU_KM)).toBeLessThan(1e-6);
    }
    // the research note's table, same day (docs/research/voyager.md, "2026-10-15 19:00 TDB"): 172.061 and 144.214 AU
    // at 19:00; 19 hours earlier Voyager 1 is 16.9 km/s x 19 h = 1.16e6 km = 0.008 AU closer, so within 0.02 AU.
    expect(Math.abs(sky.craft[0]!.au - 172.061)).toBeLessThan(0.02);
    expect(Math.abs(sky.craft[1]!.au - 144.214)).toBeLessThan(0.02);
  });

  it('keeps Earth in the plane of its own orbit, all year', () => {
    const at = new Date(utcMsOfTdbJd(truth['-31'].jd));
    const sky = skyTonight(bodies, teaching, at);
    // The ecliptic of J2000 is the mean plane of the Earth-Moon barycentre; Earth's centre wanders from it by the
    // Moon's pull (about 4,700 km x sin 5.1 deg, some 420 km) and the plane drifts about 47 arcsec a century, so
    // after 27 years well under 0.01 deg (26,000 km at 1 AU). A frame turned the wrong way would put Earth up to
    // 23 deg off the plane.
    expect(Math.abs(sky.earth.latDeg)).toBeLessThan(0.01);
    // the year's track closes on itself: one sidereal year back, Earth is where it is now (to 1 deg: 10-day samples)
    const first = sky.earthOrbit[0]!;
    const last = sky.earthOrbit[sky.earthOrbit.length - 1]!;
    expect(Math.abs(((last.lonDeg - first.lonDeg + 540) % 360) - 180)).toBeLessThan(1);
    expect(last.lonDeg).toBeCloseTo(sky.earth.lonDeg, 9);
  });

  it("draws the planets' orbits from the record's own table, the slip left out", () => {
    const rings = planetRings(teaching);
    // docs/research/teaching-frames.md, the L004/L005 table: Mercury 58, Venus 108, Mars 228, Jupiter 778, Saturn
    // 1428, Uranus 2872, Neptune 4498 (x 10^6 km). Earth (150) is drawn from the ephemeris instead; Pluto's "591"
    // breaks the table's order and is not drawn.
    expect(rings.map((r) => r.name)).toEqual(['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']);
    expect(rings.map((r) => Math.round(r.au * AU_KM / 1e6))).toEqual([58, 108, 228, 778, 1428, 2872, 4498]);
  });

  it('squeezes distance without moving any direction, and never mirrors the sky', () => {
    expect(squeeze(0)).toBe(0);
    const r = RINGS_AU.map(squeeze);
    expect(r[0]! < r[1]! && r[1]! < r[2]!).toBe(true);
    const at = new Date(utcMsOfTdbJd(truth['-31'].jd));
    const sky = skyTonight(bodies, teaching, at);
    const turn = equinoxScreenDeg(sky.craft);
    const [v1, v2] = sky.craft.map((c) => toScreen(c.lonDeg, c.au, turn)) as [[number, number], [number, number]];
    // the angle between the two craft on the screen is the angle between their true directions in the plane
    const flat = (p: Vec3): Vec3 => [p[0], p[1], 0];
    const trueAngle = angleDeg(flat(truth['-31'].pos), flat(truth['-32'].pos));
    const screenAngle = angleDeg([v1[0], v1[1], 0], [v2[0], v2[1], 0]);
    // 1e-3 deg: the longitude tolerance above, twice
    expect(Math.abs(screenAngle - trueAngle)).toBeLessThan(2e-3);
    // seen from the north: Voyager 2 lies anticlockwise of Voyager 1 in longitude, so on a y-down screen the cross
    // product of their screen vectors is negative (a mirrored drawing would flip it)
    const lonAhead = ((sky.craft[1]!.lonDeg - sky.craft[0]!.lonDeg + 360) % 360) < 180;
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    expect(cross < 0).toBe(lonAhead);
    // the turn points the craft's mean direction to the right of the Sun
    const mid = [(v1[0] / Math.hypot(...v1) + v2[0] / Math.hypot(...v2)) / 2, (v1[1] / Math.hypot(...v1) + v2[1] / Math.hypot(...v2)) / 2];
    expect(Math.abs(Math.atan2(mid[1]!, mid[0]!))).toBeLessThan(1e-9);
  });
});
