// The story stage: on the hub with the tour on, a card replaces the ring. It carries the same guide panel in
// larger type, beside the encounter scene (StoryScene.tsx: the craft under the far-future sky, M7 step 2); on a stop
// whose `widget` is 'cover' the scene dims and the real cover drawing stands large in its place, beside the words.

import { game } from '../game/state';
import { CoverDrawing } from './CoverDrawing';
import { GuideBody } from './Guide';
import { STOPS } from './script';
import { StoryScene } from './StoryScene';

export function StoryStage() {
  const stop = STOPS[game.tour.value.step];
  const cover = stop?.widget === 'cover';
  return (
    <section class={`story-stage${cover ? ' with-cover' : ''}`} aria-label="Guided tour" data-story-stage>
      <StoryScene frame={stop?.sceneFrame ?? 'overview'} />
      {cover && <CoverDrawing />}
      <div class="story-card">
        <GuideBody layout="card" />
      </div>
    </section>
  );
}
