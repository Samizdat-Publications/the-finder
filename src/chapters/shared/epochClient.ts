// The main thread's side of the epoch Worker (M4 step 7e): asks epochWorker.ts for a part of the model for a
// seed and resolves with it (structured clone keeps every number exact). One request per seed and part is
// kept, so the chapters, a checker's "still measuring" and a bot asking at once share one computation.
// Browser only at run time (Worker); Node never calls it (epochModel.ts computes locally there).

import type { EpochPrecomputed, HeavyPart } from './epochModel';

/** A part the Worker computes: the heavy ones, and the projected catalogue the model is built on. */
export type WorkerPart = HeavyPart | 'alien';

export interface PartRequest {
  id: number;
  seed: string;
  part: WorkerPart;
}

export type PartReply = { id: number; ok: true; out: EpochPrecomputed } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (p: EpochPrecomputed) => void; reject: (e: Error) => void }>();
const asked = new Map<string, Promise<EpochPrecomputed>>();

/** True where a module Worker can run (the browser). */
export function workerAvailable(): boolean {
  return typeof Worker === 'function';
}

function failAll(why: string): void {
  for (const w of waiting.values()) w.reject(new Error(why));
  waiting.clear();
  asked.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./epochWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<PartReply>): void => {
    const r = e.data;
    const p = waiting.get(r.id);
    if (!p) return;
    waiting.delete(r.id);
    if (r.ok) p.resolve(r.out);
    else p.reject(new Error(r.error));
  };
  w.onerror = (e: ErrorEvent): void => {
    e.preventDefault();
    failAll(`The measuring worker stopped: ${e.message || 'unknown error'}`);
    worker?.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

const SEP = '|';

function one(seed: string, part: WorkerPart): Promise<EpochPrecomputed> {
  const key = `${seed}${SEP}${part}`;
  const hit = asked.get(key);
  if (hit) return hit;
  // Parts for an earlier seed (before Start over) are no longer wanted.
  for (const k of [...asked.keys()]) if (!k.startsWith(`${seed}${SEP}`)) asked.delete(k);
  const id = nextId++;
  const p = new Promise<EpochPrecomputed>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, seed, part } satisfies PartRequest);
  });
  p.catch(() => asked.delete(key));
  asked.set(key, p);
  return p;
}

/** The parts for a seed, computed in the Worker, merged into one object. */
export async function requestParts(seed: string, parts: readonly WorkerPart[]): Promise<EpochPrecomputed> {
  const outs = await Promise.all(parts.map((p) => one(seed, p)));
  return Object.assign({}, ...outs) as EpochPrecomputed;
}
