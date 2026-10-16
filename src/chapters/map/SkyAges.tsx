// Ages across the sky: the old lines' ages in your own frame placed where their pulsars lie (galactic
// longitude and latitude, the centre in the middle, longitude growing to the left), coloured by how much
// older or younger each is than their median. Drag the axis anywhere on the sky; beside it, each age against
// x = (P / Pdot) cos(angle to the axis), the amount a motion along the axis moves that age, with the straight
// line through them and its scatter live (mapMath.ts axisLineFit). The side plot is a first-order guide (it
// leaves out the Shklovskii term, so its best axis can sit a few degrees from the checker's); the number that
// decides, the axis's chi-square from the velocity fitted to every old line at once (pulsarAge.ts
// axisDeltaChi2, the checker's own measure), shows live beside it against its 95% cut (M4 science audit
// finding 3).
//
// M5 step 0c (the blind critic: the step packed the sky map, two plots, the cost bar and four rows of nudges into
// one box): the step shows one control, the sky map to drag the axis on, and one result beside it, the live
// cost and its verdict. The side plot, the readouts, the nudge buttons and the legend are the working, folded
// under "show working" and open on demand. The arrow keys also move the axis when the sky map has focus.

import { useMemo } from 'preact/hooks';
import { game } from '../../game/state';
import { Working } from '../../ui/ResultView';
import { formatPower } from '../../ui/units';
import { axisDeltaChi2 } from '../../science/pulsarAge';
import { CHI2_2DOF_95 } from '../../science/triangulation';
import { JULIAN_YEAR_S } from '../../science/units';
import { axisFromGalactic, axisLineFit, skyAges, type SkyAge } from './mapMath';
import { beatTicks, linear, qty, useSize } from './plot';
import { axis, model } from './state';

const w180 = (l: number): number => ((((l + 180) % 360) + 360) % 360) - 180;

function SkyPlot(p: { pts: SkyAge[]; median: number; spread: number }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const a = axis.value;
  // Equirectangular, 2:1, fitted inside the box.
  const pw = Math.min(w - 8, 2 * (h - 8));
  const ph = pw / 2;
  const ox = (w - pw) / 2;
  const oy = (h - ph) / 2;
  const X = linear(180, -180, ox, ox + pw);
  const Y = linear(90, -90, oy, oy + ph);
  const anti = { lDeg: a.lDeg + 180, bDeg: -a.bDeg };
  const setFrom = (e: PointerEvent): void => {
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const l = X.inv(e.clientX - box.left);
    const b = Y.inv(e.clientY - box.top);
    if (Math.abs(w180(l)) > 180 || Math.abs(b) > 90) return;
    axis.value = { lDeg: Math.round((((l % 360) + 360) % 360) * 10) / 10, bDeg: Math.round(b * 10) / 10 };
  };
  const colour = (age: number): string => {
    const f = Math.max(-1, Math.min(1, (age - p.median) / (p.spread || 1)));
    return f >= 0 ? `rgba(255, 178, 122, ${0.35 + 0.65 * f})` : `rgba(155, 188, 255, ${0.35 - 0.65 * f})`;
  };
  return (
    <div class="map-plot map-sky" ref={ref}>
      {w > 0 && (
        <svg
          width={w}
          height={h}
          role="img"
          aria-label="Ages of the old lines across your sky; drag to place the axis"
          data-sky-plot=""
          data-x0={ox}
          data-y0={oy}
          data-pw={pw}
          tabIndex={0}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1 : 0.1;
            const d = e.key === 'ArrowLeft' ? [step, 0] : e.key === 'ArrowRight' ? [-step, 0] : e.key === 'ArrowUp' ? [0, step] : e.key === 'ArrowDown' ? [0, -step] : null;
            if (!d) return;
            e.preventDefault();
            const cur = axis.value;
            axis.value = { lDeg: Math.round(((((cur.lDeg + (d[0] as number)) % 360) + 360) % 360) * 100) / 100, bDeg: Math.round(Math.max(-90, Math.min(90, cur.bDeg + (d[1] as number))) * 100) / 100 };
          }}
          onPointerDown={(e) => {
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            setFrom(e);
          }}
          onPointerMove={(e) => {
            if ((e.currentTarget as SVGSVGElement).hasPointerCapture(e.pointerId)) setFrom(e);
          }}
        >
          <rect x={ox} y={oy} width={pw} height={ph} class="map-skybox" />
          <line x1={ox} x2={ox + pw} y1={Y(0)} y2={Y(0)} class="map-axis-dash" />
          <line x1={X(0)} x2={X(0)} y1={oy} y2={oy + ph} class="map-axis-dash" />
          <text x={X(0) + 4} y={oy + ph - 6} class="map-plot-label">centre</text>
          <text x={ox + 6} y={oy + ph - 6} class="map-plot-label">drag the axis</text>
          {p.pts.map((q) => (
            <circle key={q.order} cx={X(w180(q.lDeg))} cy={Y(q.bDeg)} r={7} fill={q.used ? colour(q.age) : 'none'} class={`map-skypt${q.used ? '' : ' left-out'}`} data-sky-line={q.order} />
          ))}
          <circle cx={X(w180(anti.lDeg))} cy={Y(anti.bDeg)} r={7} class="map-axis-anti" />
          <g class="map-axis-mark" transform={`translate(${X(w180(a.lDeg))} ${Y(a.bDeg)})`}>
            <circle r={9} />
            <line x1={-14} x2={14} y1={0} y2={0} />
            <line x1={0} x2={0} y1={-14} y2={14} />
          </g>
        </svg>
      )}
    </div>
  );
}

