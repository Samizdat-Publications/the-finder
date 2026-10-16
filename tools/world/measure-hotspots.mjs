#!/usr/bin/env node
// Measures the encounter-scene hotspots from the shipped model's own vertices (model coordinates, m):
// each part is a region of public/media/models/voyager.glb, and the hotspot is the middle of the
// region's bounding box. Prints the boxes; src/world/hotspots.ts and src/world/README.md carry the
// results. A glb is data: it is parsed, never executed. Run: node tools/world/measure-hotspots.mjs
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(join(ROOT, 'public', 'media', 'models', 'voyager.glb'));

// Every vertex in model coordinates (the nodes carry only translation and uniform scale).
const pts = [];
for (const n of doc.getRoot().listNodes()) {
  const m = n.getMesh();
  if (!m) continue;
  const t = n.getTranslation();
  const s = n.getScale();
  for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    const mat = p.getMaterial()?.getName() ?? '';
    const e = [];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, e);
      pts.push({ v: [e[0] * s[0] + t[0], e[1] * s[1] + t[1], e[2] * s[2] + t[2]], mat });
    }
  }
}

// Regions, read off renders from +X (side) and +Y (top) and the vertex histograms along z: the three
// RTGs are the finned cylinders between z = 2.70 and 4.50 m, split at the vertex rings at 3.30 and
// 3.87 m (0.58 m apart: the MHW-RTG length).
const near = (lim) => (q) => Math.abs(q.v[0]) < lim;
const REGIONS = {
  dish: (q) => q.mat === 'tex_02_AO',
  magnetometerBase: (q) => q.v[2] > 1.5 && q.v[2] < 2.6 && q.v[1] > 0.3,
  magnetometerTip: (q) => q.v[2] > 11,
  scienceBoom: (q) => q.v[2] < -1.2 && q.v[2] > -3.3 && q.v[1] > 0.4 && q.v[1] < 1.3,
  scanPlatform: (q) => q.v[2] < -3.4 && q.v[1] > -1 && q.v[1] < 1.5,
  rtgBoom: (q) => q.v[2] > 1.0 && q.v[2] < 2.7 && q.v[1] > -1 && q.v[1] < 0.4 && near(0.6)(q),
  rtg1: (q) => q.v[2] >= 2.7 && q.v[2] < 3.3 && q.v[1] > -1 && q.v[1] < 0.5 && near(0.6)(q),
  rtg2: (q) => q.v[2] >= 3.3 && q.v[2] < 3.87 && q.v[1] > -1 && q.v[1] < 0.5 && near(0.6)(q),
  rtg3: (q) => q.v[2] >= 3.87 && q.v[2] < 4.5 && q.v[1] > -1 && q.v[1] < 0.5 && near(0.6)(q),
  record: (q) => q.mat === 'record_cover',
};
const f = (a) => a.map((x) => x.toFixed(3)).join(', ');
for (const [name, test] of Object.entries(REGIONS)) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (const q of pts) {
    if (!test(q)) continue;
    n++;
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], q.v[i]);
      hi[i] = Math.max(hi[i], q.v[i]);
    }
  }
  const mid = lo.map((x, i) => (x + hi[i]) / 2);
  console.log(`${name.padEnd(17)} n ${String(n).padStart(5)}  min (${f(lo)})  max (${f(hi)})  mid (${f(mid)})`);
}
