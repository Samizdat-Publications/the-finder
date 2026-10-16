// Where the map was drawn from: the galactic plane around your star as it was when the map was made, seen
// from above (x toward the Galactic centre, y toward longitude 90 deg, pc), with your catalogue's nearby
// stars where they were then (epochModel starInMapPlane). Drag the map's origin; the bearings from that
// point to the identified pulsars are compared with the map's angles after the best turn (mapMath.ts
// bearingResiduals), live. The scale slider sets how many pc one centre-line length is; the map's lengths
// are rough (they can be off several times), so they guide only loosely. Once found, the region is drawn.

import { useMemo } from 'preact/hooks';
import { confirmedSet } from '../../game/state';
import { insideRegion } from '../../science/triangulation';
import { regionOutline } from '../../world/galaxyModel';
import { bearingResiduals, lengthMisfit, mapPoints } from './mapMath';
import { linear, useSize } from './plot';
import { model, origin, scalePc } from './state';

/** Half-width of the plane shown, pc (a display choice: the region is about 30 pc long). */
const HALF_PC = 25;

export function OriginPlane() {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const m = model.value;
  const o = origin.value;
  const sc = scalePc.value;
  const found = confirmedSet.value.has('map.region');
  const age = m ? m.motionFit().ageYears : 0;
  const stars = useMemo(() => {
    if (!m) return [];
    return m.inputs.stars.near.filter((s) => s.distPc !== null).map((s) => ({ id: s.id, xy: m.starInMapPlane(s, age) }));
  }, [m, age]);
  const pts = useMemo(() => (m ? mapPoints(m) : []), [m]);
  const region = found && m ? m.region() : null;
  const here = bearingResiduals(pts, o);
  const lengths = sc === null || !pts.length ? null : lengthMisfit(pts, o, sc);
  const side = Math.max(10, Math.min(w, h) - 8);
  const ox = (w - side) / 2;
  const oy = (h - side) / 2;
  const X = linear(-HALF_PC, HALF_PC, ox, ox + side);
  const Y = linear(HALF_PC, -HALF_PC, oy, oy + side);
  const home = m ? stars.find((s) => s.id === m.truth.starId) : undefined;
  const setFrom = (e: PointerEvent): void => {
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = X.inv(e.clientX - box.left);
    const y = Y.inv(e.clientY - box.top);
    if (Math.abs(x) > HALF_PC || Math.abs(y) > HALF_PC) return;
    origin.value = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };
  const nudge = (dx: number, dy: number): void => {
    origin.value = [Math.round((o[0] + dx) * 10) / 10, Math.round((o[1] + dy) * 10) / 10];
  };
  const starLayer = useMemo(
    () => (
      <g>
        {stars.map((s) => {
          if (Math.abs(s.xy[0]) >= HALF_PC || Math.abs(s.xy[1]) >= HALF_PC) return null;
          const inR = region !== null && insideRegion(region, s.xy);
          return <circle key={s.id} cx={X(s.xy[0])} cy={Y(s.xy[1])} r={inR ? 1.6 : 1.1} class={inR ? 'map-star in' : 'map-star'} />;
        })}
      </g>
    ),
    [stars, region, w, h],
  );
  const outline = region ? regionOutline(region, 96).map((p) => `${X(p[0] * 1000).toFixed(1)},${Y(p[1] * 1000).toFixed(1)}`).join(' ') : '';
  if (!m) return null;
  const inside = region ? stars.filter((s) => insideRegion(region, s.xy)).length : 0;
  return (
    <section class="map-tool map-origin" aria-label="Where the map was drawn from" data-origin-x={o[0]} data-origin-y={o[1]} data-bearing-rms={here.rmsDeg.toFixed(3)}>
      <div class="map-originrow">
        <div class="map-plot map-plane" ref={ref}>
          {w > 0 && (
            <svg
              width={w}
              height={h}
              role="img"
              aria-label="The plane around your star when the map was made; drag to place the map's origin"
              data-plane="" data-x0={X(0)} data-y0={Y(0)} data-px-per-pc={side / (2 * HALF_PC)}
              onPointerDown={(e) => {
                (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
                setFrom(e);
              }}
              onPointerMove={(e) => {
                if ((e.currentTarget as SVGSVGElement).hasPointerCapture(e.pointerId)) setFrom(e);
              }}
            >
              <rect x={ox} y={oy} width={side} height={side} class="map-skybox" />
              {starLayer}
              {region && <polygon points={outline} class="map-region" />}
              {home && (
                <g transform={`translate(${X(home.xy[0])} ${Y(home.xy[1])})`} class="map-home">
                  <circle r={4} />
                  <text x={-7} y={18} class="map-plot-label" text-anchor="end">your star then</text>
                </g>
              )}
              <text x={ox + side - 6} y={oy + 18} class="map-plot-label" text-anchor="end">centre →</text>
              <g transform={`translate(${X(o[0])} ${Y(o[1])})`} class="map-originmark">
                <circle r={7} />
                <line x1={-12} x2={12} y1={0} y2={0} />
                <line x1={0} x2={0} y1={-12} y2={12} />
              </g>
            </svg>
          )}
        </div>
        <dl class="map-originread">
          <div><dt>map's origin</dt><dd data-origin-reading="">{o[0].toFixed(1)}, {o[1].toFixed(1)} pc</dd></div>
          <div class="map-row">
            {([[-1, 0, 'x -1'], [1, 0, 'x +1'], [0, -1, 'y -1'], [0, 1, 'y +1']] as const).map(([dx, dy, t]) => (
              <button key={t} type="button" class="btn small map-nudge" onClick={() => nudge(dx, dy)}>{t}</button>
            ))}
          </div>
          <div><dt>lines against their pulsars, after the best turn</dt><dd>{here.rmsDeg.toFixed(2)} deg rms (turn {here.alphaDeg.toFixed(2)} deg)</dd></div>
          {sc !== null && lengths && (
            <>
              <div>
                <dt><label for="map-scale">scale: one centre line is {Math.round(sc).toLocaleString('en-US')} pc</label></dt>
                <dd><input id="map-scale" type="range" min={Math.log(500)} max={Math.log(30_000)} step={0.005} value={Math.log(sc)} onInput={(e) => (scalePc.value = Math.exp(Number((e.currentTarget as HTMLInputElement).value)))} /></dd>
              </div>
              <div><dt>lengths against distances (rough: a guide only)</dt><dd>off {lengths.rmsFactor.toFixed(1)} times rms, {lengths.worstFactor.toFixed(1)} at worst</dd></div>
            </>
          )}
          {region && (
            <div data-region-stars={inside}>
              <dt>the region, 95%</dt>
              <dd>{(2 * region.semiAxesPc[0]).toFixed(0)} by {(2 * region.semiAxesPc[1]).toFixed(0)} pc, {inside} stars inside then</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
