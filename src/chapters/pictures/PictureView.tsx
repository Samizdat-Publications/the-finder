// The developing picture, the chapter's centrepiece: the decoder's columns appear left to right as the lines
// come off the tape, drawn in the gold of what has been decoded from the human artifact (a duotone from the
// instrument's deep indigo to warm white), one canvas pixel per decoded pixel, scaled up crisply.

import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { decoder as D, type Picture } from '../../game/state';

/** The duotone: grey 0 is the instrument's ink (#08071a), grey 255 a warm white gold (#fff0c8). */
const LO = [8, 7, 26] as const;
const HI = [255, 240, 200] as const;
const LUT = new Uint8ClampedArray(256 * 3);
for (let v = 0; v < 256; v++) {
  // a touch of gamma so mid greys sit in the gold rather than the brown
  const t = (v / 255) ** 0.85;
  for (let c = 0; c < 3; c++) LUT[v * 3 + c] = Math.round((LO[c] as number) + ((HI[c] as number) - (LO[c] as number)) * t);
}

/** Gold duotone of an 8-bit grey picture into RGBA, columns k0..k1. */
export function paintGold(gray: Uint8Array, width: number, height: number, out: Uint8ClampedArray, k0 = 0, k1 = width): void {
  for (let j = 0; j < height; j++) {
    for (let k = k0; k < k1; k++) {
      const v = gray[j * width + k] as number;
      const o = (j * width + k) * 4;
      out[o] = LUT[v * 3] as number;
      out[o + 1] = LUT[v * 3 + 1] as number;
      out[o + 2] = LUT[v * 3 + 2] as number;
      out[o + 3] = 255;
    }
  }
}

/** A small gold thumbnail of a finished picture, as a data URL (the record of what was seen). */
export function goldThumb(p: Picture, w = 160): string {
  const full = document.createElement('canvas');
  full.width = p.width;
  full.height = p.height;
  const ctx = full.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(p.width, p.height);
  paintGold(p.gray, p.width, p.height, img.data);
  ctx.putImageData(img, 0, 0);
  const t = document.createElement('canvas');
  t.width = w;
  t.height = Math.round((w * p.height) / p.width);
  t.getContext('2d')?.drawImage(full, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}

/** Room kept under the picture for its caption, CSS px. */
const CAPTION_PX = 34;

export function PictureView() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cssW, setCssW] = useState(512);
  const picture = D.picture.value;
  const w = picture?.width ?? 512;
  const h = picture?.height ?? 355;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // As large as the column allows, up to twice the decoded size (pixelated, so the lines stay sharp). On a
    // screen with room the box has a height of its own, so the picture also keeps its caption inside it.
    const room = window.matchMedia('(min-width: 1000px) and (min-height: 620px)');
    const fit = (): void => {
      const byHeight = room.matches && el.clientHeight > 0 ? ((el.clientHeight - CAPTION_PX) * w) / h : Infinity;
      setCssW(Math.max(160, Math.min(el.clientWidth, 2 * w, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let img: ImageData | null = null;
    let owner: Picture | null = null;
    let drawn = 0;
    // the canvas size is set here only: a size attribute set by a re-render would clear the painted picture
    cv.width = 512;
    cv.height = 355;
    return effect(() => {
      const p = D.picture.value;
      const n = D.revealed.value;
      if (!p) {
        ctx.fillStyle = '#08071a';
        ctx.fillRect(0, 0, cv.width, cv.height);
        owner = null;
        drawn = 0;
        return;
      }
      if (owner !== p) {
        owner = p;
        drawn = 0;
        if (cv.width !== p.width || cv.height !== p.height) {
          cv.width = p.width;
          cv.height = p.height;
        }
        img = ctx.createImageData(p.width, p.height);
        ctx.fillStyle = '#08071a';
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
      if (!img || n <= drawn) return;
      paintGold(p.gray, p.width, p.height, img.data, drawn, n);
      ctx.putImageData(img, 0, 0, drawn, 0, n - drawn, p.height);
      drawn = n;
    });
  }, []);

  const status = D.status.value;
  const lines = picture ? D.revealed.value : 0;
  const cssH = (cssW * h) / w;
  return (
    <div class="pic-view" ref={wrap}>
      <div class="pic-frame" style={{ width: `${cssW}px`, height: `${cssH}px` }}>
        <canvas ref={canvas} id="pictures-canvas" style={{ width: `${cssW}px`, height: `${cssH}px` }} aria-label="The picture decoded from the tape" />
        {lines > 0 && lines < w && <div class="pic-beam" style={{ left: `${(lines / w) * cssW}px` }} aria-hidden="true" />}
        {!picture && <div class="pic-empty">{status === 'loading' || status === 'decoding' ? 'Reading the tape ...' : 'No picture yet.'}</div>}
      </div>
      <p class="pic-caption" aria-live="polite">
        {picture
          ? `Frame ${picture.frame}: ${lines} of ${w} lines, ${h} rows${status === 'revealing' ? ', developing at the speed the lines come off the record' : ''}.`
          : D.error.value ?? ' '}
      </p>
    </div>
  );
}
