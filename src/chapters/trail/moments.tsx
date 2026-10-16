// The Trail's staged moments (M4 step 7e), each over the whole screen:
//  - trail.origin: the neighbourhood chart (src/world/neighbourhood.ts, its own handles) with the trail of the
//    star the machine flies away from; the craft's path is drawn back from the craft to that star across the
//    dark, the craft and the star labelled by the chart.
//  - trail.neighbour: the alien's own sky, the brightest stars seen from its star at the epoch on an all-sky
//    map in Galactic coordinates (Hammer projection), the warm-white star ringed, the brighter ones numbered.
//  - trail.when: the map's old lines, each at its age in the alien's own frame, sliding onto one line, their
//    ages in the origin star's frame, with that frame's combined 95% band.
// Every position is computed from the epoch model; reduced motion shows the final picture with no movement.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sub, toGalacticCartesian, toSpherical, type Vec3 } from '../../science/astro';
import { brightestStars, starStateAt } from '../../science/epoch';
import type { PulsarAge } from '../../science/pulsarAge';
import { mountNeighbourhood } from '../../world/neighbourhood';
import { bvToSrgb } from '../../world/skyModel';
import { chartLength } from '../shared/chartLabels';
import type { EpochModel } from '../shared/epochModel';
import { beatTicks, linear, useSize } from '../map/plot';
import { agesInFrame, judgedLines } from './frames';
import { homeId, originRow, starName } from './physics';

/** How many of the alien's brightest stars the sky shows (the brightest twenty: D-A15 lists the first ten). */
const SKY_STARS = 20;

