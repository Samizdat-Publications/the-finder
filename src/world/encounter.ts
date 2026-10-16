// The encounter scene: Voyager 1 under the real sky of the discovery epoch, lit by the vessel's lamps.
// mountEncounter(canvas, opts) builds it on a canvas and returns a handle (the Arrival chapter mounts
// it; play/scene/ is the dev page). One render loop (renderer.setAnimationLoop), dt clamped, pixel
// ratio capped at 2, resizes with the canvas, dispose() frees everything.
//
// The craft's attitude is not computable (after its thrusters stop, any residual spin turns it many
// times over 44,000 years), so it is a composition choice: the high-gain dish (model +Y) faces the Sun,
// as Voyager held it toward Earth in service. Everything about the sky is computed (skyModel.ts).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Vec3 } from '../science/astro';
import { expandColumnar, type ColumnarStars, type ScenarioData, type StarCatalogue, type StarRecord } from '../science/types';
import { HOTSPOTS, hotspot, projectPoint, type HotspotId, type Projection } from './hotspots';
import { createLamps } from './lights';
import { OrbitRig, ZOOM_LIMITS, dirToAzEl, type OrbitView } from './rig';
import { STAR_RADIUS, buildSky, icrsToWorld, loadMilkyWay, type SkyObjects } from './sky';
import { computeSky, type ComputedSky } from './skyModel';

export interface EncounterOptions {
  /** Parsed data/scenario.json; loaded on demand when omitted. */
  scenario?: ScenarioData;
  /** stars.json near list plus expanded sky.json; loaded on demand when omitted. */
  stars?: StarCatalogue;
  modelUrl?: string;
  skyUrl?: string;
  reducedMotion?: boolean;
  shadows?: boolean;
}

export interface EncounterInfo {
  decimalYear: number;
  craftPosPc: Vec3;
  /** The Sun from the craft: ICRS unit vector, apparent V magnitude, distance (pc). */
  sun: { dirIcrs: Vec3; appMag: number; distPc: number };
  counts: ComputedSky['counts'];
}

export interface EncounterHandle {
  ready: Promise<EncounterInfo>;
  info(): EncounterInfo;
  hotspots: typeof HOTSPOTS;
  /** Canvas pixel coordinates and visibility of a hotspot (null before ready). */
  project(id: HotspotId): Projection | null;
  /** Canvas pixel coordinates of a sky direction (ICRS unit vector), and whether it is on screen. */
  projectSky(dirIcrs: Vec3): { x: number; y: number; onScreen: boolean };
  /** Eases the camera to a hotspot, or back to the opening view. */
  frame(id: HotspotId | 'overview', opts?: { durationS?: number }): Promise<void>;
  setView(view: Partial<OrbitView>): void;
  getView(): OrbitView;
  setReducedMotion(on: boolean): void;
  /** Vertical field of view, deg (20 to 90; 40 by default). */
  setFov(deg: number): void;
  /** Mean frame interval over the last frames, ms, and a synchronous render benchmark. */
  frameStats(): { meanIntervalMs: number; frames: number };
  benchmark(frames: number): number;
  /** Test probe: the Milky Way shader's output looking along an ICRS direction (mode 'uv' gives its texture coordinates). */
  probeSky(dirIcrs: Vec3, mode: 'colour' | 'uv'): number[];
  dispose(): void;
}

const DT_MAX = 0.1; // s: a long pause (tab hidden) never jumps the drift
const OPENING: OrbitView = { target: [0, 2.5, 3], azDeg: 200, elDeg: -76, dist: 58 };

async function loadData(opts: EncounterOptions): Promise<{ scenario: ScenarioData; stars: StarCatalogue }> {
  if (opts.scenario && opts.stars) return { scenario: opts.scenario, stars: opts.stars };
  const [sc, st, sk] = await Promise.all([
    import('../../data/scenario.json'),
    import('../../data/stars.json'),
    import('../../data/sky.json'),
  ]);
  const near = (st.default as unknown as { near: StarRecord[] }).near;
  return {
    scenario: opts.scenario ?? (sc.default as unknown as ScenarioData),
    stars: opts.stars ?? { meta: {}, near, sky: expandColumnar(sk.default as unknown as ColumnarStars) },
  };
}

