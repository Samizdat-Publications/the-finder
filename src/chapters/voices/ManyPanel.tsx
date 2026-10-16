// voices.many: cut the greetings at their pauses. The player sets the segmenter's threshold and its shortest
// pause; the trace of the greetings' loudness shows the threshold and the stretches it cuts, and the count is
// read off (all measured by the Worker on the track's runtime audio). Below, each stretch's pitch as a dot
// against a ruler one speaker's own range wide (Ozma 01, one man): the player says how many voices' worth of
// pitch the dots span. The proposal goes through the command bus.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet } from '../../game/state';
import { segmentPitches, segments } from '../../dsp/segment';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { analyse, jobProgress, peekResult } from './analysisClient';
import { GAP_RANGE, ONE_VOICE_SEMITONES, PIECES, THRESHOLD_RANGE } from './data';
import { Progress, Q } from './parts';

const W = 520;
const H = 120;
const PH = 70;
/** The pitch strip's range, Hz (log axis): below and above every speaking voice the tracker allows. */
const P_LO = 60;
const P_HI = 500;

export function ManyPanel() {
  const id = 'voices.many';
  const status = nodeStatus(id, confirmedSet.value);
  const track = PIECES.greetings;
  const [threshold, setThreshold] = useState(-45);
  const [gap, setGap] = useState(0.6);
  const [groups, setGroups] = useState(1);
  const [ruler, setRuler] = useState(130);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status === 'locked') return;
    let live = true;
    void analyse(track, 'greetings').then(() => live && setTick((n) => n + 1)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status]);
  const r = peekResult(track, 'greetings');
  const segs = useMemo(() => (r ? segments(r.levels, threshold, gap) : []), [r, threshold, gap]);
  const pitches = useMemo(() => (r ? segmentPitches(r.levels, r.f0, threshold, gap) : []), [r, threshold, gap]);
  const trace = useMemo(() => {
    if (!r) return '';
    // One point per 0.5 s: the loudest frame in it (the trace a level meter would draw).
    const step = 50;
    const n = r.levels.length;
    const pts: string[] = [];
    for (let k = 0; k < n; k += step) {
      let m = -100;
      for (let j = k; j < Math.min(n, k + step); j++) m = Math.max(m, r.levels[j]!);
      pts.push(`${((k / n) * W).toFixed(1)},${lv(m).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [r]);
  const n = r?.levels.length ?? 1;
  const px = (hz: number): number => (Math.log(hz / P_LO) / Math.log(P_HI / P_LO)) * W;
  const rulerW = px(P_LO * 2 ** (ONE_VOICE_SEMITONES / 12));
  return (
    <section class={`kpanel vo-panel ${status}`} data-panel={id} data-status={status}>
      <PanelHead id={id} />
      {status !== 'locked' && (
        <>
          <p class="note small">Voices 2, the greetings, cut where they fall quiet. Set how quiet counts as a pause, and how long a pause must last.</p>
          {!r && <Progress f={jobProgress.value[`${track}/greetings`] ?? 0} what="following the voices' loudness and pitch" />}
          {r && (
            <>
              <svg class="vo-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The voices' loudness against time, with the threshold">
                <polyline class="vo-trace" points={trace} />
                {segs.map(([a, b], i) => (
                  <rect key={i} class="vo-seg" x={(a / n) * W} y={H - 8} width={Math.max(1, ((b - a) / n) * W)} height={6} />
                ))}
                <line class="vo-thresh" x1={0} x2={W} y1={lv(threshold)} y2={lv(threshold)} />
              </svg>
              <div class="vo-controls">
                <label class="vo-slider">
                  <span>Quiet below</span>
                  <input type="range" min={THRESHOLD_RANGE.min} max={THRESHOLD_RANGE.max} step={THRESHOLD_RANGE.step} value={threshold} data-control="threshold" onInput={(e) => setThreshold(Number((e.target as HTMLInputElement).value))} />
                  <output class="num">{threshold.toFixed(1)}</output>
                </label>
                <label class="vo-slider">
                  <span>Pause at least</span>
                  <input type="range" min={GAP_RANGE.min} max={GAP_RANGE.max} step={GAP_RANGE.step} value={gap} data-control="gap" onInput={(e) => setGap(Number((e.target as HTMLInputElement).value))} />
                  <output><Q dim="time" si={gap} digits={3} /></output>
                </label>
              </div>
              <p class="vo-count">
                Stretches of voice between pauses: <span class="num big" data-count={segs.length}>{segs.length}</span>
              </p>
              <svg class="vo-chart vo-pitch" viewBox={`0 0 ${W} ${PH}`} role="img" aria-label="Each voice's pitch, low to high, with a ruler one speaker's range wide">
                <rect class="vo-ruler" x={px(ruler)} y={6} width={rulerW} height={PH - 22} data-ruler="" />
                {pitches.map((p, i) => (
                  <circle key={i} class="vo-dot" cx={px(p)} cy={14 + ((i * 7) % (PH - 34))} r={3} />
                ))}
                <text class="tick" x={2} y={PH - 3}>low</text>
                <text class="tick" x={W - 2} y={PH - 3} text-anchor="end">high</text>
              </svg>
              <div class="vo-controls">
                <label class="vo-slider">
                  <span>Slide the ruler: one speaker's own range</span>
                  <input type="range" min={P_LO} max={P_HI / 2 ** (ONE_VOICE_SEMITONES / 12)} step={1} value={ruler} onInput={(e) => setRuler(Number((e.target as HTMLInputElement).value))} />
                </label>
                <label class="vo-stepper">
                  <span>Voices' worth of pitch</span>
                  <button type="button" class="btn small" data-groups="minus" onClick={() => setGroups((g) => Math.max(1, g - 1))}>−</button>
                  <output class="num" data-groups-value={groups}>{groups}</output>
                  <button type="button" class="btn small" data-groups="plus" onClick={() => setGroups((g) => Math.min(12, g + 1))}>+</button>
                </label>
              </div>
              <button
                type="button"
                class="btn small"
                disabled={status !== 'open'}
                data-propose-button={id}
                onClick={() => send({ type: 'deduction.propose', id, answer: { threshold, gap, groups } })}
              >
                Propose
              </button>
            </>
          )}
        </>
      )}
      <LastReading id={id} current={{ threshold, gap, groups }} />
    </section>
  );
}

/** Loudness (dBFS) to the trace's y: -70 at the bottom, 0 at the top. */
function lv(db: number): number {
  const top = 0;
  const bottom = -70;
  return 4 + ((top - Math.max(bottom, Math.min(top, db))) / (top - bottom)) * (H - 18);
}
