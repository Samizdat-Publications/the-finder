// The tour's actions table (docs/plans/tour_specs/T2-actions.md): every do or watch stop in the script has a
// "Do it for me" and something for the spotlight to ring, and every selector is well formed. No DOM here; the
// actions themselves are played by tests/browser/tour.browser.mjs.

import { describe, expect, it } from 'vitest';
import { SHOW_ME, TARGETS } from './actions';
import { STOPS } from './script';

const acting = STOPS.filter((s) => s.kind === 'do' || s.kind === 'watch');

/** A light well-formedness check for a CSS selector: balanced brackets, parentheses and quotes, no empty list item. */
function wellFormed(sel: string): boolean {
  if (!sel.trim()) return false;
  let quote: string | null = null;
  const stack: string[] = [];
  for (const ch of sel) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '(') stack.push(ch);
    else if (ch === ']' && stack.pop() !== '[') return false;
    else if (ch === ')' && stack.pop() !== '(') return false;
  }
  if (quote || stack.length) return false;
  return sel.split(',').every((part) => part.trim().length > 0) && !/[>+~]\s*$/.test(sel.trim());
}

describe('tour actions', () => {
  it('the script has do and watch stops (43 deductions)', () => {
    expect(acting.length).toBe(43);
  });

  it('every do or watch stop has a Do it for me action', () => {
    const missing = acting.filter((s) => typeof SHOW_ME[s.id] !== 'function').map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('every action belongs to a stop (no stale entries)', () => {
    const ids = new Set(acting.map((s) => s.id));
    expect(Object.keys(SHOW_ME).filter((id) => !ids.has(id))).toEqual([]);
    expect(Object.keys(TARGETS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('every do or watch stop has 1 to 3 spotlight selectors', () => {
    for (const s of acting) {
      const t = TARGETS[s.id];
      expect(Array.isArray(t), s.id).toBe(true);
      expect(t!.length, s.id).toBeGreaterThanOrEqual(1);
      expect(t!.length, s.id).toBeLessThanOrEqual(3);
    }
  });

  it('every selector is a well-formed, non-empty string', () => {
    const bad = Object.entries(TARGETS).flatMap(([id, sels]) => sels.filter((x) => typeof x !== 'string' || !wellFormed(x)).map((x) => `${id}: ${x}`));
    expect(bad).toEqual([]);
  });

  it('the stop ids are the deduction ids they finish', () => {
    for (const s of acting) expect(s.node, s.id).toBe(s.id);
  });

  it('the well-formedness check rejects broken selectors', () => {
    expect(wellFormed('[data-x="a"')).toBe(false);
    expect(wellFormed(':has(a')).toBe(false);
    expect(wellFormed('a, ')).toBe(false);
    expect(wellFormed('')).toBe(false);
    expect(wellFormed('a >')).toBe(false);
    expect(wellFormed('.prow:has(> button[data-lift][disabled]) > button[data-drop]')).toBe(true);
  });
});
