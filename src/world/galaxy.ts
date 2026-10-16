// The galaxy chart: the alien's pulsar catalogue at the discovery epoch around its own star, the Galactic
// centre, a faint Galactic plane, and the cover map laid over it (rays, the player's matches, the fitted
// origin region). mountGalaxy(canvas, opts) returns a handle (the Map chapter mounts it; /play/charts/
// is the dev page). Every number drawn comes from galaxyModel.ts (pure, tested); this file only draws.

import * as THREE from 'three';
import type { Vec3 } from '../science/astro';
import { discoveryState, homeObserver, type Observer } from '../science/epoch';
import { projectCatalogue, type AlienPulsar } from '../science/pulsarEpoch';
import { expandColumnar, type ColumnarStars, type CoverData, type PulsarCatalogue, type ScenarioData, type StarCatalogue, type StarRecord } from '../science/types';
import {
  ChartCamera, attachInput, createChartRenderer, declutterLabels, disposeTree, makeLabel, makePoints, makePolyline, makeSegments, nearestOnScreen, projectGal, sizeLabels,
  type BrightPoint, type ChartView, type PointSet, type ScreenPoint,
} from './chartControls';
import {
  buildGalaxy, mapRays, matchSegments, regionOutline, type ChartPulsar, type GalaxyModel, type MapRay, type MapTransform, type MatchSegment, type PulsarClass, type RegionEllipse,
} from './galaxyModel';

export interface GalaxyOptions {
  /** The playthrough's seed: the catalogue's simulated measurements (projectCatalogue) draw from it. */
  seed: string;
  /** Already projected catalogue and its observer (the chapter's own); otherwise computed here. */
  pulsars?: readonly AlienPulsar[];
  observer?: Observer;
  scenario?: ScenarioData;
  stars?: StarCatalogue;
  catalogue?: PulsarCatalogue;
  reducedMotion?: boolean;
  /** Label of the alien's star (default 'Gliese 445'). */
  homeLabel?: string;
  /** How a distance in parsecs is written on a label (the chapter's: the alien's units, the human gloss on request); default parsecs. */
  lengthLabel?: (pc: number, digits?: number) => string;
  onHover?: (p: PickedPulsar | null) => void;
  onPick?: (p: PickedPulsar | null) => void;
}

export interface PickedPulsar {
  index: number;
  jname: string;
  chart: ChartPulsar;
  /** The catalogue entry the alien holds. */
  entry: AlienPulsar;
  screen: ScreenPoint;
}

export interface GalaxyInfo {
  decimalYear: number;
  counts: GalaxyModel['counts'];
  gc: GalaxyModel['gc'];
}

export type GalaxyFrameTarget = 'overview' | 'home' | 'gc' | 'map' | 'region' | { jname: string } | { pointKpc: Vec3 };

export interface GalaxyHandle {
  ready: Promise<GalaxyInfo>;
  model(): GalaxyModel;
  /** The pulsar nearest (x, y) (canvas CSS px) within radiusPx (default 12), or null. */
  pick(x: number, y: number, radiusPx?: number): PickedPulsar | null;
  setHighlight(jname: string | null): void;
  /** Screen position of a pulsar (by J name) or a Galactic point (kpc). */
  project(target: string | Vec3): ScreenPoint | null;
  showMap(map: CoverData['pulsarMap'], transform: MapTransform): MapRay[];
  hideMap(): void;
  /** Links from map lines (by cover order) to the pulsars the player assigned; needs showMap first. */
  setMatches(pairs: readonly { order: number; jname: string }[]): MatchSegment[];
  showRegion(region: RegionEllipse | null): void;
  frame(target: GalaxyFrameTarget, opts?: { durationS?: number; distKpc?: number }): Promise<void>;
  setViewMode(mode: 'top' | 'perspective'): Promise<void>;
  getView(): ChartView;
  setView(v: Partial<ChartView>): void;
  setReducedMotion(on: boolean): void;
  /** Writes the distance labels again (after the human gloss is switched). */
  relabel(): void;
  frameStats(): { meanIntervalMs: number; frames: number };
  benchmark(frames: number): number;
  dispose(): void;
}

/** Display colours by class (a display choice): young warm, old cool, millisecond lavender, no spin-down grey. */
const CLASS_COLOUR: Readonly<Record<PulsarClass, [number, number, number]>> = {
  young: [1.0, 0.62, 0.32],
  old: [0.55, 0.85, 1.0],
  millisecond: [0.82, 0.7, 1.0],
  noSpinDown: [0.6, 0.62, 0.68],
};
const MAP_COLOUR = 0xf0c870;
const OVERVIEW: ChartView = { target: [3, 0, 0], azDeg: -120, elDeg: 38, dist: 30 };
const LIMITS = { min: 0.002, max: 150 };

