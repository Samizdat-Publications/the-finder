// voices.others: are all the voices theirs? The player listens, looks at the spectrogram beside the disc, and
// drags across it to mark a stretch; the marked stretch (track, start, end) is proposed through the command bus.

import { nodeStatus } from '../../game/deductions';
import { confirmedSet } from '../../game/state';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { trackById } from './data';
import { marked, trackLabel } from './Disc';
import { Q } from './parts';

export function OthersPanel() {
  const id = 'voices.others';
  const status = nodeStatus(id, confirmedSet.value);
  const m = marked.value;
  const t = m ? trackById(m.track) : undefined;
  return (
    <section class={`kpanel vo-panel ${status}`} data-panel={id} data-status={status}>
      <PanelHead id={id} />
      {status !== 'locked' && (
        <>
          <p class="note small">Listen through the voices and look at their pitches beside the disc. Drag across the spectrogram to mark a stretch that is not like the rest.</p>
          <p class="vo-count" data-marked={m ? `${m.track}:${m.start.toFixed(2)}-${m.end.toFixed(2)}` : ''}>
            Marked:{' '}
            {m && t ? (
              <>
                {trackLabel(t)}, from <Q dim="time" si={m.start} digits={3} /> to <Q dim="time" si={m.end} digits={3} />
              </>
            ) : (
              <span class="dim">nothing yet</span>
            )}
          </p>
          <button type="button" class="btn small" disabled={status !== 'open' || !m} data-propose-button={id} onClick={() => m && send({ type: 'deduction.propose', id, answer: { ...m } })}>
            Propose
          </button>
        </>
      )}
      <LastReading id={id} current={m ? { ...m } : undefined} />
    </section>
  );
}
