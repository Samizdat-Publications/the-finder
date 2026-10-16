// The tour's hands (D-A33, docs/plans/tour_specs/T2-actions.md): small DOM helpers for "Do it for me". They work
// the instruments the way a player does, through the real controls (a click on the button, a value set on the
// slider with its own input or change event, a key pressed on the dial, a pointer pressed on a chart) and the
// command bus the interface itself sends (rule 5). They never write game state. Waits poll on a timer (50 to
// 100 ms), not requestAnimationFrame, because a hidden tab or the Claude Browser pane pauses animation frames.

import { dispatch } from '../game/bus';
import type { Answer } from '../game/deductions';
import type { ChapterView } from '../game/graph';
import { confirmedSet, game } from '../game/state';
import { MOMENT_IDS, activeMoment } from '../ui/momentState';

/** How often a wait looks again, ms (the spec asks for 50 to 100 ms). */
const POLL_MS = 80;

export const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

type Probe<T> = string | (() => T | null | undefined | false);

/**
 * Wait until a selector matches (resolves with the element) or a predicate returns something truthy (resolves
 * with it). Rejects with a readable Error naming `what` after `timeoutMs`.
 */
export function waitFor<T = Element>(probe: Probe<T>, timeoutMs: number, what?: string): Promise<T> {
  const test = (): T | null => {
    if (typeof probe === 'string') return (document.querySelector(probe) as T | null) ?? null;
    const v = probe();
    return v ? (v as T) : null;
  };
  return new Promise<T>((resolve, reject) => {
    const t0 = Date.now();
    const tick = (): boolean => {
      let v: T | null = null;
      try {
        v = test();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return true;
      }
      if (v) {
        resolve(v);
        return true;
      }
      if (Date.now() - t0 > timeoutMs) {
        const label = what ?? (typeof probe === 'string' ? probe : 'the instrument');
        reject(new Error(`Waited ${Math.round(timeoutMs / 1000)} s for ${label}, and it did not come.`));
        return true;
      }
      return false;
    };
    if (tick()) return;
    const id = window.setInterval(() => {
      if (tick()) window.clearInterval(id);
    }, POLL_MS);
  });
}

/** The first element matching the selector that is rendered (a non-zero box), or null. */
export function visible<E extends Element = HTMLElement>(sel: string): E | null {
  for (const el of document.querySelectorAll<E>(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Wait for a rendered match of the selector. */
export function waitVisible<E extends Element = HTMLElement>(sel: string, timeoutMs: number, what?: string): Promise<E> {
  return waitFor(() => visible<E>(sel), timeoutMs, what ?? sel);
}

/** Wait for a rendered, enabled button (or input) matching the selector. */
export function waitEnabled<E extends HTMLElement = HTMLButtonElement>(sel: string, timeoutMs: number, what?: string): Promise<E> {
  return waitFor(() => {
    for (const el of document.querySelectorAll<E>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !(el as unknown as HTMLButtonElement).disabled && !el.closest('fieldset[disabled]')) return el;
    }
    return null;
  }, timeoutMs, what ?? sel);
}

/**
 * Bring an element into view in each column that scrolls on its own (as the spotlight's "Show me where" does),
 * so the screen shows what the guide is doing. Never scrolls an overflow-hidden box.
 */
export function reveal(el: Element): void {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) {
      const er = el.getBoundingClientRect();
      const br = p.getBoundingClientRect();
      if (er.top < br.top || er.bottom > br.bottom) p.scrollTop += er.top + er.height / 2 - (br.top + br.height / 2);
    }
  }
}

/** Click a control the way a hand does (reveal it first). */
export function click(el: Element): void {
  reveal(el);
  if (el instanceof HTMLElement) el.click();
  else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

/** Wait for an enabled match of the selector, then click it. */
export async function press(sel: string, timeoutMs = 15_000, what?: string): Promise<HTMLElement> {
  const el = await waitEnabled<HTMLElement>(sel, timeoutMs, what);
  click(el);
  return el;
}

/** Set an input's value through the native setter and fire the event its handler listens for. */
export function setValue(el: HTMLInputElement | HTMLSelectElement, value: string | number, event: 'input' | 'change' = 'input'): void {
  reveal(el);
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, String(value));
  else el.value = String(value);
  el.dispatchEvent(new Event(event, { bubbles: true }));
}

/** Press a key on a focused control (keydown, then keyup). */
export function key(el: Element, k: string, opts: { shift?: boolean } = {}): void {
  if (el instanceof HTMLElement || el instanceof SVGElement) el.focus({ preventScroll: true });
  const init: KeyboardEventInit = { key: k, bubbles: true, cancelable: true, shiftKey: opts.shift === true };
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
}

/**
 * A pointer event at a point on the screen. pointerId 1 is the mouse's own id in Chromium (always an active
 * pointer), so an instrument that captures the pointer on pointerdown accepts it.
 */
export function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, held: boolean): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: type === 'pointermove' ? -1 : 0,
      buttons: held ? 1 : 0,
    }),
  );
}

