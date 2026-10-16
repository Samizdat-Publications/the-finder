// The notebook of deductions beside a chapter's instrument: whether it is open, and the one rule for
// revealing something inside it without ever scrolling the page (the page does not scroll on a wide screen;
// only the notebook's own column does).

import { signal } from '@preact/signals';

/** A screen at least this wide opens the notebook beside the instrument by default; a narrower one starts with it closed. */
export const NOTEBOOK_WIDE_PX = 1400;

const wide = (): boolean => typeof window !== 'undefined' && window.matchMedia(`(min-width: ${NOTEBOOK_WIDE_PX}px)`).matches;

export const notebookOpen = signal<boolean>(wide());

/** The nearest ancestor that scrolls vertically on its own, if any (the notebook column on a wide screen). */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Bring an element into view inside its own scrolling column; on a small screen, where the page itself flows, scroll the page. */
export function revealInside(el: HTMLElement): void {
  const box = scroller(el);
  if (box) {
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  } else if (!window.matchMedia('(min-width: 1000px) and (min-height: 620px)').matches) {
    el.scrollIntoView({ block: 'center' });
  }
}

/**
 * In a column of panels (an instrument's own notebook), scroll that column so the first open panel is in
 * view, with the panel just before it (the one that was just confirmed) kept at the top so its result stays
 * on screen. Only the column scrolls; never the page.
 */
export function alignOpenPanel(col: HTMLElement): void {
  const open = col.querySelector<HTMLElement>('[data-panel][data-status="open"]');
  if (!open) return;
  const prev = open.previousElementSibling instanceof HTMLElement ? open.previousElementSibling : null;
  // Keep the panel just confirmed above it only when both fit in the column; otherwise the open panel comes first.
  const target = prev && prev.offsetHeight + open.offsetHeight + 16 <= col.clientHeight ? prev : open;
  col.scrollTop = Math.max(0, target.getBoundingClientRect().top - col.getBoundingClientRect().top + col.scrollTop - 4);
}
