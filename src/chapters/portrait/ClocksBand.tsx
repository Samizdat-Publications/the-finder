// The centre band of Portrait's plate: the deduction portrait.together ("One story"). A time axis (before now, in
// the Finder's beats, more to the right) with four bars, each one clock's own 95% interval from the player's
// confirmed result, a soft light where three overlap and a bright one where all four do. The player moves one marker, "When it left" (drag, a
// click on the axis, or the keyboard: it is a focusable slider, arrows step, Page keys step ten times, Home and
// End go to the ends) and proposes it through the command bus. Once confirmed, the clocks' combined 95% band is
// drawn in gold. Every bar comes from the player's own results (state.ts playerClocks); nothing is typed.

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { bandHalfWidth } from '../../science/consilience';
import { JULIAN_YEAR_S } from '../../science/units';
import { GlyphLabel } from '../../ui/Glyph';
import { alienText, humanText, rangeDigits } from '../../ui/message';
import { send } from '../../ui/send';
import { LastReading } from '../key/parts';
import { beatTicks, linear, useSize } from '../map/plot';
import { CLOCKS, DRAWN_LEVEL, PORTRAIT_NODE, combine } from './checkers';
import { PORTRAIT_HEADLINES } from './headlines';
import { lastOk, marker, playerClocks, setAxis } from './state';

const ID = PORTRAIT_NODE;
const PAD_L = 150;
const PAD_R = 22;
const AXIS_H = 40;
const TOP = 8;

/** A round step for the marker, years: about a four-hundredth of the axis, rounded to 1, 2 or 5 times a power of ten. */
function niceStep(span: number): number {
  const raw = span / 400;
  const e = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].map((k) => k * e).find((s) => s >= raw) ?? 10 * e) as number;
}

/** Segments of the axis by how many of the bars cover them (drawn lit where three or all four clocks agree). */
function coverage(bars: readonly { lo: number; hi: number }[]): { a: number; b: number; n: number }[] {
  const edges = [...new Set(bars.flatMap((b) => [b.lo, b.hi]))].sort((x, y) => x - y);
  const out: { a: number; b: number; n: number }[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i] as number;
    const b = edges[i + 1] as number;
    const mid = (a + b) / 2;
    const n = bars.filter((k) => k.lo <= mid && mid <= k.hi).length;
    if (n > 0) out.push({ a, b, n });
  }
  return out;
}

