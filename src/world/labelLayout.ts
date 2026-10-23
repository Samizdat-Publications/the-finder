// A simple screen-space declutter for the charts' labels (M4 step 7e, from the blind critic and the QA audit:
// labels sat on each other and on bright points, "the craft" over "Gl 445 (home)"). Labels are placed in
// priority order; each tries its anchors in turn (right of its point, above, below, left...) and takes the
// first whose box overlaps no label already placed and no bright point; a label that fits nowhere is dropped,
// unless it must be kept (the home star, the Galactic centre), which then takes its first anchor. Pure: screen
// pixels in, placements out; chartControls.ts applies them to the sprites every frame.

/** An anchor: where the label's box sits relative to its point, as three.js's Sprite.center (0..1, y up). */
export type Anchor = readonly [number, number];

/** Right of the point, then above right, below right, left, above left, below left. */
export const DEFAULT_ANCHORS: readonly Anchor[] = [[0, 0.5], [0, -0.15], [0, 1.15], [1, 0.5], [1, -0.15], [1, 1.15]];

export interface LabelBox {
  id: number;
  /** The label's point on screen, CSS px (y down). */
  x: number;
  y: number;
  /** Box size, CSS px. */
  w: number;
  h: number;
  priority: number;
  keep: boolean;
  anchors: readonly Anchor[];
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The label's screen box for an anchor (a Sprite with center (cx, cy) spans -cx..1-cx across, -cy..1-cy up). */
export function boxAt(l: Pick<LabelBox, 'x' | 'y' | 'w' | 'h'>, a: Anchor): Rect {
  const left = l.x - a[0] * l.w;
  const top = l.y - (1 - a[1]) * l.h;
  return { left, top, right: left + l.w, bottom: top + l.h };
}

const PAD = 2;

function hitsRect(a: Rect, b: Rect): boolean {
  return a.left < b.right + PAD && b.left < a.right + PAD && a.top < b.bottom + PAD && b.top < a.bottom + PAD;
}

function hitsCircle(r: Rect, o: Obstacle): boolean {
  const dx = Math.max(r.left - o.x, 0, o.x - r.right);
  const dy = Math.max(r.top - o.y, 0, o.y - r.bottom);
  return dx * dx + dy * dy < o.r * o.r;
}

/** True when the box lies inside a w by h screen (M7 step 1: labels were cut off at the chart's edge). */
function inside(r: Rect, bounds: { w: number; h: number } | undefined): boolean {
  return !bounds || (r.left >= 0 && r.top >= 0 && r.right <= bounds.w && r.bottom <= bounds.h);
}

/**
 * Place the labels. Returns, per label id, the anchor it takes, or null when it is dropped. A bright point at
 * a label's own point does not count against it (a label always sits beside its own point). With bounds (the
 * chart's size, CSS px), an anchor whose box would leave the chart is not taken; a kept label that fits
 * nowhere takes its first anchor inside the chart, else its first.
 */
export function layoutLabels(labels: readonly LabelBox[], obstacles: readonly Obstacle[], bounds?: { w: number; h: number }): Map<number, Anchor | null> {
  const order = [...labels].sort((a, b) => Number(b.keep) - Number(a.keep) || b.priority - a.priority || a.id - b.id);
  const placed: Rect[] = [];
  const out = new Map<number, Anchor | null>();
  for (const l of order) {
    const own = obstacles.filter((o) => Math.hypot(o.x - l.x, o.y - l.y) > 1.5);
    let chosen: Anchor | null = null;
    for (const a of l.anchors) {
      const r = boxAt(l, a);
      if (!inside(r, bounds) || placed.some((p) => hitsRect(p, r)) || own.some((o) => hitsCircle(r, o))) continue;
      chosen = a;
      break;
    }
    if (!chosen && l.keep) chosen = l.anchors.find((a) => inside(boxAt(l, a), bounds)) ?? l.anchors[0] ?? null;
    if (chosen) placed.push(boxAt(l, chosen));
    out.set(l.id, chosen);
  }
  return out;
}
