// The neighbourhood chart: the catalogued stars within 10 pc of the craft at the discovery epoch, the
// craft and its velocity, the alien's star, and the trail drawn for any star (the craft's velocity
// relative to it, the line from it to the craft, the angle between them, from kinematics.trail).
// mountNeighbourhood(canvas, opts) returns a handle (the Trail chapter mounts it; /play/charts/ is the
// dev page). Every number drawn comes from neighbourhoodModel.ts and kinematics.ts; this file only draws.
//
// Stars without a radial velocity are drawn as rings, not discs: their depth is uncertain.
// The craft's velocity arrow is relative to the alien's star (what the alien measures from home); arrow
// lengths are fixed on the chart (directions only), speeds are in the readouts.
//
// Depth cues (art only, no data): faint distance rings and spokes in the Galactic plane through the craft, a
// drop line from every star to that plane with a dot where it lands, and a faint radial glow behind it all.
// The rings and spokes are a frame of reference, not data; the stalks use the model's own star positions.

import * as THREE from 'three';
import { scale, sub, toGalacticCartesian, type Vec3 } from '../science/astro';
import { homeObserver, type Observer } from '../science/epoch';
import { trail, type TrailEntry } from '../science/kinematics';
import { expandColumnar, type ColumnarStars, type ScenarioData, type StarCatalogue, type StarRecord } from '../science/types';
import {
  ChartCamera, attachInput, createChartRenderer, declutterLabels, disposeTree, galToWorld, makeChartBackdrop, makeLabel, makePoints, makePolyline, makeSegments, nearestOnScreen, projectGal, sizeLabels,
  type BrightPoint, type ChartView, type PointSet, type ScreenPoint,
} from './chartControls';
import { makeCraftGlyph, makeHomeMark } from './chartGlyphs';
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
  /** How a distance in parsecs is written on a label (the chapter's: the alien's units, the human gloss on request); default parsecs. */
  lengthLabel?: (pc: number, digits?: number) => string;
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
  /** Writes the distance labels again (after the human gloss is switched). */
  relabel(): void;
  frameStats(): { meanIntervalMs: number; frames: number };
  benchmark(frames: number): number;
  dispose(): void;
}

