// The neighbourhood chart: the catalogued stars within 10 pc of the craft at the discovery epoch, the
// craft and its velocity, the alien's star, and the trail drawn for any star (the craft's velocity
// relative to it, the line from it to the craft, the angle between them, from kinematics.trail).
// mountNeighbourhood(canvas, opts) returns a handle (the Trail chapter mounts it; /play/charts/ is the
// dev page). Every number drawn comes from neighbourhoodModel.ts and kinematics.ts; this file only draws.
//
// Stars without a radial velocity are drawn as rings, not discs: their depth is uncertain.
// The craft's velocity arrow is relative to the alien's star (what the alien measures from home); arrow
// lengths are fixed on the chart (directions only), speeds are in the readouts.

import * as THREE from 'three';
import { scale, sub, toGalacticCartesian, type Vec3 } from '../science/astro';
import { homeObserver, type Observer } from '../science/epoch';
import { trail, type TrailEntry } from '../science/kinematics';
import { expandColumnar, type ColumnarStars, type ScenarioData, type StarCatalogue, type StarRecord } from '../science/types';
import {
  ChartCamera, attachInput, createChartRenderer, disposeTree, galToWorld, makeLabel, makePoints, makePolyline, makeSegments, nearestOnScreen, projectGal, sizeLabels,
  type ChartView, type PointSet, type ScreenPoint,
} from './chartControls';
import { NEIGHBOURHOOD_RADIUS_PC, angleTint, computeNeighbourhood, trailGeometry, type ChartStar, type NeighbourhoodModel, type TrailGeometry } from './neighbourhoodModel';

export interface NeighbourhoodOptions {
  /** The playthrough's seed (the trail table's simulated measurement errors). */
  seed: string;
  scenario?: ScenarioData;
  stars?: StarCatalogue;
  /** kinematics.trail rows already computed by the chapter; otherwise computed here with trailDraws draws. */
  trail?: readonly TrailEntry[];
  trailDraws?: number;
  reducedMotion?: boolean;
  /** How stars are named on the chart (default: the catalogue's name). */
  nameOf?: (s: ChartStar) => string;
  onHover?: (p: PickedStar | null) => void;
  onPick?: (p: PickedStar | null) => void;
}

export interface PickedStar {
  index: number;
  star: ChartStar;
  /** The star's trail row, or null when it has none (no radial velocity). */
  trail: TrailEntry | null;
  screen: ScreenPoint;
}

export interface NeighbourhoodInfo {
  decimalYear: number;
  count: number;
  census: NeighbourhoodModel['census'];
}

export type NeighbourhoodFrameTarget = 'overview' | 'craft' | 'home' | { starId: number };

export interface NeighbourhoodHandle {
  ready: Promise<NeighbourhoodInfo>;
  model(): NeighbourhoodModel;
  trailRows(): readonly TrailEntry[];
  pick(x: number, y: number, radiusPx?: number): PickedStar | null;
  setHighlight(starId: number | null): void;
  /** Screen position of a star (by catalogue id), 'craft', or a chart point (pc from the craft). */
  project(target: number | 'craft' | Vec3): ScreenPoint | null;
  /** Draws the trail for a star (by catalogue id); null clears. Returns the drawn geometry, or null when the star has no row. */
  showTrail(starId: number | null): TrailGeometry | null;
  /** Tints every star by its trail angle (stars without a row turn grey); null restores colours. */
  showAll(entries: readonly TrailEntry[] | null): void;
  frame(target: NeighbourhoodFrameTarget, opts?: { durationS?: number; distPc?: number }): Promise<void>;
  setViewMode(mode: 'top' | 'perspective'): Promise<void>;
  getView(): ChartView;
  setView(v: Partial<ChartView>): void;
  setReducedMotion(on: boolean): void;
  frameStats(): { meanIntervalMs: number; frames: number };
  benchmark(frames: number): number;
  dispose(): void;
}

