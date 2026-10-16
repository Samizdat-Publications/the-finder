// The Arrival instrument: the encounter scene fills the workbench and the alien's scan panels sit over it.
// Four scans, one per deduction (structure, heat, isotopes, the decay clock); each scan frames the part it
// reads and marks it in the scene. The scene stays alive (drift and lamps) unless reduced motion is on.

import { useEffect, useRef, useState } from 'preact/hooks';
import { nodeStatus, type NodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import type { ChapterInstrumentProps } from '../registry';
import { mountEncounter, type EncounterHandle } from '../../world/encounter';
import type { HotspotId } from '../../world/hotspots';
import { DecayClockPanel } from './DecayClock';
import { arrivalModel } from './data';
import { HeatPanel, IsotopePanel, Range, StructurePanel } from './panels';
import { Value } from '../../ui/Glyph';
import type { ComponentChildren } from 'preact';
import './arrival.css';

type Scan = 'structure' | 'heat' | 'isotopes' | 'clock';

// fov: the vertical field of view, deg, that shows the whole part (the whole craft from the opening view;
// all three cylinders from the middle one's framing distance).
const SCANS: readonly { id: Scan; label: string; node: string; frame: HotspotId | 'overview'; fov: number }[] = [
  { id: 'structure', label: 'Structure', node: 'arrival.purpose', frame: 'overview', fov: 19 },
  { id: 'heat', label: 'Heat', node: 'arrival.heat', frame: 'rtg2', fov: 72 },
  { id: 'isotopes', label: 'Isotopes', node: 'arrival.madeNotMined', frame: 'rtg2', fov: 72 },
  { id: 'clock', label: 'Decay clock', node: 'arrival.fuelAge', frame: 'rtg2', fov: 72 },
];

interface Marker {
  at: HotspotId;
  text: ComponentChildren;
  kind?: 'warm' | 'gold' | 'cold' | 'probe';
}

function markersFor(scan: Scan, heatEachW: [number, number], dishK: number): Marker[] {
  switch (scan) {
    case 'structure':
      return [
        { at: 'dish', text: 'great dish' },
        { at: 'magnetometer', text: 'thin boom' },
        { at: 'scanPlatform', text: 'platform of lenses' },
        { at: 'rtg2', text: 'three cylinders' },
        { at: 'record', text: 'etched disc', kind: 'gold' },
      ];
    case 'heat': {
      const each = <Range dim="power" lo={heatEachW[0]} hi={heatEachW[1]} />;
      return [
        // One label for all three (they read the same); the other two glow without one, so labels never overlap.
        { at: 'rtg1', text: null, kind: 'warm' },
        { at: 'rtg2', text: <>each {each}</>, kind: 'warm' },
        { at: 'rtg3', text: null, kind: 'warm' },
        { at: 'dish', text: <Value reading={{ key: 'dish', value: dishK, dim: 'temperature' }} />, kind: 'cold' },
      ];
    }
    default:
      return [{ at: 'rtg2', text: 'sample drawn here', kind: 'probe' }];
  }
}

/** First scan whose deduction is still open; else the last one. */
function firstOpenScan(confirmed: ReadonlySet<string>): Scan {
  return (SCANS.find((s) => nodeStatus(s.node, confirmed) === 'open') ?? SCANS[SCANS.length - 1]!).id;
}

export function ArrivalInstrument(_p: ChapterInstrumentProps) {
  const confirmed = confirmedSet.value;
  const m = arrivalModel(game.seed.value);
  const [scan, setScan] = useState<Scan>(() => firstOpenScan(confirmed));
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<EncounterHandle | null>(null);
  const markerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reduced = game.settings.value.reducedMotion;

  // Mount the scene once; free it when the chapter closes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let h: EncounterHandle;
    try {
      h = mountEncounter(canvas, { reducedMotion: game.settings.value.reducedMotion });
    } catch {
      setSceneState('failed');
      return;
    }
    handleRef.current = h;
    let live = true;
    h.ready.then(
      () => live && setSceneState('ready'),
      () => live && setSceneState('failed'),
    );
    return () => {
      live = false;
      handleRef.current = null;
      h.dispose();
    };
  }, []);

  useEffect(() => {
    handleRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  // Frame the part the scan reads.
  const def = SCANS.find((s) => s.id === scan)!;
  useEffect(() => {
    const h = handleRef.current;
    if (sceneState !== 'ready' || !h) return;
    h.setFov(def.fov);
    void h.frame(def.frame);
  }, [scan, sceneState]);

  // Keep the markers on their parts (a light loop of our own; the scene renders in its loop).
  const markers = markersFor(scan, [m.heatW.low / 3, m.heatW.high / 3], m.estimates.dishK);
  useEffect(() => {
    if (sceneState !== 'ready') return;
    let raf = 0;
    let frame = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      if (frame++ % 2) return; // every other frame is plenty for labels
      const h = handleRef.current;
      if (!h) return;
      markers.forEach((mk, i) => {
        const el = markerRefs.current[i];
        const p = h.project(mk.at);
        if (!el || !p) return;
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        el.dataset.visible = p.onScreen ? '1' : '0';
      });
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [scan, sceneState, markers.length]);

  const tabStatus = (node: string): NodeStatus => nodeStatus(node, confirmed);
  return (
    <div class="arrival" data-instrument="arrival" data-scene={sceneState} data-scan={scan}>
      <div class="ar-viewport">
        <canvas ref={canvasRef} class="ar-scene" aria-label="The machine, drifting under the sky, lit by your lamps" />
        {sceneState === 'failed' && <p class="ar-scene-note">The scene cannot be drawn on this device; the scans still read the machine.</p>}
        {sceneState === 'loading' && <p class="ar-scene-note">Lamps warming up.</p>}
        <div class="ar-markers" aria-hidden="true">
          {sceneState === 'ready' &&
            markers.map((mk, i) => (
              <div key={`${scan}-${mk.at}`} ref={(el) => { markerRefs.current[i] = el; }} class={`ar-marker ${mk.kind ?? ''}`} data-marker={mk.at} data-visible="0">
                <span class="dot" />
                {mk.text !== null && <span class="lbl">{mk.text}</span>}
              </div>
            ))}
        </div>
        <nav class="ar-scans" aria-label="Scans">
          {SCANS.map((s) => {
            const st = tabStatus(s.node);
            return (
              <button
                key={s.id}
                type="button"
                class={`ar-tab ${st}`}
                data-scan-tab={s.id}
                aria-pressed={scan === s.id}
                disabled={st === 'locked'}
                title={st === 'locked' ? 'Not yet: an earlier scan comes first' : undefined}
                onClick={() => setScan(s.id)}
              >
                {s.label}
                {st === 'confirmed' && <span class="tick" aria-label="confirmed"> ✓</span>}
              </button>
            );
          })}
        </nav>
        <div class="ar-panelwrap">
          {scan === 'structure' && <StructurePanel m={m} />}
          {scan === 'heat' && <HeatPanel m={m} />}
          {scan === 'isotopes' && <IsotopePanel m={m} />}
          {scan === 'clock' && <DecayClockPanel m={m} />}
        </div>
      </div>
    </div>
  );
}
