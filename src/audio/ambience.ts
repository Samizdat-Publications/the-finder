// Per-chapter instrument hums: a low, slowly beating drone in each chapter's own key. Arrival is cold and
// sparse, The Key has a faint resonant ring, The Player a warm mechanical bed, The Pictures a scanning
// shimmer; the rest share the quiet hub drone. Beds crossfade when the chapter changes, drop 12 dB while the
// record plays, and dip for a hush. Works on any BaseAudioContext so a browser test renders it offline.
// Taste, not physics. Seeded noise only.

import type { ChapterView } from '../game/graph';
import { createRng, type Rng } from '../science/random';
import { DUCK_DB, HUSH_DB, HUSH_HOLD_S, LEVEL_DBFS, dbToLin, noiseBuffer, tone, voiceFor, type Bed } from './synth';

/** Seconds the old bed takes to leave and the new one to arrive (time constant is a third of it). */
export const CROSSFADE_S = 3;

export interface BedHandle {
  /** The bed's output; connect it where you want it heard. */
  out: GainNode;
  /** Stop every source at `when` and release the graph. */
  stop(when: number): void;
}

/** Gain trims (linear) from measured bed peaks, so each bed alone peaks near LEVEL_DBFS.bed. */
const BED_TRIM: Record<Bed, number> = { hub: 1, cold: 1.1, ring: 1.17, warm: 1.5, shimmer: 1.07 };

function lfo(ctx: BaseAudioContext, hz: number, depth: number, target: AudioParam, when: number, sources: AudioScheduledSourceNode[]): void {
  const o = ctx.createOscillator();
  o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g);
  g.connect(target);
  o.start(when);
  sources.push(o);
}

/** Build one chapter's bed, running from `when`. Peak (alone) is about LEVEL_DBFS.bed. */
export function buildBed(ctx: BaseAudioContext, view: ChapterView, when: number, rng: Rng): BedHandle {
  const voice = voiceFor(view);
  const out = ctx.createGain();
  out.gain.value = dbToLin(LEVEL_DBFS.bed) * BED_TRIM[voice.bed];
  const sources: AudioScheduledSourceNode[] = [];
  const mix = ctx.createGain(); // the bed's parts sum here, then out
  mix.connect(out);
  const add = (hz: number, level: number, type: OscillatorType = 'sine', dest: AudioNode = mix): GainNode => {
    const t = tone(ctx, dest, hz, when, type);
    t.gain.gain.value = level;
    sources.push(t.osc);
    return t.gain;
  };
  const r = voice.rootHz;

  switch (voice.bed) {
    case 'cold': {
      // Cold and sparse: two barely different low sines (a very slow beat), a bare fifth that fades in and
      // out about every 25 s, and nothing else.
      add(r, 0.5);
      add(r * 1.0013, 0.4);
      const fifth = add(r * 1.5, 0.0);
      lfo(ctx, 0.04, 0.12, fifth.gain, when, sources);
      add(r * 8, 0.015);
      break;
    }
    case 'ring': {
      // A faint resonant ring: a low drone under two high partials that beat against each other (about 0.8 Hz).
      add(r, 0.45);
      add(r * 1.0011, 0.3);
      add(784.0, 0.05);
      add(784.8, 0.05);
      add(1568.3, 0.018);
      break;
    }
    case 'warm': {
      // A warm mechanical bed: low-passed saws a hair apart, with a motor-like 4.2 Hz flutter, over soft brown noise.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 170;
      lp.Q.value = 0.7;
      const flutter = ctx.createGain();
      flutter.gain.value = 0.85;
      lfo(ctx, 4.2, 0.15, flutter.gain, when, sources);
      lp.connect(flutter);
      flutter.connect(mix);
      add(r, 0.35, 'sawtooth', lp);
      add(r * 1.004, 0.3, 'sawtooth', lp);
      add(r * 2, 0.2, 'sine', lp);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, rng.fork('warm'), 4, 'brown');
      src.loop = true;
      const nlp = ctx.createBiquadFilter();
      nlp.type = 'lowpass';
      nlp.frequency.value = 140;
      const ng = ctx.createGain();
      ng.gain.value = 0.25;
      src.connect(nlp);
      nlp.connect(ng);
      ng.connect(mix);
      src.start(when);
      sources.push(src);
      break;
    }
    case 'shimmer': {
      // A scanning shimmer: a low drone, a cluster of high partials each swelling at its own slow rate, and
      // a band of noise whose centre sweeps up and down like a scan line.
      add(r, 0.4);
      add(r * 1.0009, 0.3);
      const rates = [0.11, 0.17, 0.23, 0.29, 0.37];
      rates.forEach((rate, i) => {
        const g = add(r * (8 + i * 1.5), 0.0);
        lfo(ctx, rate, 0.03, g.gain, when, sources);
        g.gain.value = 0.03;
      });
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, rng.fork('shimmer'), 4, 'white');
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.value = 2400;
      lfo(ctx, 0.23, 1500, bp.frequency, when, sources);
      const ng = ctx.createGain();
      ng.gain.value = 0.05;
      src.connect(bp);
      bp.connect(ng);
      ng.connect(mix);
      src.start(when);
      sources.push(src);
      break;
    }
    case 'hub': {
      add(r, 0.5);
      add(r * 1.0012, 0.4);
      add(r * 3, 0.03);
      break;
    }
  }

  return {
    out,
    stop(at: number): void {
      for (const s of sources) {
        try {
          s.stop(at);
        } catch {
          // already stopped
        }
      }
      const last = sources[0];
      if (last) last.addEventListener('ended', () => out.disconnect());
    },
  };
}

/**
 * The live ambience: holds the current bed, crossfades it on chapter changes, and applies the record duck
 * and the hush as two gains in series. All times use the context's clock.
 */
export class Ambience {
  private readonly duckGain: GainNode;
  private readonly hushGain: GainNode;
  private current: { view: ChapterView; bed: BedHandle } | null = null;
  private count = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    dest: AudioNode,
    private readonly seed: () => string,
  ) {
    this.hushGain = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.hushGain);
    this.hushGain.connect(dest);
  }

  get view(): ChapterView | null {
    return this.current?.view ?? null;
  }

  setChapter(view: ChapterView): void {
    if (this.current?.view === view) return;
    const now = this.ctx.currentTime;
    const old = this.current;
    if (old) {
      old.bed.out.gain.setTargetAtTime(0, now, CROSSFADE_S / 3);
      old.bed.stop(now + CROSSFADE_S * 2.5);
    }
    const rng = createRng(`${this.seed()}:bed:${view}:${this.count++}`);
    const bed = buildBed(this.ctx, view, now, rng);
    const target = bed.out.gain.value;
    bed.out.gain.value = 0;
    bed.out.gain.setTargetAtTime(target, now, CROSSFADE_S / 3);
    bed.out.connect(this.duckGain);
    this.current = { view, bed };
  }

  /** Drop the ambience 12 dB while the record plays; bring it back when it stops. */
  duck(on: boolean): void {
    this.duckGain.gain.setTargetAtTime(on ? dbToLin(DUCK_DB) : 1, this.ctx.currentTime, 0.4);
  }

  /** Dip the instruments for a few seconds so the next sound stands alone. */
  hush(): void {
    const now = this.ctx.currentTime;
    const g = this.hushGain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(dbToLin(HUSH_DB), now, 0.25);
    g.setTargetAtTime(1, now + HUSH_HOLD_S, 1.2);
  }
}
