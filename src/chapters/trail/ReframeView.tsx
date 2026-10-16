// The reframe: the map's line ages (The Map's dating) as points with their 95% bars, read in a frame the
// player chooses: the alien's own (ages('own')), the star the machine came from (ages('sun')), or any other
// star with a measured velocity (datePulsar reframed into it, frames.ts). In the right frame the old lines
// snap together. The player sets a cursor on the age axis and proposes it; the combined age and its interval
// appear only after a proposal.

import { useMemo, useRef } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { nearestStars } from '../../science/epoch';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import type { EpochModel } from '../shared/epochModel';
import { AGREE_CHI2_PER_DOF } from './checkers';
import { beatsPerYear, fmtYears, yearsText } from './format';
import { formatPower } from '../../ui/units';
import { agesInFrame, judgedLines, oldSpread, type FrameId } from './frames';
import { homeId, originRow, starById, starName } from './physics';
import { cursorYears, frame, frameAges, picked, selectFrame } from './state';

const W = 640;
const ROW = 32;
const LEFT = 108;
const RIGHT = 16;
const TOP = 26;

/** The age axis, years ago: wide enough for the alien's own frame and the origin's (a display choice). */
function axisRange(m: EpochModel): [number, number] {
  const meds = [...m.ages('own').perLine, ...m.ages('sun').perLine].filter((a) => !a.young).map((a) => a.median);
  const lo = Math.min(...meds);
  const hi = Math.max(...meds);
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

export function ReframePlot(p: { m: EpochModel }) {
  const m = p.m;
  const f = frameAges.value;
  const [a0, a1] = useMemo(() => axisRange(m), [m]);
  const svg = useRef<SVGSVGElement>(null);
  const n = m.lines.length;
  const H = TOP + n * ROW + 34;
  const x = (y: number): number => LEFT + ((y - a0) / (a1 - a0)) * (W - LEFT - RIGHT);
  const inv = (px: number): number => a0 + ((px - LEFT) / (W - LEFT - RIGHT)) * (a1 - a0);
  const proposed = (game.records.value['trail.when']?.attempts.length ?? 0) > 0;
  const setFromEvent = (e: PointerEvent): void => {
    const el = svg.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < LEFT) return;
    cursorYears.value = Math.round(inv(Math.min(W - RIGHT, px)) / 10) * 10;
  };
  // Ticks at round numbers of the alien's beats (a power of ten times 1, 2 or 5), labelled the alien's way.
  const bpy = beatsPerYear();
  const span = (a1 - a0) * bpy;
  const p10 = 10 ** Math.floor(Math.log10(span / 5));
  const stepB = [1, 2, 5, 10].map((k) => k * p10).find((st) => span / st <= 8) ?? 10 * p10;
  const ticks: number[] = [];
  for (let b = Math.ceil((a0 * bpy) / stepB) * stepB; b <= a1 * bpy; b += stepB) ticks.push(b / bpy);
  const c = cursorYears.value;
  const clip = (v: number): number => Math.min(W - RIGHT, Math.max(LEFT, v));
  return (
    <svg
      ref={svg}
      class="tr-reframe"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="The map's line ages in the chosen frame"
      onPointerDown={(e) => {
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        setFromEvent(e);
      }}
      onPointerMove={(e) => e.buttons & 1 && setFromEvent(e)}
      data-frame={String(frame.value)}
      data-a0={a0}
      data-a1={a1}
      data-left={LEFT}
      data-right={RIGHT}
    >
      {ticks.map((t) => (
        <g key={t} class="tick">
          <line x1={x(t)} x2={x(t)} y1={TOP - 6} y2={TOP + n * ROW} />
          <text x={x(t)} y={TOP + n * ROW + 16} text-anchor="middle">
            {formatPower(t * bpy, 3)}
          </text>
        </g>
      ))}
      <text class="axislabel" x={W - RIGHT} y={H - 4} text-anchor="end">
        beats since the map was made{game.settings.value.humanGloss ? ` (10¹² beats is ${fmtYears(1e12 / bpy)} years)` : ''}
      </text>
      {proposed && f && (
        <rect class="tr-band" x={clip(x(f.combined.lo))} y={TOP - 8} width={Math.max(1, clip(x(f.combined.hi)) - clip(x(f.combined.lo)))} height={n * ROW + 8} data-band="" />
      )}
      {f &&
        f.perLine.map((a, i) => {
          const y = TOP + i * ROW + ROW / 2;
          const inRange = a.median >= a0 && a.median <= a1;
          return (
            <g key={a.jname} class={a.young ? 'line young' : 'line'} data-line={a.jname} data-median={a.median.toFixed(0)}>
              <text class="lab" x={LEFT - 8} y={y + 4} text-anchor="end">
                {a.jname}
              </text>
              <line class="bar" x1={clip(x(a.lo))} x2={clip(x(a.hi))} y1={y} y2={y} />
              {inRange && <circle class="pt" cx={x(a.median)} cy={y} r={4} />}
            </g>
          );
        })}
      {c !== null && (
        <g class="tr-cursor">
          <line x1={x(c)} x2={x(c)} y1={TOP - 10} y2={TOP + n * ROW + 4} />
        </g>
      )}
    </svg>
  );
}

