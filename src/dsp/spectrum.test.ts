// The FFT and the Welch spectrum against synthetic signals of known content: a direct DFT, a sine of known
// amplitude and frequency, white noise of known variance (truth: the signals' own definitions and Parseval's
// theorem). Check id: voices.dsp.spectrum.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { createRng } from '../science/random';
import { bandPower, crossing, fft, ifft, SNR_EDGE_DB, welch } from './spectrum';

describe('spectrum', () => {
  it('FFT, Welch levels and frequencies, and the crossing rule (voices.dsp.spectrum)', () => {
    // FFT against a direct DFT on 64 seeded random points.
    const rng = createRng('fft');
    const n = 64;
    const x = Array.from({ length: n }, () => rng.normal());
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    let fftErr = 0;
    for (let k = 0; k < n; k++) {
      let dr = 0;
      let di = 0;
      for (let j = 0; j < n; j++) {
        dr += x[j]! * Math.cos((-2 * Math.PI * j * k) / n);
        di += x[j]! * Math.sin((-2 * Math.PI * j * k) / n);
      }
      fftErr = Math.max(fftErr, Math.abs(dr - re[k]!), Math.abs(di - im[k]!));
    }
    ifft(re, im);
    let invErr = 0;
    for (let j = 0; j < n; j++) invErr = Math.max(invErr, Math.abs(re[j]! - x[j]!), Math.abs(im[j]!));

    // A 1 kHz sine of amplitude 0.5 at 44.1 kHz: its power A^2 / 2 = 0.125 integrates under the PSD, at 1 kHz.
    const sr = 44_100;
    const sine = Float64Array.from({ length: sr * 4 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr));
    const ws = welch(sine, sr);
    const df = sr / 4096;
    const sinePower = ws.psd.reduce((a, b) => a + b, 0) * df;
    const peakHz = ws.freqs[ws.psd.indexOf(Math.max(...ws.psd))]!;

    // White noise of variance 0.01: a flat one-sided PSD of 2 sigma^2 / sr.
    const wn = Float64Array.from({ length: sr * 20 }, () => 0.1 * rng.normal());
    const ww = welch(wn, sr);
    const flat = bandPower(ww.freqs, ww.psd, [1000, 20_000])[0]!;
    const flatRatio = flat / ((2 * 0.01) / sr);

    // The crossing: a ratio falling linearly from 10 dB at the first band centre to -2 dB at the last.
    const edges = Array.from({ length: 13 }, (_, i) => i * 1000);
    const snr = Array.from({ length: 12 }, (_, i) => 10 - i * (12 / 11));
    const cx = crossing(snr, edges, 12_000);
    const cxTruth = 500 + ((10 - SNR_EDGE_DB) / (12 / 11)) * 1000;

    const pass = fftErr < 1e-10 && invErr < 1e-12 && Math.abs(sinePower / 0.125 - 1) < 0.01 && Math.abs(peakHz - 1000) <= df && Math.abs(flatRatio - 1) < 0.03 && Math.abs(cx - cxTruth) < 1e-6;
    recordCheck({
      id: 'voices.dsp.spectrum',
      claim: 'The FFT and the Welch long-term spectrum measure known signals correctly: a sine at its frequency and power, white noise at its level.',
      measured: `FFT vs direct DFT within ${fftErr.toExponential(1)}, inverse within ${invErr.toExponential(1)}; sine power ${sinePower.toFixed(5)} at ${peakHz.toFixed(1)} Hz; white noise at ${flatRatio.toFixed(4)} of its level; crossing ${cx.toFixed(3)} Hz`,
      expected: `the DFT's definition; A^2/2 = 0.125 at 1000 Hz (Parseval); 2 sigma^2 / fs; ${cxTruth.toFixed(3)} Hz`,
      tolerance: 'FFT 1e-10; sine power 1% (Hann leakage stays in the band); peak within one bin (10.8 Hz); noise 3% (about 400 averaged segments over 3,600 bins: a few tenths of a per cent of noise)',
      pass,
    });
    expect(pass).toBe(true);
  });
});
