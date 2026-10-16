// Small helpers shared by The Map's plots: an element's size in CSS pixels (so SVG text is drawn at its real
// size, never scaled under the 13 px clue size), a linear scale, and the time axis in the alien's unit.

import { useEffect, useRef, useState } from 'preact/hooks';
import { JULIAN_YEAR_S } from '../../science/units';
import { BEAT_S, quantity, superscript, toAlien, type Dim } from '../../ui/units';

export function useSize<T extends Element>(): [preact.RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export type Scale = ((v: number) => number) & { inv: (px: number) => number };

export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.inv = (px: number) => d0 + (px - r0) / k;
  return f;
}

/** Years as beats (the alien's unit of time). */
export const yearsToBeats = (y: number): number => (y * JULIAN_YEAR_S) / BEAT_S;

/** Ticks for an axis in years, labelled in beats at round multiples of a power of ten. */
export function beatTicks(yLo: number, yHi: number, maxTicks = 7): { years: number; label: string }[] {
  const bLo = yearsToBeats(yLo);
  const bHi = yearsToBeats(yHi);
  const span = Math.abs(bHi - bLo);
  const e = Math.floor(Math.log10(span / maxTicks));
  const steps = [1, 2, 5, 10].map((k) => k * 10 ** e);
  const step = steps.find((s) => span / s <= maxTicks) ?? steps[3]!;
  const p = Math.floor(Math.log10(step));
  const out: { years: number; label: string }[] = [];
  for (let b = Math.ceil(Math.min(bLo, bHi) / step) * step; b <= Math.max(bLo, bHi) + 1e-9 * step; b += step) {
    const m = Math.round(b / 10 ** p);
    out.push({ years: (b * BEAT_S) / JULIAN_YEAR_S, label: m === 0 ? '0' : `${m}×10${superscript(p)}` });
  }
  return out;
}

/** A quantity in the alien's unit with its unit in the plural when it is not exactly one ("0.45 beats", "1 beat", "71,200 reaches per beat"), SI in parentheses with the human gloss. */
export function qty(dim: Dim, si: number, gloss: boolean): string {
  const q = quantity(dim, si);
  const one = Math.abs(toAlien(dim, si)) === 1;
  const [first, ...rest] = q.unitKey.split(' ');
  const unit = one ? q.unitKey : [/(ch|sh|s|x)$/.test(first as string) ? `${first}es` : `${first}s`, ...rest].join(' ');
  return `${q.number} ${unit}${gloss ? ` (${q.si})` : ''}`;
}
