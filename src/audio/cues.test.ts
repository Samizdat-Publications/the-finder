// The cue mapping under Node: which state change makes which cue, the rate limits, the baseline on load, the
// ducking while the record plays, and the ambience's gains on a fake audio graph.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Attempt } from '../game/deductions';
import { resetAll } from '../game/gameService';
import { game, turntable, type NodeRecord } from '../game/state';
import type { NeedleState } from '../record/engine';
import { Ambience } from './ambience';
import { HUSH_NODE, SWELL_NODE, captionFor, clearCueLog, cueLog, lastCaption, startCues, type Cues, type CueEvent, type SoundSink } from './cues';
import { CHAPTER_VOICE, DUCK_DB, HUSH_DB, dbToLin, voiceFor } from './synth';

class FakeSink implements SoundSink {
  events: CueEvent[] = [];
  cue(e: CueEvent): void {
    this.events.push(e);
  }
  kinds(): string[] {
    return this.events.map((e) => e.kind);
  }
}

let clockMs = 0;
let sink: FakeSink;
let cues: Cues;

const confirm = (...ids: string[]): void => {
  const next = { ...game.records.value };
  for (const id of ids) next[id] = { confirmed: true, attempts: [], hints: 0 };
  game.records.value = next;
};
const reject = (id: string): void => {
  const prior: NodeRecord = game.records.value[id] ?? { confirmed: false, attempts: [], hints: 0 };
  const attempt: Attempt = { answer: 'x', ok: false, result: [], message: 'not that', at: 0 };
  game.records.value = { ...game.records.value, [id]: { ...prior, attempts: [...prior.attempts, attempt] } };
};
const needle = (down: boolean, speed = 0.28): NeedleState => ({
  down, side: 1, region: 'music', timeS: 10, radiusMm: 100, itemId: 'x', offsetS: 1, speed, direction: 'cw', speedRatio: 1,
});

beforeEach(() => {
  resetAll();
  turntable.needle.value = null;
  clearCueLog();
  clockMs = 1000;
  sink = new FakeSink();
  cues = startCues({ sink, now: () => clockMs });
  sink.events.length = 0; // the chapter baseline is not under test here
});
afterEach(() => cues.dispose());

describe('cues from game state', () => {
  it('plays a pluck in the chapter key when a deduction is confirmed', () => {
    confirm('arrival.purpose');
    expect(sink.events).toEqual([{ kind: 'pluck', chapter: 'arrival', nodeId: 'arrival.purpose' }]);
    expect(voiceFor('arrival').pluckHz).not.toBe(voiceFor('key').pluckHz);
    expect(cueLog().at(-1)).toMatchObject({ kind: 'pluck', caption: 'a soft pluck' });
  });

  it('plays the low two-note cadence for a rejected answer, never a pluck', () => {
    reject('arrival.purpose');
    expect(sink.events).toEqual([{ kind: 'cadence', chapter: 'arrival', nodeId: 'arrival.purpose' }]);
  });

  it('does not play a cue for a deduction that was already confirmed when the cues started (a loaded save)', () => {
    cues.dispose();
    confirm('arrival.purpose');
    clearCueLog();
    sink = new FakeSink();
    cues = startCues({ sink, now: () => clockMs });
    expect(sink.kinds()).toEqual(['chapter']);
    expect(cueLog()).toHaveLength(0);
  });

  it('plays one cue for several confirmations at once, in the first one chapter', () => {
    confirm('arrival.purpose', 'arrival.heat');
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.kind).toBe('pluck');
  });

  it('swells for pictures.circle and hushes for player.firstSound, instead of a pluck', () => {
    confirm(SWELL_NODE);
    expect(sink.events).toEqual([{ kind: 'swell', chapter: 'pictures', nodeId: SWELL_NODE }]);
    clockMs += 10_000;
    sink.events.length = 0;
    confirm(HUSH_NODE);
    expect(sink.events).toEqual([{ kind: 'hush', chapter: 'player', nodeId: HUSH_NODE }]);
    expect(cueLog().map((c) => c.caption)).toEqual(['a chord rising out of many tones', 'the instruments hush']);
  });

  it('breathes when the codex opens, once per opening', () => {
    game.codexOpen.value = true;
    expect(sink.kinds()).toEqual(['breath']);
    game.codexFocus.value = 'x';
    game.codexOpen.value = false;
    clockMs += 1000;
    game.codexOpen.value = true;
    expect(sink.kinds()).toEqual(['breath', 'breath']);
  });

  it('changes the hum with the chapter and says so', () => {
    game.chapter.value = 'arrival';
    game.chapter.value = 'key';
    expect(sink.events.map((e) => [e.kind, e.chapter])).toEqual([['chapter', 'arrival'], ['chapter', 'key']]);
    expect(cueLog().at(-1)?.caption).toBe('the hum changes key');
    game.chapter.value = 'key';
    expect(sink.events).toHaveLength(2);
  });

  it('ducks the ambience while the needle is down and the disc turns, and lets it back up after', () => {
    turntable.needle.value = needle(false);
    expect(sink.events).toHaveLength(0);
    turntable.needle.value = needle(true);
    turntable.needle.value = needle(true); // the engine reports every 50 ms; no repeat
    expect(sink.events).toEqual([{ kind: 'duck', chapter: 'hub', on: true }]);
    turntable.needle.value = needle(true, 0);
    expect(sink.events.at(-1)).toEqual({ kind: 'duck', chapter: 'hub', on: false });
    expect(captionFor('duck')).toBeNull();
  });
});

