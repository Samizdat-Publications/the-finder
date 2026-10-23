// Shared plumbing for the two charts (galaxy.ts, neighbourhood.ts): the renderer and its one render loop
// (dt clamped, pixel ratio capped at 2, resize with the canvas, frame stats and a benchmark), an orbit
// camera in Galactic axes with eased framing and a top-down plane view, pointer input (drag orbits,
// wheel zooms, hover, click), screen-space picking, point and label drawing.
//
// Scene axes: Galactic Cartesian (x to the centre, y to l = 90, z to the north Galactic pole) turned so
// three.js +Y is the north Galactic pole: world = (x, z, -y), a proper rotation. Seen from above (the
// top view), Galactic longitude then runs counter-clockwise, as on the cover's map.

import * as THREE from 'three';
import type { Vec3 } from '../science/astro';
import { DEFAULT_ANCHORS, layoutLabels, type Anchor, type LabelBox } from './labelLayout';

export function galToWorld(v: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v[0], v[2], -v[1]);
}

const DT_MAX = 0.1; // s: a hidden tab never makes an ease jump
const EL_LIMIT = 89.9; // deg: the top view stops just short of the pole so "up" stays defined
const smooth = (x: number): number => x * x * (3 - 2 * x);

export interface ChartView {
  /** Point the camera orbits, Galactic Cartesian, chart units (kpc or pc). */
  target: Vec3;
  /** Camera's Galactic longitude and latitude seen from the target, deg. */
  azDeg: number;
  elDeg: number;
  dist: number;
}

/** Orbit camera: drag orbits, wheel zooms logarithmically between limits, easeTo frames. No drift. */
export class ChartCamera {
  view: ChartView;
  reducedMotion: boolean;
  private ease: { from: ChartView; to: ChartView; t: number; dur: number; done: () => void } | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(view: ChartView, readonly limits: { min: number; max: number }, reducedMotion = false) {
    this.view = { ...view, target: [...view.target] };
    this.reducedMotion = reducedMotion;
  }

  drag(dxPx: number, dyPx: number): void {
    this.cancel();
    this.view.azDeg -= dxPx * 0.3;
    this.view.elDeg = THREE.MathUtils.clamp(this.view.elDeg + dyPx * 0.3, -EL_LIMIT, EL_LIMIT);
  }

  zoom(deltaY: number): void {
    this.cancel();
    this.view.dist = THREE.MathUtils.clamp(this.view.dist * Math.exp(deltaY * 0.0012), this.limits.min, this.limits.max);
  }

  set(v: Partial<ChartView>): void {
    this.cancel();
    this.view = { ...this.view, ...v, target: v.target ? [...v.target] : this.view.target };
    this.view.dist = THREE.MathUtils.clamp(this.view.dist, this.limits.min, this.limits.max);
  }

  /** Eases to a view; reduced motion makes it a short cut (0.25 s at most). */
  easeTo(to: Partial<ChartView>, durS: number): Promise<void> {
    this.cancel();
    const goal: ChartView = { ...this.view, ...to, target: to.target ? [...to.target] : this.view.target };
    goal.dist = THREE.MathUtils.clamp(goal.dist, this.limits.min, this.limits.max);
    goal.elDeg = THREE.MathUtils.clamp(goal.elDeg, -EL_LIMIT, EL_LIMIT);
    const dur = this.reducedMotion ? Math.min(durS, 0.25) : durS;
    if (dur <= 0.02) {
      this.view = goal;
      return Promise.resolve();
    }
    // Take the short way round in azimuth.
    goal.azDeg = this.view.azDeg + ((((goal.azDeg - this.view.azDeg) % 360) + 540) % 360) - 180;
    return new Promise((done) => {
      this.ease = { from: { ...this.view, target: [...this.view.target] }, to: goal, t: 0, dur, done };
    });
  }

  private cancel(): void {
    if (this.ease) {
      const d = this.ease.done;
      this.ease = null;
      d();
    }
  }

