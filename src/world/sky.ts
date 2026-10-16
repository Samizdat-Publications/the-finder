// The sky of the encounter scene: the computed star field (skyModel.ts) as point sprites, and the
// Milky Way (ESA's Gaia EDR3 all-sky colour map) on a background sphere, both centred on the camera.
//
// Frames. The scene's world axes are ICRS turned so that three.js's +Y is the north celestial pole:
// world = (x_icrs, z_icrs, -y_icrs), a proper rotation (determinant +1). The Milky Way map is in
// galactic coordinates; the background shader turns each view direction back to ICRS and then into
// galactic coordinates with the Hipparcos matrix from astro.ts (ICRS_TO_GALACTIC), then reads the
// equirectangular map at (l, b) (public/media/sky/gaia-sky.json: u = 0.5 - l / 360, v = 0.5 + b / 180).
//
// At 0.75 pc from the Sun the Milky Way looks exactly as it does from Earth: its stars and dust are
// hundreds to thousands of parsecs away (the Galactic centre about 8 kpc), so a 0.75 pc step shifts
// them by at most a few hundredths of a degree. Only the catalogued stars are moved.

import * as THREE from 'three';
import { ICRS_TO_GALACTIC, type Vec3 } from '../science/astro';
import type { ComputedSky } from './skyModel';

/** ICRS unit vector to scene world axes (see the header). */
export function icrsToWorld(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[2], -v[1]);
}
/** Scene world vector to ICRS (inverse of icrsToWorld). */
export function worldToIcrs(w: THREE.Vector3): Vec3 {
  return [w.x, -w.z, w.y];
}

/** Radius of the sky shells, m (inside the camera's far plane, far outside the 17 m craft). */
export const STAR_RADIUS = 900;
const MILKY_WAY_RADIUS = 950;

/**
 * Display levels of the Milky Way map (a rendering choice, not physics): ESA's map is stretched for
 * print, with the bulge near white and the high-latitude sky a grainy grey (median 8 of 255 above
 * |b| = 60 deg, measured from the map). A black point at that level and a gain of 0.55 leave a faint
 * band behind the stars and the lit craft, with black space between.
 */
export const MILKY_WAY_BLACK = 8 / 255;
export const MILKY_WAY_GAIN = 0.55;

const STAR_VERT = /* glsl */ `
  attribute vec3 aColour;
  attribute float aRadius;
  attribute float aAlpha;
  uniform float uPixelRatio;
  varying vec3 vColour;
  varying float vAlpha;
  varying float vRadius;
  varying float vSize;
  void main() {
    vColour = aColour;
    vAlpha = aAlpha;
    vRadius = aRadius * uPixelRatio;
    vSize = max(2.0, ceil(vRadius * 5.0));
    gl_PointSize = vSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// A Gaussian core (sigma 0.55 radius) plus a faint exponential halo, additive.
const STAR_FRAG = /* glsl */ `
  varying vec3 vColour;
  varying float vAlpha;
  varying float vRadius;
  varying float vSize;
  void main() {
    float d = length(gl_PointCoord - 0.5) * vSize;
    float s = 0.55 * vRadius;
    float core = exp(-0.5 * d * d / (s * s));
    float halo = 0.12 * exp(-d / (1.2 * vRadius));
    float a = vAlpha * min(1.0, core + halo);
    if (a < 0.002) discard;
    gl_FragColor = vec4(vColour * a, a);
  }
`;

const MW_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// uMode 0: the map; 1: the (u, v) the shader reads, for the alignment test.
const MW_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform mat3 uIcrsToGal;
  uniform float uGain;
  uniform float uBlack;
  uniform int uMode;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 w = normalize(vDir);
    vec3 icrs = vec3(w.x, -w.z, w.y);
    vec3 g = uIcrsToGal * icrs;
    float l = atan(g.y, g.x);
    float b = asin(clamp(g.z, -1.0, 1.0));
    vec2 uv = vec2(fract(0.5 - l / (2.0 * PI)), 0.5 + b / PI);
    if (uMode == 1) { gl_FragColor = vec4(uv, 0.0, 1.0); return; }
    vec3 c = texture2D(uMap, uv).rgb;
    gl_FragColor = vec4(max(c - uBlack, 0.0) / (1.0 - uBlack) * uGain, 1.0);
  }
`;

export interface SkyObjects {
  group: THREE.Group;
  stars: THREE.Points;
  milkyWay: THREE.Mesh;
  setPixelRatio(pr: number): void;
  /** 0 normal, 1 output the texture coordinates (test probe). */
  setMilkyWayMode(mode: 0 | 1): void;
  dispose(): void;
}

/** Builds the star field and, when a map texture is given, the Milky Way sphere. */
export function buildSky(sky: ComputedSky, milkyWayMap: THREE.Texture | null): SkyObjects {
  const group = new THREE.Group();
  group.name = 'sky';

  const n = sky.counts.shown;
  const pos = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const w = icrsToWorld([sky.dirs[3 * i]!, sky.dirs[3 * i + 1]!, sky.dirs[3 * i + 2]!]);
    pos[3 * i] = w.x * STAR_RADIUS;
    pos[3 * i + 1] = w.y * STAR_RADIUS;
    pos[3 * i + 2] = w.z * STAR_RADIUS;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColour', new THREE.BufferAttribute(sky.colours, 3));
  geo.setAttribute('aRadius', new THREE.BufferAttribute(sky.radii, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(sky.alphas, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STAR_RADIUS);
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uPixelRatio: { value: 1 } },
    // Opaque list on purpose (drawn before the craft, by renderOrder); additive blending still applies.
    transparent: false,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const stars = new THREE.Points(geo, starMat);
  stars.name = 'stars';
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  group.add(stars);

  // Rows of ICRS_TO_GALACTIC are the galactic axes in ICRS; Matrix3.set takes row-major input.
  const [gx, gy, gz] = ICRS_TO_GALACTIC;
  const m = new THREE.Matrix3().set(gx[0], gx[1], gx[2], gy[0], gy[1], gy[2], gz[0], gz[1], gz[2]);
  const mwMat = new THREE.ShaderMaterial({
    vertexShader: MW_VERT,
    fragmentShader: MW_FRAG,
    uniforms: {
      uMap: { value: milkyWayMap },
      uIcrsToGal: { value: m },
      uGain: { value: milkyWayMap ? MILKY_WAY_GAIN : 0 },
      uBlack: { value: MILKY_WAY_BLACK },
      uMode: { value: 0 },
    },
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const milkyWay = new THREE.Mesh(new THREE.SphereGeometry(MILKY_WAY_RADIUS, 64, 32), mwMat);
  milkyWay.name = 'milky-way';
  milkyWay.frustumCulled = false;
  milkyWay.renderOrder = -2;
  group.add(milkyWay);

  return {
    group,
    stars,
    milkyWay,
    setPixelRatio(pr) {
      starMat.uniforms.uPixelRatio!.value = pr;
    },
    setMilkyWayMode(mode) {
      mwMat.uniforms.uMode!.value = mode;
    },
    dispose() {
      geo.dispose();
      starMat.dispose();
      milkyWay.geometry.dispose();
      mwMat.dispose();
      milkyWayMap?.dispose();
    },
  };
}

/** Loads the Milky Way map with the sampling the shader needs (no mipmaps: no seam at l = 180 deg). */
export async function loadMilkyWay(url: string): Promise<THREE.Texture> {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  // Raw sRGB bytes straight to the sRGB canvas (the shader skips colour conversion), so the map shows
  // as published, then levelled by MILKY_WAY_BLACK and MILKY_WAY_GAIN.
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
