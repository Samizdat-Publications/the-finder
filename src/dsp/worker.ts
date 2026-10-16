// The picture decoder in a Web Worker. Main thread: decode the FLAC slice (src/media/frames.ts) and
// transfer its Float32Array here. Worker: sync, decode, and post the picture back in line batches so
// the game can reveal it line by line, then the whole picture with timings.
// The message handling is a pure function (handleDecode) so Node tests run it without a Worker.

import { decodeLines, frameLevels, makeJob, syncFrame, toGray, toTapeUnits } from './decode';
import type { DecodeParams } from './params';

export interface DecodeRequest {
  type: 'decode';
  /** Caller's id, echoed in every reply. */
  id: number;
  /** Slice samples as decodeAudioData gives them (int16 / 32768). Transferred, not copied. */
  samples: Float32Array;
  /** int16 value = round(tape sample x gain) (data/frames.json). */
  gain: number;
  /** First-line offset, samples at the slice rate (data/frames.json firstLineOffset). */
  seed: number;
  /** The frame's line period at 384 kHz, the tracking prior (data/decoder.json). */
  periodPrior384k: number;
  params: DecodeParams;
  /** Lines per 'lines' message (default 32). */
  batchLines?: number;
  /** Fixed black and white points; omitted: the frame's own percentile stretch (the reference). */
  levels?: [number, number];
}

export interface SyncReply {
  type: 'sync';
  id: number;
  /** Fitted line period, samples at the slice rate. */
  period: number;
  stagger: number;
  rmsResidual: number;
  nReplaced: number;
  firstEdge: number;
}

export interface LinesReply {
  type: 'lines';
  id: number;
  /** Lines k0..k1 (exclusive), 0-based: picture columns k0..k1. */
  k0: number;
  k1: number;
  height: number;
  /** 8-bit grey, column-major for this batch: gray[(k - k0) * height + row]. */
  gray: Uint8Array;
}

export interface DoneReply {
  type: 'done';
  id: number;
  width: number;
  height: number;
  /** 8-bit grey, row-major (height x width), the whole picture. */
  gray: Uint8Array;
  levels: [number, number];
  /** Milliseconds: sync, line decode, stretch, total. */
  timings: { syncMs: number; decodeMs: number; grayMs: number; totalMs: number };
}

export interface ErrorReply {
  type: 'error';
  id: number;
  message: string;
}

export type DecoderReply = SyncReply | LinesReply | DoneReply | ErrorReply;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Decode one frame, posting replies through `post` (the second argument lists buffers to transfer).
 * The levels need every line, so the float picture is decoded in full first (tens of milliseconds),
 * then the 8-bit picture is posted batch by batch and finally whole.
 */
export function handleDecode(req: DecodeRequest, post: (msg: DecoderReply, transfer: ArrayBuffer[]) => void): void {
  const t0 = now();
  try {
    const p = req.params;
    const x = toTapeUnits(req.samples, req.gain);
    const sync = syncFrame(x, p.rate, req.seed, req.periodPrior384k);
    const t1 = now();
    post(
      {
        type: 'sync',
        id: req.id,
        period: sync.fit.P,
        stagger: sync.fit.b,
        rmsResidual: sync.fit.rms,
        nReplaced: sync.nReplaced,
        firstEdge: sync.locked[0] as number,
      },
      [],
    );
    const job = makeJob(x, sync, p);
    const values = new Float64Array(p.nRows * job.nLines);
    decodeLines(job, 0, job.nLines, values);
    const t2 = now();
    const levels = req.levels ?? frameLevels(values, p);
    const gray = new Uint8Array(values.length);
    toGray(values, job.nLines, p, levels, gray);
    const t3 = now();
    const batch = Math.max(1, Math.trunc(req.batchLines ?? 32));
    const H = p.nRows;
    const W = job.nLines;
    for (let k0 = 0; k0 < W; k0 += batch) {
      const k1 = Math.min(W, k0 + batch);
      const part = new Uint8Array((k1 - k0) * H);
      for (let k = k0; k < k1; k++) for (let j = 0; j < H; j++) part[(k - k0) * H + j] = gray[j * W + k] as number;
      post({ type: 'lines', id: req.id, k0, k1, height: H, gray: part }, [part.buffer]);
    }
    post(
      {
        type: 'done',
        id: req.id,
        width: W,
        height: H,
        gray,
        levels: [levels[0], levels[1]],
        timings: { syncMs: t1 - t0, decodeMs: t2 - t1, grayMs: t3 - t2, totalMs: now() - t0 },
      },
      [gray.buffer],
    );
  } catch (e) {
    post({ type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) }, []);
  }
}

// Wire up only inside a dedicated worker (WorkerGlobalScope exists there, not in Node or a page).
interface WorkerScope {
  postMessage(msg: unknown, transfer: Transferable[]): void;
  addEventListener(type: 'message', fn: (ev: MessageEvent<DecodeRequest>) => void): void;
}
const g = globalThis as unknown as { WorkerGlobalScope?: unknown };
if (typeof g.WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  scope.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'decode') handleDecode(ev.data, (msg, transfer) => scope.postMessage(msg, transfer));
  });
}
