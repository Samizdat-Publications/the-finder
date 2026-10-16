# M3 step 3a spec: the Voyager model pipeline

Subagent: `asset-smith`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit). Read `CLAUDE.md` (rules 9, 11, 12), `docs/research/voyager.md` section 1 (NASA's models: what they contain, the record patch, usage terms) and 2 (spacecraft facts), `docs/plans/M3.md` (the Arrival scene), and `C:\Users\stewa\ClaudeProjects\seked\scripts\web-assets.ts` (read only: a gltf-transform pipeline with meshopt and texture compression). Other helpers are building the game shell (`src/game/`, `src/ui/`, `src/play/`) and the cover SVG (`tools/cover/`, `assets-src/cover/`); stay out of those.

This is M3 step 3a: NASA's Voyager glTF, fetched with a checksum, cleaned and compressed into a small runtime model the encounter scene loads, plus a look at it.

## Steps
1. Add NASA's `Voyager.glb` (science.nasa.gov, URL in voyager.md section 1; 3,128,204 bytes) to `tools/sources.json` (id `nasa-voyager-glb`, credit "NASA Visualization Technology Applications and Development (VTAD), science.nasa.gov, free to use under NASA's media guidelines; no endorsement implied") and fetch it with `node tools/fetch-sources.mjs nasa-voyager-glb`.
2. Inspect it (nodes, meshes, materials, textures, extents, units, up axis) and confirm the research's description; report differences.
3. Clean and compress with gltf-transform (add `@gltf-transform/cli` and `@gltf-transform/core`/`functions`/`extensions` as exactly pinned devDependencies; a Node script `tools/models/build-voyager.mjs` run through `process.execPath`): remove the leftover transparent "clear" cube; keep metres and Y up; dedupe, weld, prune; meshopt-compress geometry (three.js `MeshoptDecoder` loads it); textures to WebP at sizes that keep detail (state them); keep the baked AO. Name or record the node that carries the gold record cover disc (voyager.md: normal +X, centre (0.948, 0, -0.002) m, 0.314 m diameter) so the scene can replace its material with our own cover later: write its node name, centre, normal and radius into `public/media/models/voyager.json`.
4. Output `public/media/models/voyager.glb` (target under 2 MB, hard limit 20 MB) and `voyager.json` (source, checksums, triangle count, extents, the record-disc entry, the build settings).
5. Look at it: render four views (front, three-quarter, the record face close up, the dish from behind) with Blender headless (`C:\Program Files\Blender Foundation\Blender 5.1\blender.exe -b --factory-startup -P script.py -- args`; a script in `tools/models/`) or three.js through the harness, into `build/models/`. Read the PNGs yourself; fix anything broken (missing textures, wrong normals, inside-out faces).
6. A test (`tests/models.test.ts`): the glb exists, is under 2 MB, parses (gltf-transform `NodeIO` in Node), has no node named like "clear", and `voyager.json` matches it (triangle count, extents within 1 mm).
7. Add the credit line to `docs/CREDITS.md` (Images and models; replace the "Planned" line).

## Done when
`npm run check` passes with the new test, and the renders look right. Report: the inspection summary, the output size and triangle count, the texture sizes, the record-disc entry, the render paths and what they show, any problem.

## Rules
No em dash anywhere. Never read .env. Never run downloaded code (a glb is data; parse it, do not execute anything in it). Do not commit.
