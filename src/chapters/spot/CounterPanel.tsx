// The alpha counter: count a sample of the spot (uranium and thorium separated first) for as long as the
// player chooses, watch the three lines grow as a spectrum, read the uranium-234 to uranium-238 ratio with its
// 95% interval, and drag an age marker on the ratio-to-age curve. Counting runs as a time-lapse; the counts
// at any counting time come from the seeded session (spot.ts), so they are the same however you get there.
// The age interval is drawn only after an age has been proposed.

import { useEffect, useRef, useState } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { ageFromU234, type AlphaCounts } from '../../science/clocks';
import { DETECTOR_RESOLUTION_KEV, MAX_COUNT_S, alphaLineMeV, u234RatioAt } from '../../science/spot';
import { wilsonInterval } from '../../science/stats';
import { JULIAN_YEAR_S, MEV_J } from '../../science/units';
import { GlyphSvg } from '../../ui/Glyph';
import { UNIT_KEY, formatNumber, formatSI, quantity, superscript, toAlien } from '../../ui/units';
import { beatsNumber, sig } from './checkers';
import type { SpotModel } from './data';
import { Panel, propose } from './parts';

/** Counting steps the player can add, in beats: whole powers of ten (the alien's round numbers). */
const STEPS_BEATS = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7];
const beatsS = (n: number): number => n / toAlien('time', 1);

/** Real seconds the time-lapse takes for a step: about 3 s per day of counting, from 0.8 s up to 6 s. */
const lapseS = (addS: number): number => Math.min(6, Math.max(0.8, 0.8 + (3 * addS) / 86_400));

const LINES = [
  { id: 'U238' as const, key: 'u238' as const, label: 'uranium-238' },
  { id: 'U234' as const, key: 'u234' as const, label: 'uranium-234' },
  { id: 'Th230' as const, key: 'th230' as const, label: 'thorium-230' },
];

// ---- spectrum ----
const SW = 360;
const SH = 150;
const SP = { l: 34, r: 8, t: 18, b: 34 };
const E_LO = 4.05; // MeV, below U-238's line
const E_HI = 5.0; // MeV, room above U-234's line for its label

function Spectrum(p: { c: AlphaCounts }) {
  const sigmaMeV = DETECTOR_RESOLUTION_KEV / 1000 / (2 * Math.sqrt(2 * Math.LN2));
  const chanMeV = 0.005; // counts per 5 keV channel
  const peaks = LINES.map((l) => ({ ...l, e: alphaLineMeV(l.id), n: p.c[l.key] }));
  const dens = (e: number): number =>
    peaks.reduce((s, k) => s + (k.n * chanMeV * Math.exp(-0.5 * ((e - k.e) / sigmaMeV) ** 2)) / (sigmaMeV * Math.sqrt(2 * Math.PI)), 0);
  // Log scale from a tenth of a count per channel, so a line of a few counts still shows.
  const top = Math.max(1, ...peaks.map((k) => dens(k.e)));
  const decades = Math.max(1, Math.ceil(Math.log10(top)));
  const sx = (e: number): number => SP.l + ((e - E_LO) / (E_HI - E_LO)) * (SW - SP.l - SP.r);
  const sy = (v: number): number => SP.t + (1 - (Math.log10(Math.max(0.1, v)) + 1) / (decades + 1)) * (SH - SP.t - SP.b);
  const pts: string[] = [];
  for (let e = E_LO; e <= E_HI + 1e-9; e += 0.002) pts.push(`${sx(e).toFixed(1)},${sy(dens(e)).toFixed(1)}`);
  const lab = (e: number): number => toAlien('energy', e * MEV_J) * 1e13;
  const ticks = [1.15, 1.2, 1.25, 1.3, 1.35, 1.4].filter((t) => lab(E_LO) <= t && t <= lab(E_HI));
  const toMeV = (t: number): number => E_LO + ((t - lab(E_LO)) / (lab(E_HI) - lab(E_LO))) * (E_HI - E_LO);
  const gloss = game.settings.value.humanGloss;
  return (
    <svg class="sp-spectrum" viewBox={`0 0 ${SW} ${SH}`} role="img" aria-label="Alpha spectrum: counts per channel against energy, three lines">
      {Array.from({ length: decades + 1 }, (_, d) => (
        <g key={d}>
          <line x1={SP.l} x2={SW - SP.r} y1={sy(10 ** d)} y2={sy(10 ** d)} class="grid" />
          {(decades <= 3 || d % 2 === 0) && (
            <text x={SP.l - 4} y={sy(10 ** d) + 4} class="tick" text-anchor="end">{d === 0 ? '1' : `10${superscript(d)}`}</text>
          )}
        </g>
      ))}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(toMeV(t))} x2={sx(toMeV(t))} y1={SH - SP.b} y2={SH - SP.b + 4} class="axisline" />
          <text x={sx(toMeV(t))} y={SH - SP.b + 15} class="tick" text-anchor="middle">{t.toFixed(2)}</text>
        </g>
      ))}
      <text x={SP.l + (SW - SP.l - SP.r) / 2} y={SH - 3} class="axis" text-anchor="middle">
        energy ({UNIT_KEY.energy} × 10⁻¹³){gloss ? `; lines at ${peaks.map((k) => k.e.toFixed(3)).join(', ')} MeV` : ''}
      </text>
      <polyline points={pts.join(' ')} class="curve" fill="none" />
      {peaks.map((k) => (
        <text key={k.id} x={sx(k.e) + (k.id === 'Th230' ? -4 : 4)} y={Math.max(SP.t + 2, sy(dens(k.e)) - 4)} class="peak" text-anchor={k.id === 'Th230' ? 'end' : 'start'} data-line={k.id}>
          {k.label.replace('uranium', 'U').replace('thorium', 'Th')}
        </text>
      ))}
    </svg>
  );
}

