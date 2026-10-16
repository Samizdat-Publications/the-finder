// The Voices on /play/, through the real instrument. The save starts with The Player done (The Voices opens after
// player.firstSound). The test:
//  1. the chapter opens and the rest of the record plays through the turntable on the one shared audio context
//     (an analyser on the shared output hears it; the needle reports the track);
//  2. the Worker's analyses of the runtime audio (Opus, decoded at 48 kHz) agree with the reference on the
//     lossless transfers (data/voices.json): what the codec changes is measured, and the tolerance is the
//     deduction's own error bar (the codec must not change any verdict);
//  3. each of the four deductions is played on the instrument, once wrong (rejected with its computed result)
//     and then right; the octave's staged moment shows and is skipped with its button;
//  4. captures at 1440 x 900 and 1366 x 768 go to review/inbox/<timestamp>-voices/ with manifest.json.
// Console errors fail the test (the harness). Ids: chapter.voices, voices.browser.agree.
// The right-answer path is exported (playVoices) for the whole-game bot (tests/browser/game.browser.mjs).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { skipMoments } from './moments.mjs';

const SAVE_KEY = 'finder.save.v1';
const V = JSON.parse(readFileSync(join(ROOT, 'data', 'voices.json'), 'utf8'));
export const VOICES_IDS = ['voices.many', 'voices.others', 'voices.hearing', 'voices.octave'];
const stamp = () => new Date().toISOString().slice(0, 19).replace(/:/g, '-');

function saveJson() {
  const done = { confirmed: true, attempts: [], hints: 0 };
  const ids = ['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths', 'player.speed', 'player.start', 'player.direction', 'player.firstSound'];
  return JSON.stringify({
    version: 1,
    nodes: Object.fromEntries(ids.map((id) => [id, done])),
    chapter: 'hub',
    settings: { humanGloss: true, masterVolume: 0.8, reducedMotion: false, soundCaptions: false },
    seed: 'voices-browser-test',
  });
}

async function setRange(page, sel, value) {
  await page.evaluate(([sel, value]) => {
    const el = document.querySelector(sel);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, value]);
}

/** Click an SVG chart at a point given in its viewBox units. */
async function clickChart(page, sel, vx, vy) {
  const p = await page.evaluate(([sel, vx, vy]) => {
    const svg = document.querySelector(sel);
    svg.scrollIntoView({ block: 'center' });
    const b = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return { x: b.left + (vx / vb.width) * b.width, y: b.top + (vy / vb.height) * b.height };
  }, [sel, vx, vy]);
  await page.mouse.click(p.x, p.y);
}

const last = (page, id) => page.evaluate((id) => window.__finder.state().game.nodes[id]?.attempts.at(-1) ?? null, id);
const confirmed = (page, id) => page.evaluate((id) => window.__finder.state().game.nodes[id]?.confirmed === true, id);
async function propose(page, id) {
  const before = (await page.evaluate((id) => window.__finder.state().game.nodes[id]?.attempts.length ?? 0, id));
  await page.locator(`[data-propose-button="${id}"]`).click();
  await page.waitForFunction(([id, n]) => (window.__finder.state().game.nodes[id]?.attempts.length ?? 0) > n, [id, before]);
  return last(page, id);
}

/** Mark a stretch [a, b] s on the spectrogram of a track by dragging across it. */
async function markStretch(page, track, a, b) {
  await page.locator(`[data-view="${track}"]`).click();
  await page.waitForSelector(`[data-spectrogram="${track}"][data-ready="true"]`, { timeout: 120_000 });
  const box = await page.locator('.vo-specbox').boundingBox();
  const dur = V_DUR[track];
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + (a / dur) * box.width, y);
  await page.mouse.down();
  await page.mouse.move(box.x + (((a + b) / 2) / dur) * box.width, y, { steps: 4 });
  await page.mouse.move(box.x + (b / dur) * box.width, y, { steps: 4 });
  await page.mouse.up();
}
const RECORD = JSON.parse(readFileSync(join(ROOT, 'data', 'record.json'), 'utf8'));
const V_DUR = Object.fromEntries(RECORD.sides.flatMap((s) => s.items).map((i) => [i.id, i.durationS]));

