// The turntable the alien builds, seen from above: the gold disc (drawn in millimetres from the groove model's
// radii), its label, a tracking arm with the stylus, and the ring where the needle will drop. The platter turns
// at the bus's speed and direction (with reduced motion it stands still and the panel shows the rate as a
// number). Drag or click on the disc to choose where the needle drops. Reads state only; commands go through
// the instrument's handlers.

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { R_INNER_MUSIC_MM, R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM } from '../../record/groove';
import { turntable as T } from '../../game/state';
import { DISC_RADIUS_MM, LABEL_RADIUS_MM } from './constants';

const VIEW = 172;
/** The arm's rail runs out of the top-right corner toward the spindle, at this angle (radians, y down). */
const ARM_ANGLE = (-38 * Math.PI) / 180;
const RAIL_OUT = DISC_RADIUS_MM + 16;

interface Props {
  target: number;
  onTarget: (r: number) => void;
  reducedMotion: boolean;
}

const at = (r: number): { x: number; y: number } => ({ x: r * Math.cos(ARM_ANGLE), y: r * Math.sin(ARM_ANGLE) });

export function Platter({ target, onTarget, reducedMotion }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const spin = useRef<SVGGElement>(null);
  const dragging = useRef(false);
  const needle = T.needle.value;
  const down = needle?.down === true;
  const r = down && needle?.radiusMm != null ? needle.radiusMm : target;
  const tip = at(r);
  const rail0 = at(RAIL_OUT);

  const rings = useMemo(() => {
    const out: { r: number; o: number }[] = [];
    for (let x = R_INNER_MUSIC_MM + 0.7; x < R_OUTER_MUSIC_MM; x += 1.3) out.push({ r: x, o: 0.1 + 0.12 * Math.abs(Math.sin(x * 0.7)) });
    return out;
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      spin.current?.setAttribute('transform', 'rotate(0)');
      return;
    }
    let raf = 0;
    let last = performance.now();
    let angle = 0;
    const frame = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      angle += (T.direction.value === 'cw' ? 1 : -1) * (360 / T.secondsPerTurn.value) * dt;
      angle %= 360;
      spin.current?.setAttribute('transform', `rotate(${angle.toFixed(3)})`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  const radiusFrom = (ev: PointerEvent): number | null => {
    const el = svg.current;
    if (!el) return null;
    // Through the drawing's own transform (viewBox units are mm), so a box wider or taller than the square
    // drawing (the platter fills the height the deck leaves it, centred) still maps the pointer exactly.
    const m = el.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    const d = Math.hypot(pt.x, pt.y);
    return d > DISC_RADIUS_MM + 3 ? null : Math.min(DISC_RADIUS_MM, Math.max(4, d));
  };

  return (
    <svg
      ref={svg}
      class="platter"
      viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`}
      role="img"
      aria-label="The turntable seen from above. Click or drag on the disc to choose where the needle drops."
      data-target-mm={target.toFixed(2)}
      onPointerDown={(ev) => {
        const x = radiusFrom(ev);
        if (x === null) return;
        dragging.current = true;
        (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
        onTarget(x);
      }}
      onPointerMove={(ev) => {
        if (!dragging.current) return;
        const x = radiusFrom(ev);
        if (x !== null) onTarget(x);
      }}
      onPointerUp={() => (dragging.current = false)}
    >
      <defs>
        <radialGradient id="pl-gold" cx="36%" cy="30%" r="88%">
          <stop offset="0" stop-color="#f6d98a" />
          <stop offset="0.5" stop-color="#d7a43c" />
          <stop offset="1" stop-color="#8d6519" />
        </radialGradient>
        <linearGradient id="pl-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff8dc" stop-opacity="0" />
          <stop offset="0.5" stop-color="#fff8dc" stop-opacity="0.38" />
          <stop offset="1" stop-color="#fff8dc" stop-opacity="0" />
        </linearGradient>
      </defs>
      {/* the plinth */}
      <circle r={VIEW - 4} fill="#100e28" stroke="#2a2750" stroke-width="1.2" />
      <circle r={DISC_RADIUS_MM + 4} fill="#07061a" />
      <g ref={spin}>
        <circle r={DISC_RADIUS_MM} fill="url(#pl-gold)" stroke="#5e4310" stroke-width="0.8" />
        {/* the smooth rim, the lead-in, the music band's groove texture, the run-out */}
        <circle r={(R_LEAD_IN_OUTER_MM + DISC_RADIUS_MM) / 2} fill="none" stroke="#fff1c2" stroke-opacity="0.28" stroke-width={DISC_RADIUS_MM - R_LEAD_IN_OUTER_MM} />
        <circle r={(R_OUTER_MUSIC_MM + R_LEAD_IN_OUTER_MM) / 2} fill="none" stroke="#6b4b10" stroke-opacity="0.35" stroke-width={R_LEAD_IN_OUTER_MM - R_OUTER_MUSIC_MM} />
        <g fill="none" stroke="#4d360b" stroke-width="0.3">
          {rings.map((g) => (
            <circle key={g.r} r={g.r} stroke-opacity={g.o} />
          ))}
        </g>
        <circle r={(R_INNER_MUSIC_MM + LABEL_RADIUS_MM) / 2} fill="none" stroke="#5b4010" stroke-opacity="0.3" stroke-width={R_INNER_MUSIC_MM - LABEL_RADIUS_MM} />
        {/* a light catching the grooves: it shows the disc turning */}
        <path d={`M ${LABEL_RADIUS_MM} -7 L ${DISC_RADIUS_MM - 1} -16 L ${DISC_RADIUS_MM - 1} 16 L ${LABEL_RADIUS_MM} 7 Z`} fill="url(#pl-sheen)" />
        <circle r={LABEL_RADIUS_MM} fill="#b88a2c" stroke="#5e4310" stroke-width="0.7" />
        <circle r={LABEL_RADIUS_MM - 6} fill="none" stroke="#7a5714" stroke-opacity="0.5" stroke-width="0.5" />
        <circle cx={LABEL_RADIUS_MM - 16} cy="0" r="2.2" fill="#5e4310" fill-opacity="0.6" />
      </g>
      <circle r="3.6" fill="#0b0a1f" stroke="#9391b8" stroke-width="0.6" />
      {/* where the needle will drop */}
      <circle class="dropring" r={target} fill="none" stroke="#4ff0c4" stroke-width="0.9" stroke-dasharray="3 3" stroke-opacity={down ? 0.35 : 0.95} />
      {/* the tracking arm: a rail toward the spindle and the carriage holding the stylus */}
      <line x1={rail0.x} y1={rail0.y} x2={at(LABEL_RADIUS_MM - 8).x} y2={at(LABEL_RADIUS_MM - 8).y} stroke="#2a2750" stroke-width="5" stroke-linecap="round" />
      <line x1={rail0.x} y1={rail0.y} x2={tip.x} y2={tip.y} stroke="#dcdcf2" stroke-width="2.2" stroke-linecap="round" stroke-opacity={down ? 1 : 0.6} />
      <circle cx={rail0.x} cy={rail0.y} r="6" fill="#2a2750" stroke="#9391b8" stroke-width="1" />
      <rect x={tip.x - 4} y={tip.y - 4} width="8" height="8" rx="1.5" fill="#14122e" stroke="#9b7bff" stroke-width="1" transform={`rotate(${(ARM_ANGLE * 180) / Math.PI} ${tip.x} ${tip.y})`} />
      <circle class="stylus" cx={tip.x} cy={tip.y} r={down ? 2.6 : 1.9} fill={down ? '#4ff0c4' : 'none'} stroke="#4ff0c4" stroke-width="1.1" />
    </svg>
  );
}
