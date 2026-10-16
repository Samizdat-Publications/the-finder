// The moments' comparisons (M5 step 0c): with the human gloss off a moment may show one comparison in the
// alien's own units, built only from the confirmed result's own readings and message quantities (never new
// science), and never in SI.
import { describe, expect, it } from 'vitest';
import type { Attempt } from '../game/deductions';
import { MOMENTS } from './moments';
import { q } from '../ui/message';

const attempt = (over: Partial<Attempt>): Attempt => ({ answer: null, ok: true, result: [], message: '', ...over }) as Attempt;

describe('moments: plain labels and comparisons in the alien\'s units', () => {
  it("the trail's origin moment is labelled in plain English", () => {
    expect(MOMENTS['trail.origin'].label).toBe('distance behind it');
  });

  it('the origin region moment compares the region\'s two sizes, from the message', () => {
    const a = attempt({ message: `The map was drawn from a region, not a point: ${q('length', 9.3e17, 2)} by ${q('length', 4.2e17, 2)} (95%), and 1007 stars lay inside it.` });
    const c = MOMENTS['map.region'].compare?.(a) ?? [];
    expect(c).toHaveLength(1);
    expect(c[0]?.text).toBe('6.8 × 10¹⁷ reaches by 3.1 × 10¹⁷ reaches');
    expect(c[0]?.text).not.toMatch(/\bpc\b/);
  });

  it("the trail's origin moment compares the measured angle with its cut, from the readings", () => {
    const a = attempt({ result: [{ key: 'measured angle from straight away', value: '0.51 deg' }, { key: '95% cut for a star it flew from', value: '0.57 deg' }] });
    expect(MOMENTS['trail.origin'].compare?.(a)).toEqual([{ label: 'its angle off straight away', text: '0.51 deg, against a cut of 0.57 deg' }]);
    expect(MOMENTS['trail.origin'].compare?.(attempt({}))).toEqual([]);
  });

  it("the map's age moment compares the machine's travel time, the fourth quantity of the confirmed message", () => {
    const a = attempt({ message: `the map was made ${q('time', 5e10)} ago (95%: ${q('time', 4e10)} to ${q('time', 6e10)}). And the machine has travelled ${q('time', 4.9e10)} (95%: ${q('time', 4e10)} to ${q('time', 6e10)}).` });
    const c = MOMENTS['trail.when'].compare?.(a) ?? [];
    expect(c[0]?.label).toBe('the machine has travelled for');
    expect(c[0]?.text).toMatch(/beats$/);
    expect(MOMENTS['trail.when'].compare?.(attempt({ message: 'no quantities' }))).toEqual([]);
  });
});