/** Let go of any pointer capture a synthetic press left on the element, so the player's own mouse is free. */
function release(el: Element): void {
  try {
    if (el.hasPointerCapture(1)) el.releasePointerCapture(1);
  } catch {
    // nothing captured
  }
}

/** A tap (press and release without moving) at a screen point, as a click on a chart. */
export function tap(el: Element, x: number, y: number): void {
  reveal(el);
  pointer(el, 'pointerdown', x, y, true);
  pointer(el, 'pointerup', x, y, false);
  release(el);
}

/** A drag from one screen point to another, in a few steps. */
export async function drag(el: Element, from: [number, number], to: [number, number], steps = 6): Promise<void> {
  reveal(el);
  pointer(el, 'pointerdown', from[0], from[1], true);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    pointer(el, 'pointermove', from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, true);
    await sleep(16);
  }
  pointer(el, 'pointerup', to[0], to[1], false);
  release(el);
}

/** A mouse click at a screen point (for charts that listen for click). */
export function clickAt(el: Element, x: number, y: number): void {
  reveal(el);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
}

/** A point given in an SVG's viewBox units, on the screen (the same mapping the charts use: the box scaled to the viewBox). */
export function viewBoxToScreen(svg: SVGSVGElement, vx: number, vy: number): [number, number] {
  const b = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return [b.left + ((vx - vb.x) / vb.width) * b.width, b.top + ((vy - vb.y) / vb.height) * b.height];
}

/** The centre of an element's box on the screen. */
export function centreOf(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

// ---- the game, read through its signals; changed only through the bus ----

export const isConfirmed = (node: string): boolean => confirmedSet.value.has(node);

const attemptCount = (node: string): number => game.records.value[node]?.attempts.length ?? 0;

/** Make sure the chapter is on the stage (the interface's own command), then let it draw. */
export async function ensureChapter(chapter: ChapterView): Promise<void> {
  if (game.chapter.value !== chapter) await dispatch({ type: 'chapter.enter', chapter });
  if (game.codexOpen.value) await dispatch({ type: 'codex.close' });
  await sleep(50);
}

/**
 * Propose through `act` (a click on the instrument's own Propose button, or a bus command) and wait for the
 * verdict. Resolves once `node` is confirmed; rejects with the checker's message if it was refused, or with the
 * bus's reason if the proposal never reached a checker.
 */
export async function proposeAndConfirm(node: string, act: () => void | Promise<void>, timeoutMs = 60_000): Promise<void> {
  if (isConfirmed(node)) return;
  const before = attemptCount(node);
  game.error.value = null;
  await act();
  await waitFor(
    () => {
      if (isConfirmed(node)) return true;
      const a = game.records.value[node]?.attempts ?? [];
      if (a.length > before && a[a.length - 1]?.ok === false) throw new RefusedError(a[a.length - 1]?.message ?? '');
      return false;
    },
    timeoutMs,
    `the verdict on ${node}${game.error.value ? ` (${game.error.value})` : ''}`,
  ).catch((e: unknown) => {
    throw e instanceof RefusedError ? new Error(`The answer was not accepted: ${e.message}`) : e;
  });
}

class RefusedError extends Error {}

/** Click the instrument's own Propose button for a node and wait until it is confirmed. */
export function proposeWith(node: string, sel = `[data-propose-button="${node}"]`, timeoutMs = 60_000): Promise<void> {
  return proposeAndConfirm(node, async () => {
    await press(sel, 20_000, `the Propose button for ${node}`);
  }, timeoutMs);
}

/** Propose through the bus (the command the Propose button itself sends), for controls a script cannot work in-page. */
export function proposeOnBus(node: string, answer: Answer, timeoutMs = 60_000): Promise<void> {
  return proposeAndConfirm(node, () => dispatch({ type: 'deduction.propose', id: node, answer }).catch(() => undefined), timeoutMs);
}

/**
 * Skip the staged moments a confirmation starts (each with its own Continue button, as a player would). The
 * moment begins in the same tick as the confirmation (src/ui/momentState.ts), so a short wait is enough.
 */
export async function skipMoments(waitMs = 3000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs || activeMoment.value) {
    const a = activeMoment.value;
    if (a) {
      const btn = await waitFor(() => document.querySelector<HTMLButtonElement>('[data-moment-skip]'), 5000, 'the moment\'s Continue button');
      btn.click();
      await waitFor(() => activeMoment.value?.n !== a.n, 5000, 'the moment to close');
      continue;
    }
    await sleep(POLL_MS);
  }
}

/** Run an action unless its node is already confirmed; then skip any moment it started. */
export async function finish(node: string, run: () => Promise<void>): Promise<void> {
  if (!isConfirmed(node)) await run();
  if (!isConfirmed(node)) throw new Error(`${node} is not confirmed yet.`);
  await skipMoments((MOMENT_IDS as readonly string[]).includes(node) ? 3000 : 0);
}
