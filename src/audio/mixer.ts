// The one AudioContext for the interface's sounds, and the master level in front of everything the sound
// layer plays. Nothing starts before the first user gesture (autoplay): the context is created, and resumed,
// inside the first pointer, key or touch event. Browser module.
//
// Sharing with the turntable (M3 step 8): the record engine (src/game/turntableService.ts) runs on this same
// context through sharedContext(), and its own level node feeds `output` beside the master. So there is one
// clock and one output: interface sounds -> master -> output -> speakers, and record -> turntable level ->
// output -> speakers. The master volume and mute act on the interface sounds only, as before; `output` is a
// unity gain that the harness audio tap (src/harness/audioTap.ts) listens to, so a filmed run hears both.

import { signal } from '@preact/signals';

/** True while the player has the interface sounds muted. The record's own audio is not affected. */
export const soundMuted = signal(false);

export type ContextFactory = () => AudioContext;

const GESTURES = ['pointerdown', 'keydown', 'touchend'];

export class Mixer {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  /** Unity gain in front of the speakers: everything audible passes through it (see the header). */
  output: GainNode | null = null;
  private volume = 0.8;
  private muted = false;
  private readonly readyListeners: Array<(ctx: AudioContext, master: GainNode) => void> = [];

  constructor(private readonly factory: ContextFactory = () => new AudioContext()) {}

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Call from inside a user gesture. Creates the context once and resumes it. */
  start(): void {
    if (!this.ctx) {
      const ctx = this.factory();
      const output = ctx.createGain();
      output.connect(ctx.destination);
      const master = ctx.createGain();
      master.gain.value = this.level();
      master.connect(output);
      this.ctx = ctx;
      this.master = master;
      this.output = output;
      for (const fn of this.readyListeners) fn(ctx, master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** Run `fn` once the context exists (immediately if it already does). */
  whenReady(fn: (ctx: AudioContext, master: GainNode) => void): void {
    if (this.ctx && this.master) fn(this.ctx, this.master);
    else this.readyListeners.push(fn);
  }

  /** Listen for the first gesture on `target` and start then. */
  arm(target: Window): void {
    const go = (): void => {
      this.start();
      for (const t of GESTURES) target.removeEventListener(t, go, true);
    };
    for (const t of GESTURES) target.addEventListener(t, go, true);
  }

  private level(): number {
    return this.muted ? 0 : this.volume;
  }

  private apply(): void {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.03);
  }

  /** Master volume, 0 to 1 (the settings panel's slider). */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.apply();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    soundMuted.value = m;
    this.apply();
  }

  get isMuted(): boolean {
    return this.muted;
  }
}

export const mixer = new Mixer();

/** The shared context (creates it if needed; call only after a user gesture). */
export function sharedContext(): AudioContext {
  mixer.start();
  return mixer.ctx as AudioContext;
}

/** The node in front of the speakers on the shared context, for sources outside the master (the record). */
export function sharedOutput(): AudioNode {
  mixer.start();
  return mixer.output as GainNode;
}
