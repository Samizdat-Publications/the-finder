// The cover's picture diagrams (group #pictures of the rebuilt cover.svg) as their own small plate for the
// shared cover viewer: the waveform with its sync pulses and line time, the scan with its staggered
// interlace, the raster with its 512, the calibration circle. The group is cut out of the cover and moved
// to the middle of a square just large enough that the viewer's round plate holds it whole, like a loupe.
// Pure: no DOM.

import { parseCoverSvg, type CoverModel, type Pt } from '../shared/coverSvg';

/** The text of the element `<g id="<id>" ...>...</g>`, nested groups included. */
export function groupText(svg: string, id: string): string {
  const start = svg.indexOf(`<g id="${id}"`);
  if (start < 0) throw new Error(`cover.svg: no group #${id}`);
  const re = /<g\b[^>]*?(\/?)>|<\/g>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    if (m[0] === '</g>') depth--;
    else if (m[1] !== '/') depth++;
    if (depth === 0) return svg.slice(start, m.index + m[0].length);
  }
  throw new Error(`cover.svg: group #${id} is not closed`);
}

/** The pictures group as a plate of its own, mm, with every stroke and string kept. */
export function picturesPlate(svg: string): CoverModel {
  const inner = groupText(svg, 'pictures');
  const full = parseCoverSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304.8 304.8">${inner}</svg>`);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number, r = 0): void => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const d of full.drawables) {
    if (d.kind === 'poly') for (const p of d.pts) take(p[0], p[1]);
    else take(d.cx, d.cy, d.r);
  }
  // the viewer clips to the inscribed disc: the box's diagonal, plus a margin, is the plate's size
  const size = Math.hypot(x1 - x0, y1 - y0) * 1.04;
  const dx = size / 2 - (x0 + x1) / 2;
  const dy = size / 2 - (y0 + y1) / 2;
  const mv = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  return {
    size,
    drawables: full.drawables.map((d) => (d.kind === 'poly' ? { ...d, pts: d.pts.map(mv) } : { ...d, cx: d.cx + dx, cy: d.cy + dy })),
    groups: full.groups.map((g) => ({ ...g, centre: mv(g.centre), bits: g.bits.map((b) => ({ ...b, a: mv(b.a), b: mv(b.b) })) })),
  };
}
