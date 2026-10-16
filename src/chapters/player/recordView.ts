// The cover's record drawings (#record: the plan view with the turn time around it and the cartridge at the
// rim, the side view with the playing time), cut out of the rebuilt cover as a square window so the shared
// cover viewer shows them filling its plate. Pure: no DOM. The window is placed from the strokes of the
// record.* groups themselves, not typed in.

import type { BinaryGroup, CoverModel, Drawable, Pt } from '../shared/coverSvg';

/** Margin around the record drawings' strokes, mm (design choice: room for the plan view's disc outline). */
const MARGIN_MM = 12;

export interface Window {
  x0: number;
  y0: number;
  size: number;
}

/** The square window around every stroke of the record.* binary groups, with a margin. */
export function recordWindow(model: CoverModel): Window {
  const pts = model.groups.filter((g) => g.id.startsWith('record.')).flatMap((g) => g.bits.flatMap((b) => [b.a, b.b]));
  if (pts.length === 0) throw new Error('player: the cover has no record.* strings');
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0) + 2 * MARGIN_MM;
  return { x0: (x0 + x1) / 2 - size / 2, y0: (y0 + y1) / 2 - size / 2, size };
}

const shift = (p: Pt, w: Window): Pt => [p[0] - w.x0, p[1] - w.y0];

function bbox(d: Drawable): [number, number, number, number] {
  if (d.kind === 'circle') return [d.cx - d.r, d.cy - d.r, d.cx + d.r, d.cy + d.r];
  const xs = d.pts.map((p) => p[0]);
  const ys = d.pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The cover model seen through the window: drawables and groups that touch it, moved so the window starts at 0. */
export function cropModel(model: CoverModel, w: Window): CoverModel {
  const touches = (b: [number, number, number, number]): boolean => b[2] >= w.x0 && b[0] <= w.x0 + w.size && b[3] >= w.y0 && b[1] <= w.y0 + w.size;
  const drawables: Drawable[] = model.drawables.filter((d) => touches(bbox(d))).map((d) =>
    d.kind === 'circle' ? { ...d, cx: d.cx - w.x0, cy: d.cy - w.y0 } : { ...d, pts: d.pts.map((p) => shift(p, w)) },
  );
  const groups: BinaryGroup[] = model.groups
    .filter((g) => touches([g.centre[0], g.centre[1], g.centre[0], g.centre[1]]))
    .map((g) => ({ ...g, centre: shift(g.centre, w), bits: g.bits.map((b) => ({ ...b, a: shift(b.a, w), b: shift(b.b, w) })) }));
  return { size: w.size, drawables, groups };
}
