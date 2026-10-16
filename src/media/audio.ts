// Record audio for the browser: whole-file fetch with progress, SHA-256 check, decode, cache.
// Browser module (fetch, Web Audio, crypto.subtle).
//
// Cloudflare static assets ignore Range requests (HANDOFF.md gotchas), so every track is fetched whole
// and kept as compressed bytes; it is decoded on demand with decodeAudioData in the page's own context
// (which resamples to the context rate) and cached by item id. Decoded audio is large (a 9-minute track
// is about 200 MB of float samples), so decoded and reversed buffers live in an LRU with a byte budget.

import type { RecordItem } from '../record/timeline';

export interface FetchProgress {
  itemId: string;
  /** Bytes received so far for this item. */
  loaded: number;
  /** Expected bytes: Content-Length when the server sends it, else record.json `bytes`. */
  total: number;
}

export interface AudioStoreOptions {
  /** URL prefix for item files (record.json paths are relative to the site root). Default "/". */
  baseUrl?: string;
  /** Byte budget for decoded and reversed buffers together. Default 768 MB. */
  decodedBudgetBytes?: number;
  /** Verify SHA-256 against record.json when crypto.subtle is available. Default true. */
  verify?: boolean;
}

/** A buffer with its samples in reverse order (the wrong-direction lesson: negative playbackRate is unsupported). */
export function reverseBuffer(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    const n = src.length;
    for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i]!;
  }
  return out;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let notedNoSubtle = false;

export class AudioStore {
  private readonly baseUrl: string;
  private readonly budget: number;
  private readonly verify: boolean;
  private readonly bytes = new Map<string, Promise<ArrayBuffer>>();
  /** Decoded and reversed buffers, least recently used first (Map keeps insertion order). */
  private readonly lru = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer>>();
  private lruBytes = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    opts: AudioStoreOptions = {},
  ) {
    this.baseUrl = opts.baseUrl ?? '/';
    this.budget = opts.decodedBudgetBytes ?? 768 * 1024 * 1024;
    this.verify = opts.verify ?? true;
  }

  /** The item's whole compressed file, fetched once, with progress, SHA-256 checked. */
  fetchBytes(item: RecordItem, onProgress?: (p: FetchProgress) => void): Promise<ArrayBuffer> {
    let p = this.bytes.get(item.id);
    if (!p) {
      p = this.download(item, onProgress);
      this.bytes.set(item.id, p);
      p.catch(() => this.bytes.delete(item.id));
    } else if (onProgress) {
      void p.then((b) => onProgress({ itemId: item.id, loaded: b.byteLength, total: b.byteLength }));
    }
    return p;
  }

  private async download(item: RecordItem, onProgress?: (p: FetchProgress) => void): Promise<ArrayBuffer> {
    const url = this.baseUrl + item.file;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio: ${url} answered ${res.status}`);
    const header = Number(res.headers.get('content-length'));
    const total = header > 0 ? header : item.bytes;
    let buf: ArrayBuffer;
    if (res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.({ itemId: item.id, loaded, total });
      }
      const all = new Uint8Array(loaded);
      let at = 0;
      for (const c of chunks) {
        all.set(c, at);
        at += c.byteLength;
      }
      buf = all.buffer;
    } else {
      buf = await res.arrayBuffer();
      onProgress?.({ itemId: item.id, loaded: buf.byteLength, total });
    }
    if (item.bytes > 0 && buf.byteLength !== item.bytes) {
      throw new Error(`audio: ${url} is ${buf.byteLength} bytes, record.json says ${item.bytes}`);
    }
    if (this.verify && item.sha256) {
      const subtle = globalThis.crypto?.subtle;
      if (subtle) {
        const got = hex(await subtle.digest('SHA-256', buf));
        if (got !== item.sha256.toLowerCase()) throw new Error(`audio: ${url} SHA-256 ${got} does not match record.json`);
      } else if (!notedNoSubtle) {
        notedNoSubtle = true;
        console.info('audio: crypto.subtle unavailable (not a secure context), SHA-256 checks skipped');
      }
    }
    return buf;
  }

  /** A decoded buffer already in the cache (and marks it recently used), else undefined. */
  peek(id: string): AudioBuffer | undefined {
    return this.touch(id);
  }

  peekReversed(id: string): AudioBuffer | undefined {
    return this.touch(`${id}~rev`);
  }

  /** Put a buffer in the cache by id (tests, and synthetic items). */
  put(id: string, buf: AudioBuffer): void {
    this.insert(id, buf);
  }

  /** Decoded audio for the item: fetched whole if needed, decoded in this store's context, cached. */
  getBuffer(item: RecordItem, onProgress?: (p: FetchProgress) => void): Promise<AudioBuffer> {
    const hit = this.touch(item.id);
    if (hit) return Promise.resolve(hit);
    let p = this.pending.get(item.id);
    if (!p) {
      p = (async () => {
        const bytes = await this.fetchBytes(item, onProgress);
        // decodeAudioData detaches its argument: give it a copy so the compressed bytes stay cached.
        const decoded = await this.ctx.decodeAudioData(bytes.slice(0));
        this.insert(item.id, decoded);
        return decoded;
      })();
      this.pending.set(item.id, p);
      const done = (): void => void this.pending.delete(item.id);
      p.then(done, done);
    }
    return p;
  }

  /** The item's samples reversed, made on demand from the decoded buffer and cached. */
  async getReversed(item: RecordItem, onProgress?: (p: FetchProgress) => void): Promise<AudioBuffer> {
    const key = `${item.id}~rev`;
    const hit = this.touch(key);
    if (hit) return hit;
    const fwd = await this.getBuffer(item, onProgress);
    const again = this.touch(key);
    if (again) return again;
    const rev = reverseBuffer(this.ctx, fwd);
    this.insert(key, rev);
    return rev;
  }

  private touch(key: string): AudioBuffer | undefined {
    const b = this.lru.get(key);
    if (b) {
      this.lru.delete(key);
      this.lru.set(key, b);
    }
    return b;
  }

  private insert(key: string, buf: AudioBuffer): void {
    const old = this.lru.get(key);
    if (old) {
      this.lruBytes -= old.length * old.numberOfChannels * 4;
      this.lru.delete(key);
    }
    this.lru.set(key, buf);
    this.lruBytes += buf.length * buf.numberOfChannels * 4;
    // Evict least recently used, but always keep the newest two (the current item and the next one).
    while (this.lruBytes > this.budget && this.lru.size > 2) {
      const [k, b] = this.lru.entries().next().value as [string, AudioBuffer];
      this.lru.delete(k);
      this.lruBytes -= b.length * b.numberOfChannels * 4;
    }
  }
}
