// The cover's pulsar map read from the rebuilt cover (public/media/cover/cover.svg, group #map) as plain
// geometry for The Map's side view: the centre line and the 14 lines, each with its solid pieces, its
// height tick and its binary digits, in the SVG's millimetres. Pure: string parsing only, no DOM.

export interface MapPath {
  /** 'solid' | 'tick' | 'one' | 'zero' (the SVG generator's classes; drawing only). */
  kind: 'solid' | 'tick' | 'one' | 'zero';
  pts: [number, number][];
  width: number;
}

export interface CoverMapLineGeom {
  /** 0 for the Galactic-centre line, else the cover order 1 to 14. */
  order: number;
  paths: MapPath[];
  /** The farthest point of the line and its digits from the origin, mm. */
  tip: [number, number];
}

export interface CoverMapGeom {
  origin: [number, number];
  lines: CoverMapLineGeom[];
  /** Bounding box of everything drawn, mm: [minX, minY, maxX, maxY]. */
  box: [number, number, number, number];
}

const attr = (tag: string, k: string): string | null => new RegExp(`\\s${k}="([^"]*)"`).exec(tag)?.[1] ?? null;

function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

/** Parse the #map group of the cover SVG text. */
export function parseCoverMap(svg: string): CoverMapGeom {
  const start = svg.indexOf('<g id="map"');
  if (start < 0) throw new Error('cover.svg has no #map group');
  const tagRe = /<(\/?)(g|path)\b([^>]*?)(\/?)>/g;
  tagRe.lastIndex = start;
  const stack: { order: number | null }[] = [];
  const byOrder = new Map<number, MapPath[]>();
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg)) !== null) {
    const [, close, name, rest, selfClose] = m as unknown as [string, string, string, string, string];
    if (name === 'g' && close) {
      stack.pop();
      if (!stack.length) break;
      continue;
    }
    if (name === 'g') {
      const id = attr(rest, 'data-id');
      const ord = attr(rest, 'data-order');
      const parent = stack.length ? (stack[stack.length - 1] as { order: number | null }).order : null;
      stack.push({ order: ord !== null ? Number(ord) : id === 'pulsarMap.gcLine' ? 0 : parent });
      if (selfClose) stack.pop();
      continue;
    }
    const owner = stack.length ? (stack[stack.length - 1] as { order: number | null }).order : null;
    const d = attr(rest, 'd');
    if (owner === null || d === null) continue;
    const cls = attr(rest, 'class') ?? '';
    const kind: MapPath['kind'] = cls.startsWith('tick') ? 'tick' : cls.includes('one') ? 'one' : cls.includes('zero') ? 'zero' : 'solid';
    const list = byOrder.get(owner) ?? [];
    list.push({ kind, pts: points(d), width: Number(attr(rest, 'stroke-width') ?? '0.27') });
    byOrder.set(owner, list);
  }
  const gc = byOrder.get(0);
  if (!gc?.[0]?.pts[0]) throw new Error('cover.svg: the map has no centre line');
  const origin = gc[0].pts[0];
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const lines: CoverMapLineGeom[] = [...byOrder.entries()].sort((a, b) => a[0] - b[0]).map(([order, paths]) => {
    let tip = origin;
    let far = 0;
    for (const p of paths) {
      for (const q of p.pts) {
        box = [Math.min(box[0], q[0]), Math.min(box[1], q[1]), Math.max(box[2], q[0]), Math.max(box[3], q[1])];
        const r = Math.hypot(q[0] - origin[0], q[1] - origin[1]);
        if (r > far) {
          far = r;
          tip = q;
        }
      }
    }
    return { order, paths, tip };
  });
  return { origin, lines, box };
}

/** A line's drawn angle, deg counter-clockwise (SVG y points down), from the origin to its tip. */
export function drawnAngleDeg(g: CoverMapGeom, line: CoverMapLineGeom): number {
  return (Math.atan2(-(line.tip[1] - g.origin[1]), line.tip[0] - g.origin[0]) * 180) / Math.PI;
}
