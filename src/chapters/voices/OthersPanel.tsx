// voices.others: are all the voices theirs? The player listens, looks at the spectrogram beside the disc, and
// drags across it to mark a stretch; while the drag runs the panel's readout says what the stretch holds (the
// same measurement the checker uses, data.ts measureStretch), and the marked stretch (track, start, end) is
// proposed through the command bus.

import { nodeStatus } from '../../game/deductions';
import { confirmedSet } from '../../game/state';
import { Clamp } from '../../ui/Fine';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { measureStretch, trackById } from './data';
import { dragging, holdsText, marked, trackLabel } from './Disc';
import { Q } from './parts';

export function OthersPanel() {
  const id = 'voices.others';
  const status = nodeStatus(id, confirmedSet.value);
  const m = marked.value;
  const shown = dragging.value ?? m;
  const t = shown ? trackById(shown.track) : undefined;
  return (
    <section class={`kpanel vo-panel ${status}`} data-panel={id} data-status={status}>
      <PanelHead id={id} />
      {status !== 'locked' && (
        <>
          <div class="hero-control vo-stretch">
            <span class="plabel">Your stretch holds</span>
            <div class="hero-readout" data-holds-readout="">
              {shown ? holdsText(measureStretch(shown.track, shown.start, shown.end)) : <span class="vo-empty">drag across the pitch picture</span>}
            </div>
            <p class="vo-count small" data-marked={m ? `${m.track}:${m.start.toFixed(2)}-${m.end.toFixed(2)}` : ''}>
              {shown && t ? (
                <>
                  {trackLabel(t)}, from <Q dim="time" si={shown.start} digits={3} /> to <Q dim="time" si={shown.end} digits={3} />
                </>
              ) : (
                <span class="dim">nothing marked yet</span>
              )}
            </p>
          </div>
          {status === 'open' && <Clamp>Listen through the voices and look at their pitches. Drag across the picture beside the disc to mark a stretch that is not like the rest: held calls show as bright lines inside it.</Clamp>}
          <button type="button" class="btn small" disabled={status !== 'open' || !m} data-propose-button={id} onClick={() => m && send({ type: 'deduction.propose', id, answer: { ...m } })}>
            Propose
          </button>
        </>
      )}
      <LastReading id={id} current={m ? { ...m } : undefined} />
    </section>
  );
}
