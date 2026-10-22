// The whole-game bots (M4 step 7; PLAN.md "How it's checked" item 11). From a fresh save (storage cleared, no
// seeded save), through window.__finder and the real page only: the same command bus the interface sends
// (rule 5), plus what a player's hands do to an instrument's own view (dials, the chart, tool tabs).
//
// bot.game: the right answers in an order the gating allows: the slice (playSlice), then The Map, The Spot and
//   The Trail through their instruments (the chapters' own play paths, exported by their browser tests). All
//   all 44 deductions confirm, the codex holds 44 entries, the ring shows every built chapter done with the
//   finished glow, no console errors (the harness), and the cue log holds the M4 moments once each, at their
//   moments. Captures for the blind critic go to review/inbox/<timestamp>-m4/frames/ at 1440x900 with
//   manifest.json (what each shows) and shots.txt (what the player did before each, in plain words).
// bot.m4Wrong: every meaningful wrong result the M4 checkers distinguish, once each, rejected and shown on the
//   instrument and in the notebook, then the right answer (tests/browser/m4wrong.mjs).
// sound.m4.levels: the new cues and beds rendered offline exactly as the game plays them, at their levels.
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { MOMENT_SHOWS, playMap } from './map.browser.mjs';
import { MOMENT_IDS, skipMoments } from './moments.mjs';
import { PORTRAIT_IDS, playPortrait } from './portrait.browser.mjs';
import { m4WrongPass } from './m4wrong.mjs';
import { SLICE_IDS, freshStart, playSlice, reviewFolder, stamp } from './slice.browser.mjs';
import { playSpot } from './spot.browser.mjs';
import { playTrail } from './trail.browser.mjs';
import { M5_PICTURE_IDS, playPicturesM5 } from './album.browser.mjs';
import { playEpilogue } from './epilogue.browser.mjs';
import { VOICES_IDS, playVoices } from './voices.browser.mjs';

const M4_IDS = [
  'map.periods', 'map.old', 'map.identify', 'map.motion', 'map.region',
  'spot.find', 'spot.age', 'spot.purity',
  'trail.origin', 'trail.age', 'trail.neighbour', 'trail.where', 'trail.when',
];
const ALL_IDS = [...SLICE_IDS, ...M5_PICTURE_IDS, ...VOICES_IDS, ...M4_IDS, ...PORTRAIT_IDS];

