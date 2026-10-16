// The tour script's rails: unique ids, every deduction once and after what it needs, nothing missing from the
// text, the parts in order, no em dash. The script grows while the tour is written; these checks hold at every size.
import { describe, expect, it } from 'vitest';
import { CHAPTERS, NODES, chapterDef, nodeDef } from '../game/graph';
import { PARTS, STOPS } from './script';

const EM_DASH = String.fromCharCode(0x2014);
const TEXT_FIELDS = ['title', 'look', 'todo', 'why', 'human', 'ask'] as const;

describe('the tour script', () => {
  it('has stops, and every stop id is unique', () => {
    expect(STOPS.length).toBeGreaterThan(0);
    const ids = STOPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every do or watch stop has a deduction in the game and a todo; a story stop has no deduction', () => {
    for (const s of STOPS) {
      if (s.kind === 'story') {
        expect(s.node, `${s.id}: a story stop has no node`).toBeUndefined();
        continue;
      }
      expect(s.node, `${s.id}: needs a node`).toBeTruthy();
      expect(NODES.some((n) => n.id === s.node), `${s.id}: node ${s.node} is in NODES`).toBe(true);
      expect(s.todo && s.todo.trim().length > 0, `${s.id}: needs a todo`).toBe(true);
      expect(s.id, `${s.id}: a do or watch stop is named by its deduction`).toBe(s.node);
    }
  });

  it("a do or watch stop is in its deduction's own chapter", () => {
    for (const s of STOPS) {
      if (!s.node) continue;
      expect(s.chapter, `${s.id}`).toBe(nodeDef(s.node)?.chapter);
    }
  });

  it('every stop names a chapter that exists (or the hub)', () => {
    for (const s of STOPS) expect(s.chapter === 'hub' || chapterDef(s.chapter) !== undefined, `${s.id}: chapter ${s.chapter}`).toBe(true);
    expect(CHAPTERS.length).toBeGreaterThan(0);
  });

  it('each deduction appears at most once', () => {
    const nodes = STOPS.flatMap((s) => (s.node ? [s.node] : []));
    expect(new Set(nodes).size).toBe(nodes.length);
  });

  it('every deduction a stop needs comes on an earlier stop (the rails respect the gating)', () => {
    const at = new Map(STOPS.flatMap((s, i) => (s.node ? [[s.node, i] as const] : [])));
    for (const [i, s] of STOPS.entries()) {
      if (!s.node) continue;
      for (const req of nodeDef(s.node)?.requires ?? []) {
        const j = at.get(req);
        // A requirement missing from the script altogether is caught by the completeness test below.
        if (j === undefined) continue;
        expect(j, `${s.id} needs ${req}, which must come earlier`).toBeLessThan(i);
      }
    }
  });

  it("a chapter's stops come after the deductions that open it", () => {
    const at = new Map(STOPS.flatMap((s, i) => (s.node ? [[s.node, i] as const] : [])));
    for (const [i, s] of STOPS.entries()) {
      if (s.chapter === 'hub') continue;
      for (const req of chapterDef(s.chapter)?.requires ?? []) {
        const j = at.get(req);
        if (j === undefined) continue;
        expect(j, `${s.id} is in ${s.chapter}, which opens after ${req}`).toBeLessThan(i);
      }
    }
  });

  it('has no em dash in any text field', () => {
    for (const s of STOPS) for (const f of TEXT_FIELDS) expect((s[f] ?? '').includes(EM_DASH), `${s.id}.${f}`).toBe(false);
    for (const p of PARTS) expect(p.title.includes(EM_DASH), `part ${p.id}`).toBe(false);
  });

  it('every stop has a title and a look', () => {
    for (const s of STOPS) {
      expect(s.title.trim().length, `${s.id}: title`).toBeGreaterThan(0);
      expect(s.look.trim().length, `${s.id}: look`).toBeGreaterThan(0);
    }
  });

  it("every stop's part is in PARTS, and the parts appear in PARTS order", () => {
    const order = PARTS.map((p) => p.id);
    expect(new Set(order).size).toBe(order.length);
    let last = -1;
    for (const s of STOPS) {
      const k = order.indexOf(s.part);
      expect(k, `${s.id}: part ${s.part} is in PARTS`).toBeGreaterThanOrEqual(0);
      expect(k, `${s.id}: part ${s.part} is not earlier than the stop before it`).toBeGreaterThanOrEqual(last);
      last = Math.max(last, k);
    }
  });

  // Flip to a plain `it` when the script holds every deduction (the lead's finishing step).
  it('every playable deduction (a node in a built chapter) appears in the script', () => {
    const inScript = new Set(STOPS.map((s) => s.node).filter((n): n is string => Boolean(n)));
    const missing = NODES.filter((n) => chapterDef(n.chapter)?.built && !inScript.has(n.id)).map((n) => n.id);
    expect(missing).toEqual([]);
  });
});
