// Browser loader for the picture slices (D-A18): fetch a frame's FLAC whole (Workers static assets
// ignore Range requests, D-A11), decode it in an OfflineAudioContext at exactly 96,000 Hz (so nothing
// is resampled; the decoded length must equal data/frames.json's sample count), and hand the samples
// to the decoder Worker (src/dsp/worker.ts), which posts the picture back line batch by line batch.
// Browser only: uses fetch, OfflineAudioContext and Worker.

import framesData from '../../data/frames.json';
import { periodPrior, referenceParams, type Channel, type DecodeParams } from '../dsp/params';
import type { DecodeRequest, DecoderReply, DoneReply, LinesReply, SyncReply } from '../dsp/worker';

export interface FrameEntry {
  frame: string;
  channel: Channel;
  index: number;
  image: number;
  title: string;
  colourRole: string;
  /** Path under the site root, e.g. media/frames/L000.flac. */
  file: string;
  bytes: number;
  sha256: string;
  /** Hz (96,000). */
  sampleRate: number;
  /** Samples in the slice. */
  samples: number;
  /** Line 1's falling edge, samples at 96 kHz from the slice start. */
  firstLineOffset: number;
  tapeStartSample384k: number;
  /** int16 value = round(tape sample x gain). */
  gain: number;
  orientationBarry: number;
}

export const FRAMES = framesData.frames as FrameEntry[];

export function frameEntry(id: string): FrameEntry {
  const f = FRAMES.find((e) => e.frame === id);
  if (!f) throw new Error(`unknown frame ${id}`);
  return f;
}

/**
 * Largest distance from an integer allowed when undoing the browser's int16 to float scaling. Chrome
 * gives float32(w / 32767) for positive samples, whose rescale lands within 0.002 of w (float32
 * precision x 32767); 0.01 leaves margin while any wrong scale is off by up to w / 32767 (measured
 * here: up to 0.72 at the slices' largest sample, 23,679).
 */
const INT_TOL = 0.01;

/**
 * The exact 16-bit samples back from decodeAudioData's floats, as int16 / 32768 (what soundfile gives
 * the Python reference and what the Node tests feed the decoder). Measured in Chrome on L000: negative
 * samples arrive as w / 32768, but positive ones as w / 32767 (Chromium's int16 conversion), so 57% of
 * the samples differed slightly from w / 32768. The scale for the positive samples is found per buffer
 * (32767 or 32768, whichever puts every sample on an integer); anything else is an error.
 */
export function restoreInt16(s: Float32Array): Float32Array {
  const fits = (scale: number, positive: boolean): boolean => {
    for (let i = 0; i < s.length; i++) {
      const v = s[i] as number;
      if (positive ? v <= 0 : v > 0) continue;
      const w = v * scale;
      if (Math.abs(w - Math.round(w)) > INT_TOL) return false;
    }
    return true;
  };
  if (!fits(32768, false)) throw new Error('decoded negative samples are not int16 / 32768');
  const posScale = fits(32768, true) ? 32768 : fits(32767, true) ? 32767 : 0;
  if (!posScale) throw new Error('decoded positive samples are neither int16 / 32768 nor int16 / 32767');
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const v = s[i] as number;
    out[i] = Math.round(v * (v > 0 ? posScale : 32768)) / 32768;
  }
  return out;
}

/** Fetch a slice whole and decode it at its own rate. Returns int16 / 32768 samples (a fresh, transferable copy). */
export async function fetchSlice(entry: FrameEntry, baseUrl = '/'): Promise<Float32Array> {
  const res = await fetch(`${baseUrl}${entry.file}`);
  if (!res.ok) throw new Error(`${entry.file}: HTTP ${res.status}`);
  const encoded = await res.arrayBuffer();
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: entry.samples, sampleRate: entry.sampleRate });
  const audio = await ctx.decodeAudioData(encoded);
  if (audio.sampleRate !== entry.sampleRate) throw new Error(`${entry.frame}: decoded at ${audio.sampleRate} Hz, expected ${entry.sampleRate}`);
  // A resampled or truncated decode would change every line time: the length must match exactly.
  if (audio.length !== entry.samples) throw new Error(`${entry.frame}: decoded ${audio.length} samples, frames.json says ${entry.samples}`);
  return restoreInt16(audio.getChannelData(0));
}

export function createDecoderWorker(): Worker {
  return new Worker(new URL('../dsp/worker.ts', import.meta.url), { type: 'module' });
}

export interface DecodeOptions {
  /** Decoder parameters; default: the reference decode for the frame's channel at the slice rate. */
  params?: DecodeParams;
  batchLines?: number;
  levels?: [number, number];
  onSync?: (m: SyncReply) => void;
  onLines?: (m: LinesReply) => void;
}

/** One Worker, many decodes; replies are matched to requests by id. */
export class PictureDecoder {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, { opts: DecodeOptions; resolve: (d: DoneReply) => void; reject: (e: Error) => void }>();

  constructor(worker: Worker = createDecoderWorker()) {
    this.worker = worker;
    this.worker.addEventListener('message', (ev: MessageEvent<DecoderReply>) => {
      const m = ev.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'sync') p.opts.onSync?.(m);
      else if (m.type === 'lines') p.opts.onLines?.(m);
      else if (m.type === 'done') {
        this.pending.delete(m.id);
        p.resolve(m);
      } else {
        this.pending.delete(m.id);
        p.reject(new Error(m.message));
      }
    });
    this.worker.addEventListener('error', (ev) => {
      for (const p of this.pending.values()) p.reject(new Error(`decoder worker: ${ev.message}`));
      this.pending.clear();
    });
  }

  /** Decode a slice's samples (transferred to the Worker: `samples` is unusable afterwards). */
  decode(entry: FrameEntry, samples: Float32Array, opts: DecodeOptions = {}): Promise<DoneReply> {
    const id = this.nextId++;
    const req: DecodeRequest = {
      type: 'decode',
      id,
      samples,
      gain: entry.gain,
      seed: entry.firstLineOffset,
      periodPrior384k: periodPrior(entry.frame),
      params: opts.params ?? referenceParams(entry.channel, entry.sampleRate),
      ...(opts.batchLines !== undefined ? { batchLines: opts.batchLines } : {}),
      ...(opts.levels !== undefined ? { levels: opts.levels } : {}),
    };
    return new Promise<DoneReply>((resolve, reject) => {
      this.pending.set(id, { opts, resolve, reject });
      this.worker.postMessage(req, [samples.buffer]);
    });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
