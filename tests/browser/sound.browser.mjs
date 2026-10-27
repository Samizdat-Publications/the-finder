// Sound v1 (M3 step 7) in a real browser.
// Part 1, offline: every cue and every chapter bed is rendered in an OfflineAudioContext exactly as the game
// plays it, and checked: finite, not silent, peak at the stated level (dBFS, before master volume), the same
// samples for the same seed. A WAV of each goes to build/sound/ (raw level, plus a copy normalized for listening).
// Part 2, live: the real game page with the interface sounds muted; the game is driven through window.__finder
// and the cue log and the caption strip are read. Id: sound.v1.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'build', 'sound');
const SR = 48000;
/** A cue's peak may sit this many dB above its target before the check fails, or this many below. */
const HIGH_DB = 0.5;
const LOW_DB = 4;

function wav(samples, scale = 1) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * scale * 32767))), 44 + i * 2);
  return buf;
}

export default async function run({ page, baseUrl, record, assert, log }) {
  mkdirSync(OUT, { recursive: true });

  // ---------------- part 1: offline renders ----------------
  const rendered = await page.evaluate(async (SR) => {
    const ui = await import('/src/audio/ui.ts');
    const amb = await import('/src/audio/ambience.ts');
    const synth = await import('/src/audio/synth.ts');
    const { createRng } = await import('/src/science/random.ts');

    const specs = [
      { name: 'pluck-arrival', level: 'pluck', lenS: 4, make: (ctx, seed) => ui.pluck(ctx, ctx.destination, 0, synth.voiceFor('arrival').pluckHz, createRng(seed)) },
      { name: 'pluck-key', level: 'pluck', lenS: 4, make: (ctx, seed) => ui.pluck(ctx, ctx.destination, 0, synth.voiceFor('key').pluckHz, createRng(seed)) },
      { name: 'pluck-player', level: 'pluck', lenS: 4, make: (ctx, seed) => ui.pluck(ctx, ctx.destination, 0, synth.voiceFor('player').pluckHz, createRng(seed)) },
      { name: 'pluck-pictures', level: 'pluck', lenS: 4, make: (ctx, seed) => ui.pluck(ctx, ctx.destination, 0, synth.voiceFor('pictures').pluckHz, createRng(seed)) },
      { name: 'cadence', level: 'cadence', lenS: 3, make: (ctx, seed) => ui.cadence(ctx, ctx.destination, 0, synth.voiceFor('arrival').pluckHz / 2, createRng(seed)) },
      { name: 'tick', level: 'tick', lenS: 0.2, make: (ctx, seed) => ui.tick(ctx, ctx.destination, 0, createRng(seed)) },
      { name: 'press', level: 'press', lenS: 0.3, make: (ctx, seed) => ui.press(ctx, ctx.destination, 0, synth.voiceFor('key').pluckHz / 2, createRng(seed)) },
      { name: 'detent-low', level: 'detent', lenS: 0.2, make: (ctx, seed) => ui.detent(ctx, ctx.destination, 0, 0, createRng(seed)) },
      { name: 'detent-high', level: 'detent', lenS: 0.2, make: (ctx, seed) => ui.detent(ctx, ctx.destination, 0, 1, createRng(seed)) },
      { name: 'breath', level: 'breath', lenS: 2, make: (ctx, seed) => ui.breath(ctx, ctx.destination, 0, createRng(seed)) },
      { name: 'swell', level: 'swell', lenS: 8, make: (ctx, seed) => ui.swell(ctx, ctx.destination, 0, synth.voiceFor('pictures').rootHz * 2, createRng(seed)) },
      { name: 'agree', level: 'agree', lenS: 9, make: (ctx, seed) => ui.agree(ctx, ctx.destination, 0, synth.voiceFor('portrait').rootHz * 2, createRng(seed)) },
      // Portrait's bed (M6): its notes swell over 16 to 34 s each, so it renders long enough for every note's crest.
      {
        name: 'bed-portrait',
        level: 'portraitBed',
        lenS: 40,
        make: (ctx, seed) => {
          const b = amb.buildBed(ctx, 'portrait', 0, createRng(seed));
          b.out.connect(ctx.destination);
          return { durationS: 40 };
        },
      },
      ...['arrival', 'key', 'player', 'pictures'].map((c) => ({
        name: `bed-${c}`,
        level: 'bed',
        lenS: 12,
        make: (ctx, seed) => {
          const b = amb.buildBed(ctx, c, 0, createRng(seed));
          b.out.connect(ctx.destination);
          return { durationS: 12 };
        },
      })),
    ];

    const renderOne = async (spec, seed) => {
      const ctx = new OfflineAudioContext(1, Math.round(spec.lenS * SR), SR);
      const info = spec.make(ctx, seed);
      const y = (await ctx.startRendering()).getChannelData(0);
      return { y: Float32Array.from(y), info };
    };

    // A plain FFT magnitude spectrum, for the spectral centroid over the whole cue.
    const centroid = (y) => {
      let n = 1;
      while (n < y.length) n <<= 1;
      const re = new Float64Array(n);
      const im = new Float64Array(n);
      for (let i = 0; i < y.length; i++) re[i] = y[i];
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) [re[i], re[j]] = [re[j], re[i]];
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        for (let i = 0; i < n; i += len) {
          for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(ang * k);
            const wi = Math.sin(ang * k);
            const a = i + k;
            const b = i + k + len / 2;
            const tr = re[b] * wr - im[b] * wi;
            const ti = re[b] * wi + im[b] * wr;
            re[b] = re[a] - tr;
            im[b] = im[a] - ti;
            re[a] += tr;
            im[a] += ti;
          }
        }
      }
      let num = 0;
      let den = 0;
      for (let k = 1; k < n / 2; k++) {
        const m = Math.hypot(re[k], im[k]);
        num += (k * SR / n) * m;
        den += m;
      }
      return den > 0 ? num / den : 0;
    };

    const out = [];
    for (const spec of specs) {
      const a = await renderOne(spec, 'seed-A');
      const b = await renderOne(spec, 'seed-A');
      const c = await renderOne(spec, 'seed-B');
      const y = a.y;
      let peak = 0;
      let sum = 0;
      let finite = true;
      let maxDiff = 0;
      let differsOtherSeed = false;
      for (let i = 0; i < y.length; i++) {
        const v = y[i];
        if (!Number.isFinite(v)) finite = false;
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        maxDiff = Math.max(maxDiff, Math.abs(v - b.y[i]));
        if (v !== c.y[i]) differsOtherSeed = true;
      }
      // Duration: last sample above -60 dB re the cue's own peak.
      let last = 0;
      for (let i = y.length - 1; i >= 0; i--) if (Math.abs(y[i]) > peak * 0.001) { last = i; break; }
      // Tail: the last 50 ms must be quiet (no cut-off click) for the one-shot cues.
      let tailPeak = 0;
      for (let i = Math.max(0, y.length - Math.round(0.05 * SR)); i < y.length; i++) tailPeak = Math.max(tailPeak, Math.abs(y[i]));
      const bytes = new Int16Array(y.length);
      for (let i = 0; i < y.length; i++) bytes[i] = Math.round(Math.max(-1, Math.min(1, y[i])) * 32767);
      let bin = '';
      const u8 = new Uint8Array(bytes.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      out.push({
        name: spec.name,
        level: spec.level,
        targetDbfs: synth.LEVEL_DBFS[spec.level],
        peak,
        peakDbfs: 20 * Math.log10(peak || 1e-12),
        rmsDbfs: 10 * Math.log10(sum / y.length || 1e-24),
        centroidHz: centroid(y),
        durationS: (last + 1) / SR,
        reportedDurationS: a.info.durationS,
        finite,
        maxDiff,
        identical: maxDiff <= peak * 1e-4 + 1e-9,
        differsOtherSeed,
        tailPeak,
        pcm: btoa(bin),
      });
    }
    return out;
  }, SR);

  let allLevelsOk = true;
  const lines = [];
  for (const r of rendered) {
    const pcm = new Int16Array(Buffer.from(r.pcm, 'base64').buffer.slice(0));
    const f = Float32Array.from(pcm, (v) => v / 32767);
    writeFileSync(join(OUT, `${r.name}.wav`), wav(f));
    writeFileSync(join(OUT, `${r.name}.norm.wav`), wav(f, r.peak > 0 ? 0.7 / r.peak : 1));
    const dev = r.peakDbfs - r.targetDbfs;
    const ok = r.finite && r.peak > 1e-5 && r.identical && dev <= HIGH_DB && dev >= -LOW_DB;
    if (!ok) allLevelsOk = false;
    lines.push(`${r.name}: peak ${r.peakDbfs.toFixed(1)} dBFS (target ${r.targetDbfs}), rms ${r.rmsDbfs.toFixed(1)} dBFS, centroid ${Math.round(r.centroidHz)} Hz, length ${r.durationS.toFixed(2)} s`);
    log(lines[lines.length - 1]);
    assert(r.finite, `${r.name} is finite`);
    assert(r.peak > 1e-5, `${r.name} is not silent`);
    assert(r.identical, `${r.name} renders the same samples for the same seed (largest difference ${r.maxDiff.toExponential(1)}, the browser's float rounding)`);
    assert(dev <= HIGH_DB, `${r.name} peaks at ${r.peakDbfs.toFixed(2)} dBFS, above its target ${r.targetDbfs} (+${HIGH_DB} dB)`);
    assert(dev >= -LOW_DB, `${r.name} peaks at ${r.peakDbfs.toFixed(2)} dBFS, far below its target ${r.targetDbfs}`);
    if (r.level !== 'bed' && r.level !== 'portraitBed') assert(r.tailPeak < r.peak * 0.003 + 1e-7, `${r.name} ends quietly (no cut-off click)`);
  }
  for (const n of ['tick', 'press', 'detent-low', 'breath', 'pluck-arrival', 'pluck-key']) {
    const r = rendered.find((x) => x.name === n);
    assert(r.differsOtherSeed, `${n} changes with the seed (its detuning or noise is seeded)`);
  }
  const loudest = Math.max(...rendered.map((r) => r.peakDbfs));
  assert(loudest <= -20, `every cue is well under the record (loudest ${loudest.toFixed(1)} dBFS)`);
  record({
    id: 'sound.v1.levels',
    claim: 'Every interface cue and chapter bed is finite, not silent, deterministic for a seed, and peaks at its stated level (all at or below -20 dBFS, far under the record)',
    measured: Object.fromEntries(rendered.map((r) => [r.name, { peakDbfs: +r.peakDbfs.toFixed(2), rmsDbfs: +r.rmsDbfs.toFixed(2), centroidHz: Math.round(r.centroidHz), durationS: +r.durationS.toFixed(2) }])),
    expected: `peak within [-${LOW_DB}, +${HIGH_DB}] dB of the stated target`,
    tolerance: `${HIGH_DB} dB above, ${LOW_DB} dB below`,
    pass: allLevelsOk,
  });

  // ---------------- part 2: the live page, muted ----------------
  await page.goto(`${baseUrl}/play/?testcheckers=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder) && document.querySelector('[data-sound-toggle]'), null, { timeout: 30_000 });

  // Nothing starts before a gesture.
  const before = await page.evaluate(async () => {
    const { mixer } = await import('/src/audio/mixer.ts');
    return { ctx: mixer.ctx !== null };
  });
  assert(before.ctx === false, 'no AudioContext exists before the first user gesture');

  const gainUntil = async (ok) => {
    for (let i = 0; i < 300; i++) {
      const g = await page.evaluate(async () => (await import('/src/audio/mixer.ts')).mixer.master.gain.value);
      if (ok(g)) return;
      await page.waitForTimeout(100);
    }
  };
  // The first gesture creates and resumes the context; then mute (a click on the switch).
  await page.mouse.click(700, 500);
  await page.waitForFunction(() => Boolean(window.__finder) && document.querySelector('[data-sound-toggle]'));
  await page.waitForTimeout(300);
  await page.locator('[data-sound-toggle]').click();
  // The context clock can run slower than the wall clock in headless Chrome: wait on the gain itself.
  await gainUntil((g) => g < 1e-3);
  const mixerState = await page.evaluate(async () => {
    const { mixer } = await import('/src/audio/mixer.ts');
    return { running: mixer.running, state: mixer.ctx?.state, muted: mixer.isMuted, gain: mixer.master?.gain.value };
  });
  assert(mixerState.muted && mixerState.gain < 1e-3, `muted: the master gain is zero (${JSON.stringify(mixerState)})`);
  assert(mixerState.running, `the context is running after the gesture (${mixerState.state})`);
  assert((await page.locator('[data-sound-toggle]').innerText()) === 'Sound off', 'the switch reads "Sound off"');

  const drive = (cmd) => page.evaluate((c) => window.__finder.dispatch(c), cmd);
  const logKinds = () => page.evaluate(async () => (await import('/src/audio/cues.ts')).cueLog().map((c) => c.kind));
  const clearLog = () => page.evaluate(async () => (await import('/src/audio/cues.ts')).clearCueLog());
  const lastLog = () => page.evaluate(async () => (await import('/src/audio/cues.ts')).cueLog().at(-1));

  await clearLog();
  // Captions are off by default: a cue is logged but no caption shows.
  await drive({ type: 'deduction.propose', id: 'arrival.purpose', answer: 'a telescope' });
  let kinds = await logKinds();
  assert(kinds.includes('cadence'), `a rejected answer logs a cadence (${kinds})`);
  assert((await page.locator('.caption').count()) === 0, 'captions are off by default');

  // Turn captions on through the bus; the next cue shows its line.
  await drive({ type: 'settings.set', name: 'soundCaptions', value: true });
  await page.waitForTimeout(700); // past the cadence rate limit
  await clearLog();
  await drive({ type: 'deduction.propose', id: 'arrival.purpose', answer: 'radio' });
  const pl = await lastLog();
  assert(pl && pl.kind === 'pluck' && pl.chapter === 'arrival' && pl.nodeId === 'arrival.purpose', `a confirmed deduction logs a pluck in Arrival's key (${JSON.stringify(pl)})`);
  await page.waitForSelector('.caption');
  assert((await page.locator('.caption').innerText()) === '[a soft pluck]', 'the caption strip shows "a soft pluck"');

  await page.waitForTimeout(600);
  await drive({ type: 'codex.open' });
  assert((await logKinds()).includes('breath'), 'opening the codex logs a breath');
  await page.waitForSelector('.caption');
  await drive({ type: 'codex.close' });

  await page.waitForTimeout(100);
  await drive({ type: 'chapter.enter', chapter: 'key' });
  const ch = await lastLog();
  assert(ch.kind === 'chapter' && ch.chapter === 'key', `entering a chapter logs the key change (${JSON.stringify(ch)})`);

  // A tick when the pointer reaches an instrument control (very quiet, rate-limited).
  await clearLog();
  await page.hover('[data-tool="codex"]');
  await page.waitForTimeout(50);
  kinds = await logKinds();
  assert(kinds.includes('tick'), `hovering a control logs a tick (${kinds})`);
  assert((await lastLog()).caption === null, 'a tick has no caption');

  // A soft knock when a control is pressed, and a detent as a slider moves (both uncaptioned, rate-limited).
  await clearLog();
  await page.evaluate(() => {
    const b = document.querySelector('[data-tool="codex"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const r = document.createElement('input');
    r.type = 'range';
    r.min = '0';
    r.max = '10';
    r.value = '7';
    (document.querySelector('.bench-area') ?? document.body).appendChild(r);
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.remove();
  });
  await page.waitForTimeout(50);
  kinds = await logKinds();
  assert(kinds.includes('press') && kinds.includes('detent'), `pressing a control logs a press and moving a slider a detent (${kinds})`);
  if ((await page.evaluate(() => document.querySelector('.codex'))) !== null) await drive({ type: 'codex.close' });

  // The record playing ducks the ambience; stopping lets it back.
  await clearLog();
  await page.evaluate(async () => {
    const { turntable } = await import('/src/game/state.ts');
    turntable.needle.value = { down: true, side: 1, region: 'music', timeS: 5, radiusMm: 100, itemId: 'x', offsetS: 1, speed: 0.28, direction: 'cw', speedRatio: 1 };
  });
  let d = await lastLog();
  assert(d.kind === 'duck', 'a playing record logs a duck');
  await page.evaluate(async () => {
    const { turntable } = await import('/src/game/state.ts');
    turntable.needle.value = null;
  });
  d = await lastLog();
  assert(d.kind === 'duck', 'a stopped record logs the release');

  // The two moments, at the state level (a bot confirming them gets the same cues).
  await page.waitForTimeout(3100);
  await clearLog();
  await page.evaluate(async () => {
    const { game } = await import('/src/game/state.ts');
    const rec = { confirmed: true, attempts: [], hints: 0 };
    game.records.value = { ...game.records.value, 'pictures.circle': rec };
  });
  const sw = await lastLog();
  assert(sw.kind === 'swell' && sw.caption === 'a chord rising out of many tones', 'pictures.circle logs the harmonic swell');
  await page.waitForTimeout(3100);
  await page.evaluate(async () => {
    const { game } = await import('/src/game/state.ts');
    const rec = { confirmed: true, attempts: [], hints: 0 };
    game.records.value = { ...game.records.value, 'player.firstSound': rec };
  });
  const hu = await lastLog();
  assert(hu.kind === 'hush' && hu.caption === 'the instruments hush', 'player.firstSound logs the hush');

  // Captions off again: the strip is empty. Unmuting restores the gain.
  await drive({ type: 'settings.set', name: 'soundCaptions', value: false });
  await page.waitForTimeout(100);
  assert((await page.locator('.caption').count()) === 0, 'captions off hides the strip');
  await page.locator('[data-sound-toggle]').click();
  await gainUntil((g) => g > 0.7);
  const gain = await page.evaluate(async () => (await import('/src/audio/mixer.ts')).mixer.master.gain.value);
  assert(gain > 0.5, `unmuting restores the master gain (${gain})`);

  record({
    id: 'sound.v1.cues',
    claim: 'The live game logs each sound cue from game state alone (reject, confirm, codex, chapter, hover, record playing, the circle swell and the first-sound hush), shows captions when asked, starts nothing before a gesture, and mutes',
    measured: 'all cue kinds seen in the cue log through window.__finder commands; caption strip text matched; master gain 0 when muted',
    expected: 'each state change maps to its cue',
    tolerance: 'exact',
    pass: true,
  });
}
