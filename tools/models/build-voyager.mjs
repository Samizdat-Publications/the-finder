#!/usr/bin/env node
// Builds public/media/models/voyager.glb (+ voyager.json) from NASA's Voyager.glb.
// Input : sources/nasa-voyager-glb/Voyager.glb (tools/fetch-sources.mjs, checksum verified).
// Steps : drop the leftover transparent "clear" cube; split the 20 triangles of the gold record
//         cover disc into their own node + material ("record_cover") so the scene can swap in our
//         own cover; dedup, weld, prune; textures to WebP at 1024; meshopt geometry (16-bit
//         positions, about 0.26 mm over the 17 m extent).
// A glb is data: it is parsed, never executed. Run: node tools/models/build-voyager.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Accessor, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'sources', 'nasa-voyager-glb', 'Voyager.glb');
const OUT_DIR = join(ROOT, 'public', 'media', 'models');
const OUT = join(OUT_DIR, 'voyager.glb');
const OUT_JSON = join(OUT_DIR, 'voyager.json');
const MANIFEST = join(ROOT, 'assets-src', 'manifests', 'voyager-model.json');

const SETTINGS = {
  textureFormat: 'webp',
  textureQuality: 90,
  textureMaxSize: 1024,
  meshoptLevel: 'high',
  quantizePosition: 16,
  quantizeNormal: 10,
  quantizeTexcoord: 14,
};
// Research (docs/research/voyager.md section 1): the cover disc in NASA's model.
const DISC_X = 0.948;
const DISC_X_TOL = 0.02;

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const srcBytes = readFileSync(SRC);
const doc = await io.readBinary(new Uint8Array(srcBytes));
const root = doc.getRoot();
const scene = root.listScenes()[0];
const buffer = root.listBuffers()[0];

// 1. Remove the leftover transparent "clear" cube and its material/texture.
// NASA's "_root" node carries the clear cube and parents the real parts (identity transform):
// lift the children to the scene, then drop the node.
for (const node of root.listNodes()) {
  const mats = node.getMesh()?.listPrimitives().map((p) => p.getMaterial()?.getName());
  if (!mats?.includes('clear')) continue;
  for (const child of node.listChildren()) {
    const t = node.getTranslation();
    if (t.some((v) => v !== 0) || node.getScale().some((v) => v !== 1) || node.getRotation()[3] !== 1) throw new Error('clear node has a transform');
    scene.addChild(child);
  }
  node.dispose();
}
for (const m of root.listMaterials()) if (m.getName() === 'clear') m.dispose();

// Dedup before the split: afterwards the cover material (a copy of the atlas material) would be merged back.
await doc.transform(dedup());

// 2. Split the record cover disc triangles out of the body primitive.
let disc = null;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const t = node.getTranslation();
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    const pos = prim.getAttribute('POSITION');
    const nor = prim.getAttribute('NORMAL');
    if (!idx || !pos || !nor) continue;
    const nt = idx.getCount() / 3;
    const discTris = [];
    const keep = [];
    for (let i = 0; i < nt; i++) {
      const v = [0, 1, 2].map((k) => idx.getScalar(i * 3 + k));
      const inDisc =
        v.every((a) => Math.abs(pos.getElement(a, [])[0] + t[0] - DISC_X) < DISC_X_TOL) &&
        Math.abs(nor.getElement(v[0], [])[0]) > 0.99;
      (inDisc ? discTris : keep).push(v);
    }
    if (discTris.length === 0) continue;
    if (disc) throw new Error('disc triangles found in more than one primitive');

    // New primitive: copy the vertices of the disc triangles (indices 0..n-1).
    const flat = discTris.flat();
    const np = doc.createPrimitive().setMode(Primitive.Mode.TRIANGLES);
    for (const sem of prim.listSemantics()) {
      const src = prim.getAttribute(sem);
      const size = src.getElementSize();
      const arr = new (src.getArray().constructor)(flat.length * size);
      const tmp = [];
      flat.forEach((a, i) => arr.set(src.getElement(a, tmp), i * size));
      np.setAttribute(sem, doc.createAccessor().setType(src.getType()).setArray(arr).setBuffer(buffer));
    }
    np.setIndices(
      doc.createAccessor().setType(Accessor.Type.SCALAR).setArray(Uint16Array.from(flat.map((_, i) => i))).setBuffer(buffer),
    );
    // Own material (a copy of the atlas material) so the scene can replace it independently.
    np.setMaterial(prim.getMaterial().clone().setName('record_cover'));
    const discMesh = doc.createMesh('record_cover').addPrimitive(np);
    scene.addChild(doc.createNode('record_cover').setMesh(discMesh).setTranslation(t));

    // The original primitive loses those triangles.
    prim.setIndices(
      doc.createAccessor().setType(Accessor.Type.SCALAR).setArray(Uint32Array.from(keep.flat())).setBuffer(buffer),
    );

    // Disc geometry in world space.
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const dpos = np.getAttribute('POSITION');
    for (let i = 0; i < dpos.getCount(); i++) {
      const p = dpos.getElement(i, []);
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], p[j] + t[j]);
        max[j] = Math.max(max[j], p[j] + t[j]);
      }
    }
    disc = {
      nodeName: 'record_cover',
      materialName: 'record_cover',
      triangles: discTris.length,
      centre: min.map((m, j) => (m + max[j]) / 2),
      normal: [1, 0, 0],
      radius: Math.max(max[1] - min[1], max[2] - min[2]) / 2,
      atlasUv: 'U 0.010..0.227, V 0.169..0.385 of voyager_tex_01',
    };
  }
}
if (!disc) throw new Error('record cover disc not found');

