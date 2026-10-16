// The turntable: plays the real record the way a turntable would, wrong settings included.
// Browser module (Web Audio). Holds no game state: the command bus calls these methods.
//
// Physics (PLAN.md chapter 5; How it's checked item 9):
// - The true speed is one turn per T (the cover's 3.59994 s, groove.ts). A turntable set to s turns per
//   second plays at k = s / trueSpeed: AudioBufferSourceNode.playbackRate = k scales tempo and pitch
//   together, exactly like a real disc (a buffer source never preserves pitch).
// - Turning the wrong way (ccw) drags the stylus back out along the groove: the music plays backward.
//   Negative playbackRate is unsupported, so a reversed copy of each buffer plays from the mirrored offset.
// - A needle in the lead-in hears silent groove until the music starts; on the smooth rim, nothing; in
//   the run-out, the locked groove: one click every turn, so every 1 / s seconds = T / k.
// All audio timing uses the AudioContext clock. A 50 ms interval (live contexts only) just reports the
// position and keeps a few seconds of audio scheduled ahead; it never times audio itself.

import coverJson from '../../data/cover.json';
import recordJson from '../../data/record.json';
import { AudioStore, reverseBuffer, type FetchProgress } from '../media/audio';
import { createRng } from '../science/random';
import { Groove, PLAYING_DIRECTION, rotationPeriodFromCover, type Direction, type Region } from './groove';
import { makeClickBuffer, makeCrackleBuffer, makeDropBuffer } from './sounds';
import { Timeline, type RecordData, type RecordItem } from './timeline';

export interface SoundSwitches {
  drop: boolean;
  crackle: boolean;
  clicks: boolean;
}

export interface TurntableOptions {
  /** The record (default data/record.json). */
  record?: RecordData;
  /** Seconds per turn at the true speed (default: the cover's etched period). */
  periodS?: number;
  store?: AudioStore;
  /** Seed for the synthesized stylus sounds (default "turntable"). */
  seed?: string;
  sounds?: Partial<SoundSwitches>;
  /** Delay before a change takes effect, s (default 0.03 live, 0 offline): lets old and new audio meet sample-exactly. */
  lookaheadS?: number;
  /** How far ahead audio is kept scheduled, s (default 4). */
  horizonS?: number;
  destination?: AudioNode;
}

export interface NeedleState {
  down: boolean;
  side: number | null;
  region: Region | null;
  /** Side time, s (negative in the lead-in; the side's end in the run-out). */
  timeS: number | null;
  radiusMm: number | null;
  itemId: string | null;
  offsetS: number | null;
  /** Turntable speed, turns per second. */
  speed: number;
  direction: Direction;
  /** Speed ratio k = speed / true speed. */
  speedRatio: number;
}

export interface VoiceSpec {
  when: number;
  offset: number;
  rate: number;
  duration?: number;
  loop?: boolean;
}

/** The engine's node-graph builder: one buffer source at a speed ratio into a destination. */
export function startVoice(ctx: BaseAudioContext, buffer: AudioBuffer, dest: AudioNode, v: VoiceSpec): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = v.rate;
  src.loop = v.loop ?? false;
  src.connect(dest);
  if (v.duration !== undefined && !src.loop) src.start(v.when, v.offset, v.duration);
  else src.start(v.when, v.offset);
  src.onended = () => src.disconnect();
  return src;
}

interface Segment {
  ctx0: number;
  t0: number;
  /** Side seconds per context second, signed (negative = backward). */
  rate: number;
  /** The needle sits still: on the rim, or the disc is stopped. */
  still: boolean;
  /** Dropped on (or carried back to) the smooth rim. */
  onRim: boolean;
  /** Context time the needle enters the locked groove (forward), or null. */
  lockCtx: number | null;
  /** Context time the needle leaves the lead-in onto the rim (backward), or null. */
  rimCtx: number | null;
  scheduled: Set<number>;
  nextClick: number | null;
}

