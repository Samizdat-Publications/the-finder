// The cover viewer, shared by The Key, The Player and The Pictures. The rebuilt cover (cover.svg) is drawn as
// an etched gold plate under one lamp the player moves (src/chapters/shared/relief.ts shades the strokes as
// grooves); an SVG layer on top makes the binary strings hoverable and their strokes selectable. Pan with a
// drag, the arrow keys or the wheel's sideways motion; zoom with the wheel or + and -; 0 fits the plate.
// View and lamp are the viewer's own state (like a scroll position); nothing here touches game state.

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CoverModel, Pt } from './coverSvg';
import { DEFAULT_RELIEF, shadeRelief, type Lamp } from './relief';
import { LampDial } from './LampDial';
import './coverViewer.css';

export interface StrokeRef {
  group: string;
  index: number;
}

export interface CoverViewerProps {
  model: CoverModel;
  lamp: Lamp;
  onLamp: (l: Lamp) => void;
  hoverGroup: string | null;
  onHover: (id: string | null) => void;
  selected: StrokeRef | null;
  onSelect: (s: StrokeRef | null) => void;
  /** Groups the player has tabulated (outlined). */
  marked?: ReadonlySet<string>;
  /** Text to show beside a hovered group, in gold (what has been decoded from it), or null. */
  labelFor?: (id: string) => string | null;
  label: string;
  /** Shown in the tool row under the plate, beside the lamp. */
  children?: ComponentChildren;
}

interface View {
  /** CSS pixels per millimetre. */
  scale: number;
  cx: number;
  cy: number;
}

const MAX_ZOOM = 24;

function fit(model: CoverModel, w: number, h: number): View {
  return { scale: (Math.min(w, h) / model.size) * 0.96, cx: model.size / 2, cy: model.size / 2 };
}

/** Rasterise the strokes as coverage and shade them under the lamp, into the visible canvas. */
function paint(canvas: HTMLCanvasElement, model: CoverModel, view: View, lamp: Lamp, w: number, h: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const s = view.scale * dpr;
  const tx = W / 2 - view.cx * s;
  const ty = H / 2 - view.cy * s;
  const hc = document.createElement('canvas');
  hc.width = W;
  hc.height = H;
  const g = hc.getContext('2d', { willReadFrequently: true });
  const out = canvas.getContext('2d');
  if (!g || !out) return;
  g.setTransform(s, 0, 0, s, tx, ty);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const minW = 1.1 / s; // keep the finest digits at least about a pixel wide
  for (const d of model.drawables) {
    g.beginPath();
    if (d.kind === 'poly') {
      const p0 = d.pts[0] as Pt;
      g.moveTo(p0[0], p0[1]);
      for (let i = 1; i < d.pts.length; i++) g.lineTo((d.pts[i] as Pt)[0], (d.pts[i] as Pt)[1]);
      if (d.closed) g.closePath();
      g.lineWidth = Math.max(d.width, minW);
      g.stroke();
    } else {
      g.arc(d.cx, d.cy, d.r, 0, 2 * Math.PI);
      if (d.fill) g.fill();
      else {
        g.lineWidth = Math.max(d.width, minW);
        g.stroke();
      }
    }
  }
  const img = g.getImageData(0, 0, W, H);
  const cov = new Float32Array(W * H);
  const inside = new Uint8Array(W * H);
  const R = model.size / 2;
  for (let y = 0; y < H; y++) {
    const my = (y + 0.5 - ty) / s - R;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      cov[i] = (img.data[i * 4 + 3] as number) / 255;
      const mx = (x + 0.5 - tx) / s - R;
      inside[i] = mx * mx + my * my <= R * R ? 1 : 0;
    }
  }
  const shaded = out.createImageData(W, H);
  // Groove walls about 0.12 mm wide, at least one pixel.
  shadeRelief(cov, inside, W, H, lamp, shaded.data, { ...DEFAULT_RELIEF, blurPx: Math.min(6, Math.max(1, 0.12 * s)) });
  out.putImageData(shaded, 0, 0);
}