/** The frames kept for the critic: what each shows and what the player did just before, in plain words. */
const FRAMES = {
  'ring-end': ['ring-after-the-key', 'The ring after the first four chapters: they are done, and The Map, The Spot and The Trail, which The Key opened, are lit and ready.', 'Finished the first four chapters (the arrival, the key on the cover, the record player and the pictures), then went back to the ring.'],
  'map-aligned': ['map-aligned', "The Map: the galaxy chart with the cover's map laid over it, turned so its long line points at the centre of the galaxy; nothing matched yet.", "Opened The Map and turned the dial until the map's long line points at the centre of the galaxy."],
  'three-lines-matched': ['map-line-matched', "Three old lines linked to their pulsars on the chart; the readout for one line gives the map's number, the pulsar's period now, how far off its direction is, and the match quality (its odds against every other pulsar along the line).", 'Chose three of the map\'s lines one after another and clicked, on the galaxy chart, the pulsar each one points to.'],
  'spin-down-clock': ['map-clock', "The spin-down clock run back tens of thousands of years: one line's curve crosses the map's number; the other matched lines cross nearby.", "Proposed one line's pulsar, then ran the clock backwards until that line's curve crossed the map's number."],
  'ages-before-axis': ['map-ages-before-axis', 'Ages across the sky: each old line\'s age placed where its pulsar lies, coloured older or younger; beside them, the ages against the axis (still at the pole) scatter widely.', 'Matched a pulsar to every line, then opened the step about the motion.'],
  'ages-after-axis': ['map-ages-after-axis', 'The axis moved across the sky: beside it the ages now fall on one straight line, its slope the speed along the axis.', 'Clicked the sky where the ages line up best, then nudged the axis until the points fell on a straight line.'],
  'region-and-stars': ['map-region', 'Where the map was drawn from: the 95% region on the plane with the stars inside it lit, and the same region on the galaxy chart.', "Proposed the axis, then slid the map's origin across the plane into the region where its lines point best."],
  'sweep-over': ['spot-found', 'The Spot: the detector probe over the hidden spot at the top of the plate; the count rate is high and the strip chart full of counts.', 'Opened The Spot and swept the probe up the plate to where the counts rise.'],
  'count-short': ['spot-count-short', 'A short count: a few dozen alphas, a wide ratio band and a wide 95% age interval; the age proposed far out is turned down.', 'Marked the spot, counted for a short while, set the age marker far out and proposed it.'],
  'count-long': ['spot-count-long', "About a day of counting: thousands of alphas, the spectrum's three lines, a narrow ratio band, and the age marker where the curve meets it.", 'Counted much longer, then set the marker where the curve meets the measured ratio.'],
  'purity-natural': ['spot-purity-natural', 'The purity test at ore in balance: the two clocks disagree and the meter says the counts do not fit.', 'Proposed the age, then turned the purity dial to ore in balance.'],
  'purity-pure': ['spot-purity-pure', 'The purity test at a pure start: both clocks read about 44,000 years and the meter says the counts fit.', 'Proposed ore in balance (turned down), then turned the dial to a pure start.'],
  '2-wrong-star-trail': ['trail-wrong-star', 'The Trail: a wrong star\'s trail on the neighbourhood chart; the machine does not fly straight away from it, and the proposal is turned down with the angle.', 'Opened The Trail, clicked a nearby star on the chart and proposed it as the star the machine flies away from.'],
  '3-sun-trail': ['trail-warm-white-star', "The warm-white star's trail: the machine flies straight away from it, within its errors; confirmed.", 'Clicked the warm-white star instead and proposed it.'],
  '4-runback-meeting': ['trail-run-back', 'The run-back at the meeting: run back about 44,000 years, the machine (gold dot) is back at the warm-white star; the separation curve is at its lowest.', 'Opened the run-back, tried a time that was too short, then set the time where the machine meets the star.'],
  '5-ruler': ['trail-ruler', "The ruler from the alien's own star to the warm-white star, with the distance and its error.", 'Opened the ruler, measured to the wrong star first, cleared it, then measured from home to the warm-white star.'],
  '6-region': ['trail-region', "The region view: the map's origin region when the map was made, the stars near it then, and the warm-white star (gold ring) inside it, picked.", "Proposed the ruler's distance, opened the region view, tried another star inside the region (turned down), then picked the warm-white star."],
  '7-reframe-own': ['trail-reframe-own', "The reframe in the alien's own frame: the map's line ages scattered across tens of thousands of years.", 'Proposed the warm-white star as the place the map was drawn, then opened the reframe.'],
  'moment-map.region': ['moment-map-region', MOMENT_SHOWS['map.region'], "Slid the map's origin into the region and proposed it; it was confirmed."],
  'moment-spot.age': ['moment-spot-age', MOMENT_SHOWS['spot.age'], 'Proposed the age where the curve meets the measured ratio; it was confirmed.'],
  'moment-trail.origin': ['moment-trail-origin', MOMENT_SHOWS['trail.origin'], 'Proposed the warm-white star as the star the machine flies away from; it was confirmed.'],
  'moment-trail.neighbour': ['moment-trail-neighbour', MOMENT_SHOWS['trail.neighbour'], 'Measured from home to the warm-white star with the ruler and proposed the distance; it was confirmed.'],
  'moment-trail.when': ['moment-trail-when', MOMENT_SHOWS['trail.when'], "Proposed the map's age read in the warm-white star's frame; it was confirmed."],
  '8-reframe-sun': ['trail-reframe-star', "The reframe in the warm-white star's frame: the old lines' ages snap together; the band of the combined age and the mark on it.", "Proposed an age read from home (turned down), tried another star's frame, then picked the warm-white star's frame and set the mark on the ages."],
};

const cueLog = (page) => page.evaluate(async () => (await import('/src/audio/cues.ts')).cueLog().map((c) => ({ n: c.n, kind: c.kind, chapter: c.chapter, nodeId: c.nodeId ?? null, caption: c.caption })));

