// 16-bit PCM WAV reader for the 96 kHz picture slices, and the loader the decoder tests share:
// build/slices/<id>.wav when present (written by tools/ref-decoder/make_slices.py), otherwise a WAV
// converted once from the committed FLAC (public/media/frames/<id>.flac) into build/wav96/ with ffmpeg.
// Samples are returned as int16 / 32768 in a Float32Array, exactly what decodeAudioData and soundfile
// give for 16-bit audio, so Node and the browser feed the decoder identical numbers.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface Wav {
  sampleRate: number;
  channels: number;
  /** First channel, int16 / 32768. */
  samples: Float32Array;
}

/** Parse a RIFF/WAVE file holding 16-bit PCM (format tag 1 or WAVE_FORMAT_EXTENSIBLE with PCM). */
export function readWav(buf: Uint8Array): Wav {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number): string => String.fromCharCode(buf[o] as number, buf[o + 1] as number, buf[o + 2] as number, buf[o + 3] as number);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let off = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {
        format: dv.getUint16(body, true),
        channels: dv.getUint16(body + 2, true),
        rate: dv.getUint32(body + 4, true),
        bits: dv.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('data chunk before fmt chunk');
      if ((fmt.format !== 1 && fmt.format !== 0xfffe) || fmt.bits !== 16) throw new Error(`not 16-bit PCM (format ${fmt.format}, ${fmt.bits} bits)`);
      const frames = Math.floor(Math.min(size, buf.length - body) / (2 * fmt.channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = dv.getInt16(body + i * 2 * fmt.channels, true) / 32768;
      return { sampleRate: fmt.rate, channels: fmt.channels, samples };
    }
    off = body + size + (size % 2);
  }
  throw new Error('no data chunk');
}

const ROOT = resolve(process.cwd());
const SLICES = join(ROOT, 'build', 'slices');
const WAV96 = join(ROOT, 'build', 'wav96');

let ffmpegOk: boolean | null = null;
function haveFfmpeg(): boolean {
  if (ffmpegOk === null) {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      ffmpegOk = true;
    } catch {
      ffmpegOk = false;
    }
  }
  return ffmpegOk;
}

/** Where a frame's 96 kHz WAV is, converting the committed FLAC once if needed; null if impossible. */
export function slicePath(id: string): string | null {
  const a = join(SLICES, `${id}.wav`);
  if (existsSync(a)) return a;
  const b = join(WAV96, `${id}.wav`);
  if (existsSync(b)) return b;
  const flac = join(ROOT, 'public', 'media', 'frames', `${id}.flac`);
  if (!existsSync(flac) || !haveFfmpeg()) return null;
  mkdirSync(WAV96, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', flac, '-c:a', 'pcm_s16le', b], { stdio: 'ignore' });
  return existsSync(b) ? b : null;
}

/** Why slices cannot be loaded, or null when they can (checked on frame L000). */
export function slicesUnavailable(): string | null {
  return slicePath('L000') === null
    ? 'no 96 kHz slices: build/slices/*.wav missing and ffmpeg could not convert public/media/frames/*.flac'
    : null;
}

export function loadSlice(id: string): Wav {
  const p = slicePath(id);
  if (!p) throw new Error(`slice ${id} unavailable`);
  return readWav(new Uint8Array(readFileSync(p)));
}
