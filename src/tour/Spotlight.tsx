// The spotlight: while a do or watch stop is unfinished, a glowing ring around the control the stop is about
// (the first visible match among TARGETS[stop.id]). It is a fixed, click-through box; its place is refreshed
// on a 250 ms timer, on scroll and on resize (the Claude Browser pane pauses requestAnimationFrame, so the
// timer is the one that counts). "Show me where" scrolls the target to the middle of its column and flashes
// the ring.

import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { confirmedSet, game } from '../game/state';
import { TARGETS } from './actions';
import { STOPS } from './script';

/** Bumped by showWhere(); the ring flashes each time it changes. */
const flashTick = signal(0);

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The element's box clipped by every ancestor that clips, and by the window; null when none of it can be seen. */
function visibleBox(el: HTMLElement): Box | null {
  if (!el.isConnected || el.closest('[hidden]')) return null;
  if (getComputedStyle(el).visibility === 'hidden') return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  let left = r.left;
  let top = r.top;
  let right = r.right;
  let bottom = r.bottom;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.display === 'none') return null;
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const c = p.getBoundingClientRect();
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, window.innerWidth);
  bottom = Math.min(bottom, window.innerHeight);
  return right - left < 1 || bottom - top < 1 ? null : { left, top, width: right - left, height: bottom - top };
}

/** The first element matching one of the stop's selectors that is visible, or null. */
export function findTarget(stopId: string): HTMLElement | null {
  for (const sel of TARGETS[stopId] ?? []) {
    let list: NodeListOf<HTMLElement>;
    try {
      list = document.querySelectorAll<HTMLElement>(sel);
    } catch {
      continue; // a selector the browser rejects is skipped
    }
    for (const el of list) if (visibleBox(el)) return el;
  }
  return null;
}

/** Scroll the element to the middle of each column that scrolls on its own (never an overflow-hidden box, which would shift the layout). */
function centre(el: HTMLElement, smooth: boolean): void {
  const scrollers: HTMLElement[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) scrollers.push(p);
  }
  const behavior: ScrollBehavior = smooth && scrollers.length <= 1 ? 'smooth' : 'auto';
  for (const box of scrollers) {
    const er = el.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    box.scrollTo({ top: box.scrollTop + (er.top + er.height / 2) - (br.top + br.height / 2), behavior });
  }
  const page = document.scrollingElement;
  if (page && page.scrollHeight > page.clientHeight && getComputedStyle(document.body).overflowY !== 'hidden') {
    const er = el.getBoundingClientRect();
    window.scrollBy({ top: er.top + er.height / 2 - window.innerHeight / 2, behavior });
  }
}

/** "Show me where": bring the stop's control into view and flash the ring twice. */
export function showWhere(stopId: string): void {
  const el = findTarget(stopId);
  if (el) centre(el, !game.settings.value.reducedMotion);
  flashTick.value += 1;
}

/**
 * One obvious control per step (M7 step 3, the V1 critic's "instrument screens overloaded"): while a stop is
 * unfinished, what holds neither its control nor its answer dims (CSS `[data-tour-dim]`; hover or focus brings it
 * back), level by level from the workbench's instrument down to the control: at each, the parts beside the one
 * that holds it (a level is the children of the first box with more than one; at most four levels), and beside the
 * control itself only the other controls. Anything that is or holds a canvas (the scene, a chart, a decoded picture)
 * never dims. Returns what to dim; the spotlight recomputes it on every refresh, since a chart or a Propose button
 * can appear after the stop opens (the M7 QA audit found both dimmed).
 */
const CONTROLS = 'button, input, select, textarea, [role="slider"], [role="radio"]';

function dimAround(target: HTMLElement, node: string | undefined): HTMLElement[] {
  const root = target.closest<HTMLElement>('.bench-main') ?? target.closest<HTMLElement>('[data-instrument]');
  if (!root) return [];
  const answer = node ? `[data-propose-button="${node}"], [data-propose="${node}"], [data-answer="${node}"]` : null;
  const shown = (c: Element): c is HTMLElement => c instanceof HTMLElement && c.getClientRects().length > 0;
  const keep = (p: HTMLElement): boolean =>
    p.contains(target) || target.contains(p) || (answer !== null && (p.matches(answer) || p.querySelector(answer) !== null)) || p.tagName === 'CANVAS' || p.querySelector('canvas') !== null;
  const dim: HTMLElement[] = [];
  let box: HTMLElement = root;
  for (let depth = 0; depth < 4; depth++) {
    while ([...box.children].filter(shown).length === 1) box = [...box.children].find(shown)!;
    const parts = [...box.children].filter(shown);
    const holder = parts.find((p) => p.contains(target));
    if (parts.length < 2 || !holder) break;
    // Beside the control itself only the other controls dim; its readouts and labels stay lit.
    const control = (p: HTMLElement): boolean => p.matches(CONTROLS) || p.querySelector(CONTROLS) !== null;
    dim.push(...parts.filter((p) => !keep(p) && (holder !== target || control(p))));
    if (holder === target) break;
    box = holder;
  }
  return dim;
}

const same = (a: Box | null, b: Box | null): boolean =>
  a === b || (a !== null && b !== null && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

const PAD = 6;

export function Spotlight() {
  const tour = game.tour.value;
  const stop = STOPS[tour.step];
  const confirmed = confirmedSet.value;
  const active = tour.on && stop !== undefined && stop.kind !== 'story' && (stop.node === undefined || !confirmed.has(stop.node));
  const stopId = active ? stop.id : null;
  const [box, setBox] = useState<Box | null>(null);
  const [flash, setFlash] = useState(false);
  const tick = flashTick.value;

  useEffect(() => {
    if (stopId === null) {
      setBox(null);
      return;
    }
    let dimmed = new Set<HTMLElement>();
    const setDim = (next: Set<HTMLElement>): void => {
      for (const p of dimmed) if (!next.has(p)) p.removeAttribute('data-tour-dim');
      for (const p of next) if (!dimmed.has(p)) p.setAttribute('data-tour-dim', '');
      dimmed = next;
    };
    let centred = false;
    const update = (): void => {
      const el = findTarget(stopId);
      const next = el ? visibleBox(el) : null;
      setBox((prev) => (same(prev, next) ? prev : next));
      setDim(new Set(el ? dimAround(el, stop?.node) : []));
      // The first time the control shows on this stop, bring it into view if part of it is scrolled away.
      if (el && next && !centred) {
        centred = true;
        const r = el.getBoundingClientRect();
        if (next.height < Math.min(r.height, window.innerHeight) - 2) centre(el, !game.settings.value.reducedMotion);
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    // A panel that mounts between two timer ticks (a stage switch, a scene that finishes loading) is dimmed in the
    // next frame rather than up to 250 ms later.
    let raf = 0;
    const soon = (): void => {
      if (raf === 0) raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    const watch = new MutationObserver(soon);
    const area = document.querySelector('.bench-area') ?? document.body;
    watch.observe(area, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      setDim(new Set());
    };
  }, [stopId]);

  useEffect(() => {
    if (tick === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [tick]);

  if (!active || !box) return null;
  return (
    <div
      class={`spotlight${flash ? ' flash' : ''}${game.settings.value.reducedMotion ? ' still' : ''}`}
      data-spotlight={stopId}
      aria-hidden="true"
      style={{ left: `${box.left - PAD}px`, top: `${box.top - PAD}px`, width: `${box.width + 2 * PAD}px`, height: `${box.height + 2 * PAD}px` }}
    />
  );
}
