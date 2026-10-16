// The lamp: a small dome seen from above. Drag the lamp round the dome's rim to choose where the light
// comes from; toward the centre it rises overhead (flat light), out at the rim it skims the plate (raking
// light). Keys: left and right swing it round, up and down raise and lower it.

import { useRef } from 'preact/hooks';
import { GlyphLabel } from '../../ui/Glyph';
import type { Lamp } from './relief';

const R = 44;

export function LampDial(p: { lamp: Lamp; onLamp: (l: Lamp) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const az = (p.lamp.azimuthDeg * Math.PI) / 180;
  const rr = R * (1 - p.lamp.elevationDeg / 90);
  const x = rr * Math.cos(az);
  const y = -rr * Math.sin(az);

  const setFrom = (e: PointerEvent): void => {
    const el = svg.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const dx = ((e.clientX - b.left) / b.width) * 112 - 56;
    const dy = ((e.clientY - b.top) / b.height) * 112 - 56;
    const r = Math.min(R, Math.hypot(dx, dy));
    const azimuthDeg = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
    p.onLamp({ azimuthDeg: Math.round(azimuthDeg), elevationDeg: Math.max(2, Math.round(90 * (1 - r / R))) });
  };

  const onKey = (e: KeyboardEvent): void => {
    const l = p.lamp;
    let n: Lamp | null = null;
    if (e.key === 'ArrowLeft') n = { ...l, azimuthDeg: (l.azimuthDeg + 10) % 360 };
    else if (e.key === 'ArrowRight') n = { ...l, azimuthDeg: (l.azimuthDeg + 350) % 360 };
    else if (e.key === 'ArrowUp') n = { ...l, elevationDeg: Math.min(90, l.elevationDeg + 5) };
    else if (e.key === 'ArrowDown') n = { ...l, elevationDeg: Math.max(2, l.elevationDeg - 5) };
    if (!n) return;
    e.preventDefault();
    e.stopPropagation();
    p.onLamp(n);
  };

  return (
    <div class="lampdial" onKeyDown={onKey}>
      <svg
        ref={svg}
        class="dial"
        viewBox="-56 -56 112 112"
        width="112"
        height="112"
        role="slider"
        tabindex={0}
        aria-label="Lamp"
        aria-valuemin={2}
        aria-valuemax={90}
        aria-valuenow={p.lamp.elevationDeg}
        aria-valuetext={`light from ${p.lamp.azimuthDeg} degrees, ${p.lamp.elevationDeg} degrees above the plate`}
        data-lamp={`${p.lamp.azimuthDeg},${p.lamp.elevationDeg}`}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setFrom(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) setFrom(e);
        }}
      >
        <circle r={R} class="dome" />
        <circle r={R * (1 - 30 / 90)} class="ring" />
        <circle r={R * (1 - 60 / 90)} class="ring" />
        <line x1={0} y1={0} x2={x} y2={y} class="beam" />
        <circle cx={x} cy={y} r={6} class="lamp" />
      </svg>
      <GlyphLabel k="lamp" gloss={`lamp: ${p.lamp.elevationDeg} deg high`} height={14} />
    </div>
  );
}