const OVERVIEW: ChartView = { target: [0, 0, 0], azDeg: -110, elDeg: 30, dist: 30 };
const LIMITS = { min: 0.3, max: 120 };
/** Arrow lengths on the chart, pc (display choice: directions only). */
const VEL_ARROW_PC = 2.5;
const NO_ROW_GREY: [number, number, number] = [0.42, 0.44, 0.5];
/** Distance rings in the Galactic plane, pc (the 10 pc edge ring is drawn separately). */
const PLANE_RINGS_PC = [2, 4, 6, 8];
const PLANE_COLOUR = 0x6a70d0;
const STALK_OPACITY = 0.09;
/** Stars without a radial velocity: their depth is uncertain, so their stalk is fainter. */
const STALK_OPACITY_UNCERTAIN = 0.045;

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
  let ringLabels: THREE.Group | null = null;
  const backdrop = makeChartBackdrop();
  const core = createChartRenderer(
    canvas,
    (dt) => {
      cam.tick(dt);
      cam.apply(core.camera);
      sizeLabels(root, core.camera, core.size().h);
      // Labels clear of each other and of the bright points (M4 step 7e: "the craft" sat over "Gl 445 (home)").
      if (model) declutterLabels(root, core.camera, core.size().w, core.size().h, brightPoints());
    },
    (_w, _h, pr) => sets.forEach((ps) => ps.setPixelRatio(pr)),
  );
  core.scene.add(backdrop);
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
  const lenText = (pc: number): string => (opts.lengthLabel ? opts.lengthLabel(pc) : `${pc.toFixed(2)} pc`);
  const nameOf = (s: ChartStar): string => (opts.nameOf ? opts.nameOf(s) : s.label);
  const labelAt = (text: string, p: Vec3, colour: string, h = 13): THREE.Sprite => {
    const l = makeLabel(text, colour, h);
    galToWorld(p, l.position);
    return l;
  };

  /** The inner ring radii written in the chart's length units (written again by relabel()). */
  const buildRingLabels = (): void => {
    if (ringLabels) disposeTree(ringLabels);
    const g = new THREE.Group();
    const a = Math.PI / 8;
    for (const r of PLANE_RINGS_PC) {
      const l = labelAt(lenText(r), [r * Math.cos(a), r * Math.sin(a), 0], '#7f8fcf', 11);
      l.userData.priority = 0;
      g.add(l);
    }
    root.add(g);
    ringLabels = g;
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
    starSet = track(makePoints(positions, baseColours.slice(), sizes, alphas, hollow, true));
    root.add(starSet.points);

    // The craft (origin) and its velocity relative to the alien's star.
    const home = m.stars[m.homeIndex]!;
    const craftVelHome = toGalacticCartesian(sub(m.disc.craft.velKmS, home.icrsVelKmS));
    const vlen = Math.hypot(...craftVelHome);
    // The craft is a small craft glyph, and your star carries a reticle, so neither is lost among the field.
    root.add(makeCraftGlyph());
    const homeMark = makeHomeMark();
    galToWorld(home.posPc, homeMark.position);
    root.add(homeMark);
    root.add(arrow([0, 0, 0], scale(craftVelHome, 1 / vlen), VEL_ARROW_PC, 0x9ff0d8, [0.62, 0.94, 0.85]));
    // The craft's label above its point and the home star's below: the two are a fraction of a parsec apart.
    const craftLabel = labelAt('the craft', [0, 0, 0], '#c8fff0');
    craftLabel.center.set(0, -0.15);
    craftLabel.userData.keep = true;
    craftLabel.userData.priority = 8;
    craftLabel.userData.anchors = [[0, -0.15], [1, -0.15], [0, 0.5], [1, 0.5], [0, 1.15], [1, 1.15]];
    const homeLabel = labelAt(`${nameOf(home)} (home)`, home.posPc, '#a8ffd0');
    homeLabel.center.set(0, 1.15);
    homeLabel.userData.keep = true;
    homeLabel.userData.priority = 9;
    homeLabel.userData.anchors = [[0, 1.15], [1, 1.15], [0, 0.5], [1, 0.5], [0, -0.15], [1, -0.15]];
    root.add(craftLabel, homeLabel);
    // A faint 10 pc reference circle in the Galactic plane through the craft.
    const ring: Vec3[] = [];
    for (let k = 0; k < 128; k++) ring.push([NEIGHBOURHOOD_RADIUS_PC * Math.cos((k / 128) * 2 * Math.PI), NEIGHBOURHOOD_RADIUS_PC * Math.sin((k / 128) * 2 * Math.PI), 0]);
    root.add(makePolyline(ring, 0x5a7fb0, 0.18, true));
    // The reference plane: inner distance rings and eight spokes every 45 deg of Galactic longitude.
    for (const r of PLANE_RINGS_PC) {
      const pts: Vec3[] = [];
      for (let k = 0; k < 96; k++) pts.push([r * Math.cos((k / 96) * 2 * Math.PI), r * Math.sin((k / 96) * 2 * Math.PI), 0]);
      root.add(makePolyline(pts, PLANE_COLOUR, 0.1, true));
    }
    const spokes: [Vec3, Vec3][] = [];
    for (let k = 0; k < 8; k++) spokes.push([[0, 0, 0], [NEIGHBOURHOOD_RADIUS_PC * Math.cos((k * Math.PI) / 4), NEIGHBOURHOOD_RADIUS_PC * Math.sin((k * Math.PI) / 4), 0]]);
    root.add(makeSegments(spokes, PLANE_COLOUR, 0.06));
    buildRingLabels();
    // Drop lines: each star straight down (or up) to the plane, tinted with its own colour; one set of lines per
    // certainty (full velocity, no radial velocity), and one points set for the feet.
    const stalk = (uncertain: boolean): THREE.LineSegments => {
      const idx = m.stars.map((_, i) => i).filter((i) => (m.stars[i]!.fullVelocity ? 0 : 1) === (uncertain ? 1 : 0));
      const pos = new Float32Array(idx.length * 6);
      const col = new Float32Array(idx.length * 6);
      const w = new THREE.Vector3();
      idx.forEach((i, j) => {
        const p = m.stars[i]!.posPc;
        galToWorld(p, w).toArray(pos, 6 * j);
        galToWorld([p[0], p[1], 0], w).toArray(pos, 6 * j + 3);
        col.set(baseColours.subarray(3 * i, 3 * i + 3), 6 * j);
        col.set(baseColours.subarray(3 * i, 3 * i + 3), 6 * j + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: uncertain ? STALK_OPACITY_UNCERTAIN : STALK_OPACITY, depthTest: false, depthWrite: false }));
      l.frustumCulled = false;
      return l;
    };
    root.add(stalk(false), stalk(true));
    const feetPos = new Float32Array(3 * n);
    const feetAlpha = new Float32Array(n);
    m.stars.forEach((s, i) => {
      feetPos.set([s.posPc[0], s.posPc[1], 0], 3 * i);
      feetAlpha[i] = s.fullVelocity ? 0.5 : 0.22;
    });
    root.add(track(makePoints(feetPos, baseColours.slice(), new Float32Array(n).fill(1.8), feetAlpha)).points);
    return { decimalYear: m.decimalYear, count: n, census: m.census };
  })();
  ready.catch(() => undefined);

  /** The points labels keep clear of: the craft, your star, the highlighted star, and the bright stars. */
  const brightPoints = (): BrightPoint[] => {
    const m = model;
    if (!m) return [];
    const out: BrightPoint[] = [{ at: [0, 0, 0], rPx: 8 }];
    for (const s of m.stars) if (s.radiusPx >= 3.5 || s.star.id === highlighted) out.push({ at: s.posPc, rPx: s.radiusPx + (s.star.id === highlighted ? 7 : 2) });
    return out;
  };

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
    const hl = labelAt(`${nameOf(s)}, ${lenText(s.distFromCraftPc)}${note}`, s.posPc, '#ffffff');
    hl.userData.priority = 5;
    g.add(ringSet.points, hl);
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
      const angle = labelAt(`${f(g.measuredAngleDeg)} deg${cut}`, scale(mid, 1.15), '#fff2c0', 14);
      angle.userData.priority = 6;
      grp.add(angle);
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
    relabel() {
      if (model) buildRingLabels();
      const id = highlighted;
      highlighted = null;
      setHighlight(id);
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
      disposeTree(backdrop);
      disposeTree(root);
      core.dispose();
    },
  };
}