async function playGame(page, baseUrl, { assert, log }) {
  const review = reviewFolder(join(ROOT, 'review', 'inbox', `${stamp()}-m4`));
  const take = async (key, shows, did) => {
    const f = FRAMES[key];
    if (!f) return; // a chapter path's frame the critic does not need
    await page.waitForTimeout(250);
    await review.shot(page, f[0], f[1] ?? shows, f[2] ?? did);
  };
  const extra = (name, shows, did) => review.shot(page, name, shows, did);
  const t0 = Date.now();
  const lap = {};
  let tl = t0;
  const mark = (k) => {
    lap[k] = (Date.now() - tl) / 1000;
    tl = Date.now();
  };
  await freshStart(page, baseUrl);
  await page.evaluate(() => window.__finder.dispatch({ type: 'settings.set', name: 'soundCaptions', value: true }));

  const slice = await playSlice(page, { shot: (n, s, d) => take(n, s, d), assert });
  mark('slice');
  const after = await page.evaluate(() => window.__finder.state().game.chapterStatus);
  for (const c of ['map', 'spot', 'trail']) assert(after[c] === 'open', `${c} is open after the slice (${after[c]})`);
  log(`slice: ${slice.confirmed.length} confirmed (${Object.entries(slice.timing).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`).join(', ')})`);

  // The Pictures, complete (M5 step 3): the album and the teaching pictures, through the instrument's views.
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'pictures' }));
  await page.waitForSelector('.picinst[data-pictures-ready="true"]', { timeout: 90_000 });
  await playPicturesM5(page, { assert, log, shot: (n, s, d) => take(n, s, d) });
  mark('pictures');
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));

  // The Voices (M5 step 4): opens after the first sound; the four deductions through its instrument.
  await playVoices(page, { assert, log, label: 'game' });
  mark('voices');
  await page.evaluate(() => window.__finder.dispatch({ type: 'turntable.lift' }));
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));

  await playMap(page, { assert, log, label: 'game', shot: (n, s, d) => take(n, s, d), game: true });
  mark('map');
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));
  await playSpot(page, { assert, log, shot: (n, s, d) => take(n, s, d), label: 'game' });
  mark('spot');
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
  const tr = await playTrail(page, { log, assert, mapPlayable: 'played', shot: async (n, s) => { await settle(); await take(n, s); } });
  // Back to the ruler to read its verdict (the neighbour twist), as a player would.
  await page.locator('[data-tool-tab="ruler"]').click();
  await page.waitForSelector('[data-result="trail.neighbour"][data-ok="true"]');
  await page.locator('[data-result="trail.neighbour"]').scrollIntoViewIfNeeded();
  await settle();
  await extra('trail-neighbour-message', "The ruler's verdict, led by its headline: the distance from the alien's star to the warm-white star, large, with one sentence; the full working (nearest catalogued star, fifth-brightest in its sky) folded under 'show working'.", 'Proposed the age in the warm-white star\'s frame, then went back to the ruler to read what it said about that star.');
  mark('trail');

  // Portrait (M6): the plate read from every confirmed result; the four clocks' combined time dragged to and
  // proposed; the sky moment (captured), then the plate with its sky strip.
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));
  await playPortrait(page, { assert, log, shot: (n, s) => extra(`portrait-${n}`, s, 'Worked the clocks band.') });
  await skipMoments(page, { shot: async () => extra('portrait-moment', "The sky moment: the warm-white star ringed in gold and named in the Finder's script as the senders' star.", "Proposed the clocks' combined time."), settleMs: 3500 });
  await page.waitForSelector('[data-sky-strip="ready"]', { timeout: 30_000 });
  await extra('portrait-after', "The finished plate: the sky strip with the senders' star, the six panels and the clocks' combined band.", 'Returned from the moment.');
  mark('portrait');

  // Our Frame (M6): no deductions; a chapter done once entered. The quiet ending, the six sections with the keyboard,
  // the record playing under it and lifted on leaving (it ends back at the ring).
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));
  await playEpilogue(page, { assert, log });
  mark('epilogue');

  // ---- the codex near the end, then the finished ring ----
  await page.evaluate(() => window.__finder.dispatch({ type: 'codex.open', id: 'trail.when' }));
  await page.waitForTimeout(800);
  const entries = await page.locator('[data-entry]').count();
  await page.locator('[data-entry="trail.when"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await extra('codex-end', 'The codex near the end: every entry worked out over the whole game, scrolled to the last one (when the map was made, with its age and error).', 'Opened the codex and scrolled to its last entry.');
  await page.evaluate(() => window.__finder.dispatch({ type: 'codex.close' }));
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));
  await page.waitForSelector('[data-ring-finished="true"]', { timeout: 10_000 });
  await page.waitForTimeout(1200);
  await extra('ring-finished', 'The ring finished: every built chapter done, a slow glow running along the lit arcs.', 'Closed the codex and went back to the ring.');
  mark('end');

  // Every confirmed result has its headline (the Pictures' and the Player's included, which Node cannot confirm),
  // and each staged moment showed once and was skipped with its Continue button.
  const heads = await page.evaluate(async () => {
    const { HEADLINES } = await import('/src/chapters/headlines.ts');
    const { headlineOf } = await import('/src/ui/headline.ts');
    const nodes = window.__finder.state().game.nodes;
    return Object.entries(nodes).filter(([, n]) => n.confirmed).map(([id, n]) => [id, headlineOf(HEADLINES[id], [...n.attempts].reverse().find((a) => a.ok))]);
  });
  const moments = await page.evaluate(async () => (await import('/src/ui/momentState.ts')).momentLog().map((e) => ({ id: e.id, ended: e.ended })));
  const g = await page.evaluate(async () => {
    const { CHAPTERS } = await import('/src/game/graph.ts');
    return { ...window.__finder.state().game, built: CHAPTERS.filter((c) => c.built).map((c) => c.id) };
  });
  return { g, entries, cues: await cueLog(page), seconds: (Date.now() - t0) / 1000, lap, review, tr, heads, moments };
}

/** The M4 moments in the cue log: each once, each after the state change that makes it, in play order. */
function checkCues(cues, assert) {
  const one = (kind) => {
    const xs = cues.filter((c) => c.kind === kind);
    assert(xs.length === 1, `the cue log holds one ${kind} (${xs.length})`);
    return xs[0];
  };
  const warm = one('warm');
  const twist = one('twist');
  const snap = one('snap');
  assert(warm.nodeId === 'trail.origin' && warm.caption === 'a warm low tone, held', `the Sun found: ${JSON.stringify(warm)}`);
  assert(twist.nodeId === 'trail.neighbour' && /hush/.test(twist.caption), `the neighbour twist: ${JSON.stringify(twist)}`);
  assert(snap.nodeId === 'trail.when' && snap.caption === 'scattered tones settle into one chord', `the ages snap: ${JSON.stringify(snap)}`);
  // Order: the Sun found, then the twist, then the snap (the reframe), then trail.when's own pluck after it.
  const whenPluck = cues.find((c) => c.kind === 'pluck' && c.nodeId === 'trail.when');
  assert(warm.n < twist.n && twist.n < snap.n, `the moments in play order (${warm.n}, ${twist.n}, ${snap.n})`);
  assert(whenPluck && whenPluck.n > snap.n, 'the ages snap before the map\'s age is proposed and confirmed');
  for (const c of ['map', 'spot', 'trail']) assert(cues.some((x) => x.kind === 'chapter' && x.chapter === c), `the hum changes key for ${c}`);
  // Portrait (M6): its bed comes in with its own caption, and the clocks agreeing plays the resolving swell once.
  const agree = one('agree');
  assert(agree.nodeId === 'portrait.together' && agree.caption === 'the clocks agree', `the clocks agree: ${JSON.stringify(agree)}`);
  assert(cues.some((x) => x.kind === 'chapter' && x.chapter === 'portrait' && /chord/.test(x.caption ?? '')), "Portrait's bed comes in, captioned");
}

async function renderLevels(page) {
  return page.evaluate(async () => {
    const ui = await import('/src/audio/ui.ts');
    const amb = await import('/src/audio/ambience.ts');
    const synth = await import('/src/audio/synth.ts');
    const { createRng } = await import('/src/science/random.ts');
    const SR = 48000;
    const root = synth.voiceFor('trail').rootHz * 2;
    const scatter = [-0.8, 0.3, 1, -0.05, -0.47, 0.6, -0.2, 0.15, -1, 0.4, 0.7];
    const specs = [
      ['snap', 'snap', 8, (c, s) => ui.snap(c, c.destination, 0, root, scatter, createRng(s))],
      ['warm', 'warm', 8, (c, s) => ui.warm(c, c.destination, 0, root, createRng(s))],
      ['warm-twist', 'warm', 8, (c, s) => ui.warm(c, c.destination, 0, root, createRng(s), synth.TWIST_WARM_DB)],
      ...['map', 'spot', 'trail'].map((v) => [`bed-${v}`, 'bed', 12, (c, s) => amb.buildBed(c, v, 0, createRng(s)).out.connect(c.destination)]),
    ];
    const out = [];
    for (const [name, level, lenS, make] of specs) {
      const render = async (seed) => {
        const ctx = new OfflineAudioContext(1, lenS * SR, SR);
        make(ctx, seed);
        return (await ctx.startRendering()).getChannelData(0);
      };
      const a = await render('seed-A');
      const b = await render('seed-A');
      let peak = 0;
      let finite = true;
      let same = true;
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i])) finite = false;
        peak = Math.max(peak, Math.abs(a[i]));
        if (Math.abs(a[i] - b[i]) > 1e-6) same = false;
      }
      let tail = 0;
      for (let i = a.length - 2400; i < a.length; i++) tail = Math.max(tail, Math.abs(a[i]));
      const target = synth.LEVEL_DBFS[level] + (name === 'warm-twist' ? synth.TWIST_WARM_DB : 0);
      out.push({ name, target, peakDbfs: 20 * Math.log10(peak || 1e-12), finite, same, tailRel: tail / (peak || 1), bed: level === 'bed' });
    }
    return out;
  });
}

export default async function run({ page, baseUrl, record, assert, log }) {
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---------------- sound.m4.levels ----------------
  const lv = await renderLevels(page);
  for (const r of lv) {
    log(`${r.name}: peak ${r.peakDbfs.toFixed(2)} dBFS (target ${r.target})`);
    assert(r.finite && r.peakDbfs > -80 && r.same, `${r.name} is finite, not silent and the same for the same seed`);
    // The same window as sound.v1.levels: 0.5 dB above the target, 4 dB below (tests/browser/sound.browser.mjs).
    assert(r.peakDbfs - r.target <= 0.5 && r.peakDbfs - r.target >= -4, `${r.name} peaks at its level (${r.peakDbfs.toFixed(2)} vs ${r.target})`);
    if (!r.bed) assert(r.tailRel < 0.003, `${r.name} ends quietly (no cut-off click)`);
  }
  record({
    id: 'sound.m4.levels',
    claim: 'The M4 sounds (the ages snapping together, the warm tone for the Sun found and its softer return for the neighbour twist, and the beds of The Map, The Spot and The Trail) are finite, deterministic for a seed, and peak at their stated levels, far under the record',
    measured: lv.map((r) => `${r.name} ${r.peakDbfs.toFixed(2)} dBFS`).join(', '),
    expected: 'src/audio/synth.ts LEVEL_DBFS: snap -22, warm -26 (the twist 6 dB softer), beds -34',
    tolerance: '0.5 dB above, 4 dB below (as sound.v1.levels)',
    pass: true,
  });

  // ---------------- bot.game ----------------
  const res = await playGame(page, baseUrl, { assert, log });
  const missing = ALL_IDS.filter((id) => !res.g.confirmed.includes(id));
  assert(missing.length === 0, `all ${ALL_IDS.length} deductions confirmed (missing: ${missing.join(', ')})`);
  assert(res.g.confirmed.length === ALL_IDS.length, `exactly ${ALL_IDS.length} confirmed (${res.g.confirmed.length})`);
  assert(res.entries === ALL_IDS.length, `the codex holds ${ALL_IDS.length} entries (${res.entries})`);
  for (const c of res.g.built) assert(res.g.chapterStatus[c] === 'done', `${c} is done`);
  checkCues(res.cues, assert);
  const noHead = res.heads.filter(([, h]) => !h).map(([id]) => id);
  assert(res.heads.length === ALL_IDS.length && noHead.length === 0, `every confirmed result has a headline (${res.heads.length} confirmed; without: ${noHead.join(', ') || 'none'})`);
  for (const id of MOMENT_IDS) {
    const seen = res.moments.filter((m) => m.id === id);
    assert(seen.length === 1 && seen[0].ended === 'button', `the ${id} moment showed once and was skipped with its button (${JSON.stringify(seen)})`);
  }
  log(`headlines: ${res.heads.map(([id, h]) => `${id} ${h.label}`).join('; ')}`);
  log(`moments: ${res.moments.map((m) => `${m.id} (${m.ended})`).join(', ')}`);
  for (const c of res.cues.filter((x) => x.kind !== 'tick')) log(`cue ${c.n}: ${c.kind}, ${c.chapter}${c.nodeId ? `, ${c.nodeId}` : ''}${c.caption ? `, "${c.caption}"` : ''}`);
  log(`bot.game: ${res.g.confirmed.length} confirmed, codex ${res.entries}, ${res.seconds.toFixed(0)} s (${Object.entries(res.lap).map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(', ')}); ${res.review.shots.length} frames in ${res.review.dir}`);
  record({
    id: 'bot.game',
    claim: 'A bot plays the whole game built so far from a fresh save (no seeded save) through the command bus and the instruments: the slice, then The Map, The Spot and The Trail. Every deduction confirms, the codex holds every entry, the ring finishes, nothing errors, and the new sound moments play once each at their moments.',
    measured: `${res.g.confirmed.length} of ${ALL_IDS.length} confirmed, each result with its headline; the five staged moments once each, skipped with their button, game state unchanged by each; codex ${res.entries} entries; done: ${res.g.built.join(', ')}; cues warm, twist, snap once each in play order; ${res.seconds.toFixed(0)} s (${Object.entries(res.lap).map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(', ')}); ${res.review.shots.length} frames`,
    expected: '44 of 44 (src/game/graph.ts and nodesM5.ts, nodesM6.ts: every playable deduction, Portrait included, then Our Frame visited), 44 codex entries, every built chapter done, no console errors (PLAN.md How it\'s checked item 11)',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });

  // ---------------- bot.m4Wrong ----------------
  const w0 = Date.now();
  const wr = await m4WrongPass(page, { assert, log, freshStart, baseUrl });
  const wrongS = (Date.now() - w0) / 1000;
  const perNode = Object.fromEntries(M4_IDS.map((id) => [id, wr.played.filter((p) => p.id === id).length]));
  const without = M4_IDS.filter((id) => perNode[id] === 0);
  assert(without.length === 0, `every M4 deduction had a wrong answer played (none for: ${without.join(', ')})`);
  for (const id of M4_IDS) {
    const msgs = wr.played.filter((p) => p.id === id).map((p) => p.message);
    assert(new Set(msgs).size === msgs.length, `${id}: each wrong answer gives its own result`);
  }
  const missingW = M4_IDS.filter((id) => !wr.confirmed.includes(id));
  assert(missingW.length === 0, `after the wrong answers every M4 deduction confirms (missing: ${missingW.join(', ')})`);
  log(`bot.m4Wrong: ${wr.played.length} wrong answers, all rejected and shown; ${wrongS.toFixed(0)} s`);
  record({
    id: 'bot.m4Wrong',
    claim: 'From a fresh save, every meaningful wrong result the M4 checkers distinguish (as their Node tests list them) is played once through the command bus, rejected, and its computed result shown on the instrument and in the notebook; then the right answer confirms.',
    measured: `${wr.played.length} wrong answers over 13 deductions, each with its own result (${M4_IDS.map((id) => `${id} ${perNode[id]}`).join(', ')}); all 13 then confirmed; ${wrongS.toFixed(0)} s; not played: ${wr.skipped.join('; ') || 'none'}`,
    expected: 'each wrong answer rejected with its result on the instrument and in the notebook (map.test.ts, spot checkers.test.ts, trail.test.ts)',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });
}