async function loadInputs(opts: GalaxyOptions): Promise<{ pulsars: readonly AlienPulsar[]; observer: Observer }> {
  if (opts.pulsars && opts.observer) return { pulsars: opts.pulsars, observer: opts.observer };
  const [sc, st, sk, ps] = await Promise.all([
    opts.scenario ? null : import('../../data/scenario.json'),
    opts.stars ? null : import('../../data/stars.json'),
    opts.stars ? null : import('../../data/sky.json'),
    opts.catalogue ? null : import('../../data/pulsars.json'),
  ]);
  const scenario = opts.scenario ?? (sc!.default as unknown as ScenarioData);
  const stars = opts.stars ?? { meta: {}, near: (st!.default as unknown as { near: StarRecord[] }).near, sky: expandColumnar(sk!.default as unknown as ColumnarStars) };
  const catalogue = opts.catalogue ?? (ps!.default as unknown as PulsarCatalogue);
  const observer = opts.observer ?? homeObserver(scenario, stars, discoveryState(scenario, stars).decimalYear);
  return { pulsars: opts.pulsars ?? projectCatalogue(catalogue, observer, { seed: opts.seed }), observer };
}

export function mountGalaxy(canvas: HTMLCanvasElement, opts: GalaxyOptions): GalaxyHandle {
  const cam = new ChartCamera(OVERVIEW, LIMITS, opts.reducedMotion ?? false);
  const root = new THREE.Group();
  const overlay = { map: null as THREE.Group | null, matches: null as THREE.Object3D | null, region: null as THREE.Group | null, highlight: null as THREE.Group | null };
  let rays: MapRay[] = [];
  let regionShown: RegionEllipse | null = null;
  let model: GalaxyModel | null = null;
  let disposed = false;
  let highlighted: string | null = null;
  const lenText = (pc: number, digits = 3): string => (opts.lengthLabel ? opts.lengthLabel(pc, digits) : `${pc.toFixed(pc < 10 ? 2 : 0)} pc`);
  let gcLabel: THREE.Sprite | null = null;
  // Every point set's pixel-ratio uniform follows the renderer's.
  const sets = new Set<PointSet>();
  const track = (ps: PointSet): PointSet => {
    ps.setPixelRatio(core.size().pr);
    sets.add(ps);
    return ps;
  };
  const core = createChartRenderer(
    canvas,
    (dt) => {
      cam.tick(dt);
      cam.apply(core.camera);
      sizeLabels(root, core.camera, core.size().h);
      const { w, h } = core.size();
      // The region's label only when the region is big enough on screen to own it (30 px semi-axis).
      const lab = overlay.region?.userData.label as THREE.Sprite | undefined;
      if (lab && regionShown) {
        const c = projectGal([regionShown.centerPc[0] / 1000, regionShown.centerPc[1] / 1000, 0], core.camera, w, h);
        const e = projectGal(lab.userData.edge as Vec3, core.camera, w, h);
        lab.userData.suppressed = Math.hypot(e.x - c.x, e.y - c.y) <= 30;
      }
      // Labels clear of each other and of the bright marks (the centre, your star, a highlighted pulsar); the
      // centre's and your star's labels are always kept (M4 step 7e).
      if (model) declutterLabels(root, core.camera, w, h, brightMarks());
    },
    (_w, _h, pr) => sets.forEach((ps) => ps.setPixelRatio(pr)),
  );
  core.scene.add(root);

  /** The Galactic centre's label: its distance and error in the chart's length text. */
  const placeGcLabel = (m: GalaxyModel): void => {
    if (gcLabel) disposeTree(gcLabel);
    const gc = m.gc.posKpc;
    gcLabel = makeLabel(`Galactic centre, ${lenText(m.gc.distKpc * 1000)} +/- ${lenText(m.gc.sigmaKpc * 1000, 2)} (modern)`, '#ffe9b8');
    gcLabel.position.set(gc[0], gc[2], -gc[1]);
    gcLabel.userData.keep = true;
    root.add(gcLabel);
  };

  const ready = (async (): Promise<GalaxyInfo> => {
    const { pulsars, observer } = await loadInputs(opts);
    if (disposed) throw new Error('galaxy chart disposed while loading');
    const m = buildGalaxy(pulsars, observer);
    model = m;
    const n = m.pulsars.length;
    const colours = new Float32Array(3 * n);
    m.pulsars.forEach((p, i) => colours.set(CLASS_COLOUR[p.cls], 3 * i));
    root.add(track(makePoints(m.positions, colours, m.sizes, m.alphas)).points);

    // The Galactic plane for orientation: rings every 2.5 kpc around the centre, in the plane through it.
    const gc = m.gc.posKpc;
    const plane = new THREE.Group();
    for (let r = 2.5; r <= 15; r += 2.5) {
      const ring: Vec3[] = [];
      for (let k = 0; k < 128; k++) ring.push([gc[0] + r * Math.cos((k / 128) * 2 * Math.PI), gc[1] + r * Math.sin((k / 128) * 2 * Math.PI), gc[2]]);
      plane.add(makePolyline(ring, 0x5a7fb0, r % 5 === 0 ? 0.22 : 0.12, true));
    }
    plane.add(makeSegments([[[0, 0, 0], gc]], 0x8fb4e0, 0.35));
    root.add(plane);

    // The centre and the alien's star.
    const marks = track(makePoints(new Float32Array([...gc, 0, 0, 0]), new Float32Array([1, 0.92, 0.7, 0.6, 1, 0.75]), new Float32Array([9, 6]), new Float32Array([1, 1])));
    root.add(marks.points);
    placeGcLabel(m);
    const homeLabel = makeLabel(opts.homeLabel ?? 'Gliese 445', '#a8ffd0');
    homeLabel.userData.keep = true;
    homeLabel.userData.priority = 2;
    root.add(homeLabel);
    return { decimalYear: m.decimalYear, counts: m.counts, gc: m.gc };
  })();
  ready.catch(() => undefined);

  /** The marks labels keep clear of: the centre, your star, and the highlighted pulsar. */
  const brightMarks = (): BrightPoint[] => {
    const out: BrightPoint[] = [{ at: [0, 0, 0], rPx: 7 }];
    if (model) out.push({ at: model.gc.posKpc, rPx: 10 });
    const p = highlighted && model ? model.pulsars.find((q) => q.jname === highlighted) : undefined;
    if (p) out.push({ at: p.posKpc, rPx: 9 });
    return out;
  };

  const requireModel = (): GalaxyModel => {
    if (!model) throw new Error('galaxy chart not ready');
    return model;
  };

  const pickAt = (x: number, y: number, radiusPx = 12): PickedPulsar | null => {
    if (!model) return null;
    const { w, h } = core.size();
    cam.apply(core.camera);
    const i = nearestOnScreen(model.positions, core.camera, w, h, x, y, radiusPx);
    const p = model.pulsars[i];
    if (!p) return null;
    return { index: i, jname: p.jname, chart: p, entry: p.entry, screen: projectGal(p.posKpc, core.camera, w, h) };
  };

  let ringSet: PointSet | null = null;
  const setHighlight = (jname: string | null): void => {
    if (jname === highlighted) return;
    highlighted = jname;
    if (overlay.highlight) disposeTree(overlay.highlight);
    if (ringSet) sets.delete(ringSet);
    overlay.highlight = null;
    ringSet = null;
    const p = jname && model ? model.pulsars.find((q) => q.jname === jname) : undefined;
    if (!p) return;
    const g = new THREE.Group();
    const ring = track(makePoints(new Float32Array(p.posKpc), new Float32Array([1, 1, 1]), new Float32Array([9]), new Float32Array([0.95]), new Float32Array([1])));
    ringSet = ring;
    const label = makeLabel(p.bname ? `PSR ${p.bname} (${p.jname})` : `PSR ${p.jname}`, '#ffffff');
    label.position.set(p.posKpc[0], p.posKpc[2], -p.posKpc[1]);
    label.userData.priority = 5;
    g.add(ring.points, label);
    root.add(g);
    overlay.highlight = g;
  };

  const detach = attachInput(canvas, cam, {
    hover(x, y) {
      const p = pickAt(x, y);
      setHighlight(p?.jname ?? null);
      opts.onHover?.(p);
    },
    click(x, y) {
      opts.onPick?.(pickAt(x, y));
    },
  });

  const frameDist = (target: GalaxyFrameTarget): { at: Vec3; dist: number } => {
    const m = requireModel();
    if (target === 'overview') return { at: OVERVIEW.target, dist: OVERVIEW.dist };
    if (target === 'home') return { at: [0, 0, 0], dist: 1.2 };
    if (target === 'gc') return { at: m.gc.posKpc, dist: 12 };
    if (target === 'map') {
      const ends = rays.map((r) => Math.hypot(r.end[0] - r.start[0], r.end[1] - r.start[1]));
      const o = rays[0]?.start ?? [0, 0, 0];
      return { at: o, dist: Math.max(0.01, 2.6 * Math.max(0.005, ...ends)) };
    }
    if (target === 'region') {
      const r = regionShown;
      if (!r) return { at: [0, 0, 0], dist: 0.2 };
      return { at: [r.centerPc[0] / 1000, r.centerPc[1] / 1000, 0], dist: Math.max(0.004, (5 * r.semiAxesPc[0]) / 1000) };
    }
    if ('jname' in target) {
      const p = m.pulsars.find((q) => q.jname === target.jname);
      return { at: p ? p.posKpc : [0, 0, 0], dist: p ? Math.max(0.05, 0.4 * p.distKpc) : 1 };
    }
    return { at: target.pointKpc, dist: cam.view.dist };
  };

  return {
    ready,
    model: requireModel,
    pick: pickAt,
    setHighlight,
    project(target) {
      if (!model) return null;
      const { w, h } = core.size();
      cam.apply(core.camera);
      if (typeof target === 'string') {
        const p = model.pulsars.find((q) => q.jname === target);
        return p ? projectGal(p.posKpc, core.camera, w, h) : null;
      }
      return projectGal(target, core.camera, w, h);
    },
    showMap(map, transform) {
      if (overlay.map) disposeTree(overlay.map);
      rays = mapRays(map, transform);
      const g = new THREE.Group();
      const gcRay = rays[0]!;
      g.add(makeSegments([[gcRay.start, gcRay.end]], 0xfff0c8, 0.95));
      g.add(makeSegments(rays.slice(1).map((r) => [r.start, r.end] as const), MAP_COLOUR, 0.85));
      // Height ticks: short marks across each line (0.015 R0 long), as on the cover.
      const tickLen = 0.015 * transform.kpcPerR0;
      const ticks: [Vec3, Vec3][] = [];
      for (const r of rays) {
        if (!r.tick) continue;
        const a = (r.angleDeg * Math.PI) / 180;
        const px = -Math.sin(a) * tickLen;
        const py = Math.cos(a) * tickLen;
        ticks.push([[r.tick[0] - px, r.tick[1] - py, r.tick[2]], [r.tick[0] + px, r.tick[1] + py, r.tick[2]]]);
      }
      g.add(makeSegments(ticks, MAP_COLOUR, 0.85));
      root.add(g);
      overlay.map = g;
      return rays;
    },
    hideMap() {
      if (overlay.map) disposeTree(overlay.map);
      if (overlay.matches) disposeTree(overlay.matches);
      overlay.map = null;
      overlay.matches = null;
      rays = [];
    },
    setMatches(pairs) {
      if (overlay.matches) disposeTree(overlay.matches);
      overlay.matches = null;
      const segs = model ? matchSegments(rays, pairs, model.pulsars) : [];
      if (segs.length) {
        overlay.matches = makeSegments(segs.map((s) => [s.from, s.to] as const), 0x9ff0d8, 0.7);
        root.add(overlay.matches);
      }
      return segs;
    },
    showRegion(region) {
      if (overlay.region) disposeTree(overlay.region);
      overlay.region = null;
      regionShown = region;
      if (!region) return;
      const outline = regionOutline(region, 128);
      const g = new THREE.Group();
      // Translucent fill: a triangle fan in the plane.
      const c: Vec3 = [region.centerPc[0] / 1000, region.centerPc[1] / 1000, 0];
      const verts: number[] = [];
      outline.forEach((p, i) => {
        const q = outline[(i + 1) % outline.length]!;
        verts.push(c[0], c[2], -c[1], p[0], p[2], -p[1], q[0], q[2], -q[1]);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
      fill.frustumCulled = false;
      g.add(fill, makePolyline(outline, 0x8fe8ff, 0.9, true));
      const label = makeLabel(`map origin, 95% region: ${lenText(2 * region.semiAxesPc[0], 2)} by ${lenText(2 * region.semiAxesPc[1], 2)}`, '#bff3ff', 12);
      const top = outline[Math.round(outline.length / 4)]!;
      label.position.set(top[0], top[2], -top[1]);
      label.userData.edge = outline[0];
      label.userData.priority = 3;
      g.userData.label = label;
      g.add(label);
      root.add(g);
      overlay.region = g;
    },
    frame(target, o = {}) {
      const f = frameDist(target);
      return cam.easeTo({ target: f.at, dist: o.distKpc ?? f.dist }, o.durationS ?? 1.6);
    },
    setViewMode(mode) {
      return mode === 'top' ? cam.easeTo({ azDeg: -90, elDeg: 89.9 }, 1.0) : cam.easeTo({ azDeg: OVERVIEW.azDeg, elDeg: OVERVIEW.elDeg }, 1.0);
    },
    getView: () => ({ ...cam.view, target: [...cam.view.target] }),
    setView: (v) => cam.set(v),
    relabel() {
      if (model) placeGcLabel(model);
      if (regionShown) this.showRegion(regionShown);
    },
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
