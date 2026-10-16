// The Voices' staged moment (voices.octave): the keyboard's pitches folded into one doubling, and a comb of
// twelve equal teeth sliding into place over their peaks, while the Queen of the Night's aria (music 11) plays
// from its high passage. Every bar and tooth comes from the reference analysis (data/voices.json); reduced
// motion shows the comb already in place. The aria plays on the shared audio context at the record's own level
// and stops when the moment ends; the moment changes no game state.

import { useEffect, useMemo, useState } from 'preact/hooks';
import recordJson from '../../../data/record.json';
import { sharedContext, sharedOutput } from '../../audio/mixer';
import type { Attempt } from '../../game/deductions';
import { gridFit } from '../../dsp/pitch';
import { turntable as T } from '../../game/state';
import type { MomentDef } from '../moments';
import { PIANO_CENTRES, PIANO_HIST, V } from './data';

/** The aria's high passage starts here, s (its one F6, measured by the reference tracker at about 70 s). */
const ARIA_FROM_S = 60;
const ARIA_ID = 'ozma-15';
const FOLD = 240;
const W = 960;
const H = 360;

function useAria(): void {
  useEffect(() => {
    let src: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    let live = true;
    const item = recordJson.sides.flatMap((s) => s.items).find((i) => i.id === ARIA_ID);
    if (!item) return;
    void (async () => {
      try {
        const ctx = sharedContext();
        const bytes = await (await fetch(`/${item.file}`)).arrayBuffer();
        const buf = await ctx.decodeAudioData(bytes);
        if (!live) return;
        gain = ctx.createGain();
        const now = ctx.currentTime;
        const level = T.volume.peek();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(level, now + 0.6);
        gain.connect(sharedOutput());
        src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        src.start(now, ARIA_FROM_S);
      } catch {
        // no sound is no harm: the moment still shows
      }
    })();
    return () => {
      live = false;
      if (src && gain) {
        const ctx = gain.context;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
        src.stop(ctx.currentTime + 0.6);
      }
    };
  }, []);
}

export function OctaveBackdrop(p: { reducedMotion: boolean }) {
  useAria();
  const oct = V.music.violin.octaveCents;
  const fit = useMemo(() => gridFit(PIANO_CENTRES, PIANO_HIST, oct / 12), []);
  const bars = useMemo(() => {
    const f = new Float64Array(FOLD);
    for (let i = 0; i < PIANO_CENTRES.length; i++) {
      const pos = (((PIANO_CENTRES[i]! % oct) + oct) % oct) / oct;
      const b = Math.min(FOLD - 1, Math.floor(pos * FOLD));
      f[b] = f[b]! + PIANO_HIST[i]!;
    }
    const mx = Math.max(...f);
    return Array.from(f, (v) => v / mx);
  }, []);
  // The comb slides from a wrong offset into the fitted one over two seconds.
  const [t, setT] = useState(p.reducedMotion ? 1 : 0);
  useEffect(() => {
    if (p.reducedMotion) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (): void => {
      const u = Math.min(1, (performance.now() - t0) / 2200);
      setT(u);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ease = 1 - (1 - t) ** 3;
  const off = fit.offset + (1 - ease) * (oct / 24);
  return (
    <svg class="vo-moment" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="The keyboard's pitches in one doubling, under a comb of twelve equal steps" data-octave-moment="">
      {bars.map((v, i) => (
        <rect key={i} x={40 + (i / FOLD) * (W - 80)} width={(W - 80) / FOLD + 0.4} y={H - 40 - v * (H - 90)} height={v * (H - 90)} fill="var(--cyan)" opacity={0.85} />
      ))}
      {Array.from({ length: 12 }, (_, j) => {
        const pos = ((((off + (j * oct) / 12) % oct) + oct) % oct) / oct;
        const x = 40 + pos * (W - 80);
        return <line key={j} x1={x} x2={x} y1={30} y2={H - 40} stroke="var(--gold)" stroke-width={2} opacity={0.4 + 0.6 * ease} />;
      })}
      <line x1={40} x2={W - 40} y1={H - 40} y2={H - 40} stroke="var(--line)" />
    </svg>
  );
}

const stepsOf = (a: Attempt): number | null => {
  const r = a.result.find((x) => x.key === 'steps in it');
  return typeof r?.value === 'number' ? r.value : null;
};

export const VOICES_MOMENTS: Record<'voices.octave', MomentDef> = {
  'voices.octave': {
    label: 'steps in a doubling',
    sentence: () => 'Their music comes back at a doubled frequency, and they cut the doubling into equal steps.',
    quantity: (a) => {
      const k = stepsOf(a);
      return k === null ? null : { si: k };
    },
    parts: null,
    Backdrop: ({ reducedMotion }) => <OctaveBackdrop reducedMotion={reducedMotion} />,
  },
};