const OVERVIEW: ChartView = { target: [0, 0, 0], azDeg: -110, elDeg: 30, dist: 30 };
const LIMITS = { min: 0.3, max: 120 };
/** Arrow lengths on the chart, pc (display choice: directions only). */
const VEL_ARROW_PC = 2.5;
const NO_ROW_GREY: [number, number, number] = [0.42, 0.44, 0.5];

async function loadInputs(opts: NeighbourhoodOptions): Promise<{ scenario: ScenarioData; stars: StarCatalogue }> {
  if (opts.scenario && opts.stars) return { scenario: opts.scenario, stars: opts.stars };
  const [sc, st, sk] = await Promise.all([import('../../data/scenario.json'), import('../../data/stars.json'), import('../../data/sky.json')]);
  return {
    scenario: opts.scenario ?? (sc.default as unknown as ScenarioData),
    stars: opts.stars ?? { meta: {}, near: (st.default as unknown as { near: StarRecord[] }).near, sky: expandColumnar(sk.default as unknown as ColumnarStars) },
  };
}

export function mountNeighbourhood(canvas: HTMLCanvasElement, opts: NeighbourhoodOptions): NeighbourhoodHandle {
  const cam = new ChartCamera(OVERVIEW, LIMITS, opts.reducedMotion ?? false);
  const root = new THREE.Group();
  const sets = new Set<PointSet>();
  const overlay = { trail: null as THREE.Group | null, highlight: null as THREE.Group | null };
  let model: NeighbourhoodModel | null = null;
  let rows: readonly TrailEntry[] = [];
  let positions = new Float32Array(0);
  let baseColours = new Float32Array(0);
  let starSet: PointSet | null = null;
  let ringSet: PointSet | null = null;
  let highlighted: number | null = null;
  let disposed = false;
  const core = createChartRenderer(
    canvas,
    (dt) => {
      cam.tick(dt);
      cam.apply(core.camera);
      sizeLabels(root, core.camera, core.size().h);
    },
    (_w, _h, pr) => sets.forEach((ps) => ps.setPixelRatio(pr)),
  );
  core.scene.add(root);
  const track = (ps: PointSet): PointSet => {
    ps.setPixelRatio(core.size().pr);
    sets.add(ps);
    return ps;
  };
  // An arrow: a line with a ringed dot at its tip (a screen-sized tip reads the same at every zoom,
  // where a 3D cone seen nose-on near the camera became a blob).
  const arrow = (from: Vec3, dir: Vec3, len: number, colour: number, rgb: [number, number, number]): THREE.Group => {
    const g = new THREE.Group();
    const tip: Vec3 = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len];
    g.add(makeSegments([[from, tip]], colour, 0.95));
    g.add(track(makePoints(new Float32Array([...tip, ...tip]), new Float32Array([...rgb, ...rgb]), new Float32Array([2.6, 5]), new Float32Array([1, 0.8]), new Float32Array([0, 1]))).points);
    return g;
  };
  const nameOf = (s: ChartStar): string => (opts.nameOf ? opts.nameOf(s) : s.label);
  const labelAt = (text: string, p: Vec3, colour: string, h = 13): THREE.Sprite => {
    const l = makeLabel(text, colour, h);
    galToWorld(p, l.position);
    return l;
  };

  const ready = (async (): Promise<NeighbourhoodInfo> => {
    const { scenario, stars } = await loadInputs(opts);
    if (disposed) throw new Error('neighbourhood chart disposed while loading');
    const m = computeNeighbourhood(scenario, stars);
    model = m;
    let observer: Observer | null = null;
    if (!opts.trail) {
      observer = homeObserver(scenario, stars, m.decimalYear);
      rows = trail(m.disc.craft, stars, observer, { maxDistPc: NEIGHBOURHOOD_RADIUS_PC, draws: opts.trailDraws ?? 400, seed: opts.seed });
    } else rows = opts.trail;
    const n = m.stars.length;
    positions = new Float32Array(3 * n);
    baseColours = new Float32Array(3 * n);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const hollow = new Float32Array(n);
    m.stars.forEach((s, i) => {
      positions.set(s.posPc, 3 * i);
      baseColours.set(s.colour, 3 * i);
      sizes[i] = s.radiusPx;
      alphas[i] = 1;
      hollow[i] = s.fullVelocity ? 0 : 1;
    });
    starSet = track(makePoints(positions, baseColours.slice(), sizes, alphas, hollow));
    root.add(starSet.points);

    // The craft (origin) and its velocity relative to the alien's star.
    const home = m.stars[m.homeIndex]!;
    const craftVelHome = toGalacticCartesian(sub(m.disc.craft.velKmS, home.icrsVelKmS));
    const vlen = Math.hypot(...craftVelHome);
    root.add(track(makePoints(new Float32Array([0, 0, 0]), new Float32Array([0.7, 1, 0.95]), new Float32Array([5]), new Float32Array([1]))).points);
    root.add(arrow([0, 0, 0], scale(craftVelHome, 1 / vlen), VEL_ARROW_PC, 0x9ff0d8, [0.62, 0.94, 0.85]));
    // The craft's label above its point and the home star's below: the two are a fraction of a parsec apart.
    const craftLabel = labelAt('the craft', [0, 0, 0], '#c8fff0');
    craftLabel.center.set(0, -0.15);
    const homeLabel = labelAt(`${nameOf(home)} (home)`, home.posPc, '#a8ffd0');
    homeLabel.center.set(0, 1.15);
    root.add(craftLabel, homeLabel);
    // A faint 10 pc reference circle in the Galactic plane through the craft.
    const ring: Vec3[] = [];
    for (let k = 0; k < 128; k++) ring.push([NEIGHBOURHOOD_RADIUS_PC * Math.cos((k / 128) * 2 * Math.PI), NEIGHBOURHOOD_RADIUS_PC * Math.sin((k / 128) * 2 * Math.PI), 0]);
    root.add(makePolyline(ring, 0x5a7fb0, 0.18, true));
    return { decimalYear: m.decimalYear, count: n, census: m.census };
  })();
  ready.catch(() => undefined);

  const requireModel = (): NeighbourhoodModel => {
    if (!model) throw new Error('neighbourhood chart not ready');
    return model;
  };
  const rowFor = (id: number): TrailEntry | null => rows.find((r) => r.star.id === id) ?? null;

  const pickAt = (x: number, y: number, radiusPx = 12): PickedStar | null => {
    if (!model) return null;
    const { w, h } = core.size();
    cam.apply(core.camera);
    const i = nearestOnScreen(positions, core.camera, w, h, x, y, radiusPx);
    const s = model.stars[i];
    if (!s) return null;
    return { index: i, star: s, trail: rowFor(s.star.id), screen: projectGal(s.posPc, core.camera, w, h) };
  };

  const setHighlight = (starId: number | null): void => {
    if (starId === highlighted) return;
    highlighted = starId;
    if (overlay.highlight) disposeTree(overlay.highlight);
    if (ringSet) sets.delete(ringSet);
    overlay.highlight = null;
    ringSet = null;
    const s = starId !== null && model ? model.stars.find((q) => q.star.id === starId) : undefined;
    if (!s) return;
    const g = new THREE.Group();
    ringSet = track(makePoints(new Float32Array(s.posPc), new Float32Array([1, 1, 1]), new Float32Array([s.radiusPx + 5]), new Float32Array([0.9]), new Float32Array([1])));
    const note = s.fullVelocity ? '' : ' (no radial velocity: depth uncertain)';
    g.add(ringSet.points, labelAt(`${nameOf(s)}, ${s.distFromCraftPc.toFixed(2)} pc${note}`, s.posPc, '#ffffff'));
    root.add(g);
    overlay.highlight = g;
  };

  const detach = attachInput(canvas, cam, {
    hover(x, y) {
      const p = pickAt(x, y);
      setHighlight(p?.star.star.id ?? null);
      opts.onHover?.(p);
    },
    click(x, y) {
      opts.onPick?.(pickAt(x, y));
    },
  });

  return {
    ready,
    model: requireModel,
    trailRows: () => rows,
    pick: pickAt,
    setHighlight,
    project(target) {
      if (!model) return null;
      const { w, h } = core.size();
      cam.apply(core.camera);
      if (target === 'craft') return projectGal([0, 0, 0], core.camera, w, h);
      if (typeof target === 'number') {
        const s = model.stars.find((q) => q.star.id === target);
        return s ? projectGal(s.posPc, core.camera, w, h) : null;
      }
      return projectGal(target, core.camera, w, h);
    },
    showTrail(starId) {
      if (overlay.trail) disposeTree(overlay.trail);
      overlay.trail = null;
      if (starId === null || !model) {
        setHighlight(null);
        return null;
      }
      const row = rowFor(starId);
      const g = row ? trailGeometry(model, row) : null;
      if (!g) return null;
      const grp = new THREE.Group();
      const sp = g.starPosPc;
      // The line from the star to the craft, continued past the craft (the "straight away" direction).
      grp.add(makeSegments([[sp, [0, 0, 0]]], 0xffd88a, 0.75));
      grp.add(makeSegments([[[0, 0, 0], scale(g.awayDir, VEL_ARROW_PC * 1.3)]], 0xffd88a, 0.35));
      grp.add(arrow([0, 0, 0], g.relVelDir, VEL_ARROW_PC, 0xfff2c0, [1, 0.95, 0.75]));
      if (g.arc.length) grp.add(makePolyline(g.arc, 0xffffff, 0.9));
      const mid = g.arc[Math.floor(g.arc.length / 2)] ?? g.relVelDir;
      // The label is the alien's measurement and its 95% cut (M4 science audit finding 2); the drawn vectors are the catalogue's.
      const f = (x: number): string => (x < 1 ? x.toFixed(3) : x.toFixed(1));
      const cut = g.nullAngle95Deg > 0 ? ` (cut ${f(g.nullAngle95Deg)})` : '';
      grp.add(labelAt(`${f(g.measuredAngleDeg)} deg${cut}`, scale(mid, 1.15), '#fff2c0', 14));
      root.add(grp);
      overlay.trail = grp;
      setHighlight(starId);
      return g;
    },
    showAll(entries) {
      if (!model || !starSet) return;
      if (!entries) {
        starSet.setColours(baseColours);
        return;
      }
      const byId = new Map(entries.map((e) => [e.star.id, e]));
      const c = new Float32Array(baseColours.length);
      model.stars.forEach((s, i) => {
        const e = byId.get(s.star.id);
        c.set(e ? angleTint(e.angleDeg) : NO_ROW_GREY, 3 * i);
      });
      starSet.setColours(c);
    },
    frame(target, o = {}) {
      const m = requireModel();
      let at: Vec3 = [0, 0, 0];
      let dist = OVERVIEW.dist;
      if (target === 'craft') dist = 6;
      else if (target === 'home') {
        at = m.stars[m.homeIndex]!.posPc;
        dist = 6;
      } else if (typeof target === 'object') {
        const s = m.stars.find((q) => q.star.id === target.starId);
        // Frame the star and the craft together.
        if (s) {
          at = scale(s.posPc, 0.5);
          dist = Math.max(4, 2.2 * s.distFromCraftPc);
        }
      }
      return cam.easeTo({ target: at, dist: o.distPc ?? dist }, o.durationS ?? 1.4);
    },
    setViewMode(mode) {
      return mode === 'top' ? cam.easeTo({ azDeg: -90, elDeg: 89.9 }, 1.0) : cam.easeTo({ azDeg: OVERVIEW.azDeg, elDeg: OVERVIEW.elDeg }, 1.0);
    },
    getView: () => ({ ...cam.view, target: [...cam.view.target] }),
    setView: (v) => cam.set(v),
    setReducedMotion(on) {
      cam.reducedMotion = on;
    },
    frameStats: () => core.frameStats(),
    benchmark: (frames) => core.benchmark(frames),
    dispose() {
      disposed = true;
      detach();
      sets.clear();
      core.dispose();
    },
  };
}
