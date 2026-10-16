// The decay clock: choose a chain, see its predicted thorium-230 to uranium-234 ratio against age with the
// measurement and its error band, then propose the chain. Ages are in the alien's time unit (src/ui/units.ts,
// D-A22; its name comes from UNIT_KEY); the human gloss adds years. The curves come from chains.ts, the measurement from the model.

import { useState } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { GlyphLabel, GlyphSvg } from '../../ui/Glyph';
import { UNIT_KEY, formatSI, quantity, toAlien } from '../../ui/units';
import { normalQuantile } from '../../science/stats';
import { JULIAN_YEAR_S } from '../../science/units';
import { ResultLine, Status, propose } from './AnswerBox';
import { chainCurve, judgeChain, type ChainId } from './chains';
import { sig } from './checkers';
import { CHOICES } from './choices';
import type { ArrivalModel } from './model';

const W = 360;
const H = 220;
const PAD = { l: 40, r: 10, t: 10, b: 40 };
const Y_MAX = 0.35; // Th-230/U-234 atoms; old ore sits at 0.307
/** The age axis runs to 4e12 alien time units (D-A22: about 110,000 years), ticks every 1e12. */
const AXIS_BEATS = [0, 1e12, 2e12, 3e12, 4e12];
const beatsToYears = (n: number): number => n / toAlien('time', 1) / JULIAN_YEAR_S;
const MAX_YEARS = beatsToYears(4e12);

const sx = (years: number): number => PAD.l + (years / MAX_YEARS) * (W - PAD.l - PAD.r);
const sy = (r: number): number => PAD.t + (1 - r / Y_MAX) * (H - PAD.t - PAD.b);

export function DecayPlot(p: { m: ArrivalModel; chain: ChainId }) {
  const meas = p.m.measurement;
  const z = normalQuantile(0.975);
  const band = [meas.th230OverU234 * (1 - z * meas.relativePrecision), meas.th230OverU234 * (1 + z * meas.relativePrecision)];
  const v = judgeChain(p.chain, meas);
  const pts = chainCurve(p.chain, MAX_YEARS)
    .filter((q) => Number.isFinite(q.r))
    .map((q) => `${sx(q.t).toFixed(1)},${sy(Math.min(q.r, Y_MAX * 1.02)).toFixed(1)}`)
    .join(' ');
  const gloss = game.settings.value.humanGloss;
  return (
    <svg class="ar-clock" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Predicted thorium-230 to uranium-234 ratio against age, with the measurement" data-chain={p.chain}>
      {[0, 0.1, 0.2, 0.3].map((r) => (
        <g key={r}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(r)} y2={sy(r)} class="grid" />
          <text x={PAD.l - 5} y={sy(r) + 3} class="tick" text-anchor="end">
            {r.toFixed(1)}
          </text>
        </g>
      ))}
      {AXIS_BEATS.map((n) => (
        <g key={n}>
          <line x1={sx(beatsToYears(n))} x2={sx(beatsToYears(n))} y1={H - PAD.b} y2={H - PAD.b + 4} class="axisline" />
          <text x={sx(beatsToYears(n))} y={H - PAD.b + 14} class="tick" text-anchor="middle">
            {n === 0 ? '0' : `${n / 1e12}e12`}
          </text>
          {gloss && n > 0 && (
            <text x={sx(beatsToYears(n))} y={H - PAD.b + 24} class="tick si" text-anchor="middle">
              {Math.round(beatsToYears(n) / 1000)}k y
            </text>
          )}
        </g>
      ))}
      <text x={PAD.l + (W - PAD.l - PAD.r) / 2} y={H - 3} class="axis" text-anchor="middle">
        age ({UNIT_KEY.time})
      </text>
      <rect x={PAD.l} width={W - PAD.l - PAD.r} y={sy(band[1]!)} height={sy(band[0]!) - sy(band[1]!)} class="band" />
      <line x1={PAD.l} x2={W - PAD.r} y1={sy(meas.th230OverU234)} y2={sy(meas.th230OverU234)} class="meas" />
      <text x={W - PAD.r - 2} y={sy(meas.th230OverU234) - 5} class="tick meas-label" text-anchor="end">
        measured {sig(meas.th230OverU234)}
      </text>
      <polyline points={pts} class="curve" fill="none" />
      {v.dating && (
        <rect x={sx(v.dating.lo)} width={Math.max(1, sx(v.dating.hi) - sx(v.dating.lo))} y={PAD.t} height={H - PAD.t - PAD.b} class="ageband" />
      )}
      {v.ageYears !== null && (
        <circle cx={sx(v.ageYears)} cy={sy(meas.th230OverU234)} r={4} class="meet" data-meet-years={v.ageYears} />
      )}
    </svg>
  );
}

/** What the curve says, before proposing: where it meets the measurement, in the alien's unit. */
function Meeting(p: { m: ArrivalModel; chain: ChainId }) {
  const v = judgeChain(p.chain, p.m.measurement);
  if (v.ageYears === null) return <p class="ar-small">This curve never meets the measured ratio.</p>;
  const s = v.ageYears * JULIAN_YEAR_S;
  const gloss = game.settings.value.humanGloss;
  const d = v.dating;
  return (
    <p class="ar-small" data-meet={p.chain}>
      Meets the measurement at {quantity('time', s).number} <GlyphSvg k={UNIT_KEY.time} height={13} class="unit" />
      {gloss && ` (${formatSI('time', s)})`}
      {d && (
        <>
          ; 95% from {quantity('time', d.lo * JULIAN_YEAR_S).number} to {quantity('time', d.hi * JULIAN_YEAR_S).number}
          {gloss && ` (${sig(d.lo)} to ${sig(d.hi)} years)`}
        </>
      )}
      .
    </p>
  );
}

export function DecayClockPanel(p: { m: ArrivalModel }) {
  const id = 'arrival.fuelAge';
  const [chain, setChain] = useState<ChainId>('pu238');
  const status = nodeStatus(id, confirmedSet.value);
  return (
    <section class="ar-panel" aria-label="Decay clock" data-panel="clock">
      <h2>
        <GlyphLabel k="decay clock" gloss="Decay clock" height={24} />
      </h2>
      <fieldset class="ar-chains">
        <legend>Which chain made the thorium-230?</legend>
        {(CHOICES[id] ?? []).map((c) => (
          <label key={c.id} class="ar-chain">
            <input type="radio" name="chain" value={c.id} checked={chain === c.id} onChange={() => setChain(c.id as ChainId)} data-chain-choice={c.id} />
            {c.label}
          </label>
        ))}
      </fieldset>
      <DecayPlot m={p.m} chain={chain} />
      <Meeting m={p.m} chain={chain} />
      <div class="ar-answer" data-answer={id}>
        <Status id={id} />
        {status === 'open' && (
          <button type="button" class="btn" data-propose-chain onClick={() => propose(id, chain)}>
            Date the heat source with this chain
          </button>
        )}
        <ResultLine id={id} answer={status === 'confirmed' ? 'pu238' : chain} />
      </div>
    </section>
  );
}
