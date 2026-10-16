// The Map's instrument: the galaxy chart with the cover's map laid over it (the centrepiece), the cover's
// own map beside it with the chosen line's reading and how a pulsar fits it, and the deductions one step at
// a time. Each step brings its own tool under the chart: the spin-down clock, the ages across the sky, the
// plane where the map's origin is slid. Every number comes from the epoch model or the science (rule 1);
// proposals go through the command bus (rule 5).

import { useEffect } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { MAP_NODE_IDS } from './checkers';
import { CoverMap } from './CoverMap';
import { GalaxyPane } from './GalaxyPane';
import { LinePanel } from './LinePanel';
import { prepare, prepareRegion } from './load';
import { OriginPlane } from './OriginPlane';
import { SkyAges } from './SkyAges';
import { SpinClock } from './SpinClock';
import { model, phase, resume, stage, timings } from './state';
import { StepPanel } from './StepPanel';
import './map.css';

let resumedFor: string | null = null;

export function MapInstrument() {
  const seed = game.seed.value;
  const confirmed = confirmedSet.value;
  const s = stage.value;

  useEffect(() => {
    if (resumedFor !== seed) {
      resumedFor = seed;
      resume(game.records.value);
    }
    void prepare(seed);
  }, [seed]);

  // When a step is confirmed, bring the next open one onto the bench.
  useEffect(() => {
    if (nodeStatus(stage.value, confirmed) === 'open') return;
    const next = MAP_NODE_IDS.find((id) => nodeStatus(id, confirmed) === 'open');
    if (next) stage.value = next;
  }, [confirmed.size]);

  // The region's fit is the heaviest computation: measure it when its tools open, behind the measuring note.
  const ready = phase.value === 'ready' && model.value !== null;
  useEffect(() => {
    if (ready && s === 'map.region') void prepareRegion();
  }, [ready, s]);

  const tool = s === 'map.old' ? <SpinClock /> : s === 'map.motion' ? <SkyAges /> : s === 'map.region' ? <OriginPlane /> : <LinePanel />;
  const t = timings.value;
  return (
    <div class="mapinst" data-map-phase={phase.value} data-stage={s} data-ms-identify={t.identify ?? ''} data-ms-region={t.region ?? ''} data-ms-load={t.load ?? ''}>
      <div class="map-left">
        <GalaxyPane />
        {ready && tool}
      </div>
      <div class="map-right">
        <CoverMap />
        <StepPanel />
      </div>
    </div>
  );
}
