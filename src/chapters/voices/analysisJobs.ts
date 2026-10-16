// What The Voices' Worker computes on a track's decoded samples (the mono mix of the runtime Opus audio): the
// display spectrogram, and for the four deductions the same measurements as the reference
// (tools/voices/analyse.py) with the same pure DSP. Pure (no DOM, no Worker globals), so Node tests and the
// Worker run the same function; src/chapters/voices/analysisWorker.ts only wires messages to it.

import voicesJson from '../../../data/voices.json';
import { CHROMA_BIN, calls, chromaHistogram, chromaPeaks, notes, yin, type Call } from '../../dsp/pitch';
import { frameLevels, quietStretches } from '../../dsp/segment';
import { crossing, meanRows, segmentBands, spectrogram, toDb, type Spectrogram } from '../../dsp/spectrum';

export type JobKind = 'display' | 'greetings' | 'hearing' | 'violin' | 'piano' | 'calls';

export interface GreetingsResult {
  kind: 'greetings';
  levels: Float64Array;
  /** Hz per frame, 0 where unvoiced (the reference stores the same: data/voices.json greetings.f0Hz100). */
  f0: Float64Array;
}
export interface HearingResult {
  kind: 'hearing';
  greetingsDb: Float64Array;
  noiseDb: Float64Array;
  noiseSegments: number;
  crossingHz: number;
}
export interface ViolinResult {
  kind: 'violin';
  /** Note pitches, cents re 440 Hz (rounded to 0.01 as the reference stores them). */
  notes: number[];
}
export interface PianoResult {
  kind: 'piano';
  hist: Float64Array;
  peaks: number;
}
export interface CallsResult {
  kind: 'calls';
  calls: Call[];
}
export interface DisplayResult {
  kind: 'display';
  spec: Spectrogram;
}
export type JobResult = GreetingsResult | HearingResult | ViolinResult | PianoResult | CallsResult | DisplayResult;

const Y = voicesJson.meta.yin;
const S = voicesJson.spectrum;

/** The display spectrogram's settings: about 43 ms frames every 21 ms at 48 kHz, up to 4 kHz (voices, calls and
 * the low partials of music), levels from -80 to -30 dB re full scale. Display only: nothing is measured from it. */
export const DISPLAY = { n: 2048, hop: 1024, maxHz: 4000, floorDb: -80, topDb: -30 } as const;

export function runJob(kind: JobKind, x: Float32Array | Float64Array, sr: number, progress?: (f: number) => void): JobResult {
  const p = progress ? (d: number, t: number): void => progress(t > 0 ? d / t : 1) : undefined;
  switch (kind) {
    case 'display':
      return { kind, spec: spectrogram(x, sr, DISPLAY.n, DISPLAY.hop, DISPLAY.maxHz, DISPLAY.floorDb, DISPLAY.topDb) };
    case 'greetings': {
      const levels = frameLevels(x, sr);
      const t = yin(x, sr, Y.speech, Y.threshold, p);
      const f0 = Float64Array.from(t.f0, (f, k) => (t.ap[k]! < Y.threshold ? Math.round(f * 100) / 100 : 0));
      return { kind, levels, f0 };
    }
    case 'hearing': {
      const edges = S.bandEdgesHz;
      const nb = edges.length - 1;
      const speech = meanRows(segmentBands(x, sr, S.welch.nperseg, edges), nb);
      const rows = quietStretches(x, sr, voicesJson.greetings.reasonable.thresholdDb[0]!, S.welch.nperseg).flatMap((s) => segmentBands(s, sr, S.welch.nperseg, edges));
      const greetingsDb = toDb(speech);
      const noiseDb = toDb(meanRows(rows, nb));
      const snr = greetingsDb.map((v, i) => v - noiseDb[i]!);
      return { kind, greetingsDb, noiseDb, noiseSegments: rows.length, crossingHz: crossing(snr, edges) };
    }
    case 'violin': {
      const t = yin(x, sr, Y.music, Y.threshold, p);
      return { kind, notes: notes(t, Y.threshold).map((n) => Math.round(n.cents * 100) / 100) };
    }
    case 'piano': {
      const pk = chromaPeaks(x, sr, p);
      return { kind, hist: chromaHistogram(pk), peaks: pk.cents.length };
    }
    case 'calls': {
      const t = yin(x, sr, Y.calls, Y.threshold, p);
      return { kind, calls: calls(t, voicesJson.greetings.speechCeilingHz, Y.threshold) };
    }
    default: {
      const never: never = kind;
      throw new Error(`unknown job ${String(never)}`);
    }
  }
}

/** The histogram bin of the piano's spectral peaks, cents (re-exported for the instrument). */
export { CHROMA_BIN };