/** Disc angle in turns (clockwise positive), piecewise linear in context time. */
interface Motor {
  ctx0: number;
  a0: number;
  turnsPerS: number;
}

const BOUNDARY_SNAP_S = 1e-6; // well under one sample at 48 kHz (20.8 us): radius round-trip noise

export class Turntable extends EventTarget {
  readonly timeline: Timeline;
  readonly groove: Groove;
  readonly store: AudioStore;
  private readonly out: GainNode;
  private readonly sounds: SoundSwitches;
  private readonly lookahead: number;
  private readonly horizon: number;
  private readonly live: boolean;
  private readonly drop: AudioBuffer;
  private readonly click: AudioBuffer;
  private readonly crackle: AudioBuffer;
  private readonly crackleRev: AudioBuffer;
  private side: number | null = null;
  private speed = 0;
  private direction: Direction = PLAYING_DIRECTION;
  private motor: Motor = { ctx0: 0, a0: 0, turnsPerS: 0 };
  private seg: Segment | null = null;
  private lockA: number | null = null;
  private readonly nodes = new Set<AudioBufferSourceNode>();
  private loading = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastItem: string | null = null;
  private lastRegion: Region | null = null;

  constructor(
    readonly ctx: BaseAudioContext,
    opts: TurntableOptions = {},
  ) {
    super();
    this.timeline = new Timeline(opts.record ?? (recordJson as unknown as RecordData));
    this.groove = new Groove(this.timeline, opts.periodS ?? rotationPeriodFromCover(coverJson));
    this.store = opts.store ?? new AudioStore(ctx);
    this.sounds = { drop: true, crackle: true, clicks: true, ...opts.sounds };
    this.live = typeof OfflineAudioContext === 'undefined' || !(ctx instanceof OfflineAudioContext);
    this.lookahead = opts.lookaheadS ?? (this.live ? 0.03 : 0);
    this.horizon = opts.horizonS ?? 4;
    this.out = ctx.createGain();
    this.out.connect(opts.destination ?? ctx.destination);
    const rng = createRng(opts.seed ?? 'turntable');
    this.drop = makeDropBuffer(ctx, rng.fork('drop'));
    this.click = makeClickBuffer(ctx, rng.fork('click'));
    this.crackle = makeCrackleBuffer(ctx, rng.fork('crackle'), this.groove.periodS);
    this.crackleRev = reverseBuffer(ctx, this.crackle);
  }

  /** The true speed, turns per second (16 2/3 rpm). */
  get trueSpeed(): number {
    return this.groove.trueSpeed;
  }

  /** Put a side on the platter; with prefetch "all" (default) download its files with progress. */
  async load(side: number, onProgress?: (p: FetchProgress) => void, opts: { prefetch?: 'all' | 'none' } = {}): Promise<void> {
    const entries = this.timeline.entries(side);
    this.lift();
    this.side = side;
    if ((opts.prefetch ?? 'all') === 'none') return;
    const total = entries.reduce((a, e) => a + e.item.bytes, 0);
    let done = 0;
    for (const e of entries) {
      await this.store.fetchBytes(e.item, (p) => onProgress?.({ itemId: p.itemId, loaded: done + p.loaded, total }));
      done += e.item.bytes;
    }
    onProgress?.({ itemId: '', loaded: total, total });
  }

