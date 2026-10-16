// The vessel's lamps: three cool-white spotlights riding with the camera (the alien vessel looking at
// the craft), slowly sweeping across it, and a faint starlight term. No other fill: the craft's far
// side falls into darkness, as it would 0.75 pc from the Sun, where sunlight is a magnitude -0.8 star
// (about a thousandth of a lux, far below what the lamps give).
//
// Lamp brightness is a look, not physics: decay 0 keeps the illuminance on the craft the same at any
// camera distance (as an auto-exposed camera would see it), so zooming in never blows it out.

import * as THREE from 'three';

/** Cool white, about 7,500 K (a display colour, sRGB). */
const LAMP_COLOUR = 0xdce6ff;

interface Lamp {
  light: THREE.SpotLight;
  /** Offset of the lamp from the camera, camera space, m. */
  offset: THREE.Vector3;
  /** Sweep: amplitude (camera-space units of the aim point per metre of distance) and angular rate, rad/s. */
  sweep: { ax: number; ay: number; wx: number; wy: number; phase: number };
}

export interface Lamps {
  /** Add to the camera (lamps and their targets are camera children). */
  attach(camera: THREE.Camera, scene: THREE.Scene): void;
  /** Aim the lamps at a point at distance `dist` in front of the camera; t is scene time, s. */
  update(t: number, dist: number, sweeping: boolean): void;
  dispose(): void;
}

export function createLamps(opts: { shadows: boolean }): Lamps {
  const defs: [number, THREE.Vector3, Lamp['sweep']][] = [
    [1.7, new THREE.Vector3(-1.5, 1.2, 0), { ax: 0.1, ay: 0.06, wx: 0.21, wy: 0.13, phase: 0 }],
    [0.7, new THREE.Vector3(2.2, -0.6, 0), { ax: 0.14, ay: 0.08, wx: 0.17, wy: 0.23, phase: 2.1 }],
    [0.45, new THREE.Vector3(0.4, 2.0, 0), { ax: 0.18, ay: 0.1, wx: 0.11, wy: 0.19, phase: 4.2 }],
  ];
  const lamps: Lamp[] = defs.map(([intensity, offset, sweep], i) => {
    const light = new THREE.SpotLight(LAMP_COLOUR, intensity, 0, THREE.MathUtils.degToRad(i === 0 ? 16 : 22), 0.65, 0);
    light.name = `lamp-${i}`;
    light.position.copy(offset);
    if (opts.shadows && i === 0) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.03;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 400;
    }
    return { light, offset, sweep };
  });
  const starlight = new THREE.HemisphereLight(0x9fb4ff, 0x1a1830, 0.035);
  starlight.name = 'starlight';

  return {
    attach(camera, scene) {
      for (const l of lamps) {
        camera.add(l.light);
        camera.add(l.light.target);
      }
      scene.add(starlight);
    },
    update(t, dist, sweeping) {
      for (const l of lamps) {
        const s = l.sweep;
        const k = sweeping ? 1 : 0;
        l.light.target.position.set(
          dist * k * s.ax * Math.sin(s.wx * t + s.phase),
          dist * k * s.ay * Math.sin(s.wy * t + 1.3 * s.phase),
          -dist,
        );
        l.light.target.updateMatrixWorld();
        // Pools of light: the main lamp's is at least 12 m across at the craft (wider far away, so the
        // opening view lights the whole craft), the others at least 7 m, so the sweep moves light across it.
        const r = l === lamps[0] ? Math.max(6, 0.4 * dist) : Math.max(3.5, 0.2 * dist);
        l.light.angle = Math.min(Math.PI / 3, Math.atan2(r, Math.max(dist, 0.5)));
        // Lamps sit closer to the line of sight when the camera is close (a lamp 2 m off-axis at 1.6 m
        // would light a close-up from the side and the gold would never glint back).
        l.light.position.copy(l.offset).multiplyScalar(Math.min(1, Math.max(0.3, dist / 20)));
        if (l.light.castShadow) {
          l.light.shadow.camera.far = dist + 40;
          l.light.shadow.camera.updateProjectionMatrix();
        }
      }
    },
    dispose() {
      for (const l of lamps) {
        l.light.removeFromParent();
        l.light.target.removeFromParent();
        l.light.shadow.map?.dispose();
        l.light.dispose();
      }
      starlight.removeFromParent();
      starlight.dispose();
    },
  };
}
