import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLB = join(ROOT, 'public', 'media', 'models', 'voyager.glb');
const JSON_PATH = join(ROOT, 'public', 'media', 'models', 'voyager.json');

describe('Voyager model (NASA VTAD, cleaned and compressed)', () => {
  const meta = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  let doc: Awaited<ReturnType<NodeIO['readBinary']>>;

  beforeAll(async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    doc = await io.readBinary(new Uint8Array(readFileSync(GLB)));
  });

  it('is under 2 MB and matches the recorded size and checksum', () => {
    const bytes = readFileSync(GLB);
    expect(statSync(GLB).size).toBeLessThan(2_000_000);
    expect(meta.output.bytes).toBe(bytes.length);
    expect(meta.output.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('has no leftover transparent "clear" cube', () => {
    const root = doc.getRoot();
    for (const n of root.listNodes()) expect(n.getName().toLowerCase()).not.toContain('clear');
    for (const m of root.listMeshes()) expect(m.getName().toLowerCase()).not.toContain('clear');
    for (const m of root.listMaterials()) {
      expect(m.getName().toLowerCase()).not.toContain('clear');
      expect(m.getAlphaMode()).toBe('OPAQUE');
    }
  });

  it('voyager.json matches the file: triangles, extents within 1 mm', () => {
    let tris = 0;
    for (const m of doc.getRoot().listMeshes())
      for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3;
    expect(tris).toBe(meta.triangles);
    const b = getBounds(doc.getRoot().listScenes()[0]!);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(b.min[i]! - meta.extents.min[i])).toBeLessThan(0.001);
      expect(Math.abs(b.max[i]! - meta.extents.max[i])).toBeLessThan(0.001);
    }
    // Research: NASA's model is about 7.8 x 11 x 16.9 m, metres, Y up.
    expect(b.max[1]! - b.min[1]!).toBeGreaterThan(10.9);
    expect(b.max[2]! - b.min[2]!).toBeGreaterThan(16.8);
  });

  it('carries the record cover disc as its own node and material, at the researched place', () => {
    const d = meta.recordDisc;
    const node = doc.getRoot().listNodes().find((n) => n.getName() === d.nodeName);
    expect(node).toBeDefined();
    const mats = node!.getMesh()!.listPrimitives().map((p) => p.getMaterial()!.getName());
    expect(mats).toEqual([d.materialName]);
    expect(d.normal).toEqual([1, 0, 0]);
    expect(Math.abs(d.centre[0] - 0.948)).toBeLessThan(0.002);
    expect(Math.abs(d.centre[1])).toBeLessThan(0.002);
    expect(Math.abs(d.centre[2])).toBeLessThan(0.004);
    expect(Math.abs(d.radius * 2 - 0.314)).toBeLessThan(0.002);
    // The disc's own bounds in the file agree with the recorded centre.
    const b = getBounds(node!);
    expect(Math.abs((b.min[0]! + b.max[0]!) / 2 - d.centre[0])).toBeLessThan(0.001);
    expect(Math.abs((b.min[1]! + b.max[1]!) / 2 - d.centre[1])).toBeLessThan(0.001);
  });

  it('keeps its textures (WebP, baked AO atlases)', () => {
    const tex = doc.getRoot().listTextures();
    expect(tex.length).toBe(3);
    for (const t of tex) expect(t.getMimeType()).toBe('image/webp');
  });
});
