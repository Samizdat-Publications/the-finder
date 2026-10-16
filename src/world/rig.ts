// The camera rig: an orbit around a target point on the craft, in the craft's own frame (so "up" is
// the dish axis), with a slow drift, drag to orbit, wheel to zoom within limits, and eased framing.
// No per-frame allocation; all motion comes from tick(dt) in the scene's one render loop.

import * as THREE from 'three';

export interface OrbitView {
  /** Target, craft (model) coordinates, m. */
  target: [number, number, number];
  /** Azimuth about the craft's +Y, deg (0 looks from +Z toward the target). */
  azDeg: number;
  /** Elevation above the craft's XZ plane, deg. */
  elDeg: number;
  /** Distance from the target, m. */
  dist: number;
}

export const ZOOM_LIMITS = { min: 0.6, max: 90 };
const EL_LIMIT = 89;
/** Drift: azimuth rate, deg/s, and a slow elevation bob (deg amplitude, rad/s). */
const DRIFT = { azDegPerS: 0.9, bobDeg: 1.5, bobW: 0.05 };
/** Seconds after the last drag or wheel before the drift resumes. */
const DRIFT_RESUME_S = 4;

const smooth = (x: number): number => x * x * (3 - 2 * x);

export class OrbitRig {
  view: OrbitView;
  reducedMotion: boolean;
  private idle = DRIFT_RESUME_S;
  private time = 0;
  private ease: { from: OrbitView; to: OrbitView; t: number; dur: number; done: () => void } | null = null;
  private readonly v = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor(view: OrbitView, reducedMotion: boolean) {
    this.view = { ...view, target: [...view.target] };
    this.reducedMotion = reducedMotion;
  }

  /** User drag in CSS pixels. */
  drag(dxPx: number, dyPx: number): void {
    this.cancelEase();
    this.idle = 0;
    this.view.azDeg -= dxPx * 0.25;
    this.view.elDeg = THREE.MathUtils.clamp(this.view.elDeg + dyPx * 0.25, -EL_LIMIT, EL_LIMIT);
  }

  /** Wheel: positive deltaY zooms out. */
  zoom(deltaY: number): void {
    this.cancelEase();
    this.idle = 0;
    this.view.dist = THREE.MathUtils.clamp(this.view.dist * Math.exp(deltaY * 0.001), ZOOM_LIMITS.min, ZOOM_LIMITS.max);
  }

  set(view: Partial<OrbitView>): void {
    this.cancelEase();
    Object.assign(this.view, view);
    if (view.target) this.view.target = [...view.target];
  }

  /** Eases to a view; resolves when it arrives (or is cancelled by the user). */
  easeTo(to: OrbitView, durS: number): Promise<void> {
    this.cancelEase();
    return new Promise((resolve) => {
      // Shortest way round in azimuth.
      const from = { ...this.view, target: [...this.view.target] as [number, number, number] };
      const dAz = ((((to.azDeg - from.azDeg) % 360) + 540) % 360) - 180;
      this.ease = { from, to: { ...to, azDeg: from.azDeg + dAz }, t: 0, dur: Math.max(durS, 1e-3), done: resolve };
    });
  }

  private cancelEase(): void {
    if (this.ease) {
      const done = this.ease.done;
      this.ease = null;
      done();
    }
  }

  tick(dt: number): void {
    this.time += dt;
    this.idle += dt;
    if (this.ease) {
      const e = this.ease;
      e.t = Math.min(1, e.t + dt / e.dur);
      const k = smooth(e.t);
      const lerp = (a: number, b: number): number => a + (b - a) * k;
      this.view.azDeg = lerp(e.from.azDeg, e.to.azDeg);
      this.view.elDeg = lerp(e.from.elDeg, e.to.elDeg);
      // Distance eases in log space, so a long zoom feels even.
      this.view.dist = Math.exp(lerp(Math.log(e.from.dist), Math.log(e.to.dist)));
      this.view.target = [lerp(e.from.target[0], e.to.target[0]), lerp(e.from.target[1], e.to.target[1]), lerp(e.from.target[2], e.to.target[2])];
      if (e.t >= 1) {
        this.ease = null;
        e.done();
      }
    } else if (!this.reducedMotion && this.idle >= DRIFT_RESUME_S) {
      this.view.azDeg += DRIFT.azDegPerS * dt;
      this.view.elDeg += DRIFT.bobDeg * DRIFT.bobW * Math.cos(DRIFT.bobW * this.time) * dt;
    }
  }

  /** Places the camera for the current view; `craft` gives the frame. */
  apply(camera: THREE.PerspectiveCamera, craft: THREE.Object3D): void {
    const { azDeg, elDeg, dist, target } = this.view;
    const az = THREE.MathUtils.degToRad(azDeg);
    const el = THREE.MathUtils.degToRad(elDeg);
    const t = this.v.set(target[0], target[1], target[2]);
    this.local.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(dist).add(t);
    craft.updateMatrixWorld();
    camera.position.copy(craft.localToWorld(this.local));
    this.up.set(0, 1, 0).applyQuaternion(craft.getWorldQuaternion(this.q));
    camera.up.copy(this.up);
    camera.lookAt(craft.localToWorld(this.look.copy(t)));
    camera.updateMatrixWorld();
  }
}

/** Azimuth and elevation (deg) of a model-space direction, for OrbitView. */
export function dirToAzEl(d: readonly [number, number, number]): { azDeg: number; elDeg: number } {
  const n = Math.hypot(d[0], d[1], d[2]);
  return {
    azDeg: THREE.MathUtils.radToDeg(Math.atan2(d[0], d[2])),
    elDeg: THREE.MathUtils.radToDeg(Math.asin(d[1] / n)),
  };
}
