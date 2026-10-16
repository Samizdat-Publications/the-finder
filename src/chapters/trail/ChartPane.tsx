// The neighbourhood chart inside The Trail: the stars within 10 pc of the machine, with the model's own trail
// rows (so the chart and the checkers share them). A click picks a star (the trail tool and the run-back)
// or sets an end of the ruler. Over the canvas, an SVG layer draws what the chart module does not: the
// machine run back along its motion relative to the picked star, and the ruler between two stars. Every
// point of that layer is the chart's own projection of a computed position.

import { useEffect, useRef, useState } from 'preact/hooks';
import { KM_S_TO_PC_PER_YEAR, scale, toGalacticCartesian, type Vec3 } from '../../science/astro';
import { game } from '../../game/state';
import { CRAFT_GLYPH_BOX, CRAFT_GLYPH_PATH } from '../../world/chartGlyphs';
import { mountNeighbourhood, type NeighbourhoodHandle } from '../../world/neighbourhood';
import { chartLength } from '../shared/chartLabels';
import type { EpochModel } from '../shared/epochModel';
import { distText } from './format';
import { homeId, relativeState, rulerReading, starById, starName } from './physics';
import { model, picked, rulerEnds, runYears, tintAll, tool } from './state';

let handle: NeighbourhoodHandle | null = null;
/** The mounted chart, for the browser test (it clicks stars at their projected points). */
export function chartHandle(): NeighbourhoodHandle | null {
  return handle;
}

interface Overlay {
  track?: { from: [number, number]; to: [number, number] };
  craft?: [number, number];
  star?: [number, number];
  ruler?: { a: [number, number]; b: [number, number]; label: string };
}

function onPick(m: EpochModel, id: number | null): void {
  if (id === null) return;
  if (tool.value === 'ruler') {
    const ends = rulerEnds.value;
    rulerEnds.value = ends.length >= 2 ? [id] : [...ends, id];
    return;
  }
  picked.value = id;
  if (tool.value === 'trail' || tool.value === 'runback') handle?.showTrail(m.trailRows().some((r) => r.star.id === id) ? id : null);
}

export function ChartPane(p: { m: EpochModel }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ov, setOv] = useState<Overlay>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const m = p.m;
    // The WebGL chart starts in a task of its own, after the instrument has drawn (M4 step 7e: no long task on entering).
    let h: NeighbourhoodHandle | null = null;
    const start = window.setTimeout(() => {
      h = mount(c, m);
    }, 0);
    return () => {
      window.clearTimeout(start);
      if (!h) return;
      h.dispose();
      if (handle === h) handle = null;
    };
  }, [p.m]);

  const mount = (c: HTMLCanvasElement, m: EpochModel): NeighbourhoodHandle => {
    const h = mountNeighbourhood(c, {
      seed: m.seed,
      scenario: m.inputs.scenario,
      stars: m.inputs.stars,
      trail: m.trailRows(),
      reducedMotion: game.settings.value.reducedMotion,
      nameOf: (s) => starName(s.star),
      lengthLabel: chartLength,
      onPick: (pk) => onPick(m, pk?.star.star.id ?? null),
    });
    handle = h;
    void h.ready.then(() => {
      if (handle !== h) return;
      setReady(true);
      if (picked.value !== null) h.showTrail(picked.value);
      if (tintAll.value) h.showAll(m.trailRows());
    });
    return h;
  };

  // the distance labels follow the human gloss
  const gloss = game.settings.value.humanGloss;
  useEffect(() => {
    if (ready) handle?.relabel();
  }, [gloss, ready]);

  // tint every star by its angle (after trail.origin)
  const tint = tintAll.value;
  useEffect(() => {
    if (ready) handle?.showAll(tint ? p.m.trailRows() : null);
  }, [tint, ready]);

  // the overlay follows the camera: project the computed points every frame
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const h = handle;
      const m = model.value;
      if (!h || !m || !ready) return;
      const next: Overlay = {};
      const xy = (s: { x: number; y: number } | null): [number, number] | undefined => (s ? [s.x, s.y] : undefined);
      const id = picked.value;
      if (tool.value === 'runback' && id !== null) {
        const star = starById(m, id);
        if (star && star.rvKmS !== null && id !== homeId(m)) {
          const v = toGalacticCartesian(relativeState(m, star).vKmS);
          const at = (years: number): Vec3 => scale(v, -KM_S_TO_PC_PER_YEAR * years);
          const t = runYears.value;
          next.craft = xy(h.project(at(t)));
          next.star = xy(h.project(id));
          const tFar = Math.max(t, 1) * 1.6 + 5000;
          next.track = { from: xy(h.project('craft')) as [number, number], to: xy(h.project(at(tFar))) as [number, number] };
        }
      }
      const ends = rulerEnds.value;
      if (tool.value === 'ruler' && ends.length === 2) {
        const [a, b] = ends as [number, number];
        const other = a === homeId(m) ? b : b === homeId(m) ? a : null;
        const sa = xy(h.project(a));
        const sb = xy(h.project(b));
        const s = other !== null ? starById(m, other) : undefined;
        if (sa && sb && s) {
          const r = rulerReading(m, s);
          next.ruler = { a: sa, b: sb, label: distText(r.distPc, game.settings.value.humanGloss) };
        }
      }
      setOv((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  return (
    <div class="tr-chart" data-chart-ready={ready ? 'true' : 'false'}>
      <canvas ref={canvas} class="tr-canvas" aria-label="Chart of the stars within 10 parsecs of the machine" />
      <svg class="tr-overlay" aria-hidden="true">
        {ov.track && <line class="tr-track" x1={ov.track.from[0]} y1={ov.track.from[1]} x2={ov.track.to[0]} y2={ov.track.to[1]} />}
        {ov.craft && ov.star && <line class="tr-sep" x1={ov.craft[0]} y1={ov.craft[1]} x2={ov.star[0]} y2={ov.star[1]} />}
        {ov.craft && (
          <g class="tr-craftglyph" transform={`translate(${ov.craft[0] - CRAFT_GLYPH_BOX * 0.7} ${ov.craft[1] - CRAFT_GLYPH_BOX * 0.7}) scale(1.4)`}>
            <path d={CRAFT_GLYPH_PATH} />
          </g>
        )}
        {ov.ruler && (
          <g class="tr-ruler">
            <line x1={ov.ruler.a[0]} y1={ov.ruler.a[1]} x2={ov.ruler.b[0]} y2={ov.ruler.b[1]} />
            <text x={(ov.ruler.a[0] + ov.ruler.b[0]) / 2} y={(ov.ruler.a[1] + ov.ruler.b[1]) / 2 - 10}>
              {ov.ruler.label}
            </text>
          </g>
        )}
      </svg>
      <p class="tr-chart-help">Drag to turn the chart, scroll to zoom, click a star to {tool.value === 'ruler' ? 'set an end of the ruler' : 'pick it'}.</p>
    </div>
  );
}
