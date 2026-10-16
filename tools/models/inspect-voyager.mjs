// Prints a summary of a glb (nodes, meshes, materials, textures, extents). Data only; nothing is executed.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
console.log('extensions', root.listExtensionsUsed().map((e) => e.extensionName));
for (const n of root.listNodes()) {
  const m = n.getMesh();
  console.log('node', JSON.stringify(n.getName()), 't', n.getTranslation(), 'r', n.getRotation(), 's', n.getScale(), 'mesh', m?.getName());
}
for (const m of root.listMeshes()) {
  for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    const pos = p.getAttribute('POSITION');
    console.log('mesh', m.getName(), 'prim mat', p.getMaterial()?.getName(), 'tris', (idx?.getCount() ?? pos.getCount()) / 3, 'verts', pos.getCount(), 'attrs', p.listSemantics().join(','), 'posMin', pos.getMinNormalized([]).map((v) => +v.toFixed(3)), 'max', pos.getMaxNormalized([]).map((v) => +v.toFixed(3)));
  }
}
for (const m of root.listMaterials()) {
  const t = m.getBaseColorTexture();
  console.log('mat', m.getName(), 'alpha', m.getAlphaMode(), 'base', m.getBaseColorFactor(), 'metal', m.getMetallicFactor(), 'rough', m.getRoughnessFactor(), 'tex', t?.getName(), 'ds', m.getDoubleSided(), 'occ', m.getOcclusionTexture()?.getName(), 'emi', m.getEmissiveTexture()?.getName());
}
for (const t of root.listTextures()) console.log('tex', t.getName(), t.getMimeType(), t.getSize(), t.getImage().byteLength);
const sc = root.getDefaultScene() ?? root.listScenes()[0];
console.log('bounds', JSON.stringify(getBounds(sc)));
