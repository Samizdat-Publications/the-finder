// The pixel size of a box, kept current by a ResizeObserver, so a picture can draw its viewBox at the box's own
// size (text in the picture stays at its stated pixel size on a phone and on a wide screen alike).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

export function useBox<T extends HTMLElement>(fallback: { w: number; h: number }): [RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
