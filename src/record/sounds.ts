// Synthesized stylus sounds: the drop, the surface crackle, the run-out click.
// Browser module (creates AudioBuffers). No downloaded files; all randomness from seeded streams
// (src/science/random.ts), so the same seed always gives the same sounds.
//
// These are sound design, not physics: levels and shapes are taste choices, labelled as such.

import type { Rng } from '../science/random';

/** Crackle level: RMS about -40 dB re full scale (step 4 spec: "about -40 dB under the music"). Taste choice. */
export const CRACKLE_RMS_DBFS = -40;
/** Peak of the run-out click, linear full scale (taste choice; well above the crackle, below clipping). */
export const CLICK_PEAK = 0.35;
/** Peak of the stylus drop thump, linear full scale (taste choice). */
export const DROP_PEAK = 0.5;

/**
 * The stylus drop: a low thump (the tonearm landing, about 55 Hz, decaying in about 60 ms) with a
 * sharp click on top (the tip meeting the groove wall). About 0.3 s long.
 */
export function makeDropBuffer(ctx: BaseAudioContext, rng: Rng): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.round(0.3 * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const thumpHz = 55;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const thump = Math.sin(2 * Math.PI * thumpHz * t) * Math.exp(-t / 0.06);
    const click = t < 0.004 ? rng.normal() * Math.exp(-t / 0.0008) * 0.6 : 0;
    d[i] = DROP_PEAK * (0.8 * thump + click);
  }
  return buf;
}

/**
 * One run-out click: a full-height first sample (so its onset is exact to the sample) followed by a
 * few milliseconds of decaying noise, the sound of the stylus jumping the locked groove's join.
 */
export function makeClickBuffer(ctx: BaseAudioContext, rng: Rng): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(2, Math.round(0.006 * sr));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  d[0] = CLICK_PEAK;
  for (let i = 1; i < n; i++) {
    const t = i / sr;
    d[i] = CLICK_PEAK * 0.5 * Math.max(-1, Math.min(1, rng.normal() * 0.5)) * Math.exp(-t / 0.0012);
  }
  return buf;
}

/**
 * Surface crackle for exactly one turn of the disc at the true speed. Looped with playbackRate equal to
 * the speed ratio, it repeats once per turn like the dust on a real disc, and speeds up with the disc.
 * Sparse ticks (Poisson, about 25 per second, each a 0.3 ms burst) over a faint high-passed hiss,
 * scaled to CRACKLE_RMS_DBFS.
 */
export function makeCrackleBuffer(ctx: BaseAudioContext, rng: Rng, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.round(seconds * sr));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  // Hiss: white noise through a one-pole high-pass (about 1 kHz corner).
  const a = Math.exp((-2 * Math.PI * 1000) / sr);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < n; i++) {
    const x = rng.normal() * 0.08;
    const y = a * (prevOut + x - prevIn);
    prevIn = x;
    prevOut = y;
    d[i] = y;
  }
  // Ticks: count from a Poisson draw, positions uniform, sign and size random.
  const ticks = rng.poisson(25 * seconds);
  const tickLen = Math.max(2, Math.round(0.0003 * sr));
  for (let k = 0; k < ticks; k++) {
    const at = Math.floor(rng.uniform() * n);
    const amp = (rng.uniform() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rng.uniform());
    for (let j = 0; j < tickLen && at + j < n; j++) d[at + j]! += amp * Math.exp(-j / (tickLen / 3));
  }
  let ss = 0;
  for (let i = 0; i < n; i++) ss += d[i]! * d[i]!;
  const rms = Math.sqrt(ss / n);
  const scale = rms > 0 ? 10 ** (CRACKLE_RMS_DBFS / 20) / rms : 0;
  for (let i = 0; i < n; i++) d[i]! *= scale;
  return buf;
}