function SidePlot(p: { pts: SkyAge[]; xs: number[]; slope: number; intercept: number }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const used = p.pts.map((q, i) => ({ q, x: p.xs[i] as number }));
  const xMax = Math.max(1, ...used.map((u) => Math.abs(u.x))) * 1.1;
  const ages = p.pts.map((q) => q.age);
  const yLo = Math.min(...ages) - 2000;
  const yHi = Math.max(...ages) + 2000;
  const pad = { l: 48, r: 10, t: 8, b: 26 };
  const X = linear(-xMax, xMax, pad.l, Math.max(pad.l + 10, w - pad.r));
  const Y = linear(yLo, yHi, Math.max(pad.t + 10, h - pad.b), pad.t);
  const yt = w > 0 ? beatTicks(yLo, yHi, Math.max(2, Math.floor(h / 40))) : [];
  return (
    <div class="map-plot map-side" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Each age against P over Pdot times the cosine of its angle to the axis, with the straight line through them">
          <clipPath id="map-side-clip">
            <rect x={pad.l} y={pad.t} width={Math.max(0, w - pad.l - pad.r)} height={Math.max(0, h - pad.t - pad.b)} />
          </clipPath>
          <line x1={X(0)} x2={X(0)} y1={pad.t} y2={h - pad.b} class="map-axis-dash" />
          <line x1={X(-xMax)} x2={X(xMax)} y1={Y(p.intercept - p.slope * xMax)} y2={Y(p.intercept + p.slope * xMax)} class="map-fitline" clip-path="url(#map-side-clip)" />
          {yt.map((k) => (
            <text key={k.years} x={pad.l - 4} y={Y(k.years) + 4} class="map-plot-label" text-anchor="end">{k.label}</text>
          ))}
          {used.map((u) => (
            <circle key={u.q.order} cx={X(u.x)} cy={Y(u.q.age)} r={5} class={`map-sidept${u.q.used ? '' : ' left-out'}`} />
          ))}
          <text x={w - pad.r} y={h - 8} class="map-plot-label" text-anchor="end">shift from your motion →</text>
          <text x={pad.l + 4} y={pad.t + 14} class="map-plot-label">age, beats</text>
        </svg>
      )}
    </div>
  );
}

/** The cost as the player reads it: two decimals while small, then whole numbers grouped, then a power of ten. */
function costText(d2: number): string {
  if (d2 < 100) return d2.toFixed(2);
  return d2 < 1e6 ? Math.round(d2).toLocaleString('en-US') : formatPower(d2, 2);
}

/**
 * The one result of map.motion, live: the axis's cost (the chi-square of the velocity fitted to every old line at
 * once, the checker's own measure) as the big number, on a bar whose scale runs to four times the 95% cut (a
 * display choice) with the cut drawn, and the verdict against that cut. Inside the cut the bar is lit.
 */
