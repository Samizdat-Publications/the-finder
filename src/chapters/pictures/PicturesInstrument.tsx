// The Pictures' instrument: the developing picture (the centrepiece), the cover's picture diagrams under the
// lamp, the oscilloscope of the tape signal, the decoder's knobs and the notebook of deductions. The decoder
// starts free-running with clearly wrong neutral settings (start.ts); every knob and proposal goes through
// the command bus; the picture, the scope and the checkers all read the real 1977 tape.

import { useEffect, useState } from 'preact/hooks';
import svgText from '../../../public/media/cover/cover.svg?raw';
import { dispatch } from '../../game/bus';
import { confirmedSet, decoder as D, game } from '../../game/state';
import { binaryToSeconds, parseCoverBinary } from '../../science/units';
import { formatNumber, quantity } from '../../ui/units';
import { CoverViewer, type StrokeRef } from '../shared/CoverViewer';
import type { Lamp } from '../shared/relief';
import { CHECKER_FRAMES, FIRST_FRAMES, POLARITY_FRAMES } from './checkers';
import { picturesPlate } from './coverPictures';
import { Knobs } from './Knobs';
import { CIRCLE_FRAME } from './measure';
import { Notebook, Seen } from './Notebook';
import { PictureView } from './PictureView';
import { Scope } from './Scope';
import { keepThumb, trackWatching } from './seen';
import { ensureSignal, ensureSignals, getSignal, signalsLoaded } from './signal';
import { resumeSettings } from './start';
import './pictures.css';

const plate = picturesPlate(svgText);

const NAMES: Record<string, string> = {
  'picture.lineTime': 'a string of strokes between two tall bars, under the first line of the signal',
  'picture.rasterLines': 'a string of strokes over the last line of the raster',
};

let initialised = false;

/** First entry: the free-running start (or the settings a returning player had confirmed), then a decode. */
async function init(): Promise<void> {
  if (initialised) return;
  initialised = true;
  const s = resumeSettings(game.records.value);
  await dispatch({ type: 'decoder.select', frame: CIRCLE_FRAME });
  await dispatch({ type: 'decoder.setParam', name: 'lineTimeMs', value: s.lineTimeMs });
  await dispatch({ type: 'decoder.setParam', name: 'syncLock', value: s.syncLock });
  await dispatch({ type: 'decoder.setParam', name: 'interlace', value: s.interlace });
  await dispatch({ type: 'decoder.setParam', name: 'polarity', value: s.polarity });
  await dispatch({ type: 'decoder.setParam', name: 'rows', value: s.rows });
  await dispatch({ type: 'decoder.setParam', name: 'droop', value: true });
  void dispatch({ type: 'decoder.run', speed: 'record' }).catch(() => undefined);
}

function labelFor(id: string): string | null {
  const confirmed = confirmedSet.value;
  if (!confirmed.has('key.binary')) return null;
  const g = plate.groups.find((x) => x.id === id);
  if (!g) return null;
  const bin = g.bits.map((b) => (b.kind === 'across' ? '1' : '0')).join('');
  const n = parseCoverBinary(bin);
  if (id === 'picture.lineTime' && confirmed.has('key.timesNotLengths')) {
    const q = quantity('time', binaryToSeconds(bin));
    return `${formatNumber(n)} = ${q.number} ${q.unitKey}s${game.settings.value.humanGloss ? ` (${q.si})` : ''}`;
  }
  return formatNumber(n);
}

export function PicturesInstrument() {
  const [lamp, setLamp] = useState<Lamp>({ azimuthDeg: 135, elevationDeg: 70 });
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<StrokeRef | null>(null);
  const confirmed = confirmedSet.value;
  const circleDone = confirmed.has('pictures.circle');
  const frame = D.frame.value;
  void signalsLoaded.value; // redraw when a slice lands

  useEffect(() => {
    trackWatching();
    void init().catch(() => undefined);
    void ensureSignals(POLARITY_FRAMES).catch(() => undefined);
  }, []);

  useEffect(() => {
    void ensureSignal(frame).catch(() => undefined);
  }, [frame]);

  useEffect(() => {
    if (circleDone) void ensureSignals(CHECKER_FRAMES.filter((f) => FIRST_FRAMES.includes(f))).catch(() => undefined);
  }, [circleDone]);

  // the circle comes out true: keep it as the first thing seen (the swell and its caption come from the
  // sound layer, src/audio/cues.ts, which hears pictures.circle confirm)
  const [wasDone] = useState(circleDone);
  useEffect(() => {
    if (!circleDone || wasDone) return;
    if (D.picture.value?.frame === CIRCLE_FRAME) keepThumb();
    return undefined;
  }, [circleDone]);

  const sig = getSignal(frame);
  const ready = Boolean(getSignal(CIRCLE_FRAME)) && D.picture.value !== null;
  return (
    <div class="picinst" data-pictures-ready={ready ? 'true' : 'false'} data-frame={frame}>
      <div class="pic-main">
        <PictureView />
        {circleDone && (
          <p class="pic-they" role="status">
            They see.
          </p>
        )}
        <Scope sig={sig} />
        <Seen />
      </div>
      <div class="pic-side">
        <CoverViewer
          model={plate}
          lamp={lamp}
          onLamp={setLamp}
          hoverGroup={hover}
          onHover={setHover}
          selected={selected}
          onSelect={setSelected}
          labelFor={labelFor}
          label="The cover's picture diagrams, under your lamp"
        >
          <p class="note kcaption" aria-live="polite">
            {hover ? (NAMES[hover] ?? 'a string of strokes') : 'The cover\'s picture diagrams: the signal, the scan, the raster and the circle.'}
          </p>
        </CoverViewer>
        <Knobs />
        <Notebook />
      </div>
    </div>
  );
}
