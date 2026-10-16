// The staged moment for map.region (M4 step 7e): the galaxy chart (src/world/galaxy.ts, its own handles) over
// the whole screen, the cover's map laid on it turned to the Galactic centre and placed at the origin the
// player confirmed, its lines linked to the pulsars of the confirmed identification, the origin region drawn,
// and the camera easing from the map's whole span down onto the region where the lines meet (reduced motion:
// framed at once, no camera move). Everything comes from the confirmed answers and the epoch model.

import { useEffect, useRef } from 'preact/hooks';
import type { Answer } from '../../game/deductions';
import { game } from '../../game/state';
import { mountGalaxy } from '../../world/galaxy';
import { chartLength } from '../shared/chartLabels';
import type { EpochModel } from '../shared/epochModel';

/** The accepted answer of a confirmed deduction, as an object. */
function accepted(id: string): Record<string, Answer> | null {
  const a = [...(game.records.value[id]?.attempts ?? [])].reverse().find((x) => x.ok)?.answer;
  return a && typeof a === 'object' && !Array.isArray(a) ? a : null;
}

export function RegionBackdrop(p: { m: EpochModel | null; reducedMotion: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const m = p.m;
    const el = canvas.current;
    if (!m || !el) return;
    const g = mountGalaxy(el, { seed: m.seed, pulsars: m.alien, observer: m.measured, reducedMotion: p.reducedMotion, lengthLabel: chartLength });
    let live = true;
    void g.ready
      .then(async (info) => {
        if (!live) return;
        const map = m.inputs.cover.pulsarMap;
        const o = accepted('map.region');
        const x = typeof o?.x === 'number' ? o.x : m.region().centerPc[0];
        const y = typeof o?.y === 'number' ? o.y : m.region().centerPc[1];
        // The map turned so its long line points at the Galactic centre (what map.periods confirmed), at the centre's distance.
        g.showMap(map, { originKpc: [x / 1000, y / 1000, 0], rotationDeg: info.gc.lDeg - map.gcLine.angleDeg, kpcPerR0: info.gc.distKpc });
        const ids = accepted('map.identify');
        if (ids) g.setMatches(Object.entries(ids).filter((e): e is [string, string] => typeof e[1] === 'string').map(([k, jname]) => ({ order: Number(k), jname })));
        g.showRegion(m.region());
        await g.setViewMode('top');
        if (p.reducedMotion) {
          await g.frame('region', { durationS: 0 });
          return;
        }
        await g.frame({ pointKpc: [x / 1000, y / 1000, 0] }, { distKpc: 5, durationS: 0.01 });
        if (live) await g.frame('region', { durationS: 3.4 });
      })
      .catch(() => undefined);
    return () => {
      live = false;
      g.dispose();
    };
  }, [p.m]);
  return <canvas ref={canvas} class="moment-canvas" aria-label="The galaxy chart, closing in on where the map's lines meet" />;
}
