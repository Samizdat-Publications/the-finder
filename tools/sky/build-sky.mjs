#!/usr/bin/env node
// Builds public/media/sky/gaia-sky.webp (+ gaia-sky.json) from ESA's Gaia EDR3 all-sky colour map,
// equirectangular projection (tools/sources.json id "gaia-sky-colour"; ESA/Gaia/DPAC, CC BY-SA 3.0
// IGO, acknowledgement A. Moitinho).
//
// The source is a 4000 x 2000 PNG in galactic coordinates, plate carree: the Galactic centre
// (l = 0, b = 0) at the image centre, b = +90 at the top row, and galactic longitude increasing to
// the LEFT (the sky seen from inside, as ESA's all-sky maps are drawn), so l = 180 at both edges.
// The orientation is checked against the image itself below (the Magellanic Clouds, l = 280.5 and
// 302.8, b = -32.9 and -44.3, must be bright patches right of and below centre), and in the browser
// test against galacticToIcrs(0, 0).
//
// Output: WebP at the source size (no resampling, so no position shift), lightly smoothed (Gaussian,
// sigma 0.8 px = 4 arcmin: the map's star-count grain otherwise shows as noise when the scene magnifies
// it about 2x; a symmetric blur moves nothing), quality 88, well under the 8 MB budget. A png is data: it is decoded, never executed.
// Run: node tools/sky/build-sky.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = JSON.parse(readFileSync(join(ROOT, 'tools', 'sources.json'), 'utf8'));
const SRC_ENTRY = SOURCES.sources.find((s) => s.id === 'gaia-sky-colour');
const SRC = join(ROOT, 'sources', 'gaia-sky-colour', SRC_ENTRY.file);
const OUT_DIR = join(ROOT, 'public', 'media', 'sky');
const OUT = join(OUT_DIR, 'gaia-sky.webp');
const OUT_JSON = join(OUT_DIR, 'gaia-sky.json');
const QUALITY = 88;
const BLUR_SIGMA_PX = 0.8;
const MAX_BYTES = 8 * 1024 * 1024; // spec budget: under 8 MB

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const input = readFileSync(SRC);
if (sha256(input) !== SRC_ENTRY.sha256) throw new Error('source checksum differs from tools/sources.json');
const meta = await sharp(input).metadata();
if (meta.width !== 2 * meta.height) throw new Error(`not 2:1 equirectangular: ${meta.width} x ${meta.height}`);

// Orientation check on the source pixels: mean luminance in a 2 deg box (half-width 1 deg) at (l, b).
const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
function pixelOf(lDeg, bDeg) {
  const lWrapped = ((lDeg + 180) % 360 + 360) % 360 - 180; // -180..180, 0 at centre
  const x = (0.5 - lWrapped / 360) * info.width; // l increases to the left
  const y = (0.5 - bDeg / 180) * info.height;
  return [x, y];
}
function lumAt(lDeg, bDeg, boxDeg = 1) {
  const [cx, cy] = pixelOf(lDeg, bDeg);
  const r = Math.round((boxDeg / 360) * info.width);
  let s = 0;
  let n = 0;
  for (let y = Math.round(cy) - r; y <= Math.round(cy) + r; y++) {
    for (let x = Math.round(cx) - r; x <= Math.round(cx) + r; x++) {
      const xx = ((x % info.width) + info.width) % info.width;
      if (y < 0 || y >= info.height) continue;
      const i = (y * info.width + xx) * info.channels;
      s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
  }
  return s / n;
}
// LMC and SMC (SIMBAD galactic coordinates), and their mirror positions if l ran the other way.
const lmc = lumAt(280.47, -32.89);
const smc = lumAt(302.8, -44.3);
const lmcMirror = lumAt(-280.47, -32.89);
const smcMirror = lumAt(-302.8, -44.3);
console.log(`LMC ${lmc.toFixed(1)} vs mirror ${lmcMirror.toFixed(1)}; SMC ${smc.toFixed(1)} vs mirror ${smcMirror.toFixed(1)}`);
if (!(lmc > 2 * lmcMirror && smc > 2 * smcMirror)) throw new Error('orientation check failed: Magellanic Clouds not where l-increases-left puts them');

mkdirSync(OUT_DIR, { recursive: true });
const webp = await sharp(input).removeAlpha().blur(BLUR_SIGMA_PX).webp({ quality: QUALITY, effort: 6 }).toBuffer();
if (webp.length > MAX_BYTES) throw new Error(`WebP is ${webp.length} bytes, over the 8 MB budget`);
writeFileSync(OUT, webp);
const out = {
  source: { id: SRC_ENTRY.id, file: `sources/gaia-sky-colour/${SRC_ENTRY.file}`, bytes: input.length, sha256: SRC_ENTRY.sha256, url: SRC_ENTRY.url, credit: SRC_ENTRY.credit },
  output: { file: 'public/media/sky/gaia-sky.webp', bytes: webp.length, sha256: sha256(webp), width: meta.width, height: meta.height, quality: QUALITY, blurSigmaPx: BLUR_SIGMA_PX },
  projection: {
    frame: 'galactic (IAU 1958, Hipparcos definition)',
    type: 'equirectangular (plate carree)',
    centre: { lDeg: 0, bDeg: 0 },
    longitudeIncreases: 'left',
    topRowBDeg: 90,
    u: 'u = 0.5 - l / 360 (l wrapped to -180..180)',
    v: 'v = 0.5 + b / 180 (v = 1 at the top row)',
  },
  orientationCheck: { lmc, lmcMirror, smc, smcMirror },
  builtBy: 'tools/sky/build-sky.mjs',
};
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${OUT} (${(webp.length / 1e6).toFixed(2)} MB, ${meta.width} x ${meta.height})`);