describe('rate limits', () => {
  it('drops a second pluck inside the gap and lets the next one through after it', () => {
    confirm('arrival.purpose');
    clockMs += 50;
    confirm('arrival.heat');
    expect(sink.events).toHaveLength(1);
    clockMs += 400;
    confirm('arrival.madeNotMined');
    expect(sink.events).toHaveLength(2);
  });

  it('rate-limits ticks and keeps them out of the captions', () => {
    expect(cues.fire({ kind: 'tick', chapter: 'hub' })).toBe(true);
    clockMs += 20;
    expect(cues.fire({ kind: 'tick', chapter: 'hub' })).toBe(false);
    clockMs += 100;
    expect(cues.fire({ kind: 'tick', chapter: 'hub' })).toBe(true);
    expect(lastCaption.value).toBeNull();
  });

  it('gives every cue with a sound a caption but the tick and the ducking', () => {
    for (const k of ['pluck', 'cadence', 'breath', 'swell', 'hush', 'chapter'] as const) expect(captionFor(k)).toBeTruthy();
    expect(captionFor('tick')).toBeNull();
  });
});

describe('the keys', () => {
  it('gives every chapter its own drone and a pluck two octaves above it, and the four built chapters their own beds', () => {
    for (const v of Object.values(CHAPTER_VOICE)) expect(v.pluckHz / v.rootHz).toBeCloseTo(4, 1);
    const beds = ['arrival', 'key', 'player', 'pictures'].map((c) => CHAPTER_VOICE[c as 'arrival'].bed);
    expect(new Set(beds).size).toBe(4);
  });
});

// ---- the ambience on a fake graph: only the gains and their automation are recorded ----
class FakeParam {
  value = 1;
  calls: Array<[string, number, number?]> = [];
  setTargetAtTime(v: number, t: number, tc: number): void {
    this.calls.push(['target', v, tc]);
    this.value = v;
    void t;
  }
  setValueAtTime(v: number, t: number): void {
    this.calls.push(['set', v, t]);
  }
  cancelScheduledValues(t: number): void {
    this.calls.push(['cancel', t]);
  }
  linearRampToValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  connected: FakeNode[] = [];
  type = '';
  value = 0;
  loop = false;
  buffer: unknown = null;
  stopped: number[] = [];
  connect(n: FakeNode): FakeNode {
    this.connected.push(n);
    return n;
  }
  disconnect(): void {}
  start(): void {}
  stop(t: number): void {
    this.stopped.push(t);
  }
  addEventListener(): void {}
}
class FakeCtx {
  currentTime = 5;
  sampleRate = 8000;
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  private make(): FakeNode {
    const n = new FakeNode();
    this.nodes.push(n);
    return n;
  }
  createGain = (): FakeNode => this.make();
  createOscillator = (): FakeNode => this.make();
  createBiquadFilter = (): FakeNode => this.make();
  createBufferSource = (): FakeNode => this.make();
  createBuffer = (_c: number, n: number): { getChannelData: () => Float32Array } => ({ getChannelData: () => new Float32Array(n) });
}

describe('the ambience (fake audio graph)', () => {
  const make = () => {
    const ctx = new FakeCtx();
    const dest = new FakeNode();
    const amb = new Ambience(ctx as unknown as BaseAudioContext, dest as unknown as AudioNode, () => 'seed');
    return { ctx, dest, amb };
  };
  const ducks = (ctx: FakeCtx) => ctx.nodes.filter((n) => n.gain.calls.some((c) => c[0] === 'target' && Math.abs(c[1] - dbToLin(DUCK_DB)) < 1e-9));

  it('ducks by 12 dB while the record plays and restores to unity after', () => {
    const { ctx, amb } = make();
    amb.duck(true);
    expect(dbToLin(DUCK_DB)).toBeCloseTo(0.2512, 4);
    expect(ducks(ctx)).toHaveLength(1);
    amb.duck(false);
    expect(ducks(ctx)[0]?.gain.value).toBe(1);
  });

  it('dips for the hush and comes back, and crossfades beds on a chapter change', () => {
    const { ctx, amb } = make();
    amb.setChapter('arrival');
    const before = ctx.nodes.length;
    amb.setChapter('arrival');
    expect(ctx.nodes.length).toBe(before); // same chapter: nothing new built
    amb.setChapter('key');
    expect(amb.view).toBe('key');
    expect(ctx.nodes.length).toBeGreaterThan(before);
    const stopped = ctx.nodes.filter((n) => n.stopped.length > 0);
    expect(stopped.length).toBeGreaterThan(0); // the arrival bed was told to stop
    amb.hush();
    const hushed = ctx.nodes.filter((n) => n.gain.calls.some((c) => c[0] === 'target' && Math.abs(c[1] - dbToLin(HUSH_DB)) < 1e-9));
    expect(hushed).toHaveLength(1);
    expect(hushed[0]?.gain.calls.at(-1)?.[1]).toBe(1); // and it is scheduled back up
  });
});
