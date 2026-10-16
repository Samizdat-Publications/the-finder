// The picture canvas (512 columns appearing left to right, one pixel per decoded pixel, scaled by a whole
// number so it stays crisp) and the oscilloscope strip under it (the raw signal of the line being drawn).

import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cachedSamples } from '../game/decoderService';
import { decoder as D, type Picture } from '../game/state';

const PLACEHOLDER = { w: 512, h: 355 };

export function PictureCanvas() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const picture = D.picture.value;
  const colour = D.colour.value;
  const w = colour?.width ?? picture?.width ?? PLACEHOLDER.w;
  const h = colour?.height ?? picture?.height ?? PLACEHOLDER.h;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // whole-number scales keep it crisp; on a screen narrower than the picture it shrinks to fit instead
    const fit = (): void => setScale(el.clientWidth < w ? Math.max(0.1, el.clientWidth / w) : Math.floor(el.clientWidth / w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  // Paint columns as they are revealed. The ImageData is made once per picture; only new columns are put.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let img: ImageData | null = null;
    let owner: Picture | null = null;
    let drawn = 0;
    return effect(() => {
      const c = D.colour.value;
      const p = D.picture.value;
      const n = D.revealed.value;
      if (c) {
        ctx.putImageData(new ImageData(c.rgba as Uint8ClampedArray<ArrayBuffer>, c.width, c.height), 0, 0);
        owner = null;
        return;
      }
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
        img = ctx.createImageData(p.width, p.height);
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
        ctx.fillStyle = '#08071a';
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
      if (!img || n <= drawn) return;
      for (let k = drawn; k < n; k++) {
        for (let j = 0; j < p.height; j++) {
          const v = p.gray[j * p.width + k] as number;
          const o = (j * p.width + k) * 4;
          img.data[o] = v;
          img.data[o + 1] = v;
          img.data[o + 2] = v;
        }
      }
      ctx.putImageData(img, 0, 0, drawn, 0, n - drawn, p.height);
      drawn = n;
    });
  }, [w, h]);

  const lines = picture ? D.revealed.value : 0;
  return (
    <div class="picture-wrap" ref={wrap}>
      <div class="picture-frame" style={{ width: `${w * scale}px`, height: `${h * scale}px` }}>
        <canvas id="picture-canvas" ref={canvas} width={w} height={h} style={{ width: `${w * scale}px`, height: `${h * scale}px` }} aria-label="The decoded picture" />
        {!picture && !colour && <div class="picture-empty">{D.status.value === 'loading' || D.status.value === 'decoding' ? 'Decoding ...' : 'No picture yet. Choose a frame and decode it.'}</div>}
      </div>
      <Scope width={w * scale} line={picture ? Math.max(0, Math.min(picture.width - 1, lines - 1)) : null} />
    </div>
  );
}

/** The raw samples of one line, as the tape delivers them (sync pulse, blanking shelf, then the picture). */
function Scope({ width, line }: { width: number; line: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const picture = D.picture.value;
  const sync = D.sync.value;
  const H = 72;

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.fillStyle = '#08071a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const s = picture ? cachedSamples(picture.frame) : undefined;
    if (!picture || !sync || !s || line === null) return;
    const step = picture.lineStepSamples;
    const start = sync.firstEdgeSamples + line * step;
    const pre = 40;
    const len = Math.round(step) + pre;
    const from = Math.round(start) - pre;
    let peak = 1e-9;
    for (let i = 0; i < s.length; i += 7) peak = Math.max(peak, Math.abs(s[i] as number));
    // the part of the line the picture is made from (decoder window, 384 kHz samples scaled to the slice rate)
    const rate = 96_000;
    const w0 = Math.round(start + (258 * rate) / 384_000);
    const w1 = Math.round(start + (2898 * rate) / 384_000);
    const x = (i: number): number => ((i - from) / len) * cv.width;
    ctx.fillStyle = 'rgba(232, 182, 74, 0.12)';
    ctx.fillRect(x(w0), 0, x(w1) - x(w0), cv.height);
    ctx.strokeStyle = '#2a2750';
    ctx.beginPath();
    ctx.moveTo(0, cv.height / 2);
    ctx.lineTo(cv.width, cv.height / 2);
    ctx.stroke();
    ctx.strokeStyle = '#4ff0c4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let px = 0; px < cv.width; px++) {
      const i0 = Math.floor(from + (px / cv.width) * len);
      const i1 = Math.max(i0 + 1, Math.floor(from + ((px + 1) / cv.width) * len));
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = i0; i < i1; i++) {
        const v = (s[Math.min(s.length - 1, Math.max(0, i))] as number) / peak;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const yTop = cv.height / 2 - (hi * (cv.height - 8)) / 2;
      const yBot = cv.height / 2 - (lo * (cv.height - 8)) / 2;
      ctx.moveTo(px + 0.5, yTop);
      ctx.lineTo(px + 0.5, Math.max(yBot, yTop + 1));
    }
    ctx.stroke();
  }, [picture, sync, line, width]);

  return (
    <div class="scope" style={{ width: `${width}px` }}>
      <canvas ref={ref} width={Math.max(64, width)} height={H} aria-label="The raw signal of the line being drawn" style={{ width: `${width}px`, height: `${H}px` }} />
      <div class="help">
        {line === null ? 'Signal strip: the raw tape signal of the line being drawn.' : `Raw signal of line ${line + 1} of ${picture?.width}: the sync pulse, then the blanking shelf, then the picture (shaded).`}
      </div>
    </div>
  );
}
