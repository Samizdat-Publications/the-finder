// The picture decoder's side of the command bus: fetches a frame's slice, decodes it in the Worker with the
// bench knobs, and reveals the picture line by line (at the speed the lines come off the record, or at once).
// Browser only (fetch, Web Audio decode, Worker).

import { compose } from '../dsp/colour';
import { FRAMES, fetchSlice, frameEntry, PictureDecoder, type FrameEntry } from '../media/frames';
import { TAPE_LINE_MS, referenceBench, toDecodeParams, type BenchParams } from './model';
import { decoder as D, type SyncInfo } from './state';

let dec: PictureDecoder | null = null;
/** Fetched slices, kept (the Worker gets a copy) so knob changes decode again without another download. */
const slices = new Map<string, Float32Array>();
const SLICE_CACHE_MAX = 8;
let token = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let endReveal: (() => void) | null = null;

function worker(): PictureDecoder {
  dec ??= new PictureDecoder();
  return dec;
}

function stopReveal(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  endReveal?.();
  endReveal = null;
}

function fail(e: unknown): never {
  const message = e instanceof Error ? e.message : String(e);
  D.error.value = message;
  D.status.value = 'error';
  throw e instanceof Error ? e : new Error(message);
}

async function samplesFor(entry: FrameEntry): Promise<Float32Array> {
  const hit = slices.get(entry.frame);
  if (hit) {
    slices.delete(entry.frame);
    slices.set(entry.frame, hit);
    return hit;
  }
  const s = await fetchSlice(entry);
  slices.set(entry.frame, s);
  while (slices.size > SLICE_CACHE_MAX) slices.delete(slices.keys().next().value as string);
  return s;
}

/** The fetched slice for a frame, if it is cached (the oscilloscope strip reads it). */
export function cachedSamples(frame: string): Float32Array | undefined {
  return slices.get(frame);
}

export function select(frame: string): void {
  frameEntry(frame); // throws for an unknown frame
  token++;
  stopReveal();
  D.frame.value = frame;
  D.picture.value = null;
  D.colour.value = null;
  D.sync.value = null;
  D.revealed.value = 0;
  D.error.value = null;
  D.status.value = 'idle';
}

export function setParam<K extends keyof BenchParams>(name: K, value: BenchParams[K]): void {
  const cur = D.bench.value;
  if (!(name in cur)) throw new Error(`unknown decoder parameter "${String(name)}"`);
  const next = { ...cur, [name]: value };
  if (!(next.lineTimeMs > 0) || !Number.isFinite(next.lineTimeMs)) throw new Error('Line time must be a positive number of milliseconds.');
  if (!Number.isInteger(next.rows) || next.rows < 2) throw new Error('Rows per picture must be a whole number.');
  if (next.polarity !== 'negative' && next.polarity !== 'positive') throw new Error('Polarity must be "negative" or "positive".');
  D.bench.value = next;
}

export function reset(): void {
  D.bench.value = referenceBench();
}

/** Decode the selected frame. 'record' reveals one line per line time (8.32 ms); 'fast' shows it at once. Resolves when shown. */
export async function run(speed: 'record' | 'fast'): Promise<void> {
  const my = ++token;
  stopReveal();
  try {
    const entry = frameEntry(D.frame.value);
    const bench = D.bench.value;
    D.error.value = null;
    D.colour.value = null;
    D.picture.value = null;
    D.sync.value = null;
    D.revealed.value = 0;
    D.status.value = 'loading';
    const samples = await samplesFor(entry);
    if (my !== token) return;
    D.status.value = 'decoding';
    const params = toDecodeParams(entry.channel, bench, entry.sampleRate);
    let sync: SyncInfo | null = null;
    const done = await worker().decode(entry, samples.slice(), {
      params,
      onSync: (m) => {
        sync = { periodSamples: m.period, firstEdgeSamples: m.firstEdge, rmsResidual: m.rmsResidual, nReplaced: m.nReplaced };
        if (my === token) D.sync.value = sync;
      },
    });
    if (my !== token) return;
    const lineStepSamples = bench.syncLock ? ((sync as SyncInfo | null)?.periodSamples ?? 0) : (bench.lineTimeMs * entry.sampleRate) / 1000;
    D.picture.value = {
      frame: entry.frame,
      width: done.width,
      height: done.height,
      gray: done.gray,
      levels: done.levels,
      timings: done.timings,
      lineStepSamples,
      bench: { ...bench },
    };
    if (speed === 'fast') {
      D.revealed.value = done.width;
      D.status.value = 'done';
      return;
    }
    D.status.value = 'revealing';
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      endReveal = resolve;
      timer = setInterval(() => {
        const n = Math.min(done.width, Math.floor((performance.now() - t0) / TAPE_LINE_MS));
        if (n !== D.revealed.value) D.revealed.value = n;
        if (n >= done.width) {
          D.status.value = 'done';
          stopReveal();
        }
      }, 16);
    });
  } catch (e) {
    if (my === token) fail(e);
  }
}

/** Decode the image's three separations (R, G, B frames) with the current knobs, line them up and stack them. */
export async function composeColour(image: number): Promise<void> {
  const my = ++token;
  stopReveal();
  try {
    const roles = ['R', 'G', 'B'] as const;
    const entries = roles.map((r) => FRAMES.find((f) => f.image === image && f.colourRole === r));
    if (entries.some((e) => !e)) throw new Error(`Image ${image} does not have separate red, green and blue frames.`);
    const frames = entries as FrameEntry[];
    D.error.value = null;
    D.picture.value = null;
    D.colour.value = null;
    D.sync.value = null;
    D.revealed.value = 0;
    D.status.value = 'decoding';
    const bench = D.bench.value;
    const grays: { width: number; height: number; data: Uint8Array }[] = [];
    for (const entry of frames) {
      const samples = await samplesFor(entry);
      if (my !== token) return;
      const done = await worker().decode(entry, samples.slice(), { params: toDecodeParams(entry.channel, bench, entry.sampleRate) });
      if (my !== token) return;
      grays.push({ width: done.width, height: done.height, data: done.gray });
    }
    const [r, g, b] = grays as [(typeof grays)[number], (typeof grays)[number], (typeof grays)[number]];
    const c = compose(r, g, b);
    D.colour.value = {
      image,
      width: c.width,
      height: c.height,
      rgba: c.rgba,
      shiftG: { shift: c.shiftG.shift, peak: c.shiftG.peak },
      shiftB: { shift: c.shiftB.shift, peak: c.shiftB.peak },
      frames: [frames[0]!.frame, frames[1]!.frame, frames[2]!.frame],
    };
    D.revealed.value = c.width;
    D.status.value = 'done';
  } catch (e) {
    if (my === token) fail(e);
  }
}
