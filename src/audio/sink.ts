// The live sound sink: turns cue events into Web Audio on the mixer's context. Cues that arrive before the
// first gesture (or while the context is not running) are logged and captioned by cues.ts but make no sound.

import { createRng } from '../science/random';
import { Ambience } from './ambience';
import type { CueEvent, SoundSink } from './cues';
import type { Mixer } from './mixer';
import { voiceFor } from './synth';
import { breath, cadence, pluck, swell, tick } from './ui';

export class LiveSink implements SoundSink {
  private ambience: Ambience | null = null;
  private view: CueEvent['chapter'] = 'hub';
  private ducked = false;
  private n = 0;

  constructor(
    private readonly mixer: Mixer,
    private readonly seed: () => string,
  ) {
    mixer.whenReady((ctx, master) => {
      this.ambience = new Ambience(ctx, master, seed);
      this.ambience.setChapter(this.view);
      this.ambience.duck(this.ducked);
    });
  }

  cue(e: CueEvent): void {
    if (e.kind === 'chapter') {
      this.view = e.chapter;
      this.ambience?.setChapter(e.chapter);
      return;
    }
    if (e.kind === 'duck') {
      this.ducked = e.on === true;
      this.ambience?.duck(this.ducked);
      return;
    }
    const ctx = this.mixer.ctx;
    const master = this.mixer.master;
    if (!ctx || !master || !this.mixer.running) return;
    if (e.kind === 'hush') {
      this.ambience?.hush();
      return;
    }
    const rng = createRng(`${this.seed()}:${e.kind}:${this.n++}`);
    const when = ctx.currentTime + 0.02;
    const voice = voiceFor(e.chapter);
    switch (e.kind) {
      case 'pluck':
        pluck(ctx, master, when, voice.pluckHz, rng);
        break;
      case 'cadence':
        cadence(ctx, master, when, voice.pluckHz / 2, rng);
        break;
      case 'tick':
        tick(ctx, master, when, rng);
        break;
      case 'breath':
        breath(ctx, master, when, rng);
        break;
      case 'swell':
        swell(ctx, master, when, voiceFor('pictures').rootHz * 2, rng);
        break;
    }
  }
}
