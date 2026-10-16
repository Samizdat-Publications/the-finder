// Hotspots: 3D anchor points on the craft for the Arrival workbenches, in MODEL coordinates (metres,
// the frame of public/media/models/voyager.glb: Y up through the high-gain dish, the magnetometer boom
// along +Z). Each was measured from the model's own vertices (src/world/README.md lists how), not
// typed from a drawing. `frameDist` is the camera distance, m, that frames the part.
// Note: NASA's model's dish is 3.81 m across (vertex box, docs/research/voyager.md section 1); the real
// high-gain antenna is 3.66 m. The scene shows the model as NASA built it.

import * as THREE from 'three';

export type HotspotId =
  | 'dish'
  | 'magnetometer'
  | 'scienceBoom'
  | 'scanPlatform'
  | 'rtgBoom'
  | 'rtg1'
  | 'rtg2'
  | 'rtg3'
  | 'record';

export interface Hotspot {
  id: HotspotId;
  label: string;
  /** Model coordinates, m. */
  pos: readonly [number, number, number];
  /** Camera distance that frames it, m. */
  frameDist: number;
  /** Half-size of the part, m: a ray that meets the craft within this of the point still sees the part. */
  radius: number;
  /** Preferred direction from the point to the camera, model coordinates (unit); omitted keeps the current one. */
  viewDir?: readonly [number, number, number];
}

// Positions: middles of the part's vertex bounding box (tools/world/measure-hotspots.mjs). The RTG
// axis height is the bottom of the finned cylinder plus its half-width (fins are round about the
// axis): RTG 1 -0.334 + 0.224 = -0.110 m, RTG 3 -0.479 + 0.362 = -0.117 m; -0.11 m for all three (RTG 2's
// box reaches lower because its support struts hang under it). The magnetometer point is halfway
// between the boom's base and its tip sensor.
export const HOTSPOTS: readonly Hotspot[] = [
  { id: 'dish', label: 'High-gain antenna', pos: [-0.003, 1.508, 0.0], frameDist: 10, radius: 1.9, viewDir: [0.35, 1, 0.45] },
  { id: 'magnetometer', label: 'Magnetometer boom', pos: [0.0, 4.575, 6.948], frameDist: 24, radius: 0.4, viewDir: [1, 0.25, -0.2] },
  { id: 'scienceBoom', label: 'Science boom', pos: [-0.003, 0.837, -2.223], frameDist: 6, radius: 0.5, viewDir: [1, 0.3, -0.3] },
  { id: 'scanPlatform', label: 'Scan platform', pos: [0.014, 0.348, -3.861], frameDist: 3.5, radius: 0.45, viewDir: [1, 0.2, -0.6] },
  { id: 'rtgBoom', label: 'RTG boom', pos: [-0.004, 0.116, 1.885], frameDist: 5.5, radius: 0.35, viewDir: [1, 0.25, 0.4] },
  { id: 'rtg1', label: 'RTG 1', pos: [-0.004, -0.11, 3.0], frameDist: 2.2, radius: 0.37, viewDir: [1, 0.2, 0.2] },
  { id: 'rtg2', label: 'RTG 2', pos: [-0.004, -0.11, 3.574], frameDist: 2.2, radius: 0.37, viewDir: [1, 0.2, 0.2] },
  { id: 'rtg3', label: 'RTG 3', pos: [-0.004, -0.11, 4.185], frameDist: 2.2, radius: 0.37, viewDir: [1, 0.2, 0.2] },
  // voyager.json recordDisc: centre (0.948, -0.0002, -0.0021), normal +X, radius 0.157 m.
  { id: 'record', label: 'The record', pos: [0.9485, -0.0002, -0.0021], frameDist: 1.6, radius: 0.02, viewDir: [1, 0.12, 0.08] },
];

export function hotspot(id: HotspotId): Hotspot {
  const h = HOTSPOTS.find((x) => x.id === id);
  if (!h) throw new Error(`unknown hotspot ${id}`);
  return h;
}

export interface Projection {
  /** CSS pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  /** In front of the camera and inside the canvas. */
  onScreen: boolean;
  /** Hidden behind part of the craft (ray from the camera hits the model first). */
  occluded: boolean;
  /** onScreen and not occluded. */
  visible: boolean;
  /** Distance from the camera, m. */
  distance: number;
}

const raycaster = new THREE.Raycaster();

/** Projects a model-space point to canvas pixels, with an occlusion test against the craft's meshes. */
export function projectPoint(
  local: readonly [number, number, number],
  radius: number,
  craft: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): Projection {
  const world = craft.localToWorld(new THREE.Vector3(...local));
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  const distance = world.distanceTo(camPos);
  const ndc = world.clone().project(camera);
  const inFront = ndc.z > -1 && ndc.z < 1;
  const x = (ndc.x * 0.5 + 0.5) * width;
  const y = (-ndc.y * 0.5 + 0.5) * height;
  const onScreen = inFront && x >= 0 && x <= width && y >= 0 && y <= height;
  raycaster.set(camPos, world.clone().sub(camPos).normalize());
  raycaster.far = distance;
  const hits = raycaster.intersectObject(craft, true);
  // A hit nearer than the part's own surface (radius, plus 5 cm) means something else is in the way.
  const occluded = hits.some((h) => h.distance < distance - radius - 0.05);
  return { x, y, onScreen, occluded, visible: onScreen && !occluded, distance };
}
