// The charts' label declutter (M4 step 7e): two labels on nearly the same point no longer overlap (one moves to
// another anchor), a label avoids a bright point, a label that fits nowhere is dropped, and a label that must
// be kept (the home star, the Galactic centre) always stays.
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANCHORS, boxAt, layoutLabels, type LabelBox } from './labelLayout';

const label = (id: number, x: number, y: number, extra: Partial<LabelBox> = {}): LabelBox => ({ id, x, y, w: 90, h: 18, priority: 1, keep: false, anchors: DEFAULT_ANCHORS, ...extra });
const overlap = (a: ReturnType<typeof boxAt>, b: ReturnType<typeof boxAt>): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('label declutter', () => {
  it('moves the lower-priority of two labels on nearly the same point to a free anchor', () => {
    const home = label(1, 200, 200, { keep: true, priority: 10 });
    const craft = label(2, 203, 188, { priority: 5 });
    const p = layoutLabels([craft, home], []);
    const a = p.get(1);
    const b = p.get(2);
    expect(a).toEqual(DEFAULT_ANCHORS[0]);
    expect(b).not.toBeNull();
    expect(b).not.toEqual(DEFAULT_ANCHORS[0]);
    expect(overlap(boxAt(home, a!), boxAt(craft, b!))).toBe(false);
  });

  it("keeps the Trail chart's craft and home labels apart when their points nearly coincide (one above, one below)", () => {
    const home = label(1, 200, 200, { keep: true, priority: 9, anchors: [[0, 1.15], [1, 1.15], [0, 0.5]] });
    const craft = label(2, 202, 199, { keep: true, priority: 8, anchors: [[0, -0.15], [1, -0.15], [0, 0.5]] });
    const p = layoutLabels([home, craft], []);
    expect(overlap(boxAt(home, p.get(1)!), boxAt(craft, p.get(2)!))).toBe(false);
  });

  it('avoids a bright point beside the label, and keeps the kept label even when crowded', () => {
    const l = label(1, 100, 100);
    // A bright point right where the default anchor's box would sit.
    const p = layoutLabels([l], [{ x: 140, y: 100, r: 8 }]);
    expect(p.get(1)).not.toEqual(DEFAULT_ANCHORS[0]);
    // Surrounded on every side: an ordinary label is dropped, a kept one stays at its first anchor.
    const walls = DEFAULT_ANCHORS.map((a) => boxAt(l, a)).map((r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, r: 6 }));
    expect(layoutLabels([l], walls).get(1)).toBeNull();
    expect(layoutLabels([{ ...l, keep: true }], walls).get(1)).toEqual(DEFAULT_ANCHORS[0]);
  });

  it('does not count a bright point at the label\'s own point', () => {
    expect(layoutLabels([label(1, 50, 50)], [{ x: 50, y: 50, r: 10 }]).get(1)).toEqual(DEFAULT_ANCHORS[0]);
  });
});
