// Focus handling for the drawers: focus moves to the drawer's close button when it opens, and goes back to
// whatever had focus (the button that opened it) when it closes.

import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

export function useDrawerFocus(target: RefObject<HTMLElement>): void {
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    target.current?.focus();
    return () => {
      if (before && document.contains(before)) before.focus();
    };
  }, [target]);
}