/** The hearing chart's x for a frequency (HearingPanel: PAD_L 44, width 520, 20,000 Hz across). */
const hearX = (hz) => 44 + (hz / 20_000) * (520 - 44 - 6);
/** The repetition curve's x for an interval in cents (OctavePanel: PAD 30, width 520, 2,400 cents across). */
const octX = (c) => 30 + (c / 2400) * (520 - 30 - 8);

/**
 * The right answers through the instrument, from a game where The Voices is open. With `wrong`, each deduction
 * is first answered wrong once (and the rejection checked). Returns what each right answer showed.
 */
export async function playVoices(page, { assert, log, shot = async () => undefined, wrong = false, label = '' }) {
  const status = await page.evaluate(() => window.__finder.state().game.chapterStatus.voices);
  assert(status === 'open', `${label}: The Voices is open after the first sound (${status})`);
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'voices' }));
  await page.waitForSelector('[data-instrument="voices"]');
  await page.evaluate(() => window.__finder.dispatch({ type: 'turntable.setVolume', value: 0.25 }));
  const shown = {};

  // ---- voices.many ----
  await page.waitForSelector('[data-panel="voices.many"] [data-control="threshold"]', { timeout: 120_000 });
  await shot('many-start', 'The Voices: the rest of the disc face by face beside its spectrogram, and the first tool: the greetings\' loudness against time with the pause threshold.', 'Opened The Voices.');
  if (wrong) {
    await setRange(page, '[data-panel="voices.many"] [data-control="threshold"]', -50);
    await setRange(page, '[data-panel="voices.many"] [data-control="gap"]', 0.4);
    const w = await propose(page, 'voices.many');
    assert(!w.ok && /hiss/.test(w.message), `${label}: a threshold in the hiss is rejected (${w.message})`);
    shown.manyWrong = w.message;
    await shot('many-wrong', 'The pause threshold set down in the hiss: only a handful of voices counted, the proposal turned down with the count.', 'Set the threshold very low and a long pause, and proposed.');
  }
  await setRange(page, '[data-panel="voices.many"] [data-control="threshold"]', -30);
  await setRange(page, '[data-panel="voices.many"] [data-control="gap"]', 0.25);
  const count = Number(await page.locator('[data-count]').getAttribute('data-count'));
  await page.locator('[data-groups="plus"]').click();
  await page.locator('[data-groups="plus"]').click();
  await shot('many-set', 'The threshold between the hiss and the voices: the greetings cut into about a hundred stretches; below, each stretch\'s pitch as a dot against a ruler one speaker\'s range wide.', 'Moved the threshold up between the hiss and the voices, shortened the pause, and counted the pitch ruler\'s widths.');
  const many = await propose(page, 'voices.many');
  assert(many.ok, `${label}: voices.many confirms at -30 and 0.25 s (${many.message})`);
  shown.many = { count, message: many.message };

  // ---- voices.others: drag across the whale song on the UN greetings track ----
  const [s0, s1] = V.whale.segmentS;
  if (wrong) {
    await markStretch(page, 'ozma-03', 20, 40);
    const w = await propose(page, 'voices.others');
    assert(!w.ok && /Speakers only/.test(w.message), `${label}: a stretch of speech is rejected (${w.message})`);
    shown.othersWrong = w.message;
  }
  await markStretch(page, 'ozma-03', s0 + 3, s1 - 3);
  await shot('others-marked', 'The UN greetings track\'s spectrogram with its last stretch marked: long, high, sliding calls unlike the speech before them.', 'Played the third voices track, looked at its pitches, and dragged across the stretch of long sliding calls near its end.');
  const others = await propose(page, 'voices.others');
  assert(others.ok, `${label}: the whale stretch confirms voices.others (${others.message})`);
  shown.others = others.message;

  // ---- voices.hearing ----
  await page.waitForSelector('[data-hearing-chart]', { timeout: 120_000 });
  if (wrong) {
    await clickChart(page, '[data-hearing-chart]', hearX(8000), 60);
    const w = await propose(page, 'voices.hearing');
    assert(!w.ok && /goes higher/.test(w.message), `${label}: a mark well above the hiss is rejected (${w.message})`);
    shown.hearingWrong = w.message;
  }
  await clickChart(page, '[data-hearing-chart]', hearX(V.spectrum.crossingHz), 60);
  await shot('hearing', 'The long spectrum of the voices falling toward the long spectrum of their silences, with the mark where they meet.', 'Clicked where the voices\' curve sinks into the hiss.');
  const hearing = await propose(page, 'voices.hearing');
  assert(hearing.ok, `${label}: the crossing confirms voices.hearing (${hearing.message})`);
  shown.hearing = hearing.message;

  // ---- voices.octave ----
  await page.waitForSelector('[data-octave-chart]', { timeout: 120_000 });
  if (wrong) {
    await clickChart(page, '[data-octave-chart]', octX(702), 60);
    await page.waitForSelector('[data-control="teeth"]', { timeout: 120_000 });
    await setRange(page, '[data-control="teeth"]', 7);
    const w = await propose(page, 'voices.octave');
    assert(!w.ok && /3 to 2/.test(w.message), `${label}: 3:2 is rejected (${w.message})`);
    shown.octaveWrong = w.message;
  }
  await clickChart(page, '[data-octave-chart]', octX(1200), 60);
  await page.waitForSelector('[data-control="teeth"]', { timeout: 120_000 });
  await setRange(page, '[data-control="teeth"]', 12);
  await page.locator('[data-comb-chart]').scrollIntoViewIfNeeded();
  await shot('octave', 'The repetition curve with its mark at a doubling, and the keyboard\'s pitches folded into one doubling under a comb of twelve equal teeth; the comb fit bars peak at twelve.', 'Clicked the peak where the pattern comes back, then moved the comb\'s teeth until it fit best.');
  const before = await page.evaluate(() => window.__finder.state().game.nodes['voices.octave']?.attempts.length ?? 0);
  await page.locator('[data-propose-button="voices.octave"]').click();
  await page.waitForFunction((n) => (window.__finder.state().game.nodes['voices.octave']?.attempts.length ?? 0) > n, before);
  const octave = await last(page, 'voices.octave');
  assert(octave.ok, `${label}: 2:1 and twelve steps confirm voices.octave (${octave.message})`);
  shown.octave = octave.message;
  const skipped = await skipMoments(page, { settleMs: 1800, shot: (id) => shot(`moment-${id}`, 'The octave moment: the keyboard\'s pitches in one doubling with the twelve-tooth comb settling over their peaks, the number twelve, while the aria plays.', 'Proposed the doubling and twelve steps; it was confirmed.') });
  assert(skipped.includes('voices.octave'), `${label}: the octave moment showed and was skipped (${skipped.join(', ')})`);
  for (const id of VOICES_IDS) assert(await confirmed(page, id), `${label}: ${id} confirmed`);
  log(`${label}: count ${count}; ${VOICES_IDS.length} confirmed`);
  return shown;
}

