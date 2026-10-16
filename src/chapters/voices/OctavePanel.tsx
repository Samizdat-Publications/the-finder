// voices.octave: how their music is built. First the tenth piece of music (one bowed instrument, alone): its
// notes (the Worker's pitch tracker on the runtime audio) folded at each ratio, and how much closer than chance
// notes a repeat apart then gather (src/dsp/fold.ts, the reference's own measure, tools/voices/vfold.py); the
// player clicks the ratio where the whole pattern comes back. Then the seventeenth (one
// keyboard): the pitches of its sounding partials folded into that ratio, and a comb of equal steps laid over
// them; the player chooses how many teeth. Both readings are proposed together through the command bus.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet } from '../../game/state';
import { FOLD_RANGE, FoldNotes, foldGrid, localFoldPeak } from '../../dsp/fold';
import { CHROMA_BIN, COMB_K, binCentres, combScores, gridFit, peakNear } from '../../dsp/pitch';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { analyse, jobProgress, peekResult } from './analysisClient';
import { PIECES } from './data';
import { Progress } from './parts';

const W = 520;
const H = 150;
const PAD = 30;
const MAX_CENTS = 2400;
const RATIO_TICKS = [1, 1.25, 1.5, 2, 2.5, 3, 4];
const FOLD_BINS = 240;
/** The fold chart's step, cents (a click is refined to the cent: localFoldPeak). */
const CURVE_STEP = 2;
const CURVE_GRID = foldGrid(CURVE_STEP);

