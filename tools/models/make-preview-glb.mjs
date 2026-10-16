// Decodes meshopt in public/media/models/voyager.glb into build/models/voyager_preview.glb so Blender can open it.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(join(ROOT, 'public', 'media', 'models', 'voyager.glb'));
for (const e of doc.getRoot().listExtensionsUsed()) if (e instanceof EXTMeshoptCompression) e.dispose();
mkdirSync(join(ROOT, 'build', 'models'), { recursive: true });
await io.write(join(ROOT, 'build', 'models', 'voyager_preview.glb'), doc);
console.log('preview written');
