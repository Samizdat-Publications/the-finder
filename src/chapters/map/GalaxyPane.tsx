// The galaxy chart with the cover's map laid over it (src/world/galaxy.ts): the alien's catalogue at the
// epoch, the map's rays from the map's origin, turned by the dial, the player's assignments drawn as links,
// and, once found, the origin region. Clicking a pulsar while a line is selected puts it on that line.
// The chart's frame starts at your star now; the map's origin is given from your star at the map epoch. The
// two differ by your own drift over the map's age (a few pc), invisible at the chart's kiloparsec scale.

import { useEffect, useRef, useState } from 'preact/hooks';
import { confirmedSet, game } from '../../game/state';
import { wrapDeg } from '../../science/pulsars';
import { mountGalaxy, type GalaxyHandle, type GalaxyInfo } from '../../world/galaxy';
import { chartLength } from '../shared/chartLabels';
import { ensureParts } from '../shared/epochModel';
import { Dial } from './Dial';
import { assign, assignments, model, origin, rotationDeg, scalePc, selectedLine, START_ROTATION_DEG } from './state';

declare global {
  interface Window {
    /** The Map's chart, for the browser tests only (set when the test handle is on). */
    __mapChart?: GalaxyHandle;
  }
}

/** The chart mounted now (as trail's ChartPane.tsx chartHandle): the guided tour's "Do it for me" clicks pulsars where it projects them. */
let current: GalaxyHandle | null = null;
export function chartHandle(): GalaxyHandle | null {
  return current;
}

export function GalaxyPane() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<GalaxyHandle | null>(null);
  const [info, setInfo] = useState<GalaxyInfo | null>(null);
  const [view, setView] = useState<'top' | 'perspective'>('top');
  const m = model.value;
  const confirmed = confirmedSet.value;
  const regionShown = confirmed.has('map.region');

  useEffect(() => {
    const el = canvas.current;
    if (!m || !el) return;
    // The WebGL chart starts in a task of its own, after the instrument has drawn (no long task on entering).
    let g: GalaxyHandle | null = null;
    let live = true;
    const start = window.setTimeout(() => {
      if (live) g = mount(el, m);
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(start);
      if (!g) return;
      if (window.__mapChart === g) delete window.__mapChart;
      if (current === g) current = null;
      g.dispose();
      handle.current = null;
    };
  }, [m]);

  const mount = (el: HTMLCanvasElement, m: NonNullable<typeof model.value>): GalaxyHandle => {
    const g = mountGalaxy(el, {
      seed: m.seed,
      pulsars: m.alien,
      observer: m.measured,
      reducedMotion: game.settings.value.reducedMotion,
      lengthLabel: chartLength,
      onPick: (p) => {
        const line = selectedLine.value;
        if (p && line !== null) assign(line, p.jname);
      },
    });
    handle.current = g;
    current = g;
    if (window.__finder) window.__mapChart = g;
    g.ready
      .then((i) => {
        if (handle.current !== g) return;
        if (scalePc.value === null) scalePc.value = i.gc.distKpc * 1000;
        // A returning player whose lines are matched gets the map back turned the way it was confirmed.
        if (confirmed.has('map.periods') && rotationDeg.value === START_ROTATION_DEG) rotationDeg.value = i.gc.lDeg;
        setInfo(i);
        void g.setViewMode('top');
        void g.frame({ pointKpc: [0, 0, 0] }, { distKpc: 7, durationS: 0.01 });
      })
      .catch(() => undefined);
    return g;
  };

  // The distance labels follow the human gloss.
  const gloss = game.settings.value.humanGloss;
  useEffect(() => {
    if (info) handle.current?.relabel();
  }, [gloss, info]);

  // Redraw the overlay whenever the map is turned, moved or scaled, or a line gets a pulsar.
  const rot = rotationDeg.value;
  const o = origin.value;
  const sc = scalePc.value;
  const pairs = assignments.value;
  useEffect(() => {
    const g = handle.current;
    if (!g || !info || !m || sc === null) return;
    g.showMap(m.inputs.cover.pulsarMap, { originKpc: [o[0] / 1000, o[1] / 1000, 0], rotationDeg: rot, kpcPerR0: sc / 1000 });
    g.setMatches(Object.entries(pairs).map(([k, jname]) => ({ order: Number(k), jname })));
  }, [info, rot, o, sc, pairs]);

  useEffect(() => {
    const g = handle.current;
    if (!g || !info || !m) return;
    if (!regionShown) {
      g.showRegion(null);
      return;
    }
    // The region comes from the epoch Worker (a returning player may not have it yet): draw it once it is in.
    let live = true;
    void ensureParts(m, ['region'])
      .then(() => live && handle.current === g && g.showRegion(m.region()))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [info, regionShown]);

  const toCentre = info && m ? wrapDeg(rot + m.inputs.cover.pulsarMap.gcLine.angleDeg - info.gc.lDeg) : null;
  const switchView = (v: 'top' | 'perspective'): void => {
    setView(v);
    void handle.current?.setViewMode(v);
  };
  return (
    <figure class="map-chart" data-chart-ready={info ? 'true' : 'false'}>
      <canvas ref={canvas} aria-label="Your chart of the galaxy's pulsars, with the cover's map laid over it" />
      <figcaption class="map-charttools">
        <Dial value={rot} onChange={(v) => (rotationDeg.value = v)} label="Turn the map" />
        <div class="map-angle" data-angle-to-centre={toCentre === null ? '' : toCentre.toFixed(2)}>
          <span class="map-k">long line to the centre</span>
          <output class="map-v">{toCentre === null ? 'measuring' : `${toCentre.toFixed(1)} deg`}</output>
        </div>
        <div class="map-views">
          <button type="button" class={`btn small${view === 'top' ? ' on' : ''}`} onClick={() => switchView('top')}>
            From above
          </button>
          <button type="button" class={`btn small${view === 'perspective' ? ' on' : ''}`} onClick={() => switchView('perspective')}>
            Tilted
          </button>
          <button type="button" class="btn small" onClick={() => void handle.current?.frame({ pointKpc: [0, 0, 0] }, { distKpc: 7 })}>
            Near
          </button>
          <button type="button" class="btn small" onClick={() => void handle.current?.frame(regionShown ? 'region' : 'overview')}>
            {regionShown ? 'Origin' : 'Far'}
          </button>
        </div>
        <p class="map-tip">
          {selectedLine.value === null ? 'Choose a line on the cover, then click a pulsar on the chart to put it on that line.' : `Line ${selectedLine.value} is chosen: click the pulsar it points to. Drag to look around; scroll to zoom.`}
        </p>
      </figcaption>
    </figure>
  );
}
