// The Voices' instrument: on the left the spectrogram of the track in view above the rest of the record on the
// turntable (every item after the pictures, one face at a time); on the right the four tools, one per deduction, in
// the guided tour's order, each opening when the one it needs is confirmed. Mostly listening: the tools measure what the player hears, in a
// Worker, on the same audio the turntable plays.

import { useEffect, useRef } from 'preact/hooks';
import { confirmedSet } from '../../game/state';
import { alignOpenPanel } from '../../ui/notebook';
import { jobProgress } from './analysisClient';
import { SpectrogramView, TrackList } from './Disc';
import { HearingPanel } from './HearingPanel';
import { ManyPanel } from './ManyPanel';
import { OctavePanel } from './OctavePanel';
import { OthersPanel } from './OthersPanel';
import '../key/key.css';
import './voices.css';

export function VoicesInstrument() {
  const col = useRef<HTMLDivElement>(null);
  const confirmed = confirmedSet.value;
  const stage = ['voices.many', 'voices.hearing', 'voices.octave', 'voices.others'].map((id) => confirmed.has(id)).join('');
  // A tool's chart arrives when its Worker analysis lands and the panel grows: align the open panel again then, so
  // its control and its Propose button stay in view (the spectrograms of the track list do not count).
  const tools = Object.entries(jobProgress.value).filter(([k, f]) => f >= 1 && !k.endsWith('/display')).length;
  useEffect(() => {
    const el = col.current;
    if (el) requestAnimationFrame(() => alignOpenPanel(el));
  }, [stage, tools]);
  return (
    <div class="voicesinst" data-instrument="voices">
      <div class="vo-left">
        <section class="kpanel vo-disc" aria-label="The rest of the disc">
          <header class="khead">
            <span class="plabel">The rest of the disc, after the pictures</span>
          </header>
          <SpectrogramView />
          <TrackList />
        </section>
      </div>
      <div class="vo-panels" ref={col}>
        <ManyPanel />
        <HearingPanel />
        <OthersPanel />
        <OctavePanel />
      </div>
    </div>
  );
}
