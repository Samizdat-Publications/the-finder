// Scroll cues (M4 step 7e, from the blind critic: panels clipped at the bottom with no sign there was more).
// Every column that scrolls on its own gets a soft fade at the clipped edge (the classes scrolls-more and
// scrolls-back, results.css) and, while more lies below, a small "more below" cue at its foot that scrolls it
// on. Presentation only: it reads the layout a few times a second and on scroll; it never touches game state.

import { useEffect, useState } from 'preact/hooks';

/** The columns of the instruments and the notebook that scroll on their own (each chapter's CSS). */
const COLUMNS = '.notebook, .ar-panelwrap, .kpanels, .map-steps, .pic-notebook, .pview, .pscene, .pnodes, .pctlpanel, .sp-panels, .tr-toolcol';
/** Pixels of hidden content below which a column counts as fully shown. */
const SLACK_PX = 6;

interface Cue {
  key: number;
  x: number;
  y: number;
}

const tagged = new WeakMap<HTMLElement, number>();
let nextKey = 1;

function scan(): Cue[] {
  const cues: Cue[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(COLUMNS)) {
    const o = getComputedStyle(el).overflowY;
    const scrolls = (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + SLACK_PX;
    const below = scrolls && el.scrollTop + el.clientHeight < el.scrollHeight - SLACK_PX;
    const above = scrolls && el.scrollTop > SLACK_PX;
    el.classList.toggle('scrolls-more', below);
    el.classList.toggle('scrolls-back', above);
    if (!below) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 80 || r.width < 60) continue;
    let k = tagged.get(el);
    if (k === undefined) {
      k = nextKey++;
      tagged.set(el, k);
    }
    el.dataset.scrollCol = String(k);
    cues.push({ key: k, x: r.left + r.width / 2, y: r.bottom });
  }
  return cues;
}

export function ScrollCues() {
  const [cues, setCues] = useState<Cue[]>([]);
  useEffect(() => {
    let raf = 0;
    const update = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = scan();
        setCues((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    };
    const id = window.setInterval(update, 400);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      window.clearInterval(id);
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <>
      {cues.map((c) => (
        <button
          key={c.key}
          type="button"
          class="scroll-cue"
          data-scroll-cue={c.key}
          style={{ left: `${c.x}px`, top: `${c.y}px` }}
          onClick={() => {
            const el = document.querySelector<HTMLElement>(`[data-scroll-col="${c.key}"]`);
            el?.scrollBy({ top: el.clientHeight * 0.7, behavior: document.documentElement.classList.contains('calm') ? 'auto' : 'smooth' });
          }}
        >
          more below
        </button>
      ))}
    </>
  );
}