  /** Drop the needle at a radius (mm). Resolves once the audio under the needle is decoded and scheduled. */
  async dropNeedle(radiusMm: number, onProgress?: (p: FetchProgress) => void): Promise<void> {
    if (this.side === null) throw new Error('turntable: load a side first');
    const side = this.side;
    const region = this.groove.regionAtRadius(radiusMm);
    let t = this.groove.timeAtRadius(side, radiusMm);
    for (const e of this.timeline.entries(side)) if (Math.abs(t - e.startS) < BOUNDARY_SNAP_S) t = e.startS;
    if (Math.abs(t - this.timeline.sideDuration(side)) < BOUNDARY_SNAP_S) t = this.timeline.sideDuration(side);
    const hit = this.timeline.itemAt(side, t);
    if (hit) await this.ensure(hit.entry.item, this.direction === 'ccw', onProgress);
    this.stopNodes(this.ctx.currentTime);
    const c = this.ctx.currentTime + this.lookahead;
    this.lockA = region === 'runout' ? this.angleAt(c) : null;
    this.startSegment(c, t, region === 'rim');
    if (this.sounds.drop && region !== 'rim') this.play(this.drop, { when: c, offset: 0, rate: 1 });
    this.pump(c + this.horizon);
    this.startTicking();
  }

  /** Lift the needle: silence at once. */
  lift(): void {
    this.stopNodes(this.ctx.currentTime);
    this.seg = null;
    this.lockA = null;
    this.emit();
  }

  /** Set the platter speed, turns per second (0 stops it). */
  setSpeed(turnsPerSecond: number): void {
    if (!(turnsPerSecond >= 0) || !Number.isFinite(turnsPerSecond)) throw new Error('turntable: speed must be >= 0');
    this.change(() => (this.speed = turnsPerSecond));
  }

  setDirection(direction: Direction): void {
    this.change(() => (this.direction = direction));
  }

  /** Offline contexts: load everything the needle reaches before context time `untilS`, then schedule it. */
  async prepare(untilS: number): Promise<void> {
    const seg = this.seg;
    if (!seg || this.side === null) return;
    const tA = this.timeAt(seg, this.ctx.currentTime);
    const tB = this.timeAt(seg, untilS);
    const [lo, hi] = tA < tB ? [tA, tB] : [tB, tA];
    for (const e of this.timeline.entries(this.side)) {
      if (e.endS > lo && e.startS <= hi) await this.ensure(e.item, seg.rate < 0);
    }
    this.pump(untilS);
  }

  /** Where the needle is now (or at context time c). */
  state(c: number = this.ctx.currentTime): NeedleState {
    const k = this.speed / this.trueSpeed;
    const base = { speed: this.speed, direction: this.direction, speedRatio: k };
    const seg = this.seg;
    if (!seg || this.side === null) {
      return { down: false, side: this.side, region: null, timeS: null, radiusMm: null, itemId: null, offsetS: null, ...base };
    }
    const t = this.timeAt(seg, c);
    const d = this.timeline.sideDuration(this.side);
    let region: Region;
    if (this.onRimAt(seg, c)) region = 'rim';
    else if (t >= d) region = 'runout';
    else if (t < 0) region = 'leadin';
    else region = 'music';
    const hit = this.timeline.itemAt(this.side, t);
    return {
      down: true,
      side: this.side,
      region,
      timeS: t,
      radiusMm: this.groove.radiusAtTime(this.side, t),
      itemId: hit?.entry.item.id ?? null,
      offsetS: hit?.offsetS ?? null,
      ...base,
    };
  }

  dispose(): void {
    this.lift();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.out.disconnect();
  }

  // ---- internals ----

  private angleAt(c: number): number {
    return this.motor.a0 + this.motor.turnsPerS * (c - this.motor.ctx0);
  }

  private timeAt(seg: Segment, c: number): number {
    const d = this.timeline.sideDuration(this.side!);
    if (seg.lockCtx !== null && c >= seg.lockCtx) return d;
    if (seg.rimCtx !== null && c >= seg.rimCtx) return -this.groove.leadInS;
    return seg.t0 + seg.rate * Math.max(0, c - seg.ctx0);
  }

