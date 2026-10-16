// The notebook's panels for The Pictures, complete (M5): one per deduction, each opening its work view on the
// instrument (the album, the colour mixer, the turntable, the counting picture, the unit picture, the planets
// table, the two figures). The album proposes from here: the frames the album holds and the bench's settings.
// The other views propose from their own tools. Each panel keeps its last result (right or wrong).

import type { Answer } from '../../game/deductions';
import { nodeStatus } from '../../game/deductions';
import { confirmedSet } from '../../game/state';
import { send } from '../../ui/send';
import { LastReading, PanelHead } from '../key/parts';
import { album, benchSettings } from './album';
import { ALBUM_FRAMES, M5_PICTURE_IDS, type M5PictureId } from './checkersM5';
import { markedCell, markedColumn, numeralTable, quarterTurns, stackStart, turnFrame, view, type WorkView } from './workState';
import { heightReachesNow, secondBeatsNow } from './TeachingViews';
import { NODES } from '../../game/graph';
import { stackFrom } from './AlbumView';

const TEXT: Record<M5PictureId, { how: string; work: WorkView }> = {
  'pictures.album': { how: `Keep the settings that made the circle round and let the rest of the side come off the tape: ${ALBUM_FRAMES.length} frames on its two tracks.`, work: 'album' },
  'pictures.colour': { how: 'Some pictures come three times in a row, a little different each time. Stack three on the mixer as three colours of light.', work: 'colour' },
  'pictures.down': { how: 'Some pictures came off the tape on their sides. Turn one until the world in it stands the right way.', work: 'turn' },
  'pictures.numerals': { how: 'One picture counts with dots, the cover\'s strokes and marks of their own. Build the table from their marks to your numerals.', work: 'numerals' },
  'pictures.units': { how: 'The atom again, in their notation. Read their second as a count of spin flips and turn it into beats.', work: 'units' },
  'pictures.home': { how: 'Two pictures of circles, each with four numbers in their units. Which circle is theirs?', work: 'planets' },
  'pictures.slip': { how: 'Read every distance the same way. Does each column follow the table\'s own order?', work: 'planets' },
  'pictures.height': { how: 'Two figures with scale bars. Read the numbers in their centimetres and turn them into reaches.', work: 'height' },
};

/** What each view would propose now (for the last result's "past proposal" mark). */
function current(id: M5PictureId): Answer | undefined {
  switch (id) {
    case 'pictures.album':
      return { developed: Object.keys(album.value).sort(), settings: { ...benchSettings() } };
    case 'pictures.colour': {
      const t = stackStart.value ? stackFrom(stackStart.value) : null;
      return t ? { frames: t } : undefined;
    }
    case 'pictures.down':
      return turnFrame.value ? { frame: turnFrame.value, quarterTurns: quarterTurns.value } : undefined;
    case 'pictures.numerals':
      return { table: { ...numeralTable.value } };
    case 'pictures.units':
      return { secondInBeats: secondBeatsNow() };
    case 'pictures.home':
      return markedColumn.value !== null ? { column: markedColumn.value } : undefined;
    case 'pictures.slip':
      return markedCell.value ? { ...markedCell.value } : undefined;
    case 'pictures.height':
      return { reaches: heightReachesNow() };
  }
}

function Panel(p: { id: M5PictureId }) {
  const status = nodeStatus(p.id, confirmedSet.value);
  const t = TEXT[p.id];
  const here = view.value === t.work;
  return (
    <section class={`kpanel pic-panel ${status}`} data-panel={p.id} data-status={status}>
      <PanelHead id={p.id} />
      {status === 'open' && <p class="note">{t.how}</p>}
      {status !== 'locked' && (
        <div class="pic-row">
          <button type="button" class={`btn small${here ? ' on' : ''}`} data-work-open={t.work} onClick={() => (view.value = t.work)}>
            {here ? 'On the bench' : status === 'confirmed' ? 'Look again' : 'Work on it'}
          </button>
          {p.id === 'pictures.album' && status === 'open' && (
            <button
              type="button"
              class="btn small"
              data-propose-button="pictures.album"
              onClick={() => send({ type: 'deduction.propose', id: 'pictures.album', answer: { developed: Object.keys(album.value).sort(), settings: { ...benchSettings() } } })}
            >
              Propose: the side is developed
            </button>
          )}
        </div>
      )}
      {status !== 'locked' && <LastReading id={p.id} current={current(p.id)} />}
    </section>
  );
}

export function NotebookM5() {
  const confirmed = confirmedSet.value;
  if (!confirmed.has('pictures.firstFrames')) return null;
  // only the deductions in play (a node still marked `later` in src/game/nodesM5.ts stays out of the notebook)
  const ids = M5_PICTURE_IDS.filter((id) => NODES.some((n) => n.id === id));
  return (
    <>
      {ids.map((id) => (
        <Panel key={id} id={id} />
      ))}
    </>
  );
}
