// The Key's instrument: the cover under the lamp on the left, the three instruments on the right (strokes,
// the atlas of hydrogen, times or lengths), each opening as the one before it is confirmed. Proposals go
// through the command bus; the lamp, the view, the table and the atlas choice are the instrument's own state.

import { useEffect, useRef, useState } from 'preact/hooks';
import { nodeStatus } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { GlyphLabel } from '../../ui/Glyph';
import { formatNumber, formatSI } from '../../ui/units';
import { alignOpenPanel } from '../../ui/notebook';
import { coverModel } from '../shared/coverData';
import { CoverViewer, type StrokeRef } from '../shared/CoverViewer';
import type { Lamp } from '../shared/relief';
import { parseCoverBinary, binaryToSeconds } from '../../science/units';
import { AtlasPanel } from './AtlasPanel';
import { BinaryPanel, stringName } from './BinaryPanel';
import { ensurePulsars, pulsarSpan } from './data';
import type { TransitionId } from './physics';
import { TimesPanel } from './TimesPanel';
import './key.css';

/** Groups whose numbers are in the hydrogen time unit (the line labels and the raster's count are not). */
const TIME_GROUP = /^(record\.rotationPeriod|record\.playTime|picture\.lineTime|pulsar\.\d+\.digits)$/;

function Locked(p: { id: string }) {
  const def = nodeDef(p.id);
  return (
    <section class="kpanel locked" data-panel={p.id}>
      <header class="khead">
        <GlyphLabel k={def?.key ?? p.id} gloss={def?.question ?? ''} height={20} />
        <span class="chip locked">locked</span>
      </header>
    </section>
  );
}

export function KeyInstrument() {
  const [lamp, setLamp] = useState<Lamp>({ azimuthDeg: 135, elevationDeg: 80 });
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<StrokeRef | null>(null);
  const [tallied, setTallied] = useState<string[]>([]);
  const [choice, setChoice] = useState<TransitionId>('lymanAlpha');
  useEffect(() => {
    void ensurePulsars();
  }, []);

  const confirmed = confirmedSet.value;
  const binaryDone = confirmed.has('key.binary');
  const timesDone = confirmed.has('key.timesNotLengths');
  const labelFor = (id: string): string | null => {
    if (!binaryDone) return null;
    const g = coverModel.groups.find((x) => x.id === id);
    if (!g) return null;
    const bin = g.bits.map((b) => (b.kind === 'across' ? '1' : '0')).join('');
    const n = parseCoverBinary(bin);
    const si = timesDone && TIME_GROUP.test(id) && game.settings.value.humanGloss ? ` (${formatSI('time', binaryToSeconds(bin))})` : '';
    return `${formatNumber(n)}${si}`;
  };
  const status = (id: string) => nodeStatus(id, confirmed);
  // When a deduction is confirmed the next instrument opens: keep it (and the result just given) in view in the
  // instruments' own column.
  const col = useRef<HTMLDivElement>(null);
  // (and once the pulsar catalogue has loaded, since the open panel grows then)
  const stage = `${binaryDone}${status('key.unit')}${timesDone}${pulsarSpan.value ? 1 : 0}`;
  useEffect(() => {
    const el = col.current;
    if (el) requestAnimationFrame(() => alignOpenPanel(el));
  }, [stage]);

  return (
    <div class="keyinst" data-key-ready={pulsarSpan.value ? 'true' : 'false'}>
      <div class="kview">
        <CoverViewer
          model={coverModel}
          lamp={lamp}
          onLamp={setLamp}
          hoverGroup={hover}
          onHover={setHover}
          selected={selected}
          onSelect={setSelected}
          marked={new Set(tallied)}
          labelFor={labelFor}
          label="The cover of the disc, under your lamp"
        >
          <p class="note kcaption" aria-live="polite">
            {hover ? stringName(coverModel.groups, hover, coverModel.size) : 'Hover over the plate to find its strings of strokes. Lower the lamp to raise the marks.'}
          </p>
        </CoverViewer>
      </div>
      <div class="kpanels" ref={col}>
        <BinaryPanel
          groups={coverModel.groups}
          size={coverModel.size}
          selected={selected}
          tallied={tallied}
          onTally={(id) => setTallied((t) => (t.includes(id) ? t : [...t, id]))}
          onUntally={(id) => setTallied((t) => t.filter((x) => x !== id))}
        />
        {status('key.unit') === 'locked' ? <Locked id="key.unit" /> : <AtlasPanel choice={choice} onChoice={setChoice} />}
        {status('key.timesNotLengths') === 'locked' ? <Locked id="key.timesNotLengths" /> : <TimesPanel />}
      </div>
    </div>
  );
}