export function OriginBackdrop(p: { m: EpochModel | null; reducedMotion: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [path, setPath] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  useEffect(() => {
    const m = p.m;
    const el = canvas.current;
    if (!m || !el) return;
    const row = originRow(m);
    const h = mountNeighbourhood(el, {
      seed: m.seed, scenario: m.inputs.scenario, stars: m.inputs.stars, trail: m.trailRows(), reducedMotion: p.reducedMotion,
      nameOf: (s) => starName(s.star), lengthLabel: chartLength,
    });
    let live = true;
    void h.ready
      .then(async () => {
        if (!live) return;
        h.showTrail(row.star.id);
        await h.setViewMode('top');
        await h.frame({ starId: row.star.id }, { durationS: p.reducedMotion ? 0 : 1.2 });
        const c = h.project('craft');
        const s = h.project(row.star.id);
        if (live && c && s) setPath({ a: [c.x, c.y], b: [s.x, s.y] });
      })
      .catch(() => undefined);
    return () => {
      live = false;
      h.dispose();
    };
  }, [p.m]);
  return (
    <div class="moment-chart">
      <canvas ref={canvas} class="moment-canvas" aria-label="The neighbourhood chart: the machine's path drawn back to the star it came from" />
      {path && (
        <svg class="moment-path" aria-hidden="true">
          <line class={p.reducedMotion ? 'still' : 'draw'} x1={path.a[0]} y1={path.a[1]} x2={path.b[0]} y2={path.b[1]} pathLength={1} />
        </svg>
      )}
    </div>
  );
}

/** Galactic longitude and latitude to a Hammer all-sky map, longitude increasing to the left, in units of the map's half-width. */
function hammer(lDeg: number, bDeg: number): [number, number] {
  const l = (((lDeg + 180) % 360) + 360) % 360 - 180;
  const lr = (l * Math.PI) / 180;
  const br = (bDeg * Math.PI) / 180;
  const d = Math.sqrt(1 + Math.cos(br) * Math.cos(lr / 2));
  return [-(2 * Math.SQRT2 * Math.cos(br) * Math.sin(lr / 2)) / d / (2 * Math.SQRT2), (Math.SQRT2 * Math.sin(br)) / d / Math.SQRT2];
}

export function SkyBackdrop(p: { m: EpochModel | null }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const sky = useMemo(() => {
    const m = p.m;
    if (!m) return null;
    const t = m.disc.decimalYear;
    const home = homeId(m);
    const origin = originRow(m).star.id;
    const at: Vec3 = m.measured.posPc;
    return brightestStars(m.inputs.stars, at, t, SKY_STARS, [home]).map((s, i) => {
      const g = toSpherical(toGalacticCartesian(sub(starStateAt(s.star, t).posPc, at)));
      const [cr, cg, cb] = bvToSrgb(s.star.ci);
      return { id: s.star.id, rank: i + 1, mag: s.appMag, name: starName(s.star), xy: hammer(g.lonDeg, g.latDeg), origin: s.star.id === origin, rgb: `rgb(${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)})` };
    });
  }, [p.m]);
  const w = size.w;
  const h = size.h;
  const R = Math.min(w / 2.2, h / 1.25);
  const cx = w / 2;
  const cy = h / 2;
  const at = (xy: [number, number]): [number, number] => [cx + xy[0] * R, cy - xy[1] * (R / 2)];
  const target = sky?.find((s) => s.origin);
  return (
    <div class="moment-sky" ref={ref}>
      {sky && w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Your sky: the brightest stars seen from your star, the warm-white star ringed">
          <text x={cx - R} y={Math.max(18, cy - R / 2 - 14)} class="sky-note">
            Your sky: its {SKY_STARS} brightest stars, numbered by brightness up to the star it came from; the dashed line is the Galaxy's plane.
          </text>
          <ellipse class="sky-edge" cx={cx} cy={cy} rx={R} ry={R / 2} />
          <line class="sky-plane" x1={cx - R} y1={cy} x2={cx + R} y2={cy} />
          {sky.map((s) => {
            const [x, y] = at(s.xy);
            const r = Math.max(1.6, 6.5 - 1.1 * s.mag);
            return (
              <g key={s.id} class={`sky-star${s.origin ? ' origin' : ''}`}>
                <circle cx={x} cy={y} r={r} style={{ fill: s.rgb }} />
                {s.rank <= (target?.rank ?? 5) && !s.origin && (
                  <text x={x + r + 4} y={y + 4} class="sky-rank">
                    {s.rank}
                  </text>
                )}
              </g>
            );
          })}
          {target && (() => {
            const [x, y] = at(target.xy);
            return (
              <g class="sky-target">
                <circle cx={x} cy={y} r={16} />
                <text x={x + 22} y={y - 10}>
                  {target.rank}: {target.name}
                </text>
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

export function WhenBackdrop(p: { m: EpochModel | null; reducedMotion: boolean }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [settled, setSettled] = useState(p.reducedMotion);
  const data = useMemo(() => {
    const m = p.m;
    if (!m) return null;
    const o = originRow(m).star;
    const there = agesInFrame(m, o.id === 0 ? 0 : o.id, o);
    const keep = judgedLines(there);
    const own = agesInFrame(m, 'own').perLine;
    const rows = there.perLine
      .map((a, i) => ({ jname: a.jname, there: a.median, sigma: a.sigma, own: (own[i] as PulsarAge).median, ownSigma: (own[i] as PulsarAge).sigma }))
      .filter((r) => keep.has(r.jname));
    return { rows, band: [there.combined.lo, there.combined.hi] as [number, number], est: there.combined.estimate };
  }, [p.m]);
  useEffect(() => {
    if (p.reducedMotion || !data) return;
    const id = window.setTimeout(() => setSettled(true), 700);
    return () => window.clearTimeout(id);
  }, [data]);
  const w = size.w;
  const h = size.h;
  if (!data) return <div class="moment-ages" ref={ref} />;
  const all = data.rows.flatMap((r) => [r.own, r.there]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08;
  // Older to the left, as on the reframe plot's time axis (years ago grows leftward).
  const x = linear(hi + pad, lo - pad, w * 0.1, w * 0.9);
  const top = h * 0.16;
  const span = h * 0.56;
  const step = span / Math.max(1, data.rows.length - 1);
  const axisY = top + span + 34;
  const ticks = w > 0 ? beatTicks(lo - pad, hi + pad, 6) : [];
  return (
    <div class="moment-ages" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="The map's old lines, each at its age, sliding together onto one age">
          <text x={w * 0.1} y={top - 34} class="ages-note">
            Each old line's age: faint as read from your own star, bright as read from the star it came from.
          </text>
          <rect class={`ages-band${settled ? ' on' : ''}`} x={x(data.band[1]) - 3} y={top - 18} width={Math.max(6, x(data.band[0]) - x(data.band[1]) + 6)} height={span + 36} />
          <line class={`ages-line${settled ? ' on' : ''}`} x1={x(data.est)} y1={top - 22} x2={x(data.est)} y2={top + span + 22} />
          {data.rows.map((r, i) => {
            const y = top + i * step;
            return <circle key={`g${r.jname}`} class="ages-ghost" cx={x(r.own)} cy={y} r={4} />;
          })}
          {data.rows.map((r, i) => {
            const y = top + i * step;
            const px = x(settled ? r.there : r.own);
            const half = Math.abs(x(r.there + (settled ? r.sigma : r.ownSigma)) - x(r.there));
            return (
              <g key={r.jname} class="ages-row" style={{ transform: `translate(${px.toFixed(1)}px, ${y.toFixed(1)}px)` }}>
                <line class="ages-err" x1={-half} x2={half} y1={0} y2={0} />
                <circle class="ages-dot" r={5} />
              </g>
            );
          })}
          <line class="ages-axis" x1={w * 0.1} x2={w * 0.9} y1={axisY} y2={axisY} />
          {ticks.map((k) => (
            <text key={k.years} x={x(k.years)} y={axisY + 18} class="ages-tick" text-anchor="middle">
              {k.label}
            </text>
          ))}
          <text x={w * 0.9} y={axisY + 38} class="ages-tick" text-anchor="end">
            beats ago (older to the left)
          </text>
        </svg>
      )}
    </div>
  );
}
