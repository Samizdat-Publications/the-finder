// The story stage's backdrop (M7 step 2, the V1 critic's "the first minutes are three text cards"): the
// encounter scene, the same craft under the same computed sky as Arrival, filling the stage behind the card.
// Its canvas reaches under the card (as Arrival's reaches under its scan panel), so the craft sits in the open
// area beside the words. A stop may name a part of the craft to frame (`sceneFrame`); otherwise the opening
// view. The scene is mounted once while the story stage is up and freed when it goes.

import { useEffect, useRef, useState } from 'preact/hooks';
import { game } from '../game/state';
import { mountEncounter, type EncounterHandle } from '../world/encounter';
import type { HotspotId } from '../world/hotspots';

export function StoryScene(p: { frame: HotspotId | 'overview' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<EncounterHandle | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const reduced = game.settings.value.reducedMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let h: EncounterHandle;
    try {
      h = mountEncounter(canvas, { reducedMotion: game.settings.value.reducedMotion });
    } catch {
      setState('failed');
      return;
    }
    handleRef.current = h;
    let live = true;
    h.ready.then(
      () => live && setState('ready'),
      () => live && setState('failed'),
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

  useEffect(() => {
    const h = handleRef.current;
    if (state !== 'ready' || !h) return;
    void h.frame(p.frame, reduced ? {} : { durationS: 2.5 });
  }, [p.frame, state]);

  return (
    <div class="story-scene" data-story-scene={state} aria-hidden={state === 'failed' ? 'true' : undefined}>
      <canvas ref={canvasRef} aria-label="Voyager 1, a tiny cold machine, drifting under the stars of the far future" />
    </div>
  );
}