/** The Worker's analyses of the runtime audio against the reference. */
async function agreement(page) {
  return page.evaluate(async (ref) => {
    const c = await import('/src/chapters/voices/analysisClient.ts');
    const seg = await import('/src/dsp/segment.ts');
    const pitch = await import('/src/dsp/pitch.ts');
    const t0 = performance.now();
    const [g, h, vi, pi, ca] = await Promise.all([
      c.analyse('ozma-02', 'greetings'), c.analyse('ozma-02', 'hearing'), c.analyse('ozma-14', 'violin'), c.analyse('ozma-21', 'piano'), c.analyse('ozma-03', 'calls'),
    ]);
    const wall = performance.now() - t0;
    const refLv = ref.greetings.levelsDb10.map((v) => v / 10);
    let n = 0;
    let sum = 0;
    const N = Math.min(refLv.length, g.levels.length);
    for (let k = 0; k < N; k++) if (refLv[k] > -60) { n++; sum += Math.abs(g.levels[k] - refLv[k]); }
    // Counts on the research grid and over the reasonable settings.
    const t = ref.greetings.researchTable;
    const table = t.thresholdsDb.map((th) => t.gapsS.map((gp) => seg.silentRuns(g.levels, th, gp).length));
    let lo = Infinity, hi = -Infinity;
    const [t0g, t1g] = ref.greetings.reasonable.thresholdGridDb;
    for (let th = t0g; th <= t1g + 1e-9; th += 0.5) for (let gi = 15; gi <= 40; gi++) { const k = seg.segments(g.levels, th, gi / 100).length; lo = Math.min(lo, k); hi = Math.max(hi, k); }
    // Voicing and pitch where both are voiced.
    const rf = ref.greetings.f0Hz100;
    let both = 0, agree = 0, dc = [];
    for (let k = 0; k < N; k++) {
      const a = g.f0[k] > 0, b = rf[k] > 0;
      if (a === b) agree++;
      if (a && b) { both++; dc.push(Math.abs(1200 * Math.log2(g.f0[k] / (rf[k] / 100)))); }
    }
    dc.sort((x, y) => x - y);
    const octave = pitch.octaveOf(vi.notes);
    const centres = pitch.binCentres(pi.hist.length, pitch.CHROMA_BIN);
    const sc = pitch.combScores(centres, pi.hist, ref.music.violin.octaveCents);
    const k = 2 + sc.indexOf(Math.max(...sc));
    const calls = ca.calls.map((x) => [x.start / 100, (x.start + x.frames) / 100]);
    return {
      wall, timings: c.jobTimings, levelMeanAbs: sum / n, table, lo, hi, voicedAgree: agree / N, pitchMedianCents: dc[Math.floor(dc.length / 2)], pitch95Cents: dc[Math.floor(dc.length * 0.95)],
      crossing: h.crossingHz, noiseSegments: h.noiseSegments, octave, notes: vi.notes.length, k, peaks: pi.peaks, calls,
      hiBandDiff: (() => { const out = []; for (const f of [5000, 10000, 15000, 17000, 19000, 20500]) { const e = ref.spectrum.bandEdgesHz; const i = e.findIndex((x, j) => f >= x && f < e[j + 1]); out.push([f, h.greetingsDb[i] - ref.spectrum.greetingsDb[i]]); } return out; })(),
    };
  }, V);
}