  private change(apply: () => void): void {
    const c = this.ctx.currentTime + this.lookahead;
    const seg = this.seg;
    const t = seg ? this.timeAt(seg, c) : null;
    const onRim = seg ? this.onRimAt(seg, c) : false;
    // Entered the locked groove under the old motor: fix the join's angle before the motor changes.
    if (seg && seg.lockCtx !== null && c >= seg.lockCtx && this.lockA === null) this.lockA = this.angleAt(seg.lockCtx);
    const a = this.angleAt(c);
    apply();
    this.motor = { ctx0: c, a0: a, turnsPerS: (this.direction === 'cw' ? 1 : -1) * this.speed };
    if (t === null) return;
    this.stopNodes(c);
    this.startSegment(c, t, onRim);
    this.pump(c + this.horizon);
  }

  private onRimAt(seg: Segment, c: number): boolean {
    return seg.onRim || (seg.rimCtx !== null && c >= seg.rimCtx);
  }

  private startSegment(c: number, t: number, onRim: boolean): void {
    const d = this.timeline.sideDuration(this.side!);
    const k = this.speed / this.trueSpeed;
    const rate = (this.direction === 'cw' ? 1 : -1) * k;
    const locked = this.lockA !== null;
    const still = onRim || rate === 0;
    const seg: Segment = { ctx0: c, t0: locked ? d : t, rate: still ? 0 : rate, still, onRim, lockCtx: null, rimCtx: null, scheduled: new Set(), nextClick: null };
    if (locked) seg.lockCtx = c;
    else if (!still && rate > 0) seg.lockCtx = c + (d - t) / rate;
    else if (!still && rate < 0) seg.rimCtx = c + (t + this.groove.leadInS) / -rate;
    this.seg = seg;
    if (this.sounds.crackle && !still) {
      const turns = this.angleAt(c);
      const frac = turns - Math.floor(turns);
      const buf = rate > 0 ? this.crackle : this.crackleRev;
      const offset = (rate > 0 ? frac : 1 - frac) * buf.duration;
      const node = this.play(buf, { when: c, offset: offset % buf.duration, rate: k, loop: true });
      if (seg.rimCtx !== null) node.stop(seg.rimCtx);
    }
  }

  private async ensure(item: RecordItem, reversed: boolean, onProgress?: (p: FetchProgress) => void): Promise<void> {
    if (reversed) await this.store.getReversed(item, onProgress);
    else await this.store.getBuffer(item, onProgress);
  }

  private requestLoad(item: RecordItem, reversed: boolean): void {
    const key = `${item.id}${reversed ? '~rev' : ''}`;
    if (this.loading.has(key)) return;
    this.loading.add(key);
    this.ensure(item, reversed)
      .then(() => this.pump(this.ctx.currentTime + this.horizon))
      .catch((e: unknown) => {
        console.warn(`turntable: could not load ${item.id}`, e);
        this.dispatchEvent(new CustomEvent('error', { detail: { itemId: item.id, error: e } }));
      })
      .finally(() => this.loading.delete(key));
  }

