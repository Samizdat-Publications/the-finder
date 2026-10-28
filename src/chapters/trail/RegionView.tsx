// The region view: the galactic plane around the alien's star as it was when the map was made (the map's
// age from the motion fit), the map's 95% origin region (the model's region()), and every star of the near
// catalogue where it was then (starInMapPlane). The star the machine came from is ringed in gold; the player
// clicks the star the map was drawn from and proposes it. Pure drawing of computed positions.

import { onContour } from '../shared/contour';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { game } from '../../game/state';
import { regionLevel } from '../../science/triangulation';
import { Clamp } from '../../ui/Fine';
import { send } from '../../ui/send';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet } from '../../game/state';
import { LastReading, PanelHead } from '../key/parts';
import type { EpochModel } from '../shared/epochModel';
import { distText, yearsText } from './format';
import { homeId, originRow, regionStars, starById, starName } from './physics';
import { regionPick } from './state';

const PAD = 28;

export function RegionPlot(p: { m: EpochModel }) {
  const m = p.m;
  const box = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 640, h: 480 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const r = m.region();
  const stars = useMemo(() => regionStars(m), [m]);
  const origin = originRow(m).star.id;
  const home = homeId(m);
  // Window: the region's ellipse with room around it (a display choice), pc per px from the smaller side.
  const half = Math.max(r.semiAxesPc[0], r.semiAxesPc[1]) * 1.35;
  const scale = Math.min(size.w - 2 * PAD, size.h - 2 * PAD) / (2 * half);
  const [cx, cy] = r.centerPc;
  const X = (x: number): number => size.w / 2 + (x - cx) * scale;
  const Y = (y: number): number => size.h / 2 - (y - cy) * scale;
  const visible = stars.filter((s) => Math.abs(X(s.xy[0]) - size.w / 2) <= size.w / 2 && Math.abs(Y(s.xy[1]) - size.h / 2) <= size.h / 2);
  const pick = regionPick.value;
  const sel = pick !== null ? stars.find((s) => s.star.id === pick) : undefined;
  const o = stars.find((s) => s.star.id === origin);
  const h = stars.find((s) => s.star.id === home);
  const onClick = (e: MouseEvent): void => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best: number | null = null;
    let bd = 12 * 12; // pick radius, px
    for (const s of visible) {
      const d = (X(s.xy[0]) - px) ** 2 + (Y(s.xy[1]) - py) ** 2;
      if (d < bd) {
        bd = d;
        best = s.star.id;
      }
    }
    regionPick.value = best;
  };
  const tenPc = 10 * scale;
  return (
    <svg ref={box} class="tr-region" role="img" aria-label="The map's origin region and the stars around it when the map was made" onClick={onClick}>
      <ellipse
        class="tr-ellipse"
        cx={X(cx)}
        cy={Y(cy)}
        rx={r.semiAxesPc[0] * scale}
        ry={r.semiAxesPc[1] * scale}
        transform={`rotate(${-r.majorAxisDeg} ${X(cx)} ${Y(cy)})`}
      />
      {visible.map((s) => (
        <circle key={s.star.id} class={s.inside ? 'tr-rs in' : 'tr-rs'} cx={X(s.xy[0])} cy={Y(s.xy[1])} r={1.6} data-region-star={s.star.id} />
      ))}
      {h && (
        <g class="tr-home">
          <rect x={X(h.xy[0]) - 4} y={Y(h.xy[1]) - 4} width={8} height={8} />
          <text x={X(h.xy[0]) + 9} y={Y(h.xy[1]) + 16}>
            your star
          </text>
        </g>
      )}
      {o && (
        <g class="tr-origin">
          <circle cx={X(o.xy[0])} cy={Y(o.xy[1])} r={7} />
          <text x={X(o.xy[0]) + 10} y={Y(o.xy[1]) - 8}>
            {starName(o.star)}
          </text>
        </g>
      )}
      {sel && (
        <g class="tr-sel">
          <circle cx={X(sel.xy[0])} cy={Y(sel.xy[1])} r={11} />
        </g>
      )}
      <g class="tr-scale">
        <line x1={PAD} y1={size.h - 14} x2={PAD + tenPc} y2={size.h - 14} />
        <text x={PAD} y={size.h - 20}>
          {distText(10, game.settings.value.humanGloss)}
        </text>
      </g>
      <text class="tr-legend" x={size.w - PAD} y={22} text-anchor="end">
        the map's origin region, 95%
      </text>
    </svg>
  );
}

/** The region tool: what the picked star's position says, and the proposal. */
export function RegionTool(p: { m: EpochModel }) {
  const m = p.m;
  const g = game.settings.value.humanGloss;
  const age = m.motionFit().ageYears;
  const pick = regionPick.value;
  const star = pick !== null ? starById(m, pick) : undefined;
  const xy = star ? m.starInMapPlane(star, age) : null;
  const level = xy ? regionLevel(m.region(), xy) : null;
  const n = useMemo(() => regionStars(m).filter((s) => s.inside).length, [m]);
  const open = nodeStatus('trail.where', confirmedSet.value) === 'open';
  return (
    <section class="kpanel tr-tool" data-tool-panel="region">
      <PanelHead id="trail.where" />
      <Clamp>
        Click the star the map was drawn from. The plane of the galaxy {yearsText(age, g)} ago, when the map was made, as the map's lines date it. The ring is the map's origin region; {n} catalogued stars lay inside it.
      </Clamp>
      {/* The hero readout (V1 polish): the picked star and whether it lies in the map's region. */}
      <div class="hero-control tr-hero">
        <span class="tr-k" data-region-pick={pick ?? ''}>{star ? starName(star) : 'No star picked yet'}</span>
        {xy && level !== null && (
          <>
            <output class="hero-readout">{level <= 0.95 ? 'in the region' : 'outside the region'}</output>
            <span class="tr-k">
              {level <= 0.95 ? `On its ${(level * 100).toFixed(0)}% contour` : onContour(level)}; {distText(Math.hypot(xy[0], xy[1]), g)} from your star then.
            </span>
          </>
        )}
      </div>
      {open && (
        <button type="button" class="btn small tr-propose tr-proposeblock" data-propose-button="trail.where" disabled={pick === null} onClick={() => send({ type: 'deduction.propose', id: 'trail.where', answer: { starId: pick as number } })}>
          Propose: the map was drawn from this star
        </button>
      )}
      <LastReading id="trail.where" current={pick !== null ? { starId: pick } : null} />
    </section>
  );
}
