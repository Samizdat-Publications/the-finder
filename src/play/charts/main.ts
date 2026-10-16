// Dev page for the two M4 charts (/play/charts/). Query:
//   ?chart=galaxy | neighbourhood | both (default both, side by side)
//   ?seed=...    the playthrough seed (default 'charts.dev')
//   ?demo=map    galaxy: lay the cover map over the chart where a triangulation fit puts it, link every
//                line to its pulsar and show the fitted region (dev only; the Map chapter does this live)
//   ?demo=sun | ?demo=wrong   neighbourhood: draw the Sun's trail, or a wrong star's (the nearest other)
//   ?reduced=1 short eases; ?clean=1 hides the buttons and readout (captures)
// Exposes window.__galaxy, window.__neighbourhood and window.__chartsDemo for the browser test.
import { KMS_PER_MASYR_PC, KM_S_TO_PC_PER_YEAR, add, scale, sub, toGalacticCartesian, type Vec3 } from '../../science/astro';
import { discoveryState } from '../../science/epoch';
import { distanceModel, eastNorth } from '../../science/pulsarEpoch';
import { originRegion, type MapPoint, type OriginRegion } from '../../science/triangulation';
import { expandColumnar, type ColumnarStars, type CoverData, type PulsarCatalogue, type ScenarioData, type StarCatalogue, type StarRecord } from '../../science/types';
import { mountGalaxy, type GalaxyHandle } from '../../world/galaxy';
import { transformFromFit, type GalaxyModel } from '../../world/galaxyModel';
import { mountNeighbourhood, type NeighbourhoodHandle } from '../../world/neighbourhood';

declare global {
  interface Window {
    __galaxy?: GalaxyHandle;
    __neighbourhood?: NeighbourhoodHandle;
    __chartsDemo?: Promise<{ region?: OriginRegion; elapsedYears?: number; wrongStarId?: number }>;
  }
}

const q = new URLSearchParams(location.search);
if (q.get('clean') === '1') document.body.classList.add('clean');
const which = q.get('chart') ?? 'both';
const seed = q.get('seed') ?? 'charts.dev';
const demo = q.get('demo');
const reducedMotion = q.get('reduced') === '1';
const info = document.getElementById('info')!;
const hud = document.getElementById('hud')!;
const gCanvas = document.getElementById('galaxy') as HTMLCanvasElement;
const nCanvas = document.getElementById('neighbourhood') as HTMLCanvasElement;
gCanvas.hidden = which === 'neighbourhood';
nCanvas.hidden = which === 'galaxy';

const button = (label: string, fn: () => void): void => {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  hud.appendChild(b);
};

/**
 * The map lines as triangulation inputs in the alien's frame at the map epoch (dev page only; the same
 * construction as triangulation.test.ts pointsEpoch): each pulsar's position from the observer, moved
 * back over the elapsed time by the proper motion the observer measures. The Map chapter builds this
 * from the player's own matches and dating.
 */
function mapPoints(model: GalaxyModel, cover: CoverData, cat: PulsarCatalogue, elapsedYears: number): MapPoint[] {
  return cover.pulsarMap.lines.map((l) => {
    const a = model.pulsars.find((p) => p.jname === l.jname)!.entry;
    const dPc = (a.distKpc as number) * 1000;
    let pos: Vec3 = scale(a.nHat, dPc);
    if (a.pmraObs !== null && a.pmdecObs !== null) {
      const [e, n] = eastNorth(a.raDeg, a.decDeg);
      const vRel = scale(add(scale(e, a.pmraObs), scale(n, a.pmdecObs)), KMS_PER_MASYR_PC * dPc);
      pos = sub(pos, scale(vRel, KM_S_TO_PC_PER_YEAR * elapsedYears));
    }
    const rec = cat.pulsars.find((r) => r.jname === l.jname)!;
    return { name: l.bname, angleDeg: l.mapAngleDeg, rOverR0: l.rOverR0, posPc: toGalacticCartesian(pos), distKpc: a.distKpc as number, distance: distanceModel(rec) };
  });
}

