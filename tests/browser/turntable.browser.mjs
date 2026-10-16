// The turntable engine in a real browser, rendered offline (OfflineAudioContext, no audio device).
// Every case drives the engine itself (Turntable: timeline, groove, node-graph builder) and measures
// the rendered samples against independent truth: an exact tone, the time-reversed input, the decoded
// track file, and the cover's rotation period. PLAN.md "How it's checked" item 9.

const SR = 48000;

export default async function run({ page, record, assert, log }) {
  // ---- Pitch and tempo: a speed error of k scales pitch and duration by exactly k ----
  const pitch = await page.evaluate(async (SR) => {
    const { Turntable } = await import('/src/record/engine.ts');
    const DUR = 2;
    const F = 1000;
    const fake = { sides: [{ side: 1, items: [{ id: 'tone', kind: 'test', musicNumber: null, title: 'tone', durationS: DUR, file: '', bytes: 0, sha256: '' }] }] };
    const out = [];
    for (const k of [0.5, 0.97, 1, 1.03, 2]) {
      const len = Math.ceil((DUR / k + 0.5) * SR);
      const ctx = new OfflineAudioContext(1, len, SR);
      const tone = ctx.createBuffer(1, DUR * SR, SR);
      const d = tone.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * F * i) / SR);
      const tt = new Turntable(ctx, { record: fake, sounds: { drop: false, crackle: false, clicks: false } });
      tt.store.put('tone', tone);
      await tt.load(1, undefined, { prefetch: 'none' });
      tt.setSpeed(k * tt.trueSpeed);
      await tt.dropNeedle(tt.groove.radiusAtTime(1, 0));
      await tt.prepare(len / SR);
      const y = (await ctx.startRendering()).getChannelData(0);
      let last = -1;
      for (let i = y.length - 1; i >= 0; i--) if (Math.abs(y[i]) > 1e-6) { last = i; break; }
      // Rising zero crossings, linearly interpolated, away from the ends.
      const lo = Math.round(0.01 * SR);
      const hi = last - Math.round(0.01 * SR);
      const xs = [];
      for (let i = lo; i < hi; i++) if (y[i] <= 0 && y[i + 1] > 0) xs.push(i + y[i] / (y[i] - y[i + 1]));
      const f = ((xs.length - 1) * SR) / (xs[xs.length - 1] - xs[0]);
      out.push({ k, f, expectedF: F * k, durS: (last + 1) / SR, expectedDurS: DUR / k });
    }
    return out;
  }, SR);
  let pitchOk = true;
  const quantumS = 128 / SR; // one Web Audio render quantum (128 frames, the spec's block size)
  for (const p of pitch) {
    const fErr = Math.abs(p.f / p.expectedF - 1);
    const dErr = Math.abs(p.durS - p.expectedDurS);
    p.fErr = fErr;
    p.dErr = dErr;
    log(`k ${p.k}: ${p.f.toFixed(3)} Hz (expected ${p.expectedF}), relative error ${fErr.toExponential(1)}; duration ${p.durS.toFixed(5)} s (expected ${p.expectedDurS.toFixed(5)})`);
    if (!(fErr < 1e-3 && dErr <= quantumS)) pitchOk = false;
  }
  record({
    id: 'turntable.pitch',
    claim: 'Play the record at the wrong speed and the pitch and tempo shift by exactly the speed error, as on a real turntable.',
    measured: pitch.map((p) => `k ${p.k}: ${p.f.toFixed(2)} Hz (relative error ${p.fErr.toExponential(1)}), ${p.durS.toFixed(4)} s`).join('; '),
    expected: '1,000 Hz x k and 2 s / k for a 1,000 Hz, 2 s test tone (PLAN.md How it\'s checked 9)',
    tolerance: 'frequency within 0.1% (spec); duration within one 128-frame render quantum (Web Audio block size)',
    pass: pitchOk,
  });
  assert(pitchOk, 'pitch and duration scale by k');

  // ---- Direction: the wrong way plays the groove backward ----
  const dir = await page.evaluate(async (SR) => {
    const { Turntable } = await import('/src/record/engine.ts');
    const LEN = 3;
    const F0 = 200;
    const F1 = 4000;
    const N = LEN * SR;
    const chirp = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      chirp[i] = 0.5 * Math.sin(2 * Math.PI * (F0 * t + ((F1 - F0) * t * t) / (2 * LEN)));
    }
    const half = N / 2;
    const fake = { sides: [{ side: 1, items: ['A', 'B'].map((id) => ({ id, kind: 'test', musicNumber: null, title: id, durationS: LEN / 2, file: '', bytes: 0, sha256: '' })) }] };
    const RENDER = 2;
    const ctx = new OfflineAudioContext(1, RENDER * SR, SR);
    const tt = new Turntable(ctx, { record: fake, sounds: { drop: false, crackle: false, clicks: false } });
    for (const [id, from] of [['A', 0], ['B', half]]) {
      const b = ctx.createBuffer(1, half, SR);
      b.getChannelData(0).set(chirp.subarray(from, from + half));
      tt.store.put(id, b);
    }
    await tt.load(1, undefined, { prefetch: 'none' });
    tt.setDirection('ccw');
    tt.setSpeed(tt.trueSpeed);
    const T0 = 2.5; // 1.0 s into item B; going backward it crosses into item A at 1.5 s
    await tt.dropNeedle(tt.groove.radiusAtTime(1, T0));
    await tt.prepare(RENDER);
    const y = (await ctx.startRendering()).getChannelData(0);
    const rev = new Float32Array(y.length);
    const fwd = new Float32Array(y.length);
    for (let n = 0; n < y.length; n++) {
      rev[n] = chirp[T0 * SR - n];
      fwd[n] = chirp[T0 * SR + n - y.length] ?? 0; // the same span played forward
    }
    const corr = (a, b) => {
      let ma = 0, mb = 0;
      for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
      ma /= a.length; mb /= b.length;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < a.length; i++) { const x = a[i] - ma, z = b[i] - mb; sab += x * z; saa += x * x; sbb += z * z; }
      return sab / Math.sqrt(saa * sbb);
    };
    const freq = (from, to) => {
      const xs = [];
      for (let i = from; i < to; i++) if (y[i] <= 0 && y[i + 1] > 0) xs.push(i + y[i] / (y[i] - y[i + 1]));
      return ((xs.length - 1) * SR) / (xs[xs.length - 1] - xs[0]);
    };
    return {
      corrReversed: corr(y, rev),
      corrForward: corr(y, fwd),
      fStart: freq(0, Math.round(0.1 * SR)),
      fEnd: freq(y.length - Math.round(0.1 * SR) - 1, y.length - 1),
    };
  }, SR);
  log(`ccw: correlation with the time-reversed chirp ${dir.corrReversed.toFixed(6)}, with the forward chirp ${dir.corrForward.toFixed(4)}; frequency ${dir.fStart.toFixed(0)} Hz falling to ${dir.fEnd.toFixed(0)} Hz`);
  const dirOk = dir.corrReversed > 0.99 && dir.fEnd < dir.fStart;
  record({
    id: 'turntable.direction',
    claim: 'Turn the record the wrong way and it plays backward: a rising sweep comes out falling.',
    measured: `correlation with the time-reversed input ${dir.corrReversed.toFixed(6)} (with the forward input ${dir.corrForward.toFixed(3)}); pitch ${dir.fStart.toFixed(0)} Hz falling to ${dir.fEnd.toFixed(0)} Hz, across an item boundary`,
    expected: 'the input chirp (200 to 4,000 Hz) reversed in time, from the mirrored position',
    tolerance: 'correlation above 0.99 (spec)',
    pass: dirOk,
  });
  assert(dirOk, 'wrong direction plays reversed');

  // ---- The real record: Johnny B. Goode from its groove radius ----
  const real = await page.evaluate(async (SR) => {
    const { Turntable } = await import('/src/record/engine.ts');
    const SECONDS = 5;
    const ref = await (async () => {
      const bytes = await (await fetch('/media/audio/11.webm')).arrayBuffer();
      return new OfflineAudioContext(2, 1, SR).decodeAudioData(bytes);
    })();
    const corr = (a, b) => {
      let ma = 0, mb = 0;
      for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
      ma /= a.length; mb /= b.length;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < a.length; i++) { const x = a[i] - ma, z = b[i] - mb; sab += x * z; saa += x * x; sbb += z * z; }
      return sab / Math.sqrt(saa * sbb);
    };
    const out = [];
    let loadMs = 0;
    for (const k of [1, 1.03]) {
      const ctx = new OfflineAudioContext(2, SECONDS * SR, SR);
      const tt = new Turntable(ctx, { sounds: { drop: false, crackle: false, clicks: false } });
      const t0 = performance.now();
      let lastProgress = null;
      await tt.load(1, (p) => (lastProgress = p));
      loadMs = performance.now() - t0;
      const start = tt.timeline.entryById('ozma-11').startS;
      const radius = tt.groove.radiusAtTime(1, start);
      tt.setSpeed(k * tt.trueSpeed);
      await tt.dropNeedle(radius);
      const st = tt.state(0);
      await tt.prepare(SECONDS);
      const rendered = await ctx.startRendering();
      // Truth: the decoded track file itself, resampled by k (linear interpolation) for k != 1.
      const a = [];
      const b = [];
      for (let c = 0; c < 2; c++) {
        const y = rendered.getChannelData(c);
        const x = ref.getChannelData(c);
        for (let n = 0; n < y.length; n++) {
          const pos = n * k;
          const i = Math.floor(pos);
          const f = pos - i;
          a.push(y[n]);
          b.push((x[i] ?? 0) * (1 - f) + (x[i + 1] ?? 0) * f);
        }
      }
      out.push({ k, radius, itemId: st.itemId, offsetS: st.offsetS, corr: corr(a, b), progress: lastProgress });
    }
    return { out, loadMs, refLength: ref.length };
  }, SR);
  let realOk = true;
  for (const r of real.out) {
    log(`k ${r.k}: needle at ${r.radius.toFixed(4)} mm -> ${r.itemId} +${r.offsetS.toExponential(1)} s; correlation ${r.corr.toFixed(5)}`);
    if (!(r.corr > 0.99 && r.itemId === 'ozma-11')) realOk = false;
  }
  log(`side 1 fetched and checked (${real.out[0].progress?.total} bytes) in ${(real.loadMs / 1000).toFixed(2)} s`);
  record({
    id: 'turntable.record',
    claim: 'Dropping the needle at the right radius plays the real record from that point, at the right speed and at a wrong one.',
    measured: real.out.map((r) => `k ${r.k}: correlation ${r.corr.toFixed(4)} over 5 s (needle at ${r.radius.toFixed(2)} mm)`).join('; '),
    expected: 'the decoded Johnny B. Goode file (music 7, side 1) from its start, resampled by k for k = 1.03',
    tolerance: 'correlation above 0.99 (spec)',
    pass: realOk,
    notes: 'Needle radius from the groove model (12-inch standard radii, not documented for Voyager). Stylus sounds off for this check.',
  });
  assert(realOk, 'the real record plays from the dropped radius');

  // ---- Run-out: the locked groove clicks once per turn ----
  const runout = await page.evaluate(async (SR) => {
    const { Turntable } = await import('/src/record/engine.ts');
    const { binaryToSeconds } = await import('/src/science/units.ts');
    const cover = await (await fetch('/data/cover.json')).json();
    const T = binaryToSeconds(cover.record.rotationPeriod.binary);
    const out = [];
    for (const k of [1, 1.5]) {
      const len = Math.ceil(((4.5 * T) / k) * SR);
      const ctx = new OfflineAudioContext(1, len, SR);
      const tt = new Turntable(ctx, { sounds: { drop: false, crackle: false, clicks: true } });
      await tt.load(1, undefined, { prefetch: 'none' });
      tt.setSpeed(k * tt.trueSpeed);
      await tt.dropNeedle(55);
      const region = tt.state(0).region;
      await tt.prepare(len / SR);
      const y = (await ctx.startRendering()).getChannelData(0);
      const onsets = [];
      let quiet = Infinity;
      for (let i = 0; i < y.length; i++) {
        if (Math.abs(y[i]) > 0.05) {
          if (quiet > 0.1 * SR) onsets.push(i);
          quiet = 0;
        } else quiet++;
      }
      out.push({ k, region, onsets, expected: (T / k) * SR });
    }
    return { out, T };
  }, SR);
  let runOk = true;
  const runFacts = [];
  for (const r of runout.out) {
    const iv = r.onsets.slice(1).map((o, i) => o - r.onsets[i]);
    const worst = Math.max(Math.abs(r.onsets[0] - r.expected), ...iv.map((v) => Math.abs(v - r.expected)));
    log(`k ${r.k}: region ${r.region}, ${r.onsets.length} clicks, intervals ${iv.join(', ')} samples (expected ${r.expected.toFixed(2)}), worst ${worst.toFixed(2)}`);
    runFacts.push(`k ${r.k}: ${r.onsets.length} clicks every ${(iv.reduce((a, b) => a + b, 0) / iv.length / SR).toFixed(5)} s, worst ${worst.toFixed(1)} samples off`);
    // Two samples: each onset is found to within one sample (sub-sample start times round either way).
    if (!(r.region === 'runout' && r.onsets.length === 4 && worst <= 2)) runOk = false;
  }
  record({
    id: 'turntable.runout',
    claim: 'A needle dropped inside the music lands in the locked run-out groove and clicks once every turn.',
    measured: runFacts.join('; '),
    expected: `one click per turn, every T / k with T = ${runout.T.toFixed(5)} s from the cover (cover.md 1b), the first one turn after the drop`,
    tolerance: '2 samples at 48 kHz (onset detection to the sample at each end)',
    pass: runOk,
  });
  assert(runOk, 'run-out clicks every T / k');
}