/** The line counts under the spectrum (the peaks are drawn from these with the detector's resolution). */
function LineCounts(p: { c: AlphaCounts }) {
  return (
    <p class="sp-lines">
      <span class="k">counts per line</span>
      {LINES.map((l) => (
        <span key={l.id} class="ln" data-line-count={l.id}>
          {l.label} <span class="num">{formatNumber(p.c[l.key])}</span>
        </span>
      ))}
      <span class="k">(spectrum: counts per channel, log scale)</span>
    </p>
  );
}

// ---- ratio-to-age curve ----
const W = 360;
const H = 180;
const PAD = { l: 40, r: 10, t: 10, b: 40 };
const Y_MAX = 0.3;
const AXIS_BEATS = [0, 1e12, 2e12, 3e12, 4e12];
const beatsToYears = (n: number): number => n / toAlien('time', 1) / JULIAN_YEAR_S;
export const MAX_YEARS = beatsToYears(4e12);
const sx = (y: number): number => PAD.l + (y / MAX_YEARS) * (W - PAD.l - PAD.r);
const sy = (r: number): number => PAD.t + (1 - r / Y_MAX) * (H - PAD.t - PAD.b);

function AgeCurve(p: { c: AlphaCounts; ageYears: number; onAge: (y: number) => void; showInterval: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const n = p.c.u238 + p.c.u234;
  const R = p.c.u238 > 0 ? p.c.u234 / p.c.u238 : null;
  const w = wilsonInterval(p.c.u234, n);
  const rLo = w.lo / (1 - w.lo);
  const rHi = w.hi >= 1 ? Infinity : w.hi / (1 - w.hi);
  const a = n > 0 ? ageFromU234(p.c) : null;
  const pts = Array.from({ length: 121 }, (_, i) => (i / 120) * MAX_YEARS).map((t) => `${sx(t).toFixed(1)},${sy(u234RatioAt(t)).toFixed(1)}`).join(' ');
  const gloss = game.settings.value.humanGloss;
  const fromEvent = (e: PointerEvent): void => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    p.onAge(Math.min(MAX_YEARS, Math.max(0, ((pt.x - PAD.l) / (W - PAD.l - PAD.r)) * MAX_YEARS)));
  };
  return (
    <svg
      ref={svg}
      class="sp-curve"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="The uranium-234 to uranium-238 ratio a pure start reaches at each age, with your measured ratio and your age marker"
      data-age-years={p.ageYears}
      onPointerDown={(e) => {
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        fromEvent(e);
      }}
      onPointerMove={(e) => (e.buttons & 1) && fromEvent(e)}
    >
      {[0, 0.1, 0.2, 0.3].map((r) => (
        <g key={r}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(r)} y2={sy(r)} class="grid" />
          <text x={PAD.l - 5} y={sy(r) + 4} class="tick" text-anchor="end">{r.toFixed(1)}</text>
        </g>
      ))}
      {AXIS_BEATS.map((b) => (
        <g key={b}>
          <line x1={sx(beatsToYears(b))} x2={sx(beatsToYears(b))} y1={H - PAD.b} y2={H - PAD.b + 4} class="axisline" />
          <text x={sx(beatsToYears(b))} y={H - PAD.b + 15} class="tick" text-anchor="middle">{b / 1e12}</text>
          {gloss && b > 0 && (
            <text x={sx(beatsToYears(b))} y={H - PAD.b + 26} class="tick si" text-anchor="middle">{Math.round(beatsToYears(b) / 1000)}k y</text>
          )}
        </g>
      ))}
      <text x={PAD.l + (W - PAD.l - PAD.r) / 2} y={H - 2} class="axis" text-anchor="middle">age ({UNIT_KEY.time}s × 10{superscript(12)})</text>
      {R !== null && (
        <>
          <rect x={PAD.l} width={W - PAD.l - PAD.r} y={sy(Math.min(Y_MAX, rHi))} height={Math.max(1, sy(Math.max(0, rLo)) - sy(Math.min(Y_MAX, rHi)))} class="band" />
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(Math.min(Y_MAX, R))} y2={sy(Math.min(Y_MAX, R))} class="meas" />
          <text x={W - PAD.r - 2} y={sy(Math.min(Y_MAX, R)) - 5} class="tick meas-label" text-anchor="end">measured {sig(R)}</text>
        </>
      )}
      {p.showInterval && a && a.lo > 0 && (
        <rect x={sx(a.lo)} width={Math.max(1, sx(Math.min(MAX_YEARS, a.hi)) - sx(a.lo))} y={PAD.t} height={H - PAD.t - PAD.b} class="ageband" data-interval={`${a.lo},${a.hi}`} />
      )}
      <polyline points={pts} class="curve" fill="none" />
      <line x1={sx(p.ageYears)} x2={sx(p.ageYears)} y1={PAD.t} y2={H - PAD.b} class="marker" />
      <circle cx={sx(p.ageYears)} cy={sy(u234RatioAt(p.ageYears))} r={5} class="marker-dot" />
    </svg>
  );
}