  /** Schedule every music buffer and click the needle reaches before context time `until`. */
  private pump(until: number): void {
    const seg = this.seg;
    if (!seg || this.side === null || seg.still) return;
    const now = this.ctx.currentTime;
    const entries = this.timeline.entries(this.side);
    const d = this.timeline.sideDuration(this.side);
    if (seg.rate > 0 && seg.t0 < d) {
      const tEnd = Math.min(d, seg.t0 + seg.rate * (until - seg.ctx0));
      for (let i = this.timeline.indexAt(this.side, Math.max(seg.t0, 0)); i < entries.length; i++) {
        const e = entries[i]!;
        if (e.startS >= tEnd) break;
        if (seg.scheduled.has(i) || e.endS <= seg.t0) continue;
        const buf = this.store.peek(e.item.id);
        if (!buf) {
          this.requestLoad(e.item, false);
          continue;
        }
        const startT = Math.max(e.startS, seg.t0);
        let when = seg.ctx0 + (startT - seg.t0) / seg.rate;
        let offset = startT - e.startS;
        if (when < now) {
          offset += (now - when) * seg.rate;
          when = now;
        }
        seg.scheduled.add(i);
        const duration = Math.min(e.endS - e.startS, buf.duration) - offset;
        if (duration <= 0) continue;
        this.play(buf, { when, offset, rate: seg.rate, duration });
      }
    } else if (seg.rate < 0 && seg.lockCtx === null && seg.t0 > -this.groove.leadInS) {
      const r = -seg.rate;
      const tEnd = Math.max(0, seg.t0 - r * (until - seg.ctx0));
      for (let i = this.timeline.indexAt(this.side, Math.min(seg.t0, d)); i >= 0; i--) {
        const e = entries[i]!;
        if (e.endS <= tEnd) break;
        if (seg.scheduled.has(i) || e.startS > seg.t0) continue;
        const buf = this.store.peekReversed(e.item.id);
        if (!buf) {
          this.requestLoad(e.item, true);
          continue;
        }
        // Reversed sample j holds forward sample N-1-j: item time tau sits at reversed offset dur - tau - 1/sr.
        const dt = 1 / buf.sampleRate;
        const lastT = e.startS + Math.min(buf.duration, e.endS - e.startS) - dt;
        const startT = Math.min(seg.t0, lastT);
        let when = seg.ctx0 + (seg.t0 - startT) / r;
        let offset = buf.duration - (startT - e.startS) - dt;
        if (when < now) {
          offset += (now - when) * r;
          when = now;
        }
        seg.scheduled.add(i);
        const duration = buf.duration - offset;
        if (duration <= 0 || startT < e.startS) continue;
        this.play(buf, { when, offset, rate: r, duration });
      }
    }
    this.pumpClicks(seg, until);
  }

  /** Run-out clicks: one each time the disc angle passes the locked groove's join (every turn). */
  private pumpClicks(seg: Segment, until: number): void {
    if (!this.sounds.clicks || seg.lockCtx === null || this.motor.turnsPerS === 0) return;
    const m = this.motor;
    // The join's angle: fixed when the needle locked, or where this segment's motor will bring it.
    const lockA = this.lockA ?? m.a0 + m.turnsPerS * (seg.lockCtx - m.ctx0);
    const from = Math.max(seg.lockCtx, seg.ctx0);
    const aFrom = m.a0 + m.turnsPerS * (from - m.ctx0) - lockA;
    const fwd = m.turnsPerS > 0;
    if (seg.nextClick === null) seg.nextClick = fwd ? Math.floor(aFrom + 1e-12) + 1 : Math.ceil(aFrom - 1e-12) - 1;
    for (;;) {
      const when = m.ctx0 + (lockA + seg.nextClick - m.a0) / m.turnsPerS;
      if (when > until) break;
      if (when >= this.ctx.currentTime) this.play(this.click, { when, offset: 0, rate: 1 });
      seg.nextClick += fwd ? 1 : -1;
    }
  }

  private stopNodes(at: number): void {
    for (const n of this.nodes) {
      try {
        n.stop(at);
      } catch {
        // already stopped
      }
    }
    this.nodes.clear();
  }

  private play(buf: AudioBuffer, v: VoiceSpec): AudioBufferSourceNode {
    const node = startVoice(this.ctx, buf, this.out, v);
    this.nodes.add(node);
    node.addEventListener('ended', () => this.nodes.delete(node));
    return node;
  }

  private startTicking(): void {
    if (!this.live || this.timer !== null) return;
    this.timer = setInterval(() => {
      this.pump(this.ctx.currentTime + this.horizon);
      this.emit();
    }, 50);
  }

  private emit(): void {
    const s = this.state();
    this.dispatchEvent(new CustomEvent('position', { detail: s }));
    if (s.itemId !== this.lastItem) {
      this.lastItem = s.itemId;
      this.dispatchEvent(new CustomEvent('itemchange', { detail: s }));
    }
    if (s.region === 'runout' && this.lastRegion !== 'runout') this.dispatchEvent(new CustomEvent('runout', { detail: s }));
    this.lastRegion = s.region;
  }
}
