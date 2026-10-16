// The interface's sounds, synthesized live in Web Audio on any BaseAudioContext: a resonant pluck on a
// confirmed deduction, a dull low two-note fall on a rejected answer, a quiet tick on instrument controls,
// a breath when the codex opens, and the harmonic swell when the calibration circle resolves.
// All noise comes from seeded streams, so the same seed always renders the same cue. Levels are the
// LEVEL_DBFS targets in synth.ts (peak, cue alone); TRIM holds the measured correction so the peak lands
// on the target (see tests/browser/sound.browser.mjs, which checks it).

import type { Rng } from '../science/random';
import { LEVEL_DBFS, dbToLin, noiseBuffer, tone } from './synth';

export type RenderKind = 'pluck' | 'cadence' | 'tick' | 'breath' | 'swell';

export interface RenderedCue {
  /** Seconds from `when` until the cue has died away (the caller may stop sources after this). */
  durationS: number;
}

/** Gain trims (linear) found by measuring the rendered peaks; a pure scale, so shapes are untouched. */
const TRIM: Record<RenderKind, number> = { pluck: 1.38, cadence: 1.2, tick: 1.86, breath: 1.1, swell: 1.15 };

const peakOf = (kind: RenderKind): number => dbToLin(LEVEL_DBFS[kind]) * TRIM[kind];

/** Exponential-ish decay envelope on a gain param: rise over `attack`, fall with time constant `tau`. */
function pluckEnv(g: AudioParam, when: number, attack: number, level: number, tau: number): void {
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(level, when + attack);
  g.setTargetAtTime(0, when + attack, tau);
}

/**
 * A soft resonant pluck at `hz`: a few partials that die away at different rates, through a low-pass whose
 * cutoff falls as the note rings (so it starts bright and mellows), about 1.4 s.
 */
export function pluck(ctx: BaseAudioContext, dest: AudioNode, when: number, hz: number, rng: Rng): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = peakOf('pluck') / 1.9;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 3;
  lp.frequency.setValueAtTime(hz * 7, when);
  lp.frequency.exponentialRampToValueAtTime(hz * 2, when + 0.35);
  lp.connect(out);
  out.connect(dest);
  const partials: Array<[number, number, number]> = [
    [1, 1, 0.42],
    [2, 0.45, 0.26],
    [3.01, 0.22, 0.17],
    [4.98, 0.08, 0.11],
  ];
  let end = when;
  for (const [mult, amp, tau] of partials) {
    const detune = 1 + (rng.uniform() - 0.5) * 0.002;
    const { osc, gain } = tone(ctx, lp, hz * mult * detune, when);
    pluckEnv(gain.gain, when, 0.004, amp, tau);
    const stopAt = when + 0.004 + tau * 8;
    osc.stop(stopAt);
    end = Math.max(end, stopAt);
  }
  return { durationS: end - when };
}

/**
 * The refusal: two low, soft notes, the second a minor third below the first, dull (low-passed), gentle
 * attacks. About 1.2 s. A fall, never a buzzer.
 */
export function cadence(ctx: BaseAudioContext, dest: AudioNode, when: number, hz: number, rng: Rng): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = peakOf('cadence') / 1.15;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(320, hz * 2.2);
  lp.Q.value = 0.5;
  lp.connect(out);
  out.connect(dest);
  const notes: Array<[number, number]> = [
    [hz, 0],
    [hz * (5 / 6), 0.3],
  ];
  let end = when;
  for (const [f, offset] of notes) {
    const t0 = when + offset;
    const f0 = f * (1 + (rng.uniform() - 0.5) * 0.002);
    const a = tone(ctx, lp, f0, t0, 'sine');
    pluckEnv(a.gain.gain, t0, 0.03, 0.8, 0.2);
    a.osc.stop(t0 + 0.03 + 1.7);
    const b = tone(ctx, lp, f0 * 2, t0, 'triangle');
    pluckEnv(b.gain.gain, t0, 0.03, 0.18, 0.12);
    b.osc.stop(t0 + 0.03 + 1.0);
    end = Math.max(end, t0 + 1.73);
  }
  return { durationS: end - when };
}

/** A tick: a few milliseconds of band-passed noise over a tiny sine click. Very quiet, about 40 ms. */
export function tick(ctx: BaseAudioContext, dest: AudioNode, when: number, rng: Rng): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = peakOf('tick');
  out.connect(dest);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, rng, 0.03, 'white');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.7, when);
  g.gain.setTargetAtTime(0, when, 0.003);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(when);
  src.stop(when + 0.03);
  const click = tone(ctx, out, 1900, when);
  pluckEnv(click.gain.gain, when, 0.0005, 0.5, 0.004);
  click.osc.stop(when + 0.04);
  return { durationS: 0.04 };
}

/**
 * A breath-like swell for the codex: soft noise through a low-pass that opens and closes, under a smooth
 * rise and fall (a raised cosine), with a faint low tone breathing in it. About 1.6 s.
 */
export function breath(ctx: BaseAudioContext, dest: AudioNode, when: number, rng: Rng): RenderedCue {
  const dur = 1.6;
  const out = ctx.createGain();
  out.gain.value = peakOf('breath') / 0.55;
  out.connect(dest);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, rng, dur + 0.1, 'white');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(380, when);
  bp.frequency.exponentialRampToValueAtTime(1500, when + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(450, when + dur);
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 2200;
  soft.Q.value = 0.5;
  const g = ctx.createGain();
  const curve = new Float32Array(64);
  for (let i = 0; i < curve.length; i++) curve[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (curve.length - 1));
  g.gain.setValueCurveAtTime(curve, when, dur);
  src.connect(bp);
  bp.connect(soft);
  soft.connect(g);
  g.connect(out);
  src.start(when);
  src.stop(when + dur);
  const low = tone(ctx, g, 110, when);
  low.gain.gain.value = 0.25;
  low.osc.stop(when + dur);
  return { durationS: dur };
}

/**
 * The harmonic swell for the circle: four notes of a chord (root, major third, fifth, major seventh) built
 * from stacked partials. Each voice enters at its own moment, glides up from a little flat and swells, so the
 * chord assembles over about 3 s, holds, and fades to silence by about 7 s.
 */
export function swell(ctx: BaseAudioContext, dest: AudioNode, when: number, rootHz: number, rng: Rng): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = peakOf('swell') / 4.5;
  out.connect(dest);
  const ratios = [1, 5 / 4, 3 / 2, 15 / 8];
  const partials: Array<[number, number]> = [
    [1, 1],
    [2, 0.5],
    [3, 0.25],
  ];
  const rise = 2.9;
  const total = 7.5;
  ratios.forEach((r, vi) => {
    const enter = vi * 0.35;
    for (const [mult, amp] of partials) {
      const f = rootHz * r * mult;
      const detune = 1 + (rng.uniform() - 0.5) * 0.003;
      const { osc, gain } = tone(ctx, out, f * detune, when);
      osc.frequency.setValueAtTime(f * detune * 0.94, when);
      osc.frequency.exponentialRampToValueAtTime(f * detune, when + enter + rise * 0.8);
      gain.gain.setValueAtTime(0, when);
      gain.gain.setValueAtTime(0, when + enter);
      gain.gain.linearRampToValueAtTime(amp, when + enter + rise);
      gain.gain.setTargetAtTime(0, when + enter + rise + 0.2, 0.55);
      osc.stop(when + total);
    }
  });
  return { durationS: total };
}