function Decides(p: { d2: number }) {
  const max = 4 * CHI2_2DOF_95;
  const W = 220;
  const x = (v: number): number => (Math.min(v, max) / max) * W;
  const inside = p.d2 <= CHI2_2DOF_95;
  return (
    <div class="map-result map-decides" data-decides={inside ? 'inside' : 'outside'}>
      <span class="map-k" title="The chi-square of the velocity fitted to every old line at once, along this axis: the number the checker judges">
        cost of this axis
      </span>
      <output class="map-cost" data-axis-chi2-reading="">{costText(p.d2)}</output>
      <svg class="map-decides-bar" width={W} height={18} role="img" aria-label={`cost ${p.d2.toFixed(2)} against the 95% cut ${CHI2_2DOF_95.toFixed(2)}`}>
        <rect x={0} y={5} width={W} height={8} class="track" />
        <rect x={0} y={5} width={x(p.d2)} height={8} class={inside ? 'fill inside' : 'fill'} />
        <line x1={x(CHI2_2DOF_95)} x2={x(CHI2_2DOF_95)} y1={0} y2={18} class="cut" />
      </svg>
      <span class={`map-verdict${inside ? ' inside' : ''}`} data-verdict="">
        {inside ? `Inside the 95% cut (${CHI2_2DOF_95.toFixed(2)}): this axis can hold.` : `Outside the 95% cut (${CHI2_2DOF_95.toFixed(2)}): keep dragging.`}
      </span>
    </div>
  );
}

export function SkyAges() {
  const m = model.value;
  const a = axis.value;
  const gloss = game.settings.value.humanGloss;
  const pts = useMemo(() => (m ? skyAges(m) : []), [m]);
  if (!m || !pts.length) return null;
  const usedAges = pts.filter((q) => q.used).map((q) => q.age).sort((x, y) => x - y);
  const median = usedAges[usedAges.length >> 1] as number;
  const spread = Math.max(...usedAges.map((x) => Math.abs(x - median)));
  const fit = axisLineFit(pts, a.lDeg, a.bDeg);
  const d2 = axisDeltaChi2(m.motionFit(), axisFromGalactic(a.lDeg, a.bDeg));
  const nudge = (dl: number, db: number): void => {
    axis.value = { lDeg: Math.round(((((a.lDeg + dl) % 360) + 360) % 360) * 100) / 100, bDeg: Math.round(Math.max(-90, Math.min(90, a.bDeg + db)) * 100) / 100 };
  };
  const left = pts.filter((q) => !q.used);
  return (
    <section class="map-tool map-skyages" aria-label="Ages across the sky" data-axis-l={a.lDeg} data-axis-b={a.bDeg} data-rms-years={fit.rmsYears.toFixed(1)} data-misfit={fit.chi2.toFixed(3)} data-axis-chi2={d2.toFixed(4)} data-axis-cut={CHI2_2DOF_95}>
      <div class="map-skymain">
        <SkyPlot pts={pts} median={median} spread={spread} />
        <Decides d2={d2} />
      </div>
      <Working>
        <div class="map-skyrow">
          <SidePlot pts={pts} xs={fit.xs} slope={fit.slope} intercept={fit.intercept} />
          <div class="map-skyctl">
            <div class="map-row map-skyread">
              <span class="map-k">axis</span>
              <output class="map-v" data-axis-reading="">l {a.lDeg.toFixed(2)}, b {a.bDeg.toFixed(2)} deg</output>
              {([[-1, 0, 'l -1'], [-0.1, 0, 'l -0.1'], [0.1, 0, 'l +0.1'], [1, 0, 'l +1'], [0, -1, 'b -1'], [0, -0.1, 'b -0.1'], [0, 0.1, 'b +0.1'], [0, 1, 'b +1']] as const).map(([dl, db, t]) => (
                <button key={t} type="button" class="btn small map-nudge" onClick={() => nudge(dl, db)}>{t}</button>
              ))}
            </div>
            <div class="map-row map-skyread">
              <span class="map-k">scatter about the line</span>
              <output class="map-v">{qty('time', fit.rmsYears * JULIAN_YEAR_S, gloss)}</output>
              <span class="map-k">misfit</span>
              <output class="map-v">{fit.chi2.toFixed(1)} for {fit.dof}</output>
              <span class="map-k">speed along the axis</span>
              <output class="map-v">{qty('speed', fit.speedKmS * 1000, gloss)}</output>
            </div>
          </div>
        </div>
        <p class="map-k map-legend">
          Sky: <span class="older">orange older</span>, <span class="younger">blue younger</span> than the middle age
          {left.length > 0 && `; hollow: line ${left.map((q) => q.order).join(', ')}, too rough to date, left out`}. Right: on the right axis the ages fall on one line.
        </p>
      </Working>
    </section>
  );
}