export interface CounterProps {
  m: SpotModel;
  countedS: number;
  onCounted: (s: number) => void;
  ageYears: number;
  onAge: (y: number) => void;
}

export function CounterPanel(p: CounterProps) {
  const id = 'spot.age';
  const status = nodeStatus(id, confirmedSet.value);
  const [shownS, setShownS] = useState(p.countedS);
  const [running, setRunning] = useState(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    if (!running) setShownS(p.countedS);
  }, [p.countedS]);

  const count = (addS: number): void => {
    const from = p.countedS;
    const to = Math.min(MAX_COUNT_S, from + addS);
    const dur = lapseS(to - from) * 1000;
    const start = performance.now();
    setRunning(true);
    const tick = (now: number): void => {
      const f = Math.min(1, (now - start) / dur);
      setShownS(from + (to - from) * f);
      if (f < 1) raf.current = requestAnimationFrame(tick);
      else {
        setRunning(false);
        p.onCounted(to);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const c = p.m.session.countsAt(shownS);
  const n = c.u238 + c.u234;
  const R = c.u238 > 0 ? c.u234 / c.u238 : null;
  const w = wilsonInterval(c.u234, n);
  const gloss = game.settings.value.humanGloss;
  const t = quantity('time', shownS);
  const proposed = (game.records.value[id]?.attempts.length ?? 0) > 0;
  return (
    <Panel id={id} title="Alpha counter" glyph="counter" current={{ countingTimeS: p.countedS, ageYears: Math.round(p.ageYears) }}>
      <p class="sp-small">
        A sample of the spot, uranium and thorium separated, under the same detector. Count longer and the error bars shrink.
      </p>
      <div class="sp-steps" role="group" aria-label="Count for longer">
        {STEPS_BEATS.map((b) => (
          <button key={b} type="button" class="btn small" data-count-beats={b} disabled={running || p.countedS >= MAX_COUNT_S} onClick={() => count(beatsS(b))}>
            +10{superscript(Math.log10(b))}
            {gloss && <span class="si"> ({formatSI('time', beatsS(b))})</span>}
          </button>
        ))}
      </div>
      <p class="sp-total" data-counted-s={running ? '' : p.countedS}>
        <span class="k">counted</span> <span class="num">{beatsNumber(shownS)}</span> <GlyphSvg k={UNIT_KEY.time} height={15} class="unit" />
        {gloss && <span class="si"> ({t.si})</span>}
        {running && <span class="sp-small"> counting...</span>}
      </p>
      <Spectrum c={c} />
      <LineCounts c={c} />
      <p class="sp-ratio" data-ratio={R ?? ''}>
        <span class="k">uranium-234 per uranium-238</span>{' '}
        {R === null ? (
          <span class="dim">no counts yet</span>
        ) : (
          <>
            <span class="num">{sig(R)}</span>
            <span class="sp-small"> (95%: {sig(w.lo / (1 - w.lo))} to {w.hi >= 1 ? 'no upper end' : sig(w.hi / (1 - w.hi))})</span>
          </>
        )}
      </p>
      <AgeCurve c={c} ageYears={p.ageYears} onAge={p.onAge} showInterval={proposed} />
      <label class="sp-slider">
        <span class="k">age marker</span>
        <input type="range" min={0} max={MAX_YEARS} step={50} value={p.ageYears} data-age-input onInput={(e) => p.onAge(Number((e.currentTarget as HTMLInputElement).value))} />
        <span class="num">{beatsNumber(p.ageYears * JULIAN_YEAR_S)}</span> <GlyphSvg k={UNIT_KEY.time} height={15} class="unit" />
        {gloss && <span class="si"> ({sig(p.ageYears)} years)</span>}
      </label>
      {status === 'open' && (
        <button type="button" class="btn" data-propose="spot.age" disabled={running || p.countedS <= 0} onClick={() => propose(id, { countingTimeS: p.countedS, ageYears: Math.round(p.ageYears) })}>
          The spot is this old
        </button>
      )}
    </Panel>
  );
}
