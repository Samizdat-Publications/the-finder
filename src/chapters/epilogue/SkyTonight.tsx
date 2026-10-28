// The picture at the top of "Right now": where the two Voyagers are tonight, seen from above the plane of Earth's
// orbit. Positions come from nowPicture.ts (the Horizons tables, turned into the ecliptic); this file only lays
// them out at the box's own pixel size. Directions are true; distances are squeezed, and the picture says so with
// its rings at 1, 10 and 100 times Earth's distance from the Sun.

import { useMemo } from 'preact/hooks';
import teachingJson from '../../../data/teaching.json';
import type { TeachingData } from '../../science/teaching';
import type { EphemerisBodies } from '../../science/voyagerNow';
import { RINGS_AU, equinoxScreenDeg, skyTonight, squeeze, toScreen, type SkyTonight as Sky } from './nowPicture';
import { useBox } from './useBox';

const teaching = teachingJson as unknown as TeachingData;

const FONT = 13;
const SMALL = 12;
/** Rough width of a line of text in the picture, px (the sans face averages about 0.56 em a character). */
const textW = (s: string, size: number): number => s.length * size * 0.56;
const PAD = 14;

const ringLabel = (au: number): string => (au === 1 ? "1 × Earth's distance" : `${au} ×`);
const latText = (lat: number, short = false): string => `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? 'above' : 'below'} the ${short ? '' : "planets' "}plane`;
const distText = (au: number): string => `${au.toFixed(0)} × Earth's distance`;

interface Layout {
  k: number;
  sun: [number, number];
  equinox: number;
  /** The screen direction the craft point (deg): 0 to the right on a wide box, -90 down on a tall one. */
  toward: number;
  /** Short labels on a narrow box. */
  short: boolean;
}

/**
 * The largest scale (px per squeezed unit) at which Earth's orbit, both craft and their labels fit the box, with
 * the Sun placed to centre them. Rings farther out than that simply run off the edge.
 */
function fit(sky: Sky, w: number, h: number): Layout {
  const toward = w / h < 1.1 ? -90 : 0;
  const short = w < 560;
  const equinox = equinoxScreenDeg(sky.craft, toward);
  const r1 = squeeze(1);
  const [ex, ey] = toScreen(sky.earth.lonDeg, sky.earth.au, equinox);
  const earthW = textW('Earth', FONT) + 8;
  type Item = { x: number; y: number; l: number; r: number; t: number; b: number };
  const items = (k: number): Item[] => [
    { x: 0, y: 0, l: r1 * k + 6, r: r1 * k + 6, t: r1 * k + 6, b: r1 * k + 6 },
    // Earth's label sits outside its dot, away from the Sun
    { x: ex * k, y: ey * k, l: ex < 0 ? earthW : 6, r: ex >= 0 ? earthW : 6, t: 18, b: 18 },
    ...sky.craft.map((c) => {
      const [x, y] = toScreen(c.lonDeg, c.au, equinox);
      const lw = Math.max(textW(c.name, FONT), textW(distText(c.au), SMALL), textW(latText(c.latDeg, short), SMALL));
      return { x: x * k, y: y * k, l: 10, r: 14 + lw, t: 22, b: 26 };
    }),
  ];
  let k = Math.max(w, h);
  let box = { x0: 0, x1: 0, y0: 0, y1: 0 };
  for (let i = 0; i < 400; i++) {
    const it = items(k);
    box = {
      x0: Math.min(...it.map((p) => p.x - p.l)),
      x1: Math.max(...it.map((p) => p.x + p.r)),
      y0: Math.min(...it.map((p) => p.y - p.t)),
      y1: Math.max(...it.map((p) => p.y + p.b)),
    };
    if (box.x1 - box.x0 <= w - 2 * PAD && box.y1 - box.y0 <= h - 2 * PAD) break;
    k *= 0.97;
  }
  const sun: [number, number] = [PAD + (w - 2 * PAD - (box.x1 - box.x0)) / 2 - box.x0, PAD + (h - 2 * PAD - (box.y1 - box.y0)) / 2 - box.y0];
  return { k, sun, equinox, toward, short };
}

/** A point on a ring of squeezed radius `rk` px at screen angle `deg` (anticlockwise from the right). */
const onRing = (sun: [number, number], rk: number, deg: number): [number, number] => [sun[0] + rk * Math.cos((deg * Math.PI) / 180), sun[1] - rk * Math.sin((deg * Math.PI) / 180)];

/** The first candidate angle whose label point lies inside the box with room for `tw` px of text. */
function labelAngle(sun: [number, number], rk: number, w: number, h: number, tw: number, candidates: number[]): number | null {
  for (const a of candidates) {
    const [x, y] = onRing(sun, rk, a);
    if (x > 8 && x + tw < w - 8 && y > 18 && y < h - 30) return a;
  }
  return null;
}

