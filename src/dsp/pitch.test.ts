// The pitch tools against synthetic truth: YIN on tones of known pitch (its error in cents, measured and
// recorded: voices.md 4 quotes no published figure), the octave on a melody with an exact doubling, the comb on
// equal-tempered and on seven-step pitches, and a sliding call of known length and glide.
// Check ids: voices.dsp.yin, voices.dsp.music.
import { describe, expect, it } from 'vitest';
import voicesJson from '../../data/voices.json';
import { recordCheck } from '../../tests/support/record';
import { createRng, type Rng } from '../science/random';
import { FoldNotes, bestFold } from './fold';
import { COMB_K, calls, combScores, yin, type TrackerSettings } from './pitch';

const SR = 44_100;

/** Five harmonics at 1/k, random phases, white noise 30 dB down, 16-bit (as tools/voices/analyse.py tone()). */
function tone(f: number, dur: number, rng: Rng): Float64Array {
  const n = Math.round(dur * SR);
  const ph = [1, 2, 3, 4, 5].map(() => rng.uniform() * 2 * Math.PI);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) for (let k = 1; k <= 5; k++) x[i] = x[i]! + Math.sin((2 * Math.PI * k * f * i) / SR + ph[k - 1]!) / k;
  const rms = Math.sqrt(x.reduce((a, b) => a + b * b, 0) / n);
  for (let i = 0; i < n; i++) x[i] = Math.round(((0.3 * x[i]!) / rms + 0.3 * 10 ** (-30 / 20) * rng.normal()) * 32768) / 32768;
  return x;
}

describe('pitch', () => {
  it('YIN reads tones of known pitch within a few cents (voices.dsp.yin)', () => {
    const rng = createRng('yin-tones');
    const y = voicesJson.meta.yin;
    const sets: [string, TrackerSettings, number, number][] = [
      ['speech', y.speech, 70, 450],
      ['music', y.music, 200, 2200],
      ['calls', y.calls, 300, 1800],
    ];
    const out: string[] = [];
    let worst95 = 0;
    for (const [name, s, lo, hi] of sets) {
      const errs: number[] = [];
      for (let i = 0; i < 20; i++) {
        const f = Math.exp(Math.log(lo) + rng.uniform() * (Math.log(hi) - Math.log(lo)));
        const t = yin(tone(f, 0.5, rng), SR, s);
        for (let k = 0; k < t.f0.length; k++) if (t.ap[k]! < 0.1) errs.push(Math.abs(1200 * Math.log2(t.f0[k]! / f)));
      }
      errs.sort((a, b) => a - b);
      const e95 = errs[Math.floor(0.95 * (errs.length - 1))]!;
      worst95 = Math.max(worst95, e95);
      out.push(`${name} 95% within ${e95.toFixed(3)} cents (${errs.length} frames)`);
    }
    recordCheck({
      id: 'voices.dsp.yin',
      claim: 'The pitch tracker reads synthetic tones of known pitch to within a few cents in every setting the game uses.',
      measured: out.join('; '),
      expected: 'the tones\' own pitches (20 per setting, five harmonics, noise 30 dB down, 16-bit)',
      tolerance: '95% of frames within 5 cents, a twentieth of a tempered step (the reference measures the same: voices.ref.tracker)',
      pass: worst95 < 5,
    });
    expect(worst95).toBeLessThan(5);
  });

  it('the octave, the comb and the calls on synthetic music (voices.dsp.music)', () => {
    const rng = createRng('music');
    // A melody on a 100-cent grid (offset 30 cents) over three octaves of a major scale, intonation sd 8 cents. (Over
    // only two octaves the fold prefers 3:2: a scale built from fifths lines up a fifth apart, and two octaves hold
    // too few notes a doubling apart to outweigh it. The Gavotte spans 2.6 octaves and folds best at 2:1 by a wide
    // margin: voices.ref.octave.)
    const scale = [0, 200, 400, 500, 700, 900, 1100];
    const mel = Array.from({ length: 400 }, () => -500 + 30 + scale[Math.floor(rng.uniform() * 7)]! + 1200 * Math.floor(rng.uniform() * 3) + 8 * rng.normal());
    const oct = bestFold(new FoldNotes(mel)).cents;
    // Combs on weighted pitches: equal-tempered (12 per octave) and seven equal steps.
    const pts = (k: number): { c: Float64Array; w: Float64Array } => {
      const c = Float64Array.from({ length: 600 }, () => (1200 / k) * Math.floor(rng.uniform() * 3 * k) - 1800 + 4 * rng.normal());
      return { c, w: new Float64Array(600).fill(1) };
    };
    const best = (k: number): number => {
      const { c, w } = pts(k);
      const s = combScores(c, w, 1200);
      return COMB_K[0] + s.indexOf(Math.max(...s));
    };
    const k12 = best(12);
    const k7 = best(7);
    // A call: 0.8 s sliding from 900 Hz up 300 cents, after 0.5 s of silence.
    const n = Math.round(1.8 * SR);
    const x = new Float64Array(n);
    let ph = 0;
    for (let i = Math.round(0.5 * SR); i < Math.round(1.3 * SR); i++) {
      const t = (i - 0.5 * SR) / (0.8 * SR);
      ph += (2 * Math.PI * 900 * 2 ** ((300 * t) / 1200)) / SR;
      x[i] = 0.3 * Math.sin(ph);
    }
    const cs = calls(yin(x, SR, voicesJson.meta.yin.calls), 400);
    const c0 = cs[0];
    const callOk = cs.length === 1 && c0 !== undefined && Math.abs(c0.frames / 100 - 0.8) <= 0.05 && Math.abs(c0.glideCents - 300) < 15;
    const pass = Math.abs(oct - 1200) < 5 && k12 === 12 && k7 === 7 && callOk;
    recordCheck({
      id: 'voices.dsp.music',
      claim: 'The octave, the comb and the call finder recover known structure: a doubling, twelve and seven equal steps, a sliding call of known length and glide.',
      measured: `octave ${oct.toFixed(2)} cents; combs ${k12} and ${k7}; ${cs.length} call(s)${c0 ? `, ${(c0.frames / 100).toFixed(2)} s, glide ${c0.glideCents.toFixed(1)} cents` : ''}`,
      expected: '1200 cents; 12 and 7; one call of 0.8 s gliding 300 cents',
      tolerance: 'octave within 5 cents (8-cent intonation over 400 notes; the fold, src/dsp/fold.ts); combs exact; call length within 5 frames (YIN windows overlap the onsets), glide within 15 cents',
      pass,
    });
    expect(pass).toBe(true);
  });
});
