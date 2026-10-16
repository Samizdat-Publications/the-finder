// The instrument's main area after the first pictures (M5): a strip of views (the decoder, the album, the colour
// mixer, the turntable, the teaching pictures) and the open view. A view appears once its deduction is in play
// and open (or done); the decoder is always there.

import { nodeStatus } from '../../game/deductions';
import { NODES } from '../../game/graph';
import { confirmedSet } from '../../game/state';
import { AlbumView, ColourMixer, TurnTable } from './AlbumView';
import { HeightView, NumeralsView, PlanetsView, UnitsView } from './TeachingViews';
import { view, type WorkView } from './workState';

const TABS: { v: WorkView; label: string; node: string | null }[] = [
  { v: 'decoder', label: 'Decoder', node: null },
  { v: 'album', label: 'Album', node: 'pictures.album' },
  { v: 'colour', label: 'Mixer', node: 'pictures.colour' },
  { v: 'turn', label: 'Turn', node: 'pictures.down' },
  { v: 'numerals', label: 'Counting', node: 'pictures.numerals' },
  { v: 'units', label: 'Units', node: 'pictures.units' },
  { v: 'planets', label: 'Circles', node: 'pictures.home' },
  { v: 'height', label: 'Figures', node: 'pictures.height' },
];

function available(node: string | null, confirmed: ReadonlySet<string>): boolean {
  if (!node) return true;
  if (!NODES.some((n) => n.id === node)) return false;
  return nodeStatus(node, confirmed) !== 'locked';
}

/** The view strip, shown once the first pictures are confirmed and at least one view beyond the decoder is open. */
export function WorkTabs() {
  const confirmed = confirmedSet.value;
  if (!confirmed.has('pictures.firstFrames')) return null;
  const tabs = TABS.filter((t) => available(t.node, confirmed));
  if (tabs.length < 2) return null;
  return (
    <nav class="pic-tabs" aria-label="Views of the instrument">
      {tabs.map((t) => (
        <button key={t.v} type="button" class={`pic-tab${view.value === t.v ? ' on' : ''}`} data-view={t.v} aria-pressed={view.value === t.v} onClick={() => (view.value = t.v)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/** The open work view, or null for the decoder (the instrument shows its own picture and scope then). */
export function OpenView() {
  switch (view.value) {
    case 'album':
      return <AlbumView />;
    case 'colour':
      return <ColourMixer />;
    case 'turn':
      return <TurnTable />;
    case 'numerals':
      return <NumeralsView />;
    case 'units':
      return <UnitsView />;
    case 'planets':
      return <PlanetsView />;
    case 'height':
      return <HeightView />;
    default:
      return null;
  }
}
