// The segmenter against synthetic truth: bursts of known level separated by gaps of known length (the count
// of segments and silent runs follows from the construction), the AES17 level of a full-scale sine, and the
// voices-by-pitch rule on pitches drawn from known speakers. Check id: voices.dsp.segment.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { createRng } from '../science/random';
import { frameLevels, segments, silentRuns, voicesByPitch } from './segment';

const SR = 44_100;

describe('segment', () => {
  it('counts bursts by threshold and gap, and voices by pitch (voices.dsp.segment)', () => {
    // A full-scale sine reads 0 dBFS (AES17); 1 kHz fits whole cycles in a 10 ms frame.
    const sine = Float64Array.from({ length: SR }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / SR));
    const l0 = frameLevels(sine, SR)[10]!;
    // Ten 0.3 s bursts at -20 dBFS; the gaps alternate 0.1 s and 0.5 s of noise at -60 dBFS.
    const rng = createRng('segments');
    const parts: number[] = [];
    const amp = 0.1;
    for (let b = 0; b < 10; b++) {
      for (let i = 0; i < 0.3 * SR; i++) parts.push(amp * Math.sin((2 * Math.PI * 300 * i) / SR));
      const gap = b % 2 === 0 ? 0.1 : 0.5;
      for (let i = 0; i < gap * SR; i++) parts.push(0.001 * rng.normal());
    }
    const lv = frameLevels(parts, SR);
    const short = segments(lv, -40, 0.05).length;
    const long = segments(lv, -40, 0.3).length;
    const tooLow = segments(lv, -70, 0.05).length;
    const runs = silentRuns(lv, -40, 0.3).length;
    // Pitches: one speaker (sd 1.2 semitones about 130 Hz) and five speakers spread over 100 to 300 Hz.
    const one = Array.from({ length: 80 }, () => 130 * 2 ** ((1.2 * rng.normal()) / 12));
    const five = Array.from({ length: 200 }, (_, i) => [100, 130, 170, 220, 290][i % 5]! * 2 ** ((1.2 * rng.normal()) / 12));
    const v1 = voicesByPitch(one, 1.2);
    const v5 = voicesByPitch(five, 1.2);
    const pass = Math.abs(l0) < 0.01 && short === 10 && long === 5 && tooLow === 1 && runs === 5 && v1 === 1 && v5 >= 3;
    recordCheck({
      id: 'voices.dsp.segment',
      claim: 'The segmenter counts sounds by the player\'s threshold and gap exactly as built, and the pitch rule tells one voice from several.',
      measured: `full-scale sine ${l0.toFixed(4)} dBFS; ten bursts: ${short} segments with a 0.05 s gap, ${long} with 0.3 s (${runs} silent runs), ${tooLow} with the threshold under the noise; voices by pitch: ${v1} for one speaker, ${v5} for five`,
      expected: '0 dBFS; 10, 5 (5 runs), 1; 1 and at least 3 (five speakers at 100 to 290 Hz overlap)',
      tolerance: 'exact counts; level within 0.01 dB',
      pass,
    });
    expect(pass).toBe(true);
  });
});