// 3. Clean up and compress.
await doc.transform(
  weld(),
  prune({ keepLeaves: false }),
  textureCompress({
    encoder: sharp,
    targetFormat: SETTINGS.textureFormat,
    quality: SETTINGS.textureQuality,
    resize: [SETTINGS.textureMaxSize, SETTINGS.textureMaxSize],
  }),
  meshopt({
    encoder: MeshoptEncoder,
    level: SETTINGS.meshoptLevel,
    quantizePosition: SETTINGS.quantizePosition,
    quantizeNormal: SETTINGS.quantizeNormal,
    quantizeTexcoord: SETTINGS.quantizeTexcoord,
  }),
);
const out = await io.writeBinary(doc);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, out);

// 4. Describe exactly what was written, by reading it back.
const back = await io.readBinary(new Uint8Array(out));
let tris = 0;
for (const m of back.getRoot().listMeshes())
  for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
const b = getBounds(back.getRoot().listScenes()[0]);
const textures = back.getRoot().listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage().byteLength }));
const info = {
  source: {
    id: 'nasa-voyager-glb',
    file: 'sources/nasa-voyager-glb/Voyager.glb',
    bytes: srcBytes.length,
    sha256: sha256(srcBytes),
    url: 'https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/v/Voyager.glb',
    credit: 'NASA Visualization Technology Applications and Development (VTAD), science.nasa.gov',
  },
  output: { file: 'public/media/models/voyager.glb', bytes: out.length, sha256: sha256(out) },
  units: 'metres',
  up: 'Y',
  triangles: tris,
  extents: { min: b.min, max: b.max },
  nodes: back.getRoot().listNodes().map((n) => n.getName()),
  materials: back.getRoot().listMaterials().map((m) => m.getName()),
  textures,
  recordDisc: disc,
  settings: SETTINGS,
  builtBy: 'tools/models/build-voyager.mjs',
};
writeFileSync(OUT_JSON, JSON.stringify(info, null, 2) + '\n');
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      asset: 'voyager-model',
      script: 'tools/models/build-voyager.mjs',
      inputs: [info.source],
      outputs: [info.output, { file: 'public/media/models/voyager.json' }],
      settings: SETTINGS,
      tools: { '@gltf-transform/core': '4.5.1', meshoptimizer: '1.3.0', sharp: '0.35.5' },
      seeds: null,
      prompts: null,
    },
    null,
    2,
  ) + '\n',
);
console.log(`voyager.glb ${out.length} bytes, ${tris} triangles, extents`, b.min.map((v) => +v.toFixed(3)), b.max.map((v) => +v.toFixed(3)));
console.log('disc', JSON.stringify(disc));
console.log('textures', JSON.stringify(textures));
