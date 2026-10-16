// The Spot's instrument: the cover under the lamp on the left with the detector probe over it, and the three
// instruments on the right (the sweep, the alpha counter, the purity test), each opening as the one before it
// is confirmed. The spot itself is never drawn (data/spot.json: visible false); the player finds it by the
// counts. The probe follows the pointer (or the probe keys); counts come from the seed's spot/sweep stream.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { confirmedSet, game } from '../../game/state';
import { createRng } from '../../science/random';
import { DETECTOR_RADIUS_MM, sweepSampler } from '../../science/spot';
import { alignOpenPanel } from '../../ui/notebook';
import { coverModel } from '../shared/coverData';
import { CoverViewer } from '../shared/CoverViewer';
import { RAKING_LAMP, type Lamp } from '../shared/relief';
import { CounterPanel, MAX_YEARS } from './CounterPanel';
import { offsetMm, spotModel, spotStream } from './data';
import { lastAnswerNumber } from './parts';
import { PurityPanel } from './PurityPanel';
import { HISTORY, SAMPLE_S, SweepPanel, type Pt } from './SweepPanel';
import { playClicks } from './clicks';
import './spot.css';

const PLATE = coverModel.size;
const onPlate = (p: Pt): boolean => Math.hypot(p[0] - PLATE / 2, p[1] - PLATE / 2) <= PLATE / 2;

/** The cover's stroke layer inside the viewer: its screen transform maps cover millimetres to the page. */
function strokesSvg(root: HTMLElement | null): SVGSVGElement | null {
  return root?.querySelector<SVGSVGElement>('.coverviewer svg.strokes') ?? null;
}

function clientToMm(root: HTMLElement | null, x: number, y: number): Pt | null {
  const m = strokesSvg(root)?.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return [p.x, p.y];
}