export function CoverViewer(p: CoverViewerProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // On a resize keep what was in view: the scale follows the plate's new fit.
  const lastW = useRef(0);
  useEffect(() => {
    if (size.w === 0) return;
    const prev = lastW.current;
    lastW.current = size.w;
    setView((v) => (!v || prev === 0 ? fit(p.model, size.w, size.h) : { ...v, scale: (v.scale * size.w) / prev }));
  }, [size.w, size.h]);

  useEffect(() => {
    if (!view || !canvas.current || size.w === 0) return;
    const id = requestAnimationFrame(() => canvas.current && paint(canvas.current, p.model, view, p.lamp, size.w, size.h));
    return () => cancelAnimationFrame(id);
  }, [view, p.lamp.azimuthDeg, p.lamp.elevationDeg, size.w, size.h, p.model]);

  const clampView = (v: View): View => {
    const f = fit(p.model, size.w, size.h);
    const scale = Math.min(f.scale * MAX_ZOOM, Math.max(f.scale, v.scale));
    const S = p.model.size;
    return { scale, cx: Math.min(S, Math.max(0, v.cx)), cy: Math.min(S, Math.max(0, v.cy)) };
  };

  const zoomAt = (factor: number, sx: number, sy: number): void => {
    setView((v) => {
      if (!v) return v;
      const mx = v.cx + (sx - size.w / 2) / v.scale;
      const my = v.cy + (sy - size.h / 2) / v.scale;
      const n = clampView({ ...v, scale: v.scale * factor });
      return clampView({ scale: n.scale, cx: mx - (sx - size.w / 2) / n.scale, cy: my - (sy - size.h / 2) / n.scale });
    });
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [size.w, size.h]);

  const onKey = (e: KeyboardEvent): void => {
    if (!view) return;
    const step = 60 / view.scale;
    const pan: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = pan[e.key];
    if (d) setView(clampView({ ...view, cx: view.cx + d[0], cy: view.cy + d[1] }));
    else if (e.key === '+' || e.key === '=') zoomAt(1.4, size.w / 2, size.h / 2);
    else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.4, size.w / 2, size.h / 2);
    else if (e.key === '0') setView(fit(p.model, size.w, size.h));
    else return;
    e.preventDefault();
  };

  const vb = view ? `${view.cx - size.w / 2 / view.scale} ${view.cy - size.h / 2 / view.scale} ${size.w / view.scale} ${size.h / view.scale}` : `0 0 ${p.model.size} ${p.model.size}`;
  const px = view ? 1 / view.scale : 1; // one CSS pixel in millimetres
  const hovered = p.hoverGroup ? p.model.groups.find((g) => g.id === p.hoverGroup) : undefined;
  const hoverLabel = hovered && p.labelFor ? p.labelFor(hovered.id) : null;
  const groupsDrawn = useMemo(() => p.model.groups, [p.model]);

  return (
    <div class="coverwrap">
    <div
      class="coverviewer"
      ref={box}
      tabIndex={0}
      role="application"
      aria-label={`${p.label}. Drag or use the arrow keys to move, the wheel or plus and minus to zoom, 0 to fit.`}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        if (!view) return;
        drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !view || (e.buttons & 1) === 0) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        if (!d.moved) box.current?.setPointerCapture(e.pointerId);
        d.moved = true;
        setView(clampView({ ...view, cx: d.cx - dx / view.scale, cy: d.cy - dy / view.scale }));
      }}
      onPointerUp={() => {
        window.setTimeout(() => (drag.current = null), 0);
      }}
    >
      <canvas ref={canvas} class="relief" aria-hidden="true" style={{ width: `${size.w}px`, height: `${size.h}px` }} />
      <svg class="strokes" viewBox={vb} width={size.w} height={size.h} aria-hidden="true">
        {groupsDrawn.map((g) => {
          const isHover = g.id === p.hoverGroup;
          const isMarked = p.marked?.has(g.id) ?? false;
          return (
            <g
              key={g.id}
              data-group={g.id}
              class={`sgroup${isHover ? ' hover' : ''}${isMarked ? ' marked' : ''}`}
              onPointerEnter={() => p.onHover(g.id)}
              onPointerLeave={() => p.onHover(null)}
            >
              {g.bits.map((b) => {
                const sel = p.selected?.group === g.id && p.selected.index === b.index;
                return (
                  <g key={b.index}>
                    {(isHover || isMarked || sel) && (
                      <line class={`mark${sel ? ' sel' : ''}`} x1={b.a[0]} y1={b.a[1]} x2={b.b[0]} y2={b.b[1]} stroke-width={Math.max(0.35, 2.4 * px)} />
                    )}
                    <line
                      class="hit"
                      data-stroke={`${g.id}:${b.index}`}
                      x1={b.a[0]}
                      y1={b.a[1]}
                      x2={b.b[0]}
                      y2={b.b[1]}
                      stroke-width={Math.max(1.2, 12 * px)}
                      onClick={() => {
                        if (drag.current?.moved) return;
                        p.onSelect({ group: g.id, index: b.index });
                      }}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
        {hovered && hoverLabel && (
          <text class="decoded" x={hovered.centre[0]} y={hovered.centre[1] - 14 * px} font-size={15 * px} text-anchor="middle">
            {hoverLabel}
          </text>
        )}
      </svg>
    </div>
    <div class="covertools">
      <LampDial lamp={p.lamp} onLamp={p.onLamp} />
      <div class="zoombtns" role="group" aria-label="Zoom">
        <button type="button" class="btn small" aria-label="Zoom in" onClick={() => zoomAt(1.5, size.w / 2, size.h / 2)}>+</button>
        <button type="button" class="btn small" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)}>-</button>
        <button type="button" class="btn small" onClick={() => setView(fit(p.model, size.w, size.h))}>Fit</button>
      </div>
      <div class="covernote">{p.children}</div>
    </div>
    </div>
  );
}