/** Stars a frame can be taken from: the nearest to the alien's star with a measured velocity, and the star picked on the chart. */
function frameStars(m: EpochModel): number[] {
  const near = nearestStars(m.inputs.stars, m.measured.posPc, m.disc.decimalYear, 24, [homeId(m)])
    .filter((s) => s.fullVelocity)
    .slice(0, 12)
    .map((s) => s.star.id);
  const pk = picked.value;
  if (pk !== null && pk !== homeId(m) && starById(m, pk)?.rvKmS != null && !near.includes(pk)) near.push(pk);
  return near;
}

export function ReframeTool(p: { m: EpochModel }) {
  const m = p.m;
  const g = game.settings.value.humanGloss;
  const f = frameAges.value;
  const fr = frame.value;
  const options = useMemo(() => frameStars(m), [m, picked.value]);
  const set = useMemo(() => judgedLines(agesInFrame(m, originRow(m).star.id, originRow(m).star)), [m]);
  const s = f ? oldSpread(f, set) : null;
  const open = nodeStatus('trail.when', confirmedSet.value) === 'open';
  const c = cursorYears.value;
  const go = (v: FrameId): void => void selectFrame(m, v).catch(() => undefined);
  const proposed = (game.records.value['trail.when']?.attempts.length ?? 0) > 0;
  return (
    <section class="kpanel tr-tool" data-tool-panel="reframe">
      <PanelHead id="trail.when" />
      <p class="note">Each line's age, read from its pulsar's rate as you measure it. Your own motion shifts every rate. Read them as another star would: pick a frame.</p>
      <div class="tr-frames" role="radiogroup" aria-label="Frame the ages are read in">
        <label class="tr-radio">
          <input type="radio" name="tr-frame" checked={fr === 'own'} onChange={() => go('own')} data-frame-own="" />
          <span>Your own frame</span>
        </label>
        <label class="tr-radio">
          <input type="radio" name="tr-frame" checked={fr !== 'own'} onChange={() => go(options[0] ?? 'own')} />
          <span>The frame of</span>
          <select
            value={fr === 'own' ? '' : String(fr)}
            onChange={(e) => go(Number((e.target as HTMLSelectElement).value))}
            data-frame-select=""
            aria-label="Star whose frame the ages are read in"
          >
            {fr === 'own' && <option value="">a star</option>}
            {options.map((id) => (
              <option key={id} value={String(id)}>
                {starName(starById(m, id)!)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {s && (
        <p class="note" data-agreement={s.chi2PerDof.toFixed(2)}>
          The {s.count} old lines spread over {yearsText(s.spread, g)}: {s.chi2PerDof < AGREE_CHI2_PER_DOF ? 'as tight as their errors allow.' : `${s.chi2PerDof.toFixed(0)} times the scatter their errors allow.`}
        </p>
      )}
      <dl class="tr-dl">
        <dt>Your mark</dt>
        <dd data-cursor={c ?? ''}>{c !== null ? yearsText(c, g, 4) : 'click the ages to set it'}</dd>
        {proposed && f && (
          <>
            <dt>Combined, this frame</dt>
            <dd data-combined={f.combined.estimate.toFixed(0)}>{`${yearsText(f.combined.estimate, g, 4)}; 95% from ${yearsText(f.combined.lo, g, 4)} to ${yearsText(f.combined.hi, g, 4)}`}</dd>
          </>
        )}
      </dl>
      {open && (
        <button
          type="button"
          class="btn small tr-propose"
          data-propose-button="trail.when"
          disabled={c === null}
          onClick={() => send({ type: 'deduction.propose', id: 'trail.when', answer: { yearsAgo: c as number, frame: fr } })}
        >
          Propose: the map was made this long ago
        </button>
      )}
      <LastReading id="trail.when" />
    </section>
  );
}
