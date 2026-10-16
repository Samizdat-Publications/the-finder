// The Voices' analysis Worker: receives a track's mono samples (transferred) and a job kind, runs the pure job
// (analysisJobs.ts) off the main thread, reports progress, and posts the result back.

import { runJob, type JobKind, type JobResult } from './analysisJobs';

export interface JobRequest {
  id: number;
  kind: JobKind;
  samples: Float32Array;
  sampleRate: number;
}

export type JobReply =
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'done'; result: JobResult; ms: number }
  | { id: number; type: 'error'; error: string };

const post = (m: JobReply): void => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<JobRequest>): void => {
  const r = e.data;
  const t0 = performance.now();
  let last = 0;
  try {
    const result = runJob(r.kind, r.samples, r.sampleRate, (f) => {
      if (f - last >= 0.05) {
        last = f;
        post({ id: r.id, type: 'progress', fraction: f });
      }
    });
    post({ id: r.id, type: 'done', result, ms: performance.now() - t0 });
  } catch (err) {
    post({ id: r.id, type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
