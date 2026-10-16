// The spin-down clock: run time back and forward and watch each matched pulsar's period with it (spin-down
// with n = 3, src/science/pulsars.ts spinForward), drawn as its share of today's difference from the map's
// number: 1 now, 0 where it equals the map's number. Where a curve crosses 0 is where that pulsar agrees with
// the map; a line lights when the clock is inside that pulsar's 95% age range in your own frame.

import { game } from '../../game/state';
import { JULIAN_YEAR_S } from '../../science/units';
import { CLOCK_N, clockShare, isYoung } from './mapMath';
import { beatTicks, linear, qty, useSize } from './plot';
import { assignments, clockYears, model } from './state';

/** The clock's range, years either side of now (spec: about 100,000 years ago to 100,000 ahead). */
export const CLOCK_SPAN_YEARS = 100_000;
const Y_RANGE: [number, number] = [-1.6, 2.6];
const SAMPLES = 160;

export function SpinClock() {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const m = model.value;
  const t = clockYears.value;
  const gloss = game.settings.value.humanGloss;
  const given = assignments.value;
  if (!m) return null;
  const rows = m.lines
    .filter((l) => given[String(l.order)] && m.byJ.has(given[String(l.order)] as string))
    .map((l) => {
      const e = m.byJ.get(given[String(l.order)] as string)!;
      const age = m.ageOf(l.order, e.jname, 'own');
      return { l, e, young: isYoung(e), agrees: -t >= age.lo && -t <= age.hi };
    });
  const pad = { l: 46, r: 12, t: 10, b: 30 };
  const X = linear(-CLOCK_SPAN_YEARS, CLOCK_SPAN_YEARS, pad.l, Math.max(pad.l + 10, w - pad.r));
  const Y = linear(Y_RANGE[0], Y_RANGE[1], Math.max(pad.t + 10, h - pad.b), pad.t);
  const clip = (v: number): number => Math.min(Y_RANGE[1], Math.max(Y_RANGE[0], v));
  const path = (e: (typeof rows)[number]['e'], l: (typeof rows)[number]['l']): string => {
    let d = '';
    let pen = false;
    for (let i = 0; i <= SAMPLES; i++) {
      const ty = -CLOCK_SPAN_YEARS + (2 * CLOCK_SPAN_YEARS * i) / SAMPLES;
      const v = clockShare(e, l, ty, CLOCK_N);
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${X(ty).toFixed(1)} ${Y(clip(v)).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const ticks = w > 0 ? beatTicks(-CLOCK_SPAN_YEARS, CLOCK_SPAN_YEARS, Math.max(3, Math.floor(w / 90))) : [];
  const agreeing = rows.filter((r) => r.agrees).map((r) => r.l.order);
  const when = t === 0 ? 'now' : `${qty('time', Math.abs(t) * JULIAN_YEAR_S, gloss)} ${t < 0 ? 'ago' : 'ahead'}`;
  const nudge = (dy: number): void => {
    clockYears.value = Math.max(-CLOCK_SPAN_YEARS, Math.min(CLOCK_SPAN_YEARS, clockYears.value + dy));
  };
  return (
    <section class="map-tool map-clock" aria-label="The spin-down clock" data-clock-years={t}>
      <div class="map-plot" ref={ref}>
        <span class="map-plot-note">{agreeing.length ? `at the map's number: line ${agreeing.join(', ')}` : rows.length ? "no matched pulsar at the map's number" : 'match a line to run its pulsar here'}</span>
        {w > 0 && (
          <svg width={w} height={h} role="img" aria-label="Each matched pulsar's period against time, as a share of today's difference from the map's number">
            <line x1={X(-CLOCK_SPAN_YEARS)} x2={X(CLOCK_SPAN_YEARS)} y1={Y(0)} y2={Y(0)} class="map-axis-gold" />
            <text x={pad.l + 4} y={Y(0) - 5} class="map-plot-label gold">the map's number</text>
            <line x1={X(-CLOCK_SPAN_YEARS)} x2={X(CLOCK_SPAN_YEARS)} y1={Y(1)} y2={Y(1)} class="map-axis-dash" />
            <text x={X(CLOCK_SPAN_YEARS) - 4} y={Y(1) - 5} class="map-plot-label" text-anchor="end">today's</text>
            <line x1={X(0)} x2={X(0)} y1={Y(Y_RANGE[0])} y2={Y(Y_RANGE[1])} class="map-axis" />
            {ticks.map((k) => (
              <text key={k.years} x={X(k.years)} y={h - 8} class="map-plot-label" text-anchor="middle">{k.label}</text>
            ))}
            {rows.map((r) => (
              <path key={r.l.order} d={path(r.e, r.l)} class={`map-curve${r.young ? ' young' : ''}${r.agrees ? ' agrees' : ''}`} data-clock-line={r.l.order} />
            ))}
            {rows.map((r) => {
              const v = clockShare(r.e, r.l, t, CLOCK_N);
              return Number.isFinite(v) ? <circle key={r.l.order} cx={X(t)} cy={Y(clip(v))} r={r.agrees ? 5 : 3.5} class={`map-dot${r.agrees ? ' agrees' : ''}`} /> : null;
            })}
            <line x1={X(t)} x2={X(t)} y1={Y(Y_RANGE[0])} y2={Y(Y_RANGE[1])} class="map-cursor" />
          </svg>
        )}
      </div>
      <div class="map-row map-clockctl">
        {[-1000, -100].map((d) => <button key={d} type="button" class="btn small" onClick={() => nudge(d)}>{d === -1000 ? '«' : '‹'}</button>)}
        <label class="map-k" for="map-clock">time, in beats</label>
        <input
          id="map-clock"
          type="range"
          min={-CLOCK_SPAN_YEARS}
          max={CLOCK_SPAN_YEARS}
          step={50}
          value={t}
          data-clock=""
          onInput={(e) => (clockYears.value = Number((e.currentTarget as HTMLInputElement).value))}
        />
        {[100, 1000].map((d) => <button key={d} type="button" class="btn small" onClick={() => nudge(d)}>{d === 1000 ? '»' : '›'}</button>)}
        <output class="map-v" data-clock-reading="">{when}</output>
      </div>
    </section>
  );
}
