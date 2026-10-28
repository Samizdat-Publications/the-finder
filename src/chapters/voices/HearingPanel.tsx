// voices.hearing: the long spectrum of the voices (the 55 greetings' track, measured by the Worker on its runtime
// audio) beside the spectrum of their own silences, the disc's hiss; faintly behind, the long spectrum of all the
// speech and music on the disc (the reference, data/voices.json). The player clicks where the voices sink into
// the hiss; the mark is proposed through the command bus.

import { useEffect, useState } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet } from '../../game/state';
import { Clamp } from '../../ui/Fine';
import { send } from '../../ui/send';
import { superscript } from '../../ui/units';
import { LastReading, PanelHead } from '../key/parts';
import { analyse, jobProgress, peekResult } from './analysisClient';
import { PIECES, SPEC } from './data';
import { Progress, Q, freqTicks } from './parts';

const W = 520;
const H = 220;
const PAD_L = 44;
const PAD_B = 26;
/** The chart's top, Hz: the runtime audio (Opus) carries nothing above 20 kHz (RFC 6716; src/dsp/spectrum.ts). */
const TOP_HZ = 20_000;
/** The level axis: 0 at the peak band of the voices, down 70 (seven decades of power). */
const LOW_DB = -70;

export function HearingPanel() {
  const id = 'voices.hearing';
  const status = nodeStatus(id, confirmedSet.value);
  const track = PIECES.greetings;
  const [mark, setMark] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status === 'locked') return;
    let live = true;
    void analyse(track, 'hearing').then(() => live && setTick((n) => n + 1)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status]);
  const r = peekResult(track, 'hearing');
  const edges = SPEC.bandEdgesHz;
  const x = (hz: number): number => PAD_L + (hz / TOP_HZ) * (W - PAD_L - 6);
  const peak = r ? Math.max(...r.greetingsDb) : 0;
  const aggPeak = Math.max(...SPEC.aggregateDb);
  const y = (db: number): number => 6 + (Math.min(0, Math.max(LOW_DB, db)) / LOW_DB) * (H - PAD_B - 6);
  const nb = edges.findIndex((e) => e >= TOP_HZ);
  const line = (vals: ArrayLike<number>, ref: number): string =>
    Array.from({ length: nb }, (_, i) => `${x((edges[i]! + edges[i + 1]!) / 2).toFixed(1)},${y((vals[i] as number) - ref).toFixed(1)}`).join(' ');
  const onClick = (e: MouseEvent): void => {
    const svg = e.currentTarget as SVGSVGElement;
    const b = svg.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    setMark(Math.max(0, Math.min(TOP_HZ, ((px - PAD_L) / (W - PAD_L - 6)) * TOP_HZ)));
  };
  return (
    <section class={`kpanel vo-panel ${status}`} data-panel={id} data-status={status}>
      <PanelHead id={id} />
      {status !== 'locked' && (
        <>
          {!r && <Progress f={jobProgress.value[`${track}/hearing`] ?? 0} what="gathering the long spectrum" />}
          {r && (
            <div class="hero-control vo-hero">
              <svg class="vo-chart vo-hear" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Long spectrum of the voices and of the hiss" onClick={onClick} data-hearing-chart="">
                {[0, -20, -40, -60].map((d) => (
                  <g key={d}>
                    <line class="grid" x1={PAD_L} x2={W - 6} y1={y(d)} y2={y(d)} />
                    <text class="tick" x={PAD_L - 4} y={y(d) + 4} text-anchor="end">{d === 0 ? '1' : `10${superscript(d / 10)}`}</text>
                  </g>
                ))}
                {freqTicks(TOP_HZ, 5).map((t) => (
                  <g key={t.hz}>
                    <line class="grid" x1={x(t.hz)} x2={x(t.hz)} y1={6} y2={H - PAD_B} />
                    <text class="tick" x={x(t.hz)} y={H - 8} text-anchor="middle">{t.label}</text>
                  </g>
                ))}
                <polyline class="vo-all" points={line(SPEC.aggregateDb, aggPeak)} />
                <polyline class="vo-noise" points={line(r.noiseDb, peak)} />
                <polyline class="vo-voices" points={line(r.greetingsDb, peak)} />
                {mark !== null && <line class="vo-markline" x1={x(mark)} x2={x(mark)} y1={4} y2={H - PAD_B} data-mark-hz={mark.toFixed(0)} />}
              </svg>
              <p class="vo-legend small">
                <span class="sw voices" /> the voices <span class="sw noise" /> their silences <span class="sw all" /> all the disc's sound
              </p>
              <p class="vo-count">
                Your mark: {mark === null ? <span class="dim">click the chart</span> : <span class="hero-readout"><Q dim="frequency" si={mark} digits={3} /></span>}
              </p>
            </div>
          )}
          {status === 'open' && <Clamp>How much of each pitch the voices hold over the whole track, against the same for their silences: the disc's own hiss. Across: pitch, per beat. Up: power, as a fraction of the strongest. Click where the voices sink into the hiss.</Clamp>}
          <button type="button" class="btn small" disabled={status !== 'open' || mark === null} data-propose-button={id} onClick={() => mark !== null && send({ type: 'deduction.propose', id, answer: { topHz: mark } })}>
            Propose
          </button>
        </>
      )}
      <LastReading id={id} current={mark === null ? undefined : { topHz: mark }} />
    </section>
  );
}

