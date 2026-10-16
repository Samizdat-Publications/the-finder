// Harness-only audio tap: records everything the page plays (the interface sounds and the record, both of
// which pass through the shared output node in src/audio/mixer.ts) as Opus in WebM, so a filmed run
// (tools/harness/film-slice.mjs) has its real sound. Installed on window.__finder only when the harness API
// is on (src/harness/api.ts); never on an ordinary visit. These two functions are harness tools, not bus
// commands: they change nothing in the game.

import { sharedContext, sharedOutput } from '../audio/mixer';

export interface TapStart {
  /** Wall clock (Date.now(), ms) when the recorder reported that it started. */
  startedAtMs: number;
  /** The recording's mime type. */
  mimeType: string;
  /** The context's sample rate, Hz. */
  sampleRate: number;
}

export interface TapStop {
  /** The recording, base64 (WebM with Opus). */
  base64: string;
  mimeType: string;
  bytes: number;
  startedAtMs: number;
  stoppedAtMs: number;
}

interface Running {
  recorder: MediaRecorder;
  dest: MediaStreamAudioDestinationNode;
  chunks: Blob[];
  startedAtMs: number;
}

let running: Running | null = null;

const MIME = 'audio/webm;codecs=opus';

/** Start recording the page's output. Creates the shared context if needed (the harness has no gesture). */
export function startAudioTap(): Promise<TapStart> {
  if (running) return Promise.reject(new Error('the audio tap is already recording'));
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(MIME)) {
    return Promise.reject(new Error(`this browser cannot record ${MIME}`));
  }
  const ctx = sharedContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  const dest = ctx.createMediaStreamDestination();
  sharedOutput().connect(dest);
  const recorder = new MediaRecorder(dest.stream, { mimeType: MIME, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e: BlobEvent): void => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  return new Promise<TapStart>((resolve, reject) => {
    recorder.onstart = (): void => {
      const startedAtMs = Date.now();
      running = { recorder, dest, chunks, startedAtMs };
      resolve({ startedAtMs, mimeType: recorder.mimeType, sampleRate: ctx.sampleRate });
    };
    recorder.onerror = (): void => reject(new Error('the audio tap recorder failed'));
    recorder.start(1000);
  });
}

/** Stop recording and hand back the file. */
export function stopAudioTap(): Promise<TapStop> {
  const r = running;
  if (!r) return Promise.reject(new Error('the audio tap is not recording'));
  return new Promise<TapStop>((resolve, reject) => {
    r.recorder.onstop = (): void => {
      const stoppedAtMs = Date.now();
      running = null;
      try {
        sharedOutput().disconnect(r.dest);
      } catch {
        // already disconnected
      }
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType });
      const reader = new FileReader();
      reader.onload = (): void => {
        const url = String(reader.result);
        resolve({ base64: url.slice(url.indexOf(',') + 1), mimeType: blob.type, bytes: blob.size, startedAtMs: r.startedAtMs, stoppedAtMs });
      };
      reader.onerror = (): void => reject(new Error('could not read the recording'));
      reader.readAsDataURL(blob);
    };
    r.recorder.stop();
  });
}
