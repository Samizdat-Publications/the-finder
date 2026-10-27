// The interface's sounds, synthesized live in Web Audio on any BaseAudioContext: a resonant pluck on a
// confirmed deduction, a dull low two-note fall on a rejected answer, a quiet tick on instrument controls,
// a breath when the codex opens, the harmonic swell when the calibration circle resolves, and The Trail's
// two moments: the scattered tones of the map's old lines settling into one chord (the ages snapping
// together) and a warm low held tone (the Sun found; softer again for the neighbour twist).
// All noise comes from seeded streams, so the same seed always renders the same cue. Levels are the
// LEVEL_DBFS targets in synth.ts (peak, cue alone); TRIM holds the measured correction so the peak lands
// on the target (see tests/browser/sound.browser.mjs, which checks it).

import type { Rng } from '../science/random';
import { LEVEL_DBFS, dbToLin, noiseBuffer, portraitChord, tone } from './synth';

export type RenderKind = 'pluck' | 'cadence' | 'tick' | 'press' | 'detent' | 'breath' | 'swell' | 'snap' | 'warm' | 'agree';

export interface RenderedCue {
  /** Seconds from `when` until the cue has died away (the caller may stop sources after this). */
  durationS: number;
}

/** Gain trims (linear) found by measuring the rendered peaks; a pure scale, so shapes are untouched. */
const TRIM: Record<RenderKind, number> = { pluck: 1.38, cadence: 1.2, tick: 1.86, press: 1.29, detent: 1.3, breath: 1.1, swell: 1.15, snap: 1.37, warm: 1.0, agree: 0.815 };

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
 * A press: a soft low knock when a control is pressed, a short sine at `hz` (the chapter's key, an octave down)
 * with a little low-passed noise for the felt part of the knock. About 90 ms.
 */
export function press(ctx: BaseAudioContext, dest: AudioNode, when: number, hz: number, rng: Rng): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = peakOf('press');
  out.connect(dest);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, rng, 0.05, 'white');
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, when);
  g.gain.setTargetAtTime(0, when, 0.006);
  src.connect(lp);
  lp.connect(g);
  g.connect(out);
  src.start(when);
  src.stop(when + 0.05);
  const body = tone(ctx, out, hz * (1 + (rng.uniform() - 0.5) * 0.004), when);
  pluckEnv(body.gain.gain, when, 0.002, 0.8, 0.018);
  body.osc.stop(when + 0.09);
  return { durationS: 0.09 };
}

/**
 * A detent: one tiny click as a slider moves a step, its pitch rising with the slider's position (0 to 1, from
 * 900 Hz to 2,400 Hz), so dragging a slider sounds like turning a fine dial. About 30 ms.
 */
export function detent(ctx: BaseAudioContext, dest: AudioNode, when: number, position: number, rng: Rng): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = peakOf('detent');
  out.connect(dest);
  const x = Math.min(1, Math.max(0, Number.isFinite(position) ? position : 0.5));
  const hz = 900 * (2400 / 900) ** x * (1 + (rng.uniform() - 0.5) * 0.004);
  const click = tone(ctx, out, hz, when);
  pluckEnv(click.gain.gain, when, 0.0005, 0.8, 0.005);
  click.osc.stop(when + 0.03);
  return { durationS: 0.03 };
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

/** The chord the old lines settle into: a major chord stacked up the harmonic series, one tone per line. */
const SNAP_CHORD = [1, 5 / 4, 3 / 2, 2, 5 / 2, 3, 4, 5, 6, 8, 10, 12];
/** How far the most scattered line starts from its chord tone, octaves (a taste choice). */
const SNAP_SPREAD_OCT = 0.5;
/** Seconds until every tone has arrived on its chord tone ("over about two seconds", the spec). */
export const SNAP_SETTLE_S = 2;

/**
 * The ages snapping together: one short tone per old line, entering one after another, each pitched off
 * its chord tone by its age's offset in the alien's own frame (`scatter`, each in -1..1, the largest offset
 * at +/-1); each glides onto its tone of one chord, which all arrive at together after SNAP_SETTLE_S, swell,
 * hold briefly and fade. About 6 s.
 */