  tick(dt: number): void {
    if (!this.ease) return;
    const e = this.ease;
    e.t = Math.min(e.dur, e.t + dt);
    const f = smooth(e.t / e.dur);
    const lerp = (a: number, b: number): number => a + (b - a) * f;
    this.view = {
      target: [lerp(e.from.target[0], e.to.target[0]), lerp(e.from.target[1], e.to.target[1]), lerp(e.from.target[2], e.to.target[2])],
      azDeg: lerp(e.from.azDeg, e.to.azDeg),
      elDeg: lerp(e.from.elDeg, e.to.elDeg),
      // Distance eases in log space so a 1000x zoom does not rush its last factor of ten.
      dist: Math.exp(lerp(Math.log(e.from.dist), Math.log(e.to.dist))),
    };
    if (e.t >= e.dur) {
      this.ease = null;
      e.done();
    }
  }

  apply(camera: THREE.PerspectiveCamera): void {
    const v = this.view;
    const az = THREE.MathUtils.degToRad(v.azDeg);
    const el = THREE.MathUtils.degToRad(v.elDeg);
    const off: Vec3 = [Math.cos(el) * Math.cos(az) * v.dist, Math.cos(el) * Math.sin(az) * v.dist, Math.sin(el) * v.dist];
    const t = v.target;
    galToWorld([t[0] + off[0], t[1] + off[1], t[2] + off[2]], camera.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(galToWorld(t, this.tmp));
    // Everything is drawn without depth testing, so near and far only have to bracket the scene.
    camera.near = v.dist * 1e-3;
    camera.far = v.dist * 1e3 + 100;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
}

export interface ScreenPoint {
  x: number;
  y: number;
  onScreen: boolean;
}

const pv = new THREE.Vector3();
/** A Galactic point (chart units) to canvas CSS pixels. */
export function projectGal(v: Vec3, camera: THREE.Camera, w: number, h: number): ScreenPoint {
  galToWorld(v, pv).project(camera);
  const x = (pv.x * 0.5 + 0.5) * w;
  const y = (-pv.y * 0.5 + 0.5) * h;
  return { x, y, onScreen: pv.z > -1 && pv.z < 1 && x >= 0 && x <= w && y >= 0 && y <= h };
}

/** Index of the point (packed Galactic xyz) nearest (x, y) on screen within radiusPx, or -1. Ties go to the lower index. */
export function nearestOnScreen(positions: Float32Array, camera: THREE.Camera, w: number, h: number, x: number, y: number, radiusPx: number): number {
  let best = -1;
  let bestD = radiusPx * radiusPx;
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    pv.set(positions[3 * i]!, positions[3 * i + 2]!, -positions[3 * i + 1]!).project(camera);
    if (pv.z <= -1 || pv.z >= 1) continue;
    const dx = (pv.x * 0.5 + 0.5) * w - x;
    const dy = (-pv.y * 0.5 + 0.5) * h - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const POINT_VERT = /* glsl */ `
  attribute vec3 aColour;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aHollow;
  uniform float uPixelRatio;
  varying vec3 vColour;
  varying float vAlpha;
  varying float vHollow;
  varying float vR;
  void main() {
    vColour = aColour;
    vAlpha = aAlpha;
    vHollow = aHollow;
    vR = aSize * uPixelRatio;
    gl_PointSize = max(2.0, ceil(vR * 3.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// Filled: a soft disc of radius vR. Hollow: a ring at vR (an outline marks uncertain stars and selections).
const POINT_FRAG = /* glsl */ `
  varying vec3 vColour;
  varying float vAlpha;
  varying float vHollow;
  varying float vR;
  uniform float uGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5) * max(2.0, ceil(vR * 3.0));
    float a;
    vec3 c = vColour;
    if (vHollow > 0.5) a = 1.0 - smoothstep(0.6, 1.4, abs(d - vR));
    else if (uGlow > 0.5) {
      // A star: a bright core, a touch toward white, and a halo that keeps the star's own colour (so a warm
      // star reads warm and a blue one blue), fading out inside the sprite.
      float core = 1.0 - smoothstep(vR * 0.45, vR * 0.8, d);
      float halo = 0.42 * exp(-d / (vR * 0.5)) * (1.0 - smoothstep(vR * 1.1, vR * 1.5, d));
      a = core + halo;
      c = mix(vColour, vec3(1.0), 0.12 * core);
    } else a = 1.0 - smoothstep(vR * 0.55, vR, d) + 0.25 * exp(-d / vR);
    a = clamp(a, 0.0, 1.0) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(c * a, a);
  }
`;

export interface PointSet {
  points: THREE.Points;
  setPixelRatio(pr: number): void;
  /** Rewrites colours (sRGB 0..1 per point) after a tint. */
  setColours(c: Float32Array): void;
  dispose(): void;
}

/** Additive points drawn in Galactic chart units; no depth test (charts are transparent overlays of light). `glow` draws filled points as stars with a coloured halo. */
export function makePoints(posGal: Float32Array, colours: Float32Array, sizes: Float32Array, alphas: Float32Array, hollow?: Float32Array, glow = false): PointSet {
  const n = posGal.length / 3;
  const world = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    world[3 * i] = posGal[3 * i]!;
    world[3 * i + 1] = posGal[3 * i + 2]!;
    world[3 * i + 2] = -posGal[3 * i + 1]!;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(world, 3));
  g.setAttribute('aColour', new THREE.BufferAttribute(colours, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  g.setAttribute('aHollow', new THREE.BufferAttribute(hollow ?? new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { uPixelRatio: { value: 1 }, uGlow: { value: glow ? 1 : 0 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  return {
    points,
    setPixelRatio: (pr) => void (m.uniforms.uPixelRatio!.value = pr),
    setColours(c) {
      (g.getAttribute('aColour') as THREE.BufferAttribute).copyArray(c).needsUpdate = true;
    },
    dispose() {
      g.dispose();
      m.dispose();
    },
  };
}

/** Line segments from pairs of Galactic points (chart units). */
export function makeSegments(pairs: readonly (readonly [Vec3, Vec3])[], colour: number, opacity: number): THREE.LineSegments {
  const arr = new Float32Array(pairs.length * 6);
  const w = new THREE.Vector3();
  pairs.forEach(([a, b], i) => {
    galToWorld(a, w).toArray(arr, 6 * i);
    galToWorld(b, w).toArray(arr, 6 * i + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false, depthWrite: false }));
  line.frustumCulled = false;
  return line;
}

/** A polyline through Galactic points (closed when asked). */
export function makePolyline(pts: readonly Vec3[], colour: number, opacity: number, closed = false): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => galToWorld(p)));
  const mat = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false, depthWrite: false });
  const line = closed ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
  line.frustumCulled = false;
  return line;
}

/** Frees every geometry and material under an object, and the object from its parent. */
export function disposeTree(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as THREE.SpriteMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

/** A text label that stays the same size on screen (heightPx CSS px), anchored at its left middle beside a point. */
export function makeLabel(text: string, colour = '#cfe9ff', heightPx = 13): THREE.Sprite {
  const scaleUp = 3;
  const font = `${heightPx * scaleUp}px system-ui, sans-serif`;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 8 * scaleUp;
  c.width = w;
  c.height = Math.ceil(heightPx * scaleUp * 1.4);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 4 * scaleUp;
  ctx.fillStyle = colour;
  ctx.fillText(text, 6 * scaleUp, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
  s.center.set(0, 0.5);
  s.userData.aspect = c.width / c.height;
  s.userData.heightPx = c.height / scaleUp;
  s.renderOrder = 10;
  return s;
}

/** Keeps labels at their pixel size: a non-attenuated sprite's scale is its size at unit distance. */
export function sizeLabels(root: THREE.Object3D, camera: THREE.PerspectiveCamera, cssH: number): void {
  const k = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / cssH;
  root.traverse((o) => {
    const h = o.userData.heightPx as number | undefined;
    if (h === undefined) return;
    o.scale.set(h * k * (o.userData.aspect as number), h * k, 1);
  });
}

/** A bright point labels keep clear of: a Galactic point (chart units) and its radius on screen, px. */
export interface BrightPoint {
  at: Vec3;
  rPx: number;
}

const lv = new THREE.Vector3();
/**
 * Declutter the labels under root on screen (labelLayout.ts): every label sprite (userData.heightPx) is placed
 * at the first of its anchors (userData.anchors, default labelLayout's) clear of the labels placed before it
 * (by userData.keep, then userData.priority) and of the bright points; one that fits nowhere is hidden, unless
 * userData.keep. A label another rule hides (userData.suppressed) takes no part; a glyph (userData.glyph) is not a label.
 */
export function declutterLabels(root: THREE.Object3D, camera: THREE.Camera, w: number, h: number, bright: readonly BrightPoint[]): void {
  const sprites: THREE.Sprite[] = [];
  root.traverse((o) => {
    if (o.userData.heightPx !== undefined && o.userData.glyph !== true) sprites.push(o as THREE.Sprite);
  });
  const boxes: LabelBox[] = [];
  sprites.forEach((s, id) => {
    if (s.userData.suppressed === true || !s.parent?.visible) {
      s.visible = false;
      return;
    }
    s.getWorldPosition(lv).project(camera);
    if (lv.z <= -1 || lv.z >= 1) {
      s.visible = false;
      return;
    }
    const hp = s.userData.heightPx as number;
    boxes.push({
      id, x: (lv.x * 0.5 + 0.5) * w, y: (-lv.y * 0.5 + 0.5) * h, w: hp * (s.userData.aspect as number), h: hp,
      priority: (s.userData.priority as number | undefined) ?? 1, keep: s.userData.keep === true,
      anchors: (s.userData.anchors as Anchor[] | undefined) ?? DEFAULT_ANCHORS,
    });
  });
  const obstacles = bright.map((b) => {
    const p = projectGal(b.at, camera, w, h);
    return { x: p.x, y: p.y, r: b.rPx };
  });
  const placed = layoutLabels(boxes, obstacles, { w, h });
  for (const b of boxes) {
    const s = sprites[b.id] as THREE.Sprite;
    const a = placed.get(b.id) ?? null;
    s.visible = a !== null;
    if (a) s.center.set(a[0], a[1]);
  }
}

export interface ChartRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  size(): { w: number; h: number; pr: number };
  frameStats(): { meanIntervalMs: number; frames: number };
  /** Mean ms per frame rendered back to back, each waited for with a one-pixel read-back. */
  benchmark(frames: number): number;
  dispose(): void;
}

/**
 * Creates the canvas's WebGL2 context with the attributes createChartRenderer's renderer asks for (three r186:
 * alpha, depth, no stencil, antialias, premultiplied alpha, high-performance), so the renderer made next finds it
 * and takes it as is. The context alone costs 40 to 50 ms on this machine (ANGLE on Direct3D 11); a caller that
 * calls this in one task and createChartRenderer in the next keeps each task short. A no-op when WebGL2 is missing
 * (createChartRenderer then fails as before).
 */
export function warmChartContext(canvas: HTMLCanvasElement): void {
  canvas.getContext('webgl2', { alpha: true, depth: true, stencil: false, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
}

/** Renderer, scene, camera and the one render loop; onFrame(dt) runs before every render. */
export function createChartRenderer(canvas: HTMLCanvasElement, onFrame: (dt: number) => void, onResize: (w: number, h: number, pr: number) => void): ChartRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 1000);
  let w = 1;
  let h = 1;
  let pr = 1;
  const resize = (): void => {
    w = Math.max(1, canvas.clientWidth);
    h = Math.max(1, canvas.clientHeight);
    pr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onResize(w, h, pr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  let last = -1;
  const intervals: number[] = [];
  renderer.setAnimationLoop((now: number) => {
    const dt = last < 0 ? 0 : Math.min(DT_MAX, (now - last) / 1000);
    if (last >= 0) {
      intervals.push(now - last);
      if (intervals.length > 240) intervals.shift();
    }
    last = now;
    onFrame(dt);
    renderer.render(scene, camera);
  });
  return {
    renderer,
    scene,
    camera,
    size: () => ({ w, h, pr }),
    frameStats() {
      const n = intervals.length;
      return { meanIntervalMs: n ? intervals.reduce((a, b) => a + b, 0) / n : NaN, frames: n };
    },
    benchmark(frames) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      onFrame(0);
      renderer.render(scene, camera);
      sync();
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        onFrame(0);
        renderer.render(scene, camera);
        sync();
      }
      return (performance.now() - t0) / frames;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      disposeTree(scene);
      renderer.dispose();
    },
  };
}

/** Pointer input: drag orbits, wheel zooms, hover reports the pointer, a click (moved under 5 px) reports a pick. */
export function attachInput(canvas: HTMLCanvasElement, cam: ChartCamera, on: { hover?: (x: number, y: number) => void; click?: (x: number, y: number) => void }): () => void {
  let drag: { id: number; x: number; y: number; x0: number; y0: number } | null = null;
  const local = (e: PointerEvent | WheelEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e: PointerEvent): void => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent): void => {
    if (drag && e.pointerId === drag.id) {
      cam.drag(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    on.hover?.(...local(e));
  };
  const up = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    drag = null;
    if (moved < 5) on.click?.(...local(e));
  };
  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    cam.zoom(e.deltaY);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
