// Two small drawing pieces for The Pictures' work views: a crop of a decoded frame from the album (the gold of
// what was decoded from the tape, one canvas pixel per decoded pixel, scaled up crisply; rule 2), and one of the
// Finder's own numerals (src/ui/glyphs.ts numeralGlyph) with its quiet gloss.

import { useEffect, useRef } from 'preact/hooks';
import { GLYPH_H, GLYPH_W, numeralGlyph } from '../../ui/glyphs';
import { album } from './album';
import { paintGold } from './PictureView';
import type { Region } from '../../science/teaching';

/** A region of a developed frame, `scale` CSS px per decoded pixel, turned `turns` quarter turns clockwise. */
export function Crop(p: { frame: string; region?: Region; scale?: number; turns?: number; label: string; class?: string; maxWidth?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pic = album.value[p.frame];
  const r: Region = p.region ?? [0, 0, pic?.width ?? 536, pic?.height ?? 355];
  const w = r[2] - r[0];
  const h = r[3] - r[1];
  const t = (((p.turns ?? 0) % 4) + 4) % 4;
  const side = t % 2 === 1;
  let s = p.scale ?? 2;
  if (p.maxWidth && (side ? h : w) * s > p.maxWidth) s = p.maxWidth / (side ? h : w);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !pic) return;
    const out = side ? [h, w] : [w, h];
    cv.width = out[0] as number;
    cv.height = out[1] as number;
    const sub = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sub[y * w + x] = pic.gray[(r[1] + y) * pic.width + r[0] + x] as number;
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sctx = src.getContext('2d');
    if (!sctx) return;
    const img = sctx.createImageData(w, h);
    paintGold(sub, w, h, img.data);
    sctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate((t * Math.PI) / 2);
    ctx.drawImage(src, -w / 2, -h / 2);
    ctx.restore();
  }, [pic, r[0], r[1], r[2], r[3], t]);
  if (!pic) return <span class="pic-crop missing">{p.frame} not developed</span>;
  const cw = (side ? h : w) * s;
  const ch = (side ? w : h) * s;
  return <canvas ref={ref} class={`pic-crop ${p.class ?? ''}`} style={{ width: `${cw}px`, height: `${ch}px` }} role="img" aria-label={p.label} />;
}

/** One of the Finder's numerals, with its digit as the quiet gloss under it. */
export function Numeral(p: { n: number; height?: number; gloss?: boolean }) {
  const g = numeralGlyph(p.n);
  const h = p.height ?? 22;
  return (
    <span class="pic-numeral" data-numeral={p.n}>
      <svg viewBox={`-3 -3 ${GLYPH_W + 6} ${GLYPH_H + 6}`} width={((GLYPH_W + 6) / (GLYPH_H + 6)) * h} height={h} role="img" aria-label={`the Finder's numeral ${p.n}`} fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        {g.strokes.map((d, j) => (
          <path key={j} d={d} />
        ))}
        {g.marks.map((m, j) => (
          <circle key={`m${j}`} cx={m[0]} cy={m[1]} r={m[2]} fill={m[3] ? 'currentColor' : 'none'} stroke-width="1.6" />
        ))}
      </svg>
      {p.gloss !== false && <span class="gloss">{p.n}</span>}
    </span>
  );
}

/** A whole number in the Finder's numerals (most significant first). */
export function Numerals(p: { value: number; height?: number }) {
  const ds = String(Math.round(p.value)).split('').map(Number);
  return (
    <span class="pic-numerals" data-numerals={p.value}>
      {ds.map((d, i) => (
        <Numeral key={i} n={d} height={p.height} gloss={false} />
      ))}
      <span class="gloss">{p.value}</span>
    </span>
  );
}