export function mountEncounter(canvas: HTMLCanvasElement, opts: EncounterOptions = {}): EncounterHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = opts.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 3000);
  scene.add(camera);
  const lamps = createLamps({ shadows: opts.shadows !== false });
  lamps.attach(camera, scene);
  const craft = new THREE.Group();
  craft.name = 'craft';
  scene.add(craft);
  const rig = new OrbitRig({ ...OPENING }, opts.reducedMotion ?? false);

  let sky: SkyObjects | null = null;
  let info: EncounterInfo | null = null;
  let envRT: THREE.WebGLRenderTarget | null = null;
  let disposed = false;
  const owned: { dispose(): void }[] = [];

  // Size: follows the canvas's CSS box; pixel ratio capped at 2.
  let cssW = 1;
  let cssH = 1;
  const resize = (): void => {
    cssW = Math.max(1, canvas.clientWidth);
    cssH = Math.max(1, canvas.clientHeight);
    const pr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    sky?.setPixelRatio(pr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // Input: drag orbits, wheel zooms.
  let dragging: { id: number; x: number; y: number } | null = null;
  const onDown = (e: PointerEvent): void => {
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragging.id) return;
    rig.drag(e.clientX - dragging.x, e.clientY - dragging.y);
    dragging.x = e.clientX;
    dragging.y = e.clientY;
  };
  const onUp = (e: PointerEvent): void => {
    if (dragging && e.pointerId === dragging.id) dragging = null;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    rig.zoom(e.deltaY);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const ready = (async (): Promise<EncounterInfo> => {
    const [data, mwTex, gltf] = await Promise.all([
      loadData(opts),
      loadMilkyWay(opts.skyUrl ?? '/media/sky/gaia-sky.webp'),
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(opts.modelUrl ?? '/media/models/voyager.glb'),
    ]);
    if (disposed) {
      mwTex.dispose();
      throw new Error('encounter disposed while loading');
    }
    const computed = computeSky(data.scenario, data.stars);
    sky = buildSky(computed, mwTex);
    sky.setPixelRatio(renderer.getPixelRatio());
    scene.add(sky.group);

    // The gold glints reflect the real sky: an environment map rendered from the Milky Way sphere.
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(sky.milkyWay.geometry, sky.milkyWay.material));
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromScene(envScene, 0.02, 1, 2000);
    pmrem.dispose();

    // Gold: the reflectance of gold (F0 about (1.00, 0.77, 0.34) linear, Physically Based database) as an
    // sRGB colour; only the metals see the sky map, so the painted parts get no fill.
    const gold = new THREE.MeshStandardMaterial({ color: 0xe8b04e, metalness: 1, roughness: 0.5, envMap: envRT.texture, envMapIntensity: 1.2, name: 'record_cover_gold' });
    owned.push(gold);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        owned.push(m, ...Object.values(m).filter((v): v is THREE.Texture => v instanceof THREE.Texture));
        const std = m as THREE.MeshStandardMaterial;
        if (std.metalness > 0.5) {
          std.envMap = envRT!.texture;
          std.envMapIntensity = 1.2;
        }
      }
      if (mesh.name === 'record_cover' || (mats[0] as THREE.Material).name === 'record_cover') mesh.material = gold;
      owned.push(mesh.geometry);
    });
    craft.add(gltf.scene);
    // Dish (model +Y) toward the Sun.
    craft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), icrsToWorld(computed.sun.dir));
    craft.updateMatrixWorld(true);

    info = {
      decimalYear: computed.decimalYear,
      craftPosPc: computed.craftPosPc,
      sun: { dirIcrs: computed.sun.dir, appMag: computed.sun.appMag, distPc: computed.sun.distPc },
      counts: computed.counts,
    };
    return info;
  })();

  // The one render loop.
  let last = -1;
  let time = 0;
  const intervals: number[] = [];
  const draw = (): void => {
    rig.apply(camera, craft);
    if (sky) sky.group.position.copy(camera.position);
    lamps.update(time, rig.view.dist, !rig.reducedMotion);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop((now: number) => {
    const dt = last < 0 ? 0 : Math.min(DT_MAX, (now - last) / 1000);
    if (last >= 0) {
      intervals.push(now - last);
      if (intervals.length > 240) intervals.shift();
    }
    last = now;
    time += dt;
    rig.tick(dt);
    draw();
  });

  const requireInfo = (): EncounterInfo => {
    if (!info) throw new Error('encounter not ready');
    return info;
  };

  return {
    ready,
    info: requireInfo,
    hotspots: HOTSPOTS,
    project(id) {
      if (!info) return null;
      const h = hotspot(id);
      return projectPoint(h.pos, h.radius, craft, camera, cssW, cssH);
    },
    projectSky(dirIcrs) {
      const ndc = icrsToWorld(dirIcrs).multiplyScalar(STAR_RADIUS).add(camera.position).project(camera);
      const x = (ndc.x * 0.5 + 0.5) * cssW;
      const y = (-ndc.y * 0.5 + 0.5) * cssH;
      return { x, y, onScreen: ndc.z > -1 && ndc.z < 1 && x >= 0 && x <= cssW && y >= 0 && y <= cssH };
    },
    frame(id, o = {}) {
      const dur = o.durationS ?? (rig.reducedMotion ? 0.35 : 1.8);
      if (id === 'overview') return rig.easeTo({ ...OPENING }, dur);
      const h = hotspot(id);
      const ae = h.viewDir ? dirToAzEl(h.viewDir) : { azDeg: rig.view.azDeg, elDeg: rig.view.elDeg };
      const dist = THREE.MathUtils.clamp(h.frameDist, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
      return rig.easeTo({ target: [...h.pos], azDeg: ae.azDeg, elDeg: ae.elDeg, dist }, dur);
    },
    setView(view) {
      rig.set(view);
    },
    getView() {
      return { ...rig.view, target: [...rig.view.target] };
    },
    setReducedMotion(on) {
      rig.reducedMotion = on;
    },
    setFov(deg) {
      camera.fov = THREE.MathUtils.clamp(deg, 20, 90);
      camera.updateProjectionMatrix();
    },
    frameStats() {
      const n = intervals.length;
      return { meanIntervalMs: n ? intervals.reduce((a, b) => a + b, 0) / n : NaN, frames: n };
    },
    benchmark(frames) {
      // gl.finish() does not block in Chrome; reading one pixel back does (it waits for the GPU).
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      draw();
      sync();
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        draw();
        sync();
      }
      return (performance.now() - t0) / frames;
    },
    probeSky(dirIcrs, mode) {
      if (!sky) throw new Error('encounter not ready');
      const rt = new THREE.WebGLRenderTarget(5, 5, { type: THREE.FloatType, colorSpace: THREE.NoColorSpace });
      const probe = new THREE.PerspectiveCamera(0.5, 1, 0.1, 3000);
      const d = icrsToWorld(dirIcrs);
      probe.up.set(Math.abs(d.y) > 0.99 ? 1 : 0, Math.abs(d.y) > 0.99 ? 0 : 1, 0);
      probe.lookAt(d);
      probe.updateMatrixWorld();
      const keep = { craft: craft.visible, stars: sky.stars.visible, pos: sky.group.position.clone(), tm: renderer.toneMapping };
      craft.visible = false;
      sky.stars.visible = false;
      sky.group.position.set(0, 0, 0);
      sky.setMilkyWayMode(mode === 'uv' ? 1 : 0);
      renderer.setRenderTarget(rt);
      renderer.render(scene, probe);
      const px = new Float32Array(4);
      renderer.readRenderTargetPixels(rt, 2, 2, 1, 1, px);
      renderer.setRenderTarget(null);
      sky.setMilkyWayMode(0);
      craft.visible = keep.craft;
      sky.stars.visible = keep.stars;
      sky.group.position.copy(keep.pos);
      rt.dispose();
      return [...px];
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      lamps.dispose();
      sky?.dispose();
      envRT?.dispose();
      for (const o of owned) o.dispose();
      renderer.dispose();
    },
  };
}