export function OctavePanel() {
  const id = 'voices.octave';
  const status = nodeStatus(id, confirmedSet.value);
  const [ratioC, setRatioC] = useState<number | null>(null);
  const [k, setK] = useState(5);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status === 'locked') return;
    let live = true;
    const bump = (): void => void (live && setTick((n) => n + 1));
    void analyse(PIECES.violin, 'violin').then(bump).catch(() => undefined);
    void analyse(PIECES.piano, 'piano').then(bump).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status]);
  const vio = peekResult(PIECES.violin, 'violin');
  const pia = peekResult(PIECES.piano, 'piano');
  const fold = useMemo(() => (vio ? new FoldNotes(vio.notes) : null), [vio]);
  const curve = useMemo(() => (fold ? fold.curve(CURVE_GRID) : null), [fold]);
  const cmax = curve ? Math.max(...curve) : 1;
  const centres = useMemo(() => (pia ? binCentres(pia.hist.length, CHROMA_BIN) : null), [pia]);
  const scores = useMemo(() => (pia && centres && ratioC ? combScores(centres, pia.hist, ratioC) : null), [pia, centres, ratioC]);
  const fit = useMemo(() => (pia && centres && ratioC ? gridFit(centres, pia.hist, ratioC / k) : null), [pia, centres, ratioC, k]);
  const folded = useMemo(() => {
    if (!pia || !centres || !ratioC) return null;
    const f = new Float64Array(FOLD_BINS);
    for (let i = 0; i < centres.length; i++) {
      const pos = (((centres[i]! % ratioC) + ratioC) % ratioC) / ratioC;
      const b = Math.min(FOLD_BINS - 1, Math.floor(pos * FOLD_BINS));
      f[b] = f[b]! + pia.hist[i]!;
    }
    return f;
  }, [pia, centres, ratioC]);

  const x = (c: number): number => PAD + (c / MAX_CENTS) * (W - PAD - 8);
  const y = (v: number): number => H - 22 - Math.max(0, v) * (H - 32);
  const onCurve = (e: MouseEvent): void => {
    if (!curve || !fold) return;
    const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const c = ((((e.clientX - b.left) / b.width) * W - PAD) / (W - PAD - 8)) * MAX_CENTS;
    // The peak of the drawn curve within half a tempered step of the click, then its own peak to the cent.
    const pk = peakNear(curve, (c - FOLD_RANGE[0]) / CURVE_STEP, Math.round(50 / CURVE_STEP));
    if (pk !== null) setRatioC(localFoldPeak(fold, FOLD_RANGE[0] + pk * CURVE_STEP).cents);
  };
  const ratio = ratioC === null ? null : 2 ** (ratioC / 1200);
  const fmax = folded ? Math.max(...folded) : 1;
  const smax = scores ? Math.max(...scores, 1e-9) : 1;
  return (
    <section class={`kpanel vo-panel ${status}`} data-panel={id} data-status={status}>
      <PanelHead id={id} />
      {status !== 'locked' && (
        <>
          <p class="note small">Music 10, one bowed instrument alone: its notes folded at each ratio, and how much closer than chance notes a repeat apart then gather (the line marks chance). Click the ratio where the whole pattern comes back.</p>
          {!curve && <Progress f={jobProgress.value[`${PIECES.violin}/violin`] ?? 0} what="following the notes" />}
          {curve && (
            <svg class="vo-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="How tightly the notes gather when folded at each ratio" onClick={onCurve} data-octave-chart="">
              {RATIO_TICKS.map((r) => (
                <g key={r}>
                  <line class="grid" x1={x(1200 * Math.log2(r))} x2={x(1200 * Math.log2(r))} y1={6} y2={H - 22} />
                  <text class="tick" x={x(1200 * Math.log2(r))} y={H - 6} text-anchor="middle">{r}</text>
                </g>
              ))}
              <line class="grid" x1={x(FOLD_RANGE[0])} x2={x(MAX_CENTS)} y1={y(1 / cmax)} y2={y(1 / cmax)} data-chance="" />
              <polyline class="vo-voices" points={Array.from(curve, (v, i) => `${x(CURVE_GRID[i]!).toFixed(1)},${y(v / cmax).toFixed(1)}`).join(' ')} />
              {ratioC !== null && <line class="vo-markline" x1={x(ratioC)} x2={x(ratioC)} y1={4} y2={H - 22} data-ratio-cents={ratioC.toFixed(2)} />}
            </svg>
          )}
          <p class="vo-count">Pattern comes back at: {ratio === null ? <span class="dim">click a peak</span> : <span class="num" data-ratio={ratio.toFixed(5)}>{ratio.toFixed(4)} to 1</span>}</p>
          {ratioC !== null && (
            <>
              <p class="note small">Music 17, one keyboard: the pitches of everything it sounds, folded into that ratio. Lay a comb of equal steps over them.</p>
              {!folded && <Progress f={jobProgress.value[`${PIECES.piano}/piano`] ?? 0} what="finding the sounding pitches" />}
              {folded && fit && (
                <svg class="vo-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The keyboard's pitches folded into one repeat, with the comb" data-comb-chart="">
                  {Array.from(folded, (v, i) => (
                    <rect key={i} class="vo-hbar" x={PAD + (i / FOLD_BINS) * (W - PAD - 8)} width={(W - PAD - 8) / FOLD_BINS + 0.3} y={y(v / fmax)} height={H - 22 - y(v / fmax)} />
                  ))}
                  {Array.from({ length: k }, (_, j) => {
                    const pos = ((((fit.offset + (j * ratioC) / k) % ratioC) + ratioC) % ratioC) / ratioC;
                    const xx = PAD + pos * (W - PAD - 8);
                    return <line key={j} class="vo-tooth" x1={xx} x2={xx} y1={6} y2={H - 22} />;
                  })}
                  <text class="tick" x={PAD} y={H - 6}>one repeat, low to high</text>
                </svg>
              )}
              {folded && scores && (
                <>
                  <div class="vo-controls">
                    <label class="vo-slider">
                      <span>Teeth on the comb</span>
                      <input type="range" min={COMB_K[0]} max={COMB_K[1]} step={1} value={k} data-control="teeth" onInput={(e) => setK(Number((e.target as HTMLInputElement).value))} />
                      <output class="num" data-teeth={k}>{k}</output>
                    </label>
                  </div>
                  <svg class="vo-chart vo-scores" viewBox={`0 0 ${W} 60`} role="img" aria-label="How well each comb fits">
                    {scores.map((s, i) => {
                      const kk = COMB_K[0] + i;
                      const bw = (W - PAD - 8) / scores.length;
                      const h = (Math.max(0, s) / smax) * 40;
                      return <rect key={kk} class={`vo-score${kk === k ? ' on' : ''}`} x={PAD + i * bw + 1} width={bw - 2} y={44 - h} height={h} />;
                    })}
                    <text class="tick" x={PAD} y={58}>fit of each comb, from {COMB_K[0]} teeth to {COMB_K[1]}</text>
                  </svg>
                </>
              )}
            </>
          )}
          <button
            type="button"
            class="btn small"
            disabled={status !== 'open' || ratio === null || !folded}
            data-propose-button={id}
            onClick={() => ratio !== null && send({ type: 'deduction.propose', id, answer: { ratio, step: ratio ** (1 / k) } })}
          >
            Propose
          </button>
        </>
      )}
      <LastReading id={id} current={ratio === null ? undefined : { ratio, step: ratio ** (1 / k) }} />
    </section>
  );
}