export function SpotInstrument() {
  const seed = game.seed.value;
  const m = spotModel(seed);
  const confirmed = confirmedSet.value;
  // The lamp starts low (raking light), so the cover's relief shows (M4 step 7e).
  const [lamp, setLamp] = useState<Lamp>(RAKING_LAMP);
  const [probe, setProbe] = useState<Pt | null>(null);
  const [mark, setMark] = useState<Pt | null>(() => {
    const x = lastAnswerNumber('spot.find', 'xMm');
    const y = lastAnswerNumber('spot.find', 'yMm');
    return x !== null && y !== null ? [x, y] : null;
  });
  const [history, setHistory] = useState<(number | null)[]>([]);
  const [countedS, setCountedS] = useState(() => lastAnswerNumber('spot.purity', 'countingTimeS') ?? lastAnswerNumber('spot.age', 'countingTimeS') ?? 0);
  const [ageYears, setAgeYears] = useState(() => lastAnswerNumber('spot.age', 'ageYears') ?? MAX_YEARS / 8);
  const [r0, setR0] = useState(() => lastAnswerNumber('spot.purity', 'startA234overA238') ?? 0.5);

  const wrap = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const probeEl = useRef<HTMLDivElement>(null);
  const markEl = useRef<HTMLDivElement>(null);
  const probeRef = useRef<Pt | null>(null);
  probeRef.current = probe;
  const markRef = useRef<Pt | null>(mark);
  markRef.current = mark;

  // The sweep's counts: one seeded stream per visit, a sample every SAMPLE_S while the probe is over the plate.
  const sampler = useMemo(() => sweepSampler(m.sweep, spotStream(seed, 'sweep')), [seed]);
  const clickRng = useMemo(() => createRng(`${seed}/spot/clicks`), [seed]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = probeRef.current;
      const n = p && onPlate(p) ? sampler.sample(offsetMm(p[0], p[1]), SAMPLE_S) : null;
      if (n) playClicks(n, SAMPLE_S, clickRng);
      setHistory((h) => [...h.slice(-(HISTORY - 1)), n]);
    }, SAMPLE_S * 1000);
    return () => window.clearInterval(id);
  }, [sampler]);

  // Keep the probe and the mark on the plate as the view pans and zooms (a light loop; the viewer paints in its own).
  useEffect(() => {
    let raf = 0;
    const place = (el: HTMLDivElement | null, p: Pt | null, ctm: DOMMatrix, box: DOMRect, sizePx?: number): void => {
      if (!el) return;
      if (!p) {
        el.style.display = 'none';
        return;
      }
      const s = new DOMPoint(p[0], p[1]).matrixTransform(ctm);
      el.style.display = 'block';
      el.style.transform = `translate(${(s.x - box.left).toFixed(1)}px, ${(s.y - box.top).toFixed(1)}px)`;
      if (sizePx !== undefined) {
        el.style.width = `${sizePx.toFixed(1)}px`;
        el.style.height = `${sizePx.toFixed(1)}px`;
      }
    };
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const root = wrap.current;
      const viewer = root?.querySelector<HTMLElement>('.coverviewer');
      const ctm = strokesSvg(root)?.getScreenCTM();
      const ov = overlay.current;
      if (!root || !viewer || !ctm || !ov) return;
      const rb = root.getBoundingClientRect();
      const vb = viewer.getBoundingClientRect();
      ov.style.left = `${vb.left - rb.left}px`;
      ov.style.top = `${vb.top - rb.top}px`;
      ov.style.width = `${vb.width}px`;
      ov.style.height = `${vb.height}px`;
      place(probeEl.current, probeRef.current, ctm, vb, 2 * DETECTOR_RADIUS_MM * ctm.a);
      place(markEl.current, markRef.current, ctm, vb);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  const down = useRef<{ x: number; y: number } | null>(null);
  const markAt = (p: Pt | null): void => {
    if (p && onPlate(p)) setMark([p[0], p[1]]);
  };

  // When a deduction is confirmed the next instrument opens: keep it in view in the instruments' own column.
  const col = useRef<HTMLDivElement>(null);
  const stage = ['spot.find', 'spot.age', 'spot.purity'].map((id) => confirmed.has(id)).join('');
  useEffect(() => {
    const el = col.current;
    if (el) requestAnimationFrame(() => alignOpenPanel(el));
  }, [stage]);

  return (
    <div class="spotinst" data-instrument="spot" data-probe={probe ? `${probe[0].toFixed(1)},${probe[1].toFixed(1)}` : ''}>
      <div
        class="sp-view"
        ref={wrap}
        onPointerMove={(e) => {
          if (!(e.target as Element).closest('.coverviewer')) return;
          setProbe(clientToMm(wrap.current, e.clientX, e.clientY));
        }}
        onPointerDown={(e) => {
          down.current = (e.target as Element).closest('.coverviewer') ? { x: e.clientX, y: e.clientY } : null;
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) markAt(clientToMm(wrap.current, e.clientX, e.clientY));
        }}
      >
        <CoverViewer
          model={coverModel}
          lamp={lamp}
          onLamp={setLamp}
          hoverGroup={null}
          onHover={() => undefined}
          selected={null}
          onSelect={() => undefined}
          label="The cover of the disc under your lamp, with the detector probe over it"
        >
          <p class="note sp-caption">The ring that follows your pointer is the detector's face, drawn to scale. Drag to move the plate; click to mark a point.</p>
        </CoverViewer>
        <div class="sp-overlay" ref={overlay} aria-hidden="true">
          <div class="sp-probe" ref={probeEl} />
          <div class="sp-mark" ref={markEl} />
        </div>
      </div>
      <div class="sp-panels" ref={col}>
        <SweepPanel
          probe={probe}
          mark={mark}
          history={history}
          onKeyMove={(dx, dy) => {
            const p = probeRef.current ?? [PLATE / 2, PLATE / 2];
            const q: Pt = [Math.min(PLATE, Math.max(0, p[0] + dx)), Math.min(PLATE, Math.max(0, p[1] + dy))];
            setProbe(q);
          }}
          onMark={() => markAt(probeRef.current)}
        />
        <CounterPanel m={m} countedS={countedS} onCounted={setCountedS} ageYears={ageYears} onAge={setAgeYears} />
        <PurityPanel m={m} countedS={countedS} r0={r0} onR0={setR0} />
      </div>
    </div>
  );
}
