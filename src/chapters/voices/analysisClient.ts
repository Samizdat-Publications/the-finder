// The main thread's side of The Voices' analyses: fetch a track's runtime audio, decode it once at 48 kHz in an
// OfflineAudioContext (decodeAudioData is not available inside a Worker), mix it to mono and hand it to the
// Worker for each job. Results are kept per track and job, and every caller asking at once shares one run.
// Browser only. Progress (0 to 1) is published per job for the panels.

import { signal } from '@preact/signals';
import recordJson from '../../../data/record.json';
import type { JobKind, JobResult } from './analysisJobs';
import type { JobReply, JobRequest } from './analysisWorker';

/** Decoding rate: Opus is coded at 48 kHz, so decoding there resamples nothing. */
export const DECODE_RATE = 48_000;

const fileOf = (trackId: string): string => {
  for (const s of recordJson.sides) for (const i of s.items) if (i.id === trackId) return i.file;
  throw new Error(`no track ${trackId}`);
};

/** Progress per "track/kind": 0 to 1 while running, 1 when done; absent before. */
export const jobProgress = signal<Record<string, number>>({});
const setProgress = (key: string, f: number): void => {
  jobProgress.value = { ...jobProgress.value, [key]: f };
};

/** How long each job took in the Worker, ms (the browser test reports it). */
export const jobTimings: Record<string, number> = {};

const settled = new Map<string, JobResult>();
const decoded = new Map<string, Promise<Float32Array>>();
const results = new Map<string, Promise<JobResult>>();
let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { key: string; resolve: (r: JobResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<JobReply>): void => {
    const m = e.data;
    const p = waiting.get(m.id);
    if (!p) return;
    if (m.type === 'progress') setProgress(p.key, Math.min(0.99, 0.15 + 0.85 * m.fraction));
    else {
      waiting.delete(m.id);
      if (m.type === 'done') {
        jobTimings[p.key] = m.ms;
        setProgress(p.key, 1);
        p.resolve(m.result);
      } else p.reject(new Error(m.error));
    }
  };
  w.onerror = (e: ErrorEvent): void => {
    e.preventDefault();
    for (const p of waiting.values()) p.reject(new Error(`The analysis worker stopped: ${e.message || 'unknown error'}`));
    waiting.clear();
    results.clear();
    worker?.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

/** A track's runtime audio as one mono channel at DECODE_RATE ((L + R) / 2, as the reference mixes). */
export function monoSamples(trackId: string): Promise<Float32Array> {
  let p = decoded.get(trackId);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/${fileOf(trackId)}`);
      if (!res.ok) throw new Error(`audio ${trackId}: ${res.status}`);
      const bytes = await res.arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, DECODE_RATE);
      const buf = await ctx.decodeAudioData(bytes);
      const a = buf.getChannelData(0);
      const out = new Float32Array(a.length);
      if (buf.numberOfChannels > 1) {
        const b = buf.getChannelData(1);
        for (let i = 0; i < a.length; i++) out[i] = (a[i]! + b[i]!) / 2;
      } else out.set(a);
      return out;
    })();
    decoded.set(trackId, p);
    p.catch(() => decoded.delete(trackId));
  }
  return p;
}

/** Run one analysis of one track in the Worker (shared and cached). */
export function analyse<K extends JobKind>(trackId: string, kind: K): Promise<Extract<JobResult, { kind: K }>> {
  const key = `${trackId}/${kind}`;
  let p = results.get(key);
  if (!p) {
    setProgress(key, 0.02);
    p = monoSamples(trackId).then(
      (x) =>
        new Promise<JobResult>((resolve, reject) => {
          setProgress(key, 0.15);
          const id = nextId++;
          waiting.set(id, { key, resolve, reject });
          // The Worker gets its own copy (the decoded samples stay cached here for other jobs).
          const samples = x.slice();
          getWorker().postMessage({ id, kind, samples, sampleRate: DECODE_RATE } satisfies JobRequest, [samples.buffer]);
        }),
    );
    results.set(key, p);
    p.then((r) => void settled.set(key, r)).catch(() => {
      results.delete(key);
      setProgress(key, 0);
    });
  }
  return p as Promise<Extract<JobResult, { kind: K }>>;
}

/** A result already computed, or undefined (for rendering without waiting). */
export function peekResult<K extends JobKind>(trackId: string, kind: K): Extract<JobResult, { kind: K }> | undefined {
  return settled.get(`${trackId}/${kind}`) as Extract<JobResult, { kind: K }> | undefined;
}
