// Portrait (chapter 8): the Finder's portrait of the senders, one dark plate drawn in gold (gold is the human
// artifact's colour, and this is the portrait of the humans). Six panels around a centre band: their star, how
// they look, their world above; the four clocks in the middle (the chapter's one deduction, portrait.together);
// their numbers, their voices, their machine below. Every value is the player's own confirmed result. Once the
// clocks are confirmed and the sky moment has played, the Finder's sky runs as a strip across the top, the
// senders' star ringed. One screen at 1440 x 900 and 1366 x 768; a panel scrolls inside itself only if it must.

import { useEffect } from 'preact/hooks';
import { confirmedSet, game } from '../../game/state';
import { ensureParts, loadEpochModel } from '../shared/epochModel';
import { activeMoment } from '../../ui/momentState';
import { ClocksBand } from './ClocksBand';
import { PORTRAIT_NODE } from './checkers';
import { SkyStrip } from './moments';
import { LookPanel, MachinePanel, NumbersPanel, StarPanel, VoicesPanel, WorldPanel } from './panels';
import { ensurePlatePictures } from './pictures';
import './portrait.css';

export function PortraitInstrument() {
  const done = confirmedSet.value.has(PORTRAIT_NODE);
  const showStrip = done && activeMoment.value?.id !== PORTRAIT_NODE;
  useEffect(() => {
    void ensurePlatePictures().catch(() => undefined);
    // The sky the moment and the strip draw needs the epoch model's trail (from the Worker): ask for it now, so the
    // moment opens on its sky at once rather than spending its seconds waiting.
    void loadEpochModel(game.seed.value)
      .then((m) => ensureParts(m, ['trail']))
      .catch(() => undefined);
  }, []);
  return (
    <div class="portrait" data-instrument="portrait" data-done={done ? 'true' : 'false'}>
      <div class={`pt-plate${showStrip ? ' with-strip' : ''}`}>
        {showStrip && <SkyStrip />}
        <div class="pt-row">
          <StarPanel />
          <LookPanel />
          <WorldPanel />
        </div>
        <ClocksBand />
        <div class="pt-row">
          <NumbersPanel />
          <VoicesPanel />
          <MachinePanel />
        </div>
      </div>
    </div>
  );
}
