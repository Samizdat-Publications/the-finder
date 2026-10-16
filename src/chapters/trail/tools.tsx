// The Trail's chart tools: the trail readout for the picked star (and the proposal of where the machine came
// from), the run-back (the machine and that star run back together until they meet), and the ruler (from
// the alien's own star to another). Every number is computed from the model; every proposal goes through
// the command bus.

import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { norm } from '../../science/astro';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { TRAIL_MAX_DIST_PC, type EpochModel } from '../shared/epochModel';
import { chartHandle } from './ChartPane';
import { angleText, distText, figuresFor, speedText, yearsText } from './format';
import { consistent, cutRatio, homeId, meeting, noRvBounds, relativeState, rowFor, rulerReading, separationAt, starById, starName, trailLevel } from './physics';
import { picked, rulerEnds, runYears, tintAll } from './state';

const gloss = (): boolean => game.settings.value.humanGloss;

function Propose(p: { id: string; label: string; answer: () => unknown; disabled?: boolean }) {
  if (nodeStatus(p.id, confirmedSet.value) !== 'open') return null;
  return (
    <button
      type="button"
      class="btn small tr-propose"
      data-propose-button={p.id}
      disabled={p.disabled}
      onClick={() => send({ type: 'deduction.propose', id: p.id, answer: p.answer() as never })}
    >
      {p.label}
    </button>
  );
}

/** A measured distance over speed with its 95% interval, at the figures that tell the three apart. */
function dosText(years: number, iv: [number, number], g: boolean): [string, string, string] {
  const d = figuresFor(Math.max(years, iv[1]), iv[1] - iv[0]);
  return [yearsText(years, g, d), yearsText(iv[0], g, d), yearsText(iv[1], g, d)];
}