export function ClocksBand() {
  const [ref, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const confirmed = confirmedSet.value;
  const status = nodeStatus(ID, confirmed);
  const done = status === 'confirmed';
  const gloss = game.settings.value.humanGloss;
  const clocks = playerClocks();
  const all = clocks.length === CLOCKS.length;
  const combined = useMemo(() => (all && done ? combine(clocks) : null), [all, done, clocks.map((c) => c.estimate).join()]);
  const axis = useMemo(() => {
    if (!clocks.length) return null;
    const lo = Math.min(...clocks.map((c) => c.lo));
    const hi = Math.max(...clocks.map((c) => (Number.isFinite(c.hi) ? c.hi : c.estimate)));
    const pad = (hi - lo) * 0.06;
    return { lo: lo - pad, hi: hi + pad };
  }, [clocks.map((c) => `${c.lo},${c.hi}`).join()]);
  const step = axis ? niceStep(axis.hi - axis.lo) : 1;

  // The marker starts at the most recent end of the axis; once confirmed it sits where the player proposed it.
  useEffect(() => {
    if (!axis) return;
    setAxis(axis);
    const confirmedAt = (lastOk(ID)?.answer as { yearsAgo?: number } | undefined)?.yearsAgo;
    if (done && typeof confirmedAt === 'number') marker.value = confirmedAt;
    else if (marker.value === null || marker.value < axis.lo || marker.value > axis.hi) marker.value = axis.lo;
    return () => setAxis(null);
  }, [axis?.lo, axis?.hi, done]);

  const w = size.w;
  const h = size.h;
  const x = axis ? linear(axis.lo, axis.hi, PAD_L, Math.max(PAD_L + 10, w - PAD_R)) : null;
  const rowH = (h - AXIS_H - TOP) / Math.max(1, CLOCKS.length);
  const m = marker.value;

  const setFromPx = (clientX: number): void => {
    const svg = svgRef.current;
    if (!svg || !x || !axis || done) return;
    const r = svg.getBoundingClientRect();
    const px = clientX - r.left;
    const v = Math.min(axis.hi, Math.max(axis.lo, x.inv(px)));
    marker.value = Math.round(v / step) * step;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!axis || done) return;
    const cur = marker.value ?? axis.lo;
    const by: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 10 * step, PageDown: -10 * step };
    let next: number | null = null;
    if (e.key in by) next = Math.round(cur / step) * step + (by[e.key] as number);
    else if (e.key === 'Home') next = axis.lo;
    else if (e.key === 'End') next = axis.hi;
    if (next === null) return;
    e.preventDefault();
    marker.value = Math.min(axis.hi, Math.max(axis.lo, next));
  };

  const digits = axis ? rangeDigits('time', axis.hi * JULIAN_YEAR_S, step * 10 * JULIAN_YEAR_S) : 3;
  const mText = m === null ? '' : `${alienText('time', m * JULIAN_YEAR_S, digits)}${gloss ? ` (${humanText('time', m * JULIAN_YEAR_S, Math.max(3, Math.ceil(Math.log10(Math.max(1, m)))))})` : ''} ago`;
  const ticks = axis && w > 0 ? beatTicks(axis.lo, axis.hi, Math.max(3, Math.floor((w - PAD_L) / 110))) : [];
  const cov = coverage(clocks.filter((c) => Number.isFinite(c.hi)));
  const band = combined ? { lo: combined.mean - bandHalfWidth(combined.sigma, DRAWN_LEVEL), hi: combined.mean + bandHalfWidth(combined.sigma, DRAWN_LEVEL) } : null;
  const def = nodeDef(ID);

  return (
    <section class={`pt-band ${status}`} data-panel={ID} data-status={status} aria-label="One story: the four clocks">
      <header class="pt-bandhead">
        <GlyphLabel k={def?.key ?? 'One story'} gloss={done ? PORTRAIT_HEADLINES[ID]?.sentence : def?.question} height={22} />
      </header>
      <div class="pt-bandbody">
        <div class="pt-chart" ref={ref}>
          {x && axis && w > 0 && h > 0 && (
            <svg
              ref={svgRef}
              width={w}
              height={h}
              class="pt-clocks"
              data-clocks-chart=""
              data-axis={`${axis.lo},${axis.hi}`}
              data-x-range={`${PAD_L},${Math.max(PAD_L + 10, w - PAD_R)}`}
              role="img"
              aria-label="Four clocks, each with its 95% bar of when the machine left"
              onPointerDown={(e) => {
                if (done) return;
                (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
                setFromPx(e.clientX);
                document.querySelector<HTMLElement>('[data-portrait-marker]')?.focus();
              }}
              onPointerMove={(e) => {
                if ((e.currentTarget as SVGSVGElement).hasPointerCapture(e.pointerId)) setFromPx(e.clientX);
              }}
            >
              {cov
                .filter((s) => s.n >= CLOCKS.length - 1)
                .map((s) => (
                  <rect key={`${s.a}`} class="pt-cover" x={x(s.a)} y={TOP} width={Math.max(0.5, x(s.b) - x(s.a))} height={rowH * CLOCKS.length} rx={3} style={{ opacity: s.n === CLOCKS.length ? 0.2 : 0.05 }} />
                ))}
              {band && (
                <g class="pt-combined" data-combined={`${band.lo.toFixed(1)},${band.hi.toFixed(1)}`}>
                  <rect x={x(band.lo)} y={TOP - 4} width={Math.max(2, x(band.hi) - x(band.lo))} height={rowH * CLOCKS.length + 8} />
                  <text x={x(band.hi) + 6} y={TOP + 12}>
                    95%, all four together
                  </text>
                </g>
              )}
              {CLOCKS.map((def, i) => {
                const c = clocks.find((k) => k.id === def.id);
                const y = TOP + rowH * (i + 0.5);
                return (
                  <g key={def.id} class={`pt-clock${c ? '' : ' missing'}`} data-clock={def.id}>
                    <text class="pt-clocklabel" x={PAD_L - 14} y={rowH >= 30 ? y - 1 : y + 4} text-anchor="end">
                      {def.short}
                      <title>{def.label}</title>
                    </text>
                    {rowH >= 30 && (
                      <text class="pt-clocksub" x={PAD_L - 14} y={y + 12} text-anchor="end">
                        {def.reads}
                      </text>
                    )}
                    {c ? (
                      <>
                        <line class="pt-bar" x1={x(c.lo)} x2={x(Number.isFinite(c.hi) ? c.hi : axis.hi)} y1={y} y2={y} />
                        <line class="pt-barend" x1={x(c.lo)} x2={x(c.lo)} y1={y - 6} y2={y + 6} />
                        {Number.isFinite(c.hi) && <line class="pt-barend" x1={x(c.hi)} x2={x(c.hi)} y1={y - 6} y2={y + 6} />}
                        <circle class="pt-est" cx={x(c.estimate)} cy={y} r={4.5} />
                      </>
                    ) : (
                      <rect class="pt-barwait" x={PAD_L} y={y - 6} width={Math.max(10, w - PAD_L - PAD_R)} height={12} rx={6} />
                    )}
                  </g>
                );
              })}
              <line class="pt-axis" x1={PAD_L} x2={w - PAD_R} y1={h - AXIS_H + 6} y2={h - AXIS_H + 6} />
              {ticks.map((t) => (
                <g key={t.years}>
                  <line class="pt-tick" x1={x(t.years)} x2={x(t.years)} y1={h - AXIS_H + 6} y2={h - AXIS_H + 11} />
                  <text class="pt-ticklabel" x={x(t.years)} y={h - AXIS_H + 26} text-anchor="middle">
                    {t.label}
                  </text>
                </g>
              ))}
              <text class="pt-ticklabel" x={PAD_L - 12} y={h - AXIS_H + 26} text-anchor="end">
                beats before now
              </text>
              {m !== null && (
                <g class="pt-marker" transform={`translate(${x(m).toFixed(1)} 0)`}>
                  <line x1={0} x2={0} y1={TOP - 6} y2={h - AXIS_H + 6} />
                  <path d={`M-7 ${TOP - 8} L7 ${TOP - 8} L0 ${TOP + 2} Z`} />
                </g>
              )}
            </svg>
          )}
          {x && m !== null && axis && (
            <div
              class="pt-knob"
              role="slider"
              tabIndex={done ? -1 : 0}
              aria-label="When it left"
              aria-valuemin={Math.round(axis.lo)}
              aria-valuemax={Math.round(axis.hi)}
              aria-valuenow={Math.round(m)}
              aria-valuetext={mText}
              aria-disabled={done || status !== 'open' ? 'true' : undefined}
              data-portrait-marker=""
              data-value={m}
              style={{ left: `${x(m)}px`, top: `${h - AXIS_H - 4}px` }}
              onKeyDown={onKey}
              onPointerDown={(e) => {
                if (done) return;
                e.preventDefault();
                (e.currentTarget as HTMLElement).focus();
                svgRef.current?.setPointerCapture(e.pointerId);
              }}
            />
          )}
        </div>
        <div class="pt-ask">
          {!done && (
            <p class="pt-readout" data-marker-text="">
              <span class="pt-label">When it left</span>
              <span class="pt-mval">{mText || '...'}</span>
            </p>
          )}
          {!done && (
            <button
              type="button"
              class="btn"
              disabled={status !== 'open' || m === null}
              data-portrait-propose=""
              data-propose-button={ID}
              onClick={() => m !== null && send({ type: 'deduction.propose', id: ID, answer: { yearsAgo: m } })}
            >
              Propose: it left this long ago
            </button>
          )}
          {!all && <p class="note small">Some clocks are not read yet: their bars wait in outline.</p>}
          <LastReading id={ID} current={m === null ? undefined : { yearsAgo: m }} />
        </div>
      </div>
    </section>
  );
}
