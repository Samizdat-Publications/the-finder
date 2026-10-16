// The record as an SVG drawing in millimetres (the viewBox is the disc's own size): gold, with a ring for
// every item on the loaded side, the lead-in and the smooth rim marked, the needle and the chosen drop
// radius. Click or drag on it to choose where the needle drops; the drop happens when the pointer is released.

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { R_INNER_MUSIC_MM, R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM } from '../record/groove';
import { groove, timeline } from '../game/model';
import { turntable as T } from '../game/state';

const DISC_R = 150;
const LABEL_R = 36;
const VIEW = 155;
const PIVOT = { x: 146, y: 92 };
const TIP_ANGLE = (50 * Math.PI) / 180;

interface Props {
  target: number;
  onTarget: (r: number) => void;
  onDrop: (r: number) => void;
}

function tip(r: number): { x: number; y: number } {
  return { x: r * Math.cos(TIP_ANGLE), y: r * Math.sin(TIP_ANGLE) };
}

export function Disc({ target, onTarget, onDrop }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const spin = useRef<SVGGElement>(null);
  const dragging = useRef(false);
  const side = T.side.value;
  const needle = T.needle.value;
  const down = needle?.down === true;
  const radius = down && needle?.radiusMm != null ? needle.radiusMm : target;
  const pos = tip(radius);

  const rings = useMemo(() => {
    if (side === null) return [];
    return timeline.entries(side).map((e) => {
      const r0 = groove.radiusAtTime(side, e.startS);
      const r1 = groove.radiusAtTime(side, e.endS);
      return { id: e.item.id, r: (r0 + r1) / 2, w: r0 - r1, index: e.index };
    });
  }, [side]);

  const fine = useMemo(() => {
    const out: number[] = [];
    for (let r = R_INNER_MUSIC_MM + 0.6; r < R_OUTER_MUSIC_MM; r += 1.1) out.push(r);
    return out;
  }, []);

  // The platter turns at the chosen speed, in the chosen direction (a drawing aid; the engine keeps the real clock).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let angle = 0;
    const frame = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      if (T.side.value !== null) angle += (T.direction.value === 'cw' ? 1 : -1) * (360 / T.secondsPerTurn.value) * dt;
      spin.current?.setAttribute('transform', `rotate(${angle % 360})`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const radiusFrom = (ev: PointerEvent): number | null => {
    const el = svg.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const x = ((ev.clientX - b.left) / b.width) * 2 * VIEW - VIEW;
    const y = ((ev.clientY - b.top) / b.height) * 2 * VIEW - VIEW;
    const r = Math.hypot(x, y);
    return r > DISC_R + 2 ? null : Math.min(DISC_R, Math.max(8, r));
  };

  const onDown = (ev: PointerEvent): void => {
    const r = radiusFrom(ev);
    if (r === null) return;
    dragging.current = true;
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    onTarget(r);
  };
  const onMove = (ev: PointerEvent): void => {
    if (!dragging.current) return;
    const r = radiusFrom(ev);
    if (r !== null) onTarget(r);
  };
  const onUp = (ev: PointerEvent): void => {
    if (!dragging.current) return;
    dragging.current = false;
    const r = radiusFrom(ev) ?? target;
    onTarget(r);
    onDrop(r);
  };

  return (
    <svg
      ref={svg}
      class="disc"
      viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`}
      role="img"
      aria-label="The record seen from above. Click or drag to choose where the needle drops."
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <defs>
        <radialGradient id="gold-face" cx="38%" cy="32%" r="85%">
          <stop offset="0" stop-color="#f3cf78" />
          <stop offset="0.55" stop-color="#d9a73e" />
          <stop offset="1" stop-color="#9a7020" />
        </radialGradient>
      </defs>
      <circle r={DISC_R} fill="url(#gold-face)" stroke="#6b4e14" stroke-width="1" />
      {/* the smooth rim and the lead-in */}
      <circle r={(R_LEAD_IN_OUTER_MM + DISC_R) / 2} fill="none" stroke="#f7e3a6" stroke-opacity="0.35" stroke-width={DISC_R - R_LEAD_IN_OUTER_MM} />
      <circle r={(R_OUTER_MUSIC_MM + R_LEAD_IN_OUTER_MM) / 2} fill="none" stroke="#7a5714" stroke-opacity="0.35" stroke-width={R_LEAD_IN_OUTER_MM - R_OUTER_MUSIC_MM} />
      {/* groove texture */}
      <g fill="none" stroke="#5b4010" stroke-opacity="0.22" stroke-width="0.25">
        {fine.map((r) => (
          <circle key={r} r={r} />
        ))}
      </g>
      {/* run-out */}
      <circle r={(R_INNER_MUSIC_MM + LABEL_R) / 2} fill="none" stroke="#5b4010" stroke-opacity="0.3" stroke-width={R_INNER_MUSIC_MM - LABEL_R} />
      {/* one ring per item on the loaded side */}
      <g fill="none">
        {rings.map((g) => {
          const here = needle?.down === true && needle.itemId === g.id;
          return (
            <circle
              key={g.id}
              r={g.r}
              stroke={here ? '#fff4cf' : g.index % 2 === 0 ? '#fff0bd' : '#4a330a'}
              stroke-opacity={here ? 0.75 : 0.16}
              stroke-width={g.w}
            />
          );
        })}
      </g>
      <g ref={spin}>
        <line x1={LABEL_R} y1="0" x2={DISC_R - 1} y2="0" stroke="#fff6d8" stroke-opacity="0.35" stroke-width="1.2" />
        <circle cx={LABEL_R + 6} cy="0" r="2" fill="#2b1d05" fill-opacity="0.55" />
      </g>
      <circle r={LABEL_R} fill="#1b1330" stroke="#6b4e14" stroke-width="0.8" />
      <text class="disc-label" y="-3" text-anchor="middle">
        {side === null ? 'side' : `side ${side}`}
      </text>
      <text class="disc-label small" y="8" text-anchor="middle">
        label area
      </text>
      <circle r="3.4" fill="#0b0a1f" />
      {/* the chosen drop radius */}
      <circle r={target} fill="none" stroke="#4ff0c4" stroke-width="0.9" stroke-dasharray="3 3" stroke-opacity={down ? 0.35 : 0.95} />
      {/* the arm and the needle */}
      <line x1={PIVOT.x} y1={PIVOT.y} x2={pos.x} y2={pos.y} stroke="#dcdcf2" stroke-width="2.4" stroke-linecap="round" stroke-opacity={down ? 1 : 0.55} stroke-dasharray={down ? undefined : '5 4'} />
      <circle cx={PIVOT.x} cy={PIVOT.y} r="5" fill="#2a2750" stroke="#9391b8" stroke-width="1" />
      <circle cx={pos.x} cy={pos.y} r={down ? 3 : 2.2} fill={down ? '#4ff0c4' : 'none'} stroke="#4ff0c4" stroke-width="1.2" />
    </svg>
  );
}
