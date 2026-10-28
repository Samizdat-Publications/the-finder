// The hero-control pass (2026-10-28, Stewart: "clearly understandable interfaces that aren't overly dense"): each
// instrument panel leads with its one main control. Two shared pieces keep the rest within reach but quiet:
// <Fine> folds secondary controls (step buttons, typed values, alternative views) under a small "Fine tune" line,
// and <Clamp> shows an explanation's first two lines with a "more" switch. The guided tour's spotlight opens a
// <Fine> fold when the step's control is inside it (Spotlight.tsx findTarget), so no step loses its control.

import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

/** Secondary controls, folded away until asked for. `open` starts it open (for a panel whose fine controls matter more). */
export function Fine(p: { children: ComponentChildren; label?: string; open?: boolean; class?: string }) {
  return (
    <details class={`fine ${p.class ?? ''}`} data-fine open={p.open}>
      <summary>{p.label ?? 'Fine tune'}</summary>
      <div class="fine-body">{p.children}</div>
    </details>
  );
}

/** An explanation clamped to two lines, with "more" / "less" when it is longer than that. */
export function Clamp(p: { children: ComponentChildren; class?: string; lines?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  // One observer for the paragraph's life. The measuring runs in the next frame, never inside the observer's own
  // callback: a state change there (a panel hiding its working) makes the browser report "ResizeObserver loop
  // completed with undelivered notifications", which boot.ts treats as fatal (found by builder D, 2026-10-28).
  const openRef = useRef(open);
  openRef.current = open;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = (): void => {
      raf = 0;
      if (openRef.current || !el.isConnected || el.clientHeight === 0) return;
      const next = el.scrollHeight > el.clientHeight + 1;
      setLong((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(() => {
      if (raf === 0) raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div class={`clamp-wrap ${p.class ?? ''}`}>
      <p ref={ref} class={`note small clamp${open ? ' open' : ''}`} style={{ '--clamp-lines': String(p.lines ?? 2) }}>
        {p.children}
      </p>
      {(long || open) && (
        <button type="button" class="clamp-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}
