// The Trail's instrument: the neighbourhood chart (or, for the last two deductions, the region view and the
// reframe) beside a column of tools. The trail tool picks the star the machine flies straight away from;
// after that the run-back and the ruler open; with The Map's region the region view, and with The Map's
// motion and the region check, the reframe. The model is loaded and measured behind a visible "measuring"
// state so the page paints first; every proposal goes through the command bus.

import { useEffect, useState } from 'preact/hooks';
import { missingFor } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { PanelHead } from '../key/parts';
import type { EpochModel } from '../shared/epochModel';
import { ChartPane } from './ChartPane';
import { ReframePlot, ReframeTool } from './ReframeView';
import { RegionPlot, RegionTool } from './RegionView';
import { ensureModel, ensureReframe, ensureRegion, failure, measuring, model, tool, type Tool } from './state';
import { RulerTool, RunBackTool, TrailTool } from './tools';
import './trail.css';

const TOOLS: { id: Tool; label: string; node: string; needs: string[] }[] = [
  { id: 'trail', label: 'Trail', node: 'trail.origin', needs: [] },
  { id: 'runback', label: 'Run back', node: 'trail.age', needs: ['trail.origin'] },
  { id: 'ruler', label: 'Ruler', node: 'trail.neighbour', needs: ['trail.origin'] },
  { id: 'region', label: 'Region', node: 'trail.where', needs: ['trail.origin', 'map.region'] },
  { id: 'reframe', label: 'Reframe', node: 'trail.when', needs: ['trail.where', 'map.motion'] },
];

const unlocked = (t: Tool, confirmed: ReadonlySet<string>): boolean => (TOOLS.find((x) => x.id === t)?.needs ?? []).every((n) => confirmed.has(n));

function Locked(p: { node: string }) {
  const missing = missingFor(p.node, confirmedSet.value);
  return (
    <section class="kpanel tr-tool locked" data-tool-panel="locked">
      <PanelHead id={p.node} />
      <p class="note">Needs first: {missing.map((id) => nodeDef(id)?.question ?? id).join(' ')}</p>
    </section>
  );
}

function Tool_(p: { m: EpochModel; t: Tool; ready: boolean }) {
  const def = TOOLS.find((x) => x.id === p.t)!;
  if (!unlocked(p.t, confirmedSet.value)) return <Locked node={def.node} />;
  if (!p.ready) return <p class="note tr-wait">Measuring...</p>;
  switch (p.t) {
    case 'trail':
      return <TrailTool m={p.m} />;
    case 'runback':
      return <RunBackTool m={p.m} />;
    case 'ruler':
      return <RulerTool m={p.m} />;
    case 'region':
      return <RegionTool m={p.m} />;
    case 'reframe':
      return <ReframeTool m={p.m} />;
  }
}

export function TrailInstrument() {
  const seed = game.seed.value;
  const m = model.value;
  const t = tool.value;
  const confirmed = confirmedSet.value;
  const [prepared, setPrepared] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void ensureModel(seed).catch(() => undefined);
  }, [seed]);

  // the region and the reframe need the map's fit, region and frames: measure them on first use
  const open = unlocked(t, confirmed);
  useEffect(() => {
    if (!m || !open) return;
    const key = `${m.seed}/${t}`;
    if (t === 'region' && !prepared[key]) void ensureRegion(m).then(() => setPrepared((x) => ({ ...x, [key]: true }))).catch(() => undefined);
    if (t === 'reframe' && !prepared[key]) void ensureReframe(m).then(() => setPrepared((x) => ({ ...x, [key]: true }))).catch(() => undefined);
  }, [m, t, open]);

  const ready = Boolean(m) && (t === 'region' || t === 'reframe' ? Boolean(m && prepared[`${m.seed}/${t}`]) : true);
  const view = open && ready && (t === 'region' || t === 'reframe') ? t : 'chart';
  return (
    <div class="trinst" data-trail-ready={m ? 'true' : 'false'} data-view={view} data-tool={t}>
      <div class="tr-main">
        {m && <ChartPane m={m} />}
        {m && view === 'region' && (
          <div class="tr-plotwrap">
            <RegionPlot m={m} />
          </div>
        )}
        {m && view === 'reframe' && (
          <div class="tr-plotwrap">
            <ReframePlot m={m} />
          </div>
        )}
        {(measuring.value || !m) && (
          <div class="tr-measuring" role="status" aria-live="polite" data-measuring="">
            {failure.value ?? `${measuring.value ?? 'Loading the star catalogues'}...`}
          </div>
        )}
      </div>
      <div class="tr-side">
        <nav class="tr-tabs" aria-label="Tools">
          {TOOLS.map((x) => (
            <button
              key={x.id}
              type="button"
              class={`tr-tab${t === x.id ? ' on' : ''}${unlocked(x.id, confirmed) ? '' : ' locked'}${confirmed.has(x.node) ? ' done' : ''}`}
              aria-pressed={t === x.id}
              data-tool-tab={x.id}
              onClick={() => (tool.value = x.id)}
            >
              {x.label}
            </button>
          ))}
        </nav>
        <div class="tr-toolcol">{m ? <Tool_ m={m} t={t} ready={ready} /> : <p class="note tr-wait">Loading...</p>}</div>
      </div>
    </div>
  );
}
