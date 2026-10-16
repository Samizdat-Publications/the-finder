// A turning dial: drag the pointer round, or use the arrow keys (1 deg; with Shift 0.1 deg; Page keys
// 10 deg). No snapping: the value is wherever the hand leaves it. Angles counter-clockwise, deg in [0, 360).

const norm360 = (x: number): number => ((x % 360) + 360) % 360;

export function Dial(p: { value: number; onChange: (deg: number) => void; label: string }) {
  const r = 26;
  const a = (p.value * Math.PI) / 180;
  const setFrom = (e: PointerEvent): void => {
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = e.clientX - (box.left + box.width / 2);
    const y = e.clientY - (box.top + box.height / 2);
    if (Math.hypot(x, y) < 3) return;
    p.onChange(norm360((Math.atan2(-y, x) * 180) / Math.PI));
  };
  const onKey = (e: KeyboardEvent): void => {
    const step = e.key.startsWith('Page') ? 10 : e.shiftKey ? 0.1 : 1;
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    p.onChange(norm360(Math.round((p.value + dir * step) * 10) / 10));
  };
  return (
    <svg
      class="map-dial"
      viewBox="-32 -32 64 64"
      width="64"
      height="64"
      role="slider"
      tabIndex={0}
      aria-label={p.label}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Number(p.value.toFixed(1))}
      data-dial=""
      onPointerDown={(e) => {
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        setFrom(e);
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as SVGSVGElement).hasPointerCapture(e.pointerId)) setFrom(e);
      }}
      onKeyDown={onKey}
    >
      <circle r={r} class="map-dial-face" />
      {Array.from({ length: 24 }, (_, i) => {
        const t = (i * 15 * Math.PI) / 180;
        const k = i % 6 === 0 ? 5 : 2.5;
        return <line key={i} x1={(r - k) * Math.cos(t)} y1={-(r - k) * Math.sin(t)} x2={r * Math.cos(t)} y2={-r * Math.sin(t)} class="map-dial-tick" />;
      })}
      <line x1={0} y1={0} x2={(r - 4) * Math.cos(a)} y2={-(r - 4) * Math.sin(a)} class="map-dial-hand" />
      <circle r={3} class="map-dial-hub" />
    </svg>
  );
}