export function SkyTonight(p: { bodies: EphemerisBodies; at: Date }) {
  const [ref, { w, h }] = useBox<HTMLDivElement>({ w: 960, h: 380 });
  // The picture moves too slowly to see in a second: recompute once a minute.
  const minute = Math.floor(p.at.getTime() / 60_000);
  const sky = useMemo(() => skyTonight(p.bodies, teaching, new Date(minute * 60_000)), [p.bodies, minute]);
  const { k, sun, equinox, toward, short } = useMemo(() => fit(sky, w, h), [sky, w, h]);
  // label places are listed for craft pointing right and turned with them
  const turned = (list: number[]): number[] => list.map((a) => a + toward);
  const at = (lon: number, au: number): [number, number] => {
    const [x, y] = toScreen(lon, au, equinox);
    return [sun[0] + x * k, sun[1] + y * k];
  };
  const orbit = sky.earthOrbit.map((e, i) => {
    const [x, y] = at(e.lonDeg, e.au);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('');
  const earth = at(sky.earth.lonDeg, sky.earth.au);
  // the March equinox arrow, in the bottom-left corner
  const eq = (equinox * Math.PI) / 180;
  const cx = 30;
  const cy = h - 30;
  const named = new Set(['Jupiter', 'Neptune']);
  return (
    <figure class="epi-sky epi-picture" data-epilogue-picture="now">
      <div class="epi-sky-box" ref={ref}>
      <svg
        viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`}
        width={w}
        height={h}
        role="img"
        aria-label={`Where the two Voyagers are tonight, seen from above the plane of Earth's orbit: the Sun at the centre, Earth's orbit, the planets' orbits, ${sky.craft.map((c) => `${c.name} ${distText(c.au)}`).join(' and ')}. Directions are true; distances are squeezed.`}
        data-epilogue-sky
        data-sun={`${sun[0].toFixed(1)},${sun[1].toFixed(1)}`}
      >
        {RINGS_AU.map((au) => {
          const rk = squeeze(au) * k;
          const label = ringLabel(au);
          const a = labelAngle(sun, rk, w, h, textW(label, SMALL), turned([52, 40, 64, 30, 76, 90, 110, 130, 3, -3, 150, -150]));
          const lp = a === null ? null : onRing(sun, rk, a);
          return (
            <g key={au} data-sky-ring={au}>
              <circle class="ring" cx={sun[0]} cy={sun[1]} r={rk} />
              {lp && (
                <text class="ringlab" x={lp[0] + 4} y={lp[1] - 4}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {sky.planets.map((pl) => {
          const rk = squeeze(pl.au) * k;
          const a = named.has(pl.name) ? labelAngle(sun, rk, w, h, textW(pl.name, SMALL), turned([-58, -70, -46, -84, -100, -120, -32, -140, -160, 160, 140, 120, 36, 28, 44])) : null;
          const lp = a === null ? null : onRing(sun, rk, a);
          return (
            <g key={pl.column} data-sky-planet={pl.name}>
              <circle class="planet" cx={sun[0]} cy={sun[1]} r={rk} />
              {lp && (
                <text class="planetlab" x={lp[0] + 4} y={lp[1] + 13}>
                  {pl.name}
                </text>
              )}
            </g>
          );
        })}
        <path class="earth-orbit" d={orbit} />
        {sky.craft.map((c) => {
          const [x, y] = at(c.lonDeg, c.au);
          return <line key={`ray${c.id}`} class="ray" x1={sun[0]} y1={sun[1]} x2={x} y2={y} />;
        })}
        <circle class="sun-glow" cx={sun[0]} cy={sun[1]} r="11" />
        <circle class="sun" cx={sun[0]} cy={sun[1]} r="5" />
        <text class="lab" x={sun[0]} y={sun[1] - 12} text-anchor="middle">
          Sun
        </text>
        <circle class="earth" cx={earth[0]} cy={earth[1]} r="3.5" data-sky-earth data-lon={sky.earth.lonDeg.toFixed(3)} />
        <text class="lab earthlab" x={earth[0] + (earth[0] >= sun[0] ? 7 : -7)} y={earth[1] + (earth[1] >= sun[1] ? 14 : -6)} text-anchor={earth[0] >= sun[0] ? 'start' : 'end'}>
          Earth
        </text>
        {sky.craft.map((c) => {
          const [x, y] = at(c.lonDeg, c.au);
          return (
            <g key={c.id} data-sky-craft={c.id} data-lon={c.lonDeg.toFixed(4)} data-lat={c.latDeg.toFixed(4)} data-au={c.au.toFixed(4)} data-x={x.toFixed(2)} data-y={y.toFixed(2)}>
              <circle class="craft-glow" cx={x} cy={y} r="10" />
              <circle class="craft" cx={x} cy={y} r="4.5" />
              <text class="lab craftlab" x={x + 12} y={y - 6}>
                {c.name}
              </text>
              <text class="lab dim" x={x + 12} y={y + 9}>
                {distText(c.au)}
              </text>
              <text class="lab dim" x={x + 12} y={y + 23}>
                {latText(c.latDeg, short)}
              </text>
            </g>
          );
        })}
        <g class="compass" data-sky-equinox={equinox.toFixed(2)}>
          <line x1={cx} y1={cy} x2={cx + 18 * Math.cos(eq)} y2={cy - 18 * Math.sin(eq)} />
          <circle cx={cx + 18 * Math.cos(eq)} cy={cy - 18 * Math.sin(eq)} r="2" />
          <text class="lab dim" x={cx + 18 * Math.cos(eq) + 8} y={cy - 18 * Math.sin(eq) + 4}>
            toward the March equinox
          </text>
        </g>
      </svg>
      </div>
      <figcaption class="epi-sky-key">
        Seen from above the planets. Directions are true; distances are squeezed (rings at 1, 10 and 100 times Earth's distance from the Sun) so both
        Voyagers fit.
      </figcaption>
    </figure>
  );
}