/** The trail readout of the picked star: the alien's one measurement, judged against the 95% cut. */
export function TrailTool(p: { m: EpochModel }) {
  const m = p.m;
  const id = picked.value;
  const star = id !== null ? starById(m, id) : undefined;
  const row = id !== null ? rowFor(m, id) : null;
  const g = gloss();
  const done = confirmedSet.value.has('trail.origin');
  return (
    <section class="kpanel tr-tool" data-tool-panel="trail">
      <PanelHead id="trail.origin" />
      {!done && <p class="note">Click a star. A thing thrown from a star flies straight away from it: compare the machine's motion relative to the star with the direction out of the star.</p>}
      {star ? (
        <div class="tr-readout" data-readout={star.id}>
          <h3 class="tr-name">{starName(star)}</h3>
          {id === homeId(m) ? (
            <p class="note">Your own star. The machine is passing it now, at its closest approach.</p>
          ) : row ? (
            <dl class="tr-dl">
              <dt>Motion from straight away, as you measure it</dt>
              <dd data-angle={row.measuredAngleDeg} data-angle-cut={row.nullAngle95Deg}>{angleText(row.measuredAngleDeg)}</dd>
              <dt>95% cut for a star it truly flew from</dt>
              <dd>{angleText(row.nullAngle95Deg)}</dd>
              <dt>Spread of the angle, rms per axis</dt>
              <dd>{angleText(row.angleRmsDeg)}</dd>
              <dt>Distance from the machine</dt>
              <dd>{distText(row.distPc, g)}</dd>
              <dt>Speed relative to it</dt>
              <dd>{speedText(norm(relativeState(m, row.star).vKmS), g)}</dd>
              <dt>Distance over speed, as you measure it</dt>
              <dd data-dos={row.measuredDistOverSpeedYears}>{dosText(row.measuredDistOverSpeedYears, row.measuredDistOverSpeedInterval95, g)[0]}</dd>
              <dt>95% from</dt>
              <dd>{dosText(row.measuredDistOverSpeedYears, row.measuredDistOverSpeedInterval95, g)[1]}</dd>
              <dt>to</dt>
              <dd>{dosText(row.measuredDistOverSpeedYears, row.measuredDistOverSpeedInterval95, g)[2]}</dd>
            </dl>
          ) : (
            <NoRv m={m} id={star.id} />
          )}
          {row && star.rvFromPrimary && <p class="note">Its radial velocity is its companion's: it has none of its own in the catalogue.</p>}
          {row && id !== homeId(m) && (
            <p class="note tr-verdict">
              {consistent(row)
                ? 'Inside the 95% cut: a star the machine truly flew from would show an angle this small or smaller 95% of the time.'
                : trailLevel(m, row).level === 'edge'
                  ? `${cutRatio(row).toFixed(2)} times the 95% cut, inside the 99.9% cut: consistent, at the edge.`
                  : `${cutRatio(row) < 10 ? cutRatio(row).toFixed(1) : cutRatio(row).toFixed(0)} times the 95% cut for a star it truly flew from, beyond the 99.9% cut.`}
            </p>
          )}
        </div>
      ) : (
        <p class="note tr-empty">No star picked yet.</p>
      )}
      <div class="tr-row">
        <Propose id="trail.origin" label="Propose: it came from this star" answer={() => ({ starId: picked.value as number })} disabled={id === null} />
        {star && (
          <button type="button" class="btn small" onClick={() => void chartHandle()?.frame({ starId: star.id })}>
            Frame it
          </button>
        )}
        {done && (
          <button type="button" class={`btn small${tintAll.value ? ' on' : ''}`} aria-pressed={tintAll.value} data-tint-all="" onClick={() => (tintAll.value = !tintAll.value)}>
            {tintAll.value ? 'Plain colours' : 'Tint all by angle'}
          </button>
        )}
      </div>
      <LastReading id="trail.origin" current={picked.value !== null ? { starId: picked.value } : null} />
    </section>
  );
}

function NoRv(p: { m: EpochModel; id: number }) {
  const star = starById(p.m, p.id);
  if (!star) return null;
  const b = noRvBounds(p.m, star);
  return (
    <div class="tr-norv">
      <p class="note">No measured radial velocity: its motion along your line of sight is unknown, so it is drawn hollow and its trail cannot be drawn.</p>
      <dl class="tr-dl">
        {b.map((x) => (
          <>
            <dt>Smallest possible angle, radial velocity up to {x.vmaxKmS} km/s</dt>
            <dd>{x.angleDeg === null ? `never within ${TRAIL_MAX_DIST_PC} pc` : angleText(x.angleDeg)}</dd>
          </>
        ))}
      </dl>
    </div>
  );
}

/** Run-back range, years: past the travel time of most of the chart's stars (a display choice). */
export const RUN_MAX_YEARS = 150_000;
const STEPS = [-1000, -100, -10, 10, 100, 1000];

function SeparationPlot(p: { m: EpochModel; id: number }) {
  const star = starById(p.m, p.id);
  if (!star) return null;
  const W = 360;
  const H = 110;
  const n = 120;
  const pts: [number, number][] = [];
  let max = 0;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * RUN_MAX_YEARS;
    const s = separationAt(p.m, star, t);
    pts.push([t, s]);
    max = Math.max(max, s);
  }
  const x = (t: number): number => 6 + (t / RUN_MAX_YEARS) * (W - 12);
  const y = (s: number): number => H - 14 - (s / max) * (H - 24);
  const t = runYears.value;
  return (
    <svg class="tr-sepplot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Separation of the machine and the star against time run back">
      <line class="axis" x1={6} y1={H - 14} x2={W - 6} y2={H - 14} />
      <polyline class="curve" points={pts.map(([a, b]) => `${x(a)},${y(b)}`).join(' ')} />
      <line class="now" x1={x(t)} y1={6} x2={x(t)} y2={H - 14} />
      <circle class="nowdot" cx={x(t)} cy={y(separationAt(p.m, star, t))} r={3.5} />
      <text x={6} y={H - 2}>now</text>
      <text x={W - 6} y={H - 2} text-anchor="end">
        further back
      </text>
    </svg>
  );
}

/** The run-back of the machine and the picked star. */
export function RunBackTool(p: { m: EpochModel }) {
  const m = p.m;
  const id = picked.value;
  const star = id !== null ? starById(m, id) : undefined;
  const g = gloss();
  const can = star && star.rvKmS !== null && id !== homeId(m);
  const t = runYears.value;
  const set = (v: number): void => {
    runYears.value = Math.min(RUN_MAX_YEARS, Math.max(0, Math.round(v)));
  };
  const sep = can && star ? separationAt(m, star, t) : null;
  const meet = can && star ? meeting(m, star) : null;
  return (
    <section class="kpanel tr-tool" data-tool-panel="runback">
      <PanelHead id="trail.age" />
      <p class="note">
        Run the machine and {star ? starName(star) : 'the picked star'} back in time together, each along its straight line. Where they meet is where it set out.
      </p>
      {can && star ? (
        <>
          <label class="tr-slider">
            <span>
              Run back <output data-run-years={t}>{yearsText(t, g, 4)}</output>
            </span>
            <input type="range" min={0} max={RUN_MAX_YEARS} step={10} value={t} onInput={(e) => set(Number((e.target as HTMLInputElement).value))} data-run-slider="" />
          </label>
          <div class="tr-row">
            {STEPS.map((s) => (
              <button key={s} type="button" class="btn small tr-step" onClick={() => set(t + s)}>
                {s > 0 ? `+${s}` : s}
              </button>
            ))}
            <input
              class="tr-num"
              type="number"
              min={0}
              max={RUN_MAX_YEARS}
              step={10}
              value={t}
              aria-label="Years run back (the human count)"
              data-run-input=""
              onChange={(e) => set(Number((e.target as HTMLInputElement).value))}
            />
          </div>
          <SeparationPlot m={m} id={star.id} />
          <dl class="tr-dl">
            <dt>Separation then</dt>
            <dd data-separation={sep?.toFixed(6)}>{sep !== null ? distText(sep, g) : ''}</dd>
            <dt>Closest they come</dt>
            <dd>{meet && t >= meet.yearsAgo - 0.5 ? distText(meet.missPc, g) : 'not reached yet'}</dd>
          </dl>
        </>
      ) : (
        <p class="note tr-empty">{star ? 'This star cannot be run back: ' + (id === homeId(m) ? 'it is your own.' : 'its radial velocity is unknown.') : 'Pick a star on the chart.'}</p>
      )}
      <Propose id="trail.age" label="Propose: they met this long ago" answer={() => ({ years: runYears.value })} disabled={!can} />
      <LastReading id="trail.age" current={{ years: runYears.value }} />
    </section>
  );
}

/** The ruler: from the alien's own star to another. */
export function RulerTool(p: { m: EpochModel }) {
  const m = p.m;
  const ends = rulerEnds.value;
  const home = homeId(m);
  const g = gloss();
  const other = ends.length === 2 ? (ends[0] === home ? ends[1] : ends[1] === home ? ends[0] : null) : null;
  const s = other !== null && other !== undefined ? starById(m, other) : undefined;
  const r = s && other !== home ? rulerReading(m, s) : null;
  return (
    <section class="kpanel tr-tool" data-tool-panel="ruler">
      <PanelHead id="trail.neighbour" />
      <p class="note">Click your own star, then another. The ruler measures between them as you measure it: your own position carries an error, and the ruler shows it.</p>
      <dl class="tr-dl">
        <dt>Ends</dt>
        <dd data-ruler-ends={ends.join(',')}>{ends.length ? ends.map((id) => starName(starById(m, id)!)).join(' to ') : 'none yet'}</dd>
        <dt>Distance</dt>
        <dd data-ruler={r ? r.distPc.toFixed(6) : ''}>
          {r ? `${distText(r.distPc, g)} ± ${distText(r.sigmaPc, g)}` : ends.length === 2 ? 'One end must be your own star.' : 'click two stars'}
        </dd>
      </dl>
      <div class="tr-row">
        <Propose id="trail.neighbour" label="Propose this distance" answer={() => ({ distancePc: r?.distPc ?? 0 })} disabled={!r} />
        <button type="button" class="btn small" onClick={() => (rulerEnds.value = [])}>
          Clear the ruler
        </button>
      </div>
      <LastReading id="trail.neighbour" current={r ? { distancePc: r.distPc } : null} />
    </section>
  );
}
