// The staged moment for spot.age (M4 step 7e): the cover under the low raking lamp (the shared CoverViewer and
// its relief shading), filling the screen, with the spot's position, where the counts rose, glowing faintly
// (the spot itself is never drawn: data/spot.json visible false). Reduced motion: the glow holds still.

import { useEffect, useRef } from 'preact/hooks';
import { coverModel } from '../shared/coverData';
import { CoverViewer } from '../shared/CoverViewer';
import { RAKING_LAMP } from '../shared/relief';
import { SPOT } from './data';

export function SpotBackdrop() {
  const wrap = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  // Keep the glow on the spot as the viewer lays out (the strokes layer maps cover millimetres to the page).
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const root = wrap.current;
      const el = glow.current;
      const svg = root?.querySelector<SVGSVGElement>('.coverviewer svg.strokes');
      const ctm = svg?.getScreenCTM();
      if (!root || !el || !ctm) return;
      const s = new DOMPoint(SPOT.centreMm[0], SPOT.centreMm[1]).matrixTransform(ctm);
      const b = root.getBoundingClientRect();
      const d = Math.max(16, 2 * SPOT.radiusMm * ctm.a * 1.6);
      el.style.width = `${d.toFixed(1)}px`;
      el.style.height = `${d.toFixed(1)}px`;
      el.style.transform = `translate(${(s.x - b.left - d / 2).toFixed(1)}px, ${(s.y - b.top - d / 2).toFixed(1)}px)`;
      el.style.display = 'block';
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div class="moment-cover" ref={wrap}>
      <CoverViewer
        model={coverModel}
        lamp={RAKING_LAMP}
        onLamp={() => undefined}
        hoverGroup={null}
        onHover={() => undefined}
        selected={null}
        onSelect={() => undefined}
        label="The cover of the disc under a low lamp, the spot glowing where the counts rose"
      />
      <div class="moment-spotglow" ref={glow} aria-hidden="true" />
    </div>
  );
}