export function snap(ctx: BaseAudioContext, dest: AudioNode, when: number, rootHz: number, scatter: readonly number[], rng: Rng): RenderedCue {
  const offs = scatter.length > 0 ? scatter.slice(0, SNAP_CHORD.length) : [-1, 0.6, -0.3, 0.9, -0.7, 0.2, -0.5, 0.4];
  const out = ctx.createGain();
  out.gain.value = peakOf('snap') / 2.2;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  lp.Q.value = 0.5;
  lp.connect(out);
  out.connect(dest);
  const settle = when + SNAP_SETTLE_S;
  const total = 6.4;
  offs.forEach((off, i) => {
    const target = rootHz * (SNAP_CHORD[i] as number) * (1 + (rng.uniform() - 0.5) * 0.002);
    const start = target * 2 ** (SNAP_SPREAD_OCT * Math.max(-1, Math.min(1, off)));
    const enter = when + i * 0.11;
    const amp = 1 / (1 + 0.3 * i);
    const { osc, gain } = tone(ctx, lp, start, enter, 'triangle');
    osc.frequency.setValueAtTime(start, enter);
    osc.frequency.exponentialRampToValueAtTime(target, settle);
    const g = gain.gain;
    // the short scattered tone: a quick strike that falls to a murmur while it glides
    g.setValueAtTime(0, enter);
    g.linearRampToValueAtTime(amp * 0.7, enter + 0.012);
    g.setTargetAtTime(amp * 0.12, enter + 0.012, 0.09);
    // the chord: every voice swells together onto its tone, holds, and fades
    g.setTargetAtTime(amp * 0.55, settle - 0.35, 0.18);
    g.setTargetAtTime(0, settle + 0.9, 0.5);
    osc.stop(when + total);
  });
  return { durationS: total };
}

/**
 * The warm tone: a low, soft, held note (a chorus of two sines a hair apart, a quiet octave and twelfth,
 * through a low-pass), a slow rise, about three seconds held, a long release. `levelDb` lowers it (the
 * neighbour twist plays it softer). About 7 s.
 */
export function warm(ctx: BaseAudioContext, dest: AudioNode, when: number, hz: number, rng: Rng, levelDb = 0): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = (peakOf('warm') * dbToLin(levelDb)) / 1.6;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(400, hz * 4);
  lp.Q.value = 0.4;
  lp.connect(out);
  out.connect(dest);
  const total = 7;
  const parts: Array<[number, number]> = [
    [1, 0.7],
    [1.0025, 0.55],
    [2, 0.22],
    [3, 0.08],
  ];
  for (const [mult, amp] of parts) {
    const { osc, gain } = tone(ctx, lp, hz * mult * (1 + (rng.uniform() - 0.5) * 0.001), when);
    const g = gain.gain;
    g.setValueAtTime(0, when);
    g.setTargetAtTime(amp, when, 0.35);
    g.setTargetAtTime(0, when + 3.4, 0.55);
    osc.stop(when + total);
  }
  return { durationS: total };
}

/** The chord the clocks resolve onto: a major triad with its octave over Portrait's root (taste). */
const AGREE_CHORD = [1, 5 / 4, 3 / 2, 2];

/**
 * The clocks agree (portrait.together): every chapter's key at once, the chord of Portrait's bed (synth.ts
 * portraitChord) an octave up, entering softly one after another; then each voice glides onto the nearest tone of
 * one major chord over Portrait's root (`rootHz`) and the chord swells, holds and fades. A slower, warmer cousin of
 * the snap. About 8 s.
 */
export function agree(ctx: BaseAudioContext, dest: AudioNode, when: number, rootHz: number, rng: Rng): RenderedCue {
  const out = ctx.createGain();
  out.gain.value = peakOf('agree') / 2.4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  lp.Q.value = 0.4;
  lp.connect(out);
  out.connect(dest);
  const notes = portraitChord(rootHz);
  const targets = AGREE_CHORD.map((r) => rootHz * r);
  const resolve = when + 2.6;
  const total = 8.4;
  notes.forEach((hz, i) => {
    const near = targets.reduce((b, t) => (Math.abs(Math.log2(t / hz)) < Math.abs(Math.log2(b / hz)) ? t : b), targets[0] as number);
    const detune = 1 + (rng.uniform() - 0.5) * 0.002;
    const enter = when + i * 0.22;
    const amp = 1 / (1 + 0.15 * i);
    for (const [mult, part] of [[1, 1], [2, 0.3]] as const) {
      const { osc, gain } = tone(ctx, lp, hz * mult * detune, enter);
      osc.frequency.setValueAtTime(hz * mult * detune, enter);
      osc.frequency.setValueAtTime(hz * mult * detune, resolve - 0.9);
      osc.frequency.exponentialRampToValueAtTime(near * mult * detune, resolve);
      const g = gain.gain;
      g.setValueAtTime(0, when);
      g.setValueAtTime(0, enter);
      g.linearRampToValueAtTime(amp * part * 0.35, enter + 1.2);
      g.linearRampToValueAtTime(amp * part * 0.8, resolve + 0.5);
      g.setTargetAtTime(0, resolve + 2.2, 0.8);
      osc.stop(when + total);
    }
  });
  return { durationS: total };
}
