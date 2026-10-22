// The purity test: dial the starting uranium-234 (its activity per uranium-238's at the start, from 0 to a
// little beyond ore in balance) and see the age each clock gives from the counts (the uranium-234 clock and
// the thorium-230 clock), and whether they agree (testStartHypothesis's p-value as an agreement meter).

import { useMemo } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { START_P_95, testStartHypothesis } from '../../science/clocks';
import { clockAges, naturalStartRatio } from '../../science/spot';
import { JULIAN_YEAR_S } from '../../science/units';
import { GlyphSvg } from '../../ui/Glyph';
import { UNIT_KEY, superscript } from '../../ui/units';
import { REJECT_P, beatsNumber, sig } from './checkers';
import type { SpotModel } from './data';
import { Panel, propose } from './parts';

/** The dial runs from no uranium-234 to a fifth beyond ore in balance. */
const DIAL_MAX = 1.2 * naturalStartRatio();
/** The agreement meter's scale: p from 10^-12 to 1, logarithmic. */
const P_FLOOR_LOG = -12;

function Dial(p: { r0: number }) {
  const W = 220;
  const H = 120;
  const cx = W / 2;
  const cy = H - 12;
  const R = 92;
  const ang = (v: number): number => Math.PI * (1 - v / DIAL_MAX);
  const at = (v: number, r: number): [number, number] => [cx + r * Math.cos(ang(v)), cy - r * Math.sin(ang(v))];
  const nat = naturalStartRatio();
  const ticks = Array.from({ length: 7 }, (_, i) => (i / 6) * DIAL_MAX);
  const [nx, ny] = at(p.r0, R - 10);
  const [ax, ay] = at(nat, R + 2);
  return (
    <svg class="sp-dial" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Starting uranium-234 dial at ${sig(p.r0)}`}>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} class="arc" fill="none" />
      {ticks.map((v) => {
        const [x1, y1] = at(v, R);
        const [x2, y2] = at(v, R - 7);
        const [tx, ty] = at(v, R - 19);
        return (
          <g key={v}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} class="axisline" />
            <text x={tx} y={ty + 4} class="tick" text-anchor="middle">{sig(v, 2)}</text>
          </g>
        );
      })}
      <circle cx={ax} cy={ay} r={4} class="natural" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} class="needle" />
      <circle cx={cx} cy={cy} r={4} class="hub" />
    </svg>
  );
}

function ClockAge(p: { label: string; years: number | null }) {
  const gloss = game.settings.value.humanGloss;
  if (p.years === null) {
    return (
      <li>
        <span class="k">{p.label}</span> <span class="dim">never reaches the measured ratio</span>
      </li>
    );
  }
  return (
    <li>
      <span class="k">{p.label}</span> <span class="num">{beatsNumber(p.years * JULIAN_YEAR_S)}</span> <GlyphSvg k={UNIT_KEY.time} height={15} class="unit" />
      {gloss && <span class="si"> ({sig(p.years)} years)</span>}
    </li>
  );
}

export interface PurityProps {
  m: SpotModel;
  countedS: number;
  r0: number;
  onR0: (r: number) => void;
}

export function PurityPanel(p: PurityProps) {
  const id = 'spot.purity';
  const status = nodeStatus(id, confirmedSet.value);
  const c = p.m.session.countsAt(p.countedS);
  const ok = c.u238 > 0;
  const clocks = useMemo(() => (ok ? clockAges(c, p.r0) : null), [p.countedS, p.r0]);
  const test = useMemo(() => (ok ? testStartHypothesis(c, p.r0) : null), [p.countedS, p.r0]);
  const pv = test?.pValue ?? null;
  const agree = pv !== null && pv >= REJECT_P;
  const frac = pv === null ? 0 : Math.max(0, 1 - Math.log10(Math.max(pv, 10 ** P_FLOOR_LOG)) / P_FLOOR_LOG);
  const thr = 1 - Math.log10(REJECT_P) / P_FLOOR_LOG;
  return (
    <Panel id={id} title="Purity test" glyph="purity" current={{ countingTimeS: p.countedS, startA234overA238: Math.round(p.r0 * 1000) / 1000 }}>
      <p class="sp-small">
        Dial how much uranium-234 the spot held when it was laid down, for each uranium-238. Each clock then gives its own age from your counts
        ({sig(c.th230)} thorium-230 so far).
      </p>
      <div class="sp-purity">
        <Dial r0={p.r0} />
        <div>
          <label class="sp-slider">
            <span class="k">start</span>
            <input type="range" min={0} max={DIAL_MAX} step={0.01} value={p.r0} data-start-input onInput={(e) => p.onR0(Number((e.currentTarget as HTMLInputElement).value))} />
            <span class="num">{sig(p.r0, 3)}</span>
          </label>
          <p class="sp-small sp-legend">
            <span class="dot" aria-hidden="true" /> ore in balance: {sig(naturalStartRatio(), 3)} (uranium-234 as active as uranium-238)
          </p>
          <ul class="sp-clocks">
            <ClockAge label="uranium-234 clock" years={clocks?.u234Years ?? null} />
            <ClockAge label="thorium-230 clock" years={clocks?.th230Years ?? null} />
          </ul>
        </div>
      </div>
      <div class="sp-meter" data-p-value={pv ?? ''} data-agree={agree ? '1' : '0'}>
        <span class="k">do the counts fit this start?</span>
        <div class="track" aria-hidden="true">
          <div class={`fill ${agree ? 'agree' : 'disagree'}`} style={{ width: `${(frac * 100).toFixed(1)}%` }} />
          <div class="thr" style={{ left: `${(thr * 100).toFixed(1)}%` }} />
        </div>
        <p class="sp-small">
          {pv === null
            ? 'Count first.'
            : agree
              ? `They fit: counts like these would turn up ${pv >= 0.995 ? 'nearly always' : `${sig(pv * 100, 2)}% of the time`} from this start` +
                (pv < START_P_95 ? ', at the edge: outside the 95% range, inside the 99.9% level.' : '.')
              : pv < 10 ** P_FLOOR_LOG
                ? `They do not fit: from this start, counts this far off would turn up less than once in 10${superscript(-P_FLOOR_LOG)} tries.`
                : `They do not fit: from this start, counts this far off would turn up with a chance of only ${sig(pv, 2)}.`}
        </p>
      </div>
      {status === 'open' && (
        <button type="button" class="btn" data-propose="spot.purity" disabled={p.countedS <= 0} onClick={() => propose(id, { countingTimeS: p.countedS, startA234overA238: Math.round(p.r0 * 1000) / 1000 })}>
          It began like this
        </button>
      )}
    </Panel>
  );
}