async function audioProbe(page) {
  // An analyser on the shared output (the node every sound passes through: src/audio/mixer.ts) while a track plays.
  await page.locator('[data-play="ozma-01"]').click();
  await page.waitForFunction(() => window.__finder.state().turntable.needle?.itemId === 'ozma-01' && window.__finder.state().turntable.needle?.down, null, { timeout: 60_000 });
  return page.evaluate(async () => {
    const mix = await import('/src/audio/mixer.ts');
    const ctx = mix.sharedContext();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    mix.sharedOutput().connect(an);
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      peak = Math.max(peak, Math.sqrt(s / buf.length));
    }
    mix.sharedOutput().disconnect(an);
    return { rms: peak, state: ctx.state, rate: ctx.sampleRate, item: window.__finder.state().turntable.needle?.itemId };
  });
}

function reviewFolder() {
  const dir = join(ROOT, 'review', 'inbox', `${stamp()}-voices`);
  mkdirSync(join(dir, 'frames'), { recursive: true });
  const shots = [];
  return {
    dir,
    shots,
    async shot(page, size, name, shows, did) {
      const file = `frames/frame_${String(shots.length + 1).padStart(2, '0')}_${size}_${name}.png`;
      await page.screenshot({ path: join(dir, file) });
      shots.push({ file, viewport: size, shows, did });
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), shots }, null, 2));
      writeFileSync(join(dir, 'shots.txt'), shots.map((s) => `${s.file}: ${s.did}`).join('\n') + '\n');
    },
  };
}

