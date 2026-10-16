// Render public/media/cover/cover.svg over the 1977 photo (aligned by the measured disc fit in
// assets-src/cover/geometry.json) into build/cover/overlay.png and overlay_detail_{tl,tr,bl,br}.png
// (full resolution quadrants), plus build/cover/render.png (the SVG alone at photo scale, used by landmarks.py).
// Run: node tools/cover/overlay.mjs
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const geo = JSON.parse(readFileSync(join(ROOT, 'assets-src/cover/geometry.json'), 'utf8'));
const svg = readFileSync(join(ROOT, 'public/media/cover/cover.svg'), 'utf8');
const D = geo.disc;
const K = 304.8 / (2 * D.r); // mm per px
const X0 = D.cx - D.r;
const Y0 = D.cy - D.r;
const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
function wrap(color, w) {
  const body = inner.replace(/color="#1a1a1a"/, `color="${color}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">` +
    `<g transform="translate(${X0} ${Y0}) scale(${1 / K})">${body}</g></svg>`;
}
const out = join(ROOT, 'build/cover');
mkdirSync(out, { recursive: true });
const W = geo.meta.photoSize[0];
const cyan = await sharp(Buffer.from(wrap('#00ffff', W)), { density: 72 }).png().toBuffer();
const black = await sharp(Buffer.from(wrap('#000000', W)), { density: 72 }).flatten({ background: '#ffffff' }).png().toBuffer();
writeFileSync(join(out, 'render.png'), black);
const photo = join(ROOT, 'sources/cover-photo/GPN-2000-001978.jpg');
const base = await sharp(photo).png().toBuffer();
const comp = await sharp(base).composite([{ input: cyan }]).png().toBuffer();
writeFileSync(join(out, 'overlay.png'), await sharp(comp).resize(1600).png().toBuffer());
const h = Math.floor(W / 2);
for (const [n, l, t] of [['tl', 0, 0], ['tr', W - h, 0], ['bl', 0, W - h], ['br', W - h, W - h]]) {
  writeFileSync(join(out, `overlay_detail_${n}.png`), await sharp(comp).extract({ left: l, top: t, width: h, height: h }).png().toBuffer());
}
console.log('overlays written to', out, 'photo px per mm', (1 / K).toFixed(4));