async function main(): Promise<{ region?: OriginRegion; elapsedYears?: number; wrongStarId?: number }> {
  const [sc, st, sk, ps, cv] = await Promise.all([
    import('../../../data/scenario.json'),
    import('../../../data/stars.json'),
    import('../../../data/sky.json'),
    import('../../../data/pulsars.json'),
    import('../../../data/cover.json'),
  ]);
  const scenario = sc.default as unknown as ScenarioData;
  const stars: StarCatalogue = { meta: {}, near: (st.default as unknown as { near: StarRecord[] }).near, sky: expandColumnar(sk.default as unknown as ColumnarStars) };
  const catalogue = ps.default as unknown as PulsarCatalogue;
  const cover = cv.default as unknown as CoverData;
  const out: { region?: OriginRegion; elapsedYears?: number; wrongStarId?: number } = {};
  const lines: string[] = [];

  if (which !== 'neighbourhood') {
    const g = mountGalaxy(gCanvas, { seed, scenario, stars, catalogue, reducedMotion });
    window.__galaxy = g;
    const gi = await g.ready;
    lines.push(`galaxy: ${gi.counts.shown} pulsars drawn of ${gi.counts.catalogue} (${gi.counts.noDistance} without a distance), AD ${Math.floor(gi.decimalYear)}`);
    button('Galaxy', () => void g.frame('overview'));
    button('Home', () => void g.frame('home'));
    button('Centre', () => void g.frame('gc'));
    button('Top view', () => void g.setViewMode('top'));
    button('Perspective', () => void g.setViewMode('perspective'));
    if (demo === 'map') {
      const elapsed = discoveryState(scenario, stars).yearsAfterLaunch;
      const region = originRegion(mapPoints(g.model(), cover, catalogue, elapsed), { draws: 300, seed: `${seed}.region` });
      g.showMap(cover.pulsarMap, transformFromFit(region.fit));
      g.setMatches(cover.pulsarMap.lines.map((l) => ({ order: l.order, jname: l.jname })));
      g.showRegion(region);
      out.region = region;
      out.elapsedYears = elapsed;
      lines.push(`map fit: rms ${region.fit.rmsDeg.toFixed(2)} deg; region ${(2 * region.semiAxesPc[0]).toFixed(0)} by ${(2 * region.semiAxesPc[1]).toFixed(0)} pc`);
      button('Map', () => void g.frame('map'));
      button('Region', () => void g.frame('region'));
    }
  }
  if (which !== 'galaxy') {
    const n = mountNeighbourhood(nCanvas, { seed, scenario, stars, reducedMotion });
    window.__neighbourhood = n;
    const ni = await n.ready;
    lines.push(`neighbourhood: ${ni.count} stars within 10 pc of the craft (${ni.census.noRadialVelocity} without a radial velocity)`);
    const m = n.model();
    // The wrong star for the demo: the nearest star to the craft with a trail row, other than the Sun and
    // the alien's own star (which the craft is passing at closest approach, so 90 deg by construction).
    const homeId = m.stars[m.homeIndex]!.star.id;
    const wrong = n.trailRows().filter((r) => r.star.id !== 0 && r.star.id !== homeId).sort((a, b) => a.distPc - b.distPc || a.star.id - b.star.id)[0];
    out.wrongStarId = wrong?.star.id;
    button('Neighbourhood', () => void n.frame('overview'));
    button('Craft', () => void n.frame('craft'));
    button('Sun trail', () => void (n.showTrail(0), n.frame({ starId: 0 })));
    if (wrong) button(`${m.stars.find((s) => s.star.id === wrong.star.id)?.label} trail`, () => void (n.showTrail(wrong.star.id), n.frame({ starId: wrong.star.id })));
    button('Tint by angle', () => n.showAll(n.trailRows()));
    if (demo === 'sun') n.showTrail(0);
    if (demo === 'wrong' && wrong) n.showTrail(wrong.star.id);
  }
  info.textContent = lines.join('\n');
  return out;
}

window.__chartsDemo = main();