export default async function run({ page, baseUrl, record, assert, log }) {
  const review = reviewFolder();
  const S = V.spectrum;
  let agree = null;
  let probe = null;
  const shownBy = {};
  for (const size of [{ w: 1440, h: 900 }, { w: 1366, h: 768 }]) {
    const tag = `${size.w}x${size.h}`;
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
    await page.evaluate(([k, v]) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem(k, v); }, [SAVE_KEY, saveJson()]);
    await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
    if (!probe) {
      await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'voices' }));
      await page.waitForSelector('[data-instrument="voices"]');
      await page.evaluate(() => window.__finder.dispatch({ type: 'turntable.setVolume', value: 0.25 }));
      probe = await audioProbe(page);
      log(`audio: rms ${probe.rms.toFixed(4)} on the shared output (${probe.state}, ${probe.rate} Hz) playing ${probe.item}`);
      assert(probe.rms > 1e-3 && probe.item === 'ozma-01', 'the record plays through the shared context');
      await page.evaluate(() => window.__finder.dispatch({ type: 'turntable.lift' }));
      agree = await agreement(page);
      log(`agreement: ${JSON.stringify(agree)}`);
      await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));
    }
    shownBy[tag] = await playVoices(page, { assert, log, wrong: true, label: tag, shot: (n, s, d) => review.shot(page, tag, n, s, d) });
    await page.evaluate(() => window.__finder.dispatch({ type: 'turntable.lift' }));
  }

  // ---- the browser's analyses against the reference: the codec must not change any verdict ----
  const acc = V.greetings.accepted;
  const tol = Math.hypot(V.music.violin.bootstrap.octaveHalfWidthCents, V.music.violin.trackerError95Cents);
  const [cLo, cHi] = S.crossingBandHz;
  const whaleIn = agree.calls.length >= 3 && agree.calls.every(([a, b]) => a >= V.whale.segmentS[0] - 1 && b <= V.whale.segmentS[1] + 1);
  const checks = {
    counts: agree.lo >= 24 && agree.hi >= agree.lo,
    crossing: agree.crossing >= cLo && agree.crossing <= cHi,
    octave: Math.abs(agree.octave - 1200) <= tol,
    comb: agree.k === 12,
    whale: whaleIn,
  };
  log(`checks: ${JSON.stringify(checks)}`);
  for (const [k, v] of Object.entries(checks)) assert(v, `browser analysis vs reference: ${k}`);
  record({
    id: 'voices.browser.agree',
    claim: "In the browser, The Voices' analyses run in a Worker on the record's runtime audio (Opus) and reach the same verdicts as the reference on the lossless transfers.",
    measured: `frame levels within ${agree.levelMeanAbs.toFixed(3)} dB on average; silent runs ${JSON.stringify(agree.table)}; ${agree.lo} to ${agree.hi} voices over the reasonable settings (reference ${acc.minVoices} to ${acc.maxVoices}); voicing agrees on ${(agree.voicedAgree * 100).toFixed(2)}% of frames, pitch median ${agree.pitchMedianCents.toFixed(3)} cents apart (95% ${agree.pitch95Cents.toFixed(2)}); crossing ${(agree.crossing / 1000).toFixed(2)} kHz; the codec moves the greetings' long spectrum by ${agree.hiBandDiff.map(([f, d]) => `${(f / 1000).toFixed(1)} kHz ${d >= 0 ? '+' : ''}${d.toFixed(2)} dB`).join(', ')}; octave ${agree.octave.toFixed(2)} cents from ${agree.notes} notes; best comb ${agree.k}; ${agree.calls.length} calls ${agree.calls.length ? `${agree.calls[0][0].toFixed(2)} to ${agree.calls.at(-1)[1].toFixed(2)} s` : ''}; Worker ms ${JSON.stringify(Object.fromEntries(Object.entries(agree.timings).map(([k, v]) => [k, Math.round(v)])))}`,
    expected: `the reference (data/voices.json): ${JSON.stringify(V.greetings.researchTable.research)}; ${acc.minVoices} to ${acc.maxVoices}; crossing ${(S.crossingHz / 1000).toFixed(2)} kHz; octave ${V.music.violin.octaveCents} cents; comb ${V.music.piano.combK}; whale ${V.whale.segmentS.join(' to ')} s`,
    tolerance: `each verdict's own error bar: crossing inside the reference's 95% band ${(cLo / 1000).toFixed(2)} to ${(cHi / 1000).toFixed(2)} kHz; octave within ${tol.toFixed(2)} cents of 1200; the same comb; every call inside the whale stretch (1 s slack for the codec's onsets); at least two dozen voices. The frame levels, silent runs, voicing and pitch are reported, not judged: they show what the codec changes`,
    pass: Object.values(checks).every(Boolean),
  });
  record({
    id: 'chapter.voices',
    claim: 'The Voices plays in the browser: the rest of the record on the turntable through the shared audio context, the spectrogram and the four tools; each deduction rejected once with its computed result, then confirmed through the instrument, at two window sizes; the octave moment shows once and is skipped.',
    measured: `audio rms ${probe.rms.toFixed(4)} on the shared output; ${VOICES_IDS.length} deductions at 1440x900 and 1366x768; counted ${shownBy['1440x900'].many.count} voices at -30 and 0.25 s; ${review.shots.length} captures in ${review.dir}`,
    expected: 'audio above silence on the shared output; every wrong answer rejected and every right one confirmed; no console errors',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });
  for (const [k, v] of Object.entries(shownBy['1440x900'])) log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
}
