// The story stage: on the hub with the tour on, a centred card replaces the ring. It carries the same guide
// panel in larger type; a stop whose `widget` is 'cover' shows the real cover beside the words.

import { game } from '../game/state';
import { CoverDrawing } from './CoverDrawing';
import { GuideBody } from './Guide';
import { STOPS } from './script';

export function StoryStage() {
  const cover = STOPS[game.tour.value.step]?.widget === 'cover';
  return (
    <section class="story-stage" aria-label="Guided tour" data-story-stage>
      <div class={`story-card${cover ? ' with-cover' : ''}`}>
        {cover && <CoverDrawing />}
        <GuideBody layout="card" />
      </div>
    </section>
  );
}
