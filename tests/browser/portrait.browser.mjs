// Portrait on /play/, through the real plate and the command bus. The save is built in the page from the chapters'
// own checkers on their right answers (the answers their own tests, the seed check and the bots propose), so every
// line of the plate reads a real confirmed result: Arrival, The Player's speed, The Spot's one-day count, The
// Trail on the epoch model (from the Worker), The Pictures' teaching checkers and the colour of the world's three
// frames decoded from the tape here, The Voices on their reference analysis. The decoder settings The Pictures
// confirmed (line time, sync, interlace, polarity, rows) are given as their accepted answers, which is all the
// plate reads of them (pictures/start.ts resumeSettings). Then, at 1440 x 900 and 1366 x 768:
//  1. the plate fits one screen (no page scroll), its six panels are filled, the decoded pictures arrive;
//  2. the marker is a keyboard slider (arrows step, Page keys step ten times);
//  3. a wrong time (the far end of the axis) is refused with its message, naming how many clocks' bars it misses;
//  4. the marker dragged to the clocks' combined time is confirmed; the sky moment shows the senders' star;
//  5. after the moment the plate keeps the sky strip and the combined band.
// Screenshots go to review/archive/<timestamp>-portrait/ (shots.txt lists them). Console errors fail the test (the
// harness). Ids: chapter.portrait. playPortrait(page) is exported for the whole-game bot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { skipMoments } from './moments.mjs';

const SAVE_KEY = 'finder.save.v1';
export const PORTRAIT_IDS = ['portrait.together'];
const SEED = 'finder-1';
const stamp = () => new Date().toISOString().slice(0, 19).replace(/:/g, '-');

/** The plate's state as the page shows it. */
const plate = (page) =>
  page.evaluate(() => {
    const panels = [...document.querySelectorAll('[data-portrait-panel]')].map((p) => ({
      id: p.getAttribute('data-portrait-panel'),
      lines: p.querySelectorAll('.pt-line').length,
      empty: p.querySelectorAll('.pt-empty').length,
      text: p.textContent.replace(/\s+/g, ' ').trim(),
      links: p.querySelectorAll('a[data-checked-link]').length,
    }));
    return {
      panels,
      waiting: document.querySelectorAll('[data-pic-wait]').length,
      pictures: document.querySelectorAll('[data-portrait-panel] canvas').length,
      pageScroll: document.scrollingElement.scrollHeight - window.innerHeight,
      plateBottom: document.querySelector('.pt-plate')?.getBoundingClientRect().bottom ?? null,
      viewport: [window.innerWidth, window.innerHeight],
      rawTokens: /\{\{q\|/.test(document.body.textContent),
    };
  });


/** The clocks band's result box and the sky strip, measured: nothing clipped, "show working" inside the box, the strip's stars whole. */
const bandFit = (page) =>
  page.evaluate(() => {
    const ask = document.querySelector('.pt-ask');
    const band = document.querySelector('.pt-band');
    const strip = document.querySelector('.pt-strip');
    const a = ask.getBoundingClientRect();
    const b = band.getBoundingClientRect();
    const sum = ask.querySelector('summary')?.getBoundingClientRect() ?? null;
    const kr = ask.querySelector('.kresult')?.getBoundingClientRect() ?? null;
    const label = document.querySelector('.pt-combined text')?.getBoundingClientRect() ?? null;
    const bars = [...document.querySelectorAll('.pt-clock .pt-bar')].map((e) => e.getBoundingClientRect());
    const sr = strip?.getBoundingClientRect() ?? null;
    const cut = strip ? [...strip.querySelectorAll('.pt-skystar')].filter((c) => { const r = c.getBoundingClientRect(); return r.top < sr.top - 0.5 || r.bottom > sr.bottom + 0.5; }).length : 0;
    return {
      overflow: ask.scrollHeight - ask.clientHeight,
      hasSummary: Boolean(sum),
      summaryInside: Boolean(sum) && sum.top >= a.top - 1 && sum.bottom <= a.bottom + 1,
      resultInside: Boolean(kr) && kr.bottom <= a.bottom + 1 && kr.bottom <= b.bottom + 1,
      labelOverBars: label ? bars.filter((r) => label.bottom > r.top - 2 && label.top < r.bottom + 2 && label.right > r.left && label.left < r.right).length : 0,
      starsCut: cut,
      panelsClipped: [...document.querySelectorAll('[data-portrait-panel] .pt-body, [data-portrait-panel] .pt-lines')].filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => `${e.closest('[data-portrait-panel]').getAttribute('data-portrait-panel')}+${e.scrollHeight - e.clientHeight}`),
    };
  });

const last = (page, id) => page.evaluate((id) => window.__finder.state().game.nodes[id]?.attempts.at(-1) ?? null, id);

/** Drag the marker's knob to a time, years before now, at the chart's own x mapping (data-axis, data-x-range). */
async function dragMarkerTo(page, years) {
  const at = await page.evaluate((years) => {
    const svg = document.querySelector('svg[data-clocks-chart]');
    const [lo, hi] = svg.getAttribute('data-axis').split(',').map(Number);
    const [x0, x1] = svg.getAttribute('data-x-range').split(',').map(Number);
    const b = svg.getBoundingClientRect();
    const knob = document.querySelector('[data-portrait-marker]').getBoundingClientRect();
    return { from: [knob.left + knob.width / 2, knob.top + knob.height / 2], to: [b.left + x0 + ((years - lo) / (hi - lo)) * (x1 - x0), knob.top + knob.height / 2] };
  }, years);
  await page.mouse.move(at.from[0], at.from[1]);
  await page.mouse.down();
  await page.mouse.move((at.from[0] + at.to[0]) / 2, at.to[1], { steps: 6 });
  await page.mouse.move(at.to[0], at.to[1], { steps: 6 });
  await page.mouse.up();
}

/**
 * Plays Portrait from the hub: the marker moved to the clocks' combined time by dragging, and proposed. Returns
 * the confirmed attempt. opts: { assert, log, shot(name, shows), wrong } (wrong: a refused proposal first).
 */
export async function playPortrait(page, { assert, log, shot = async () => undefined, wrong = false }) {
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'portrait' }));
  await page.waitForSelector('[data-instrument="portrait"] [data-portrait-marker]', { timeout: 60_000 });
  const mean = await page.evaluate(async () => (await import('/src/chapters/portrait/state.ts')).portraitHandle().combined().mean);
  if (wrong) {
    await page.focus('[data-portrait-marker]');
    await page.keyboard.press('End');
    await page.locator('[data-portrait-propose]').click();
    await page.waitForFunction(() => (window.__finder.state().game.nodes['portrait.together']?.attempts.length ?? 0) > 0);
    const a = await last(page, 'portrait.together');
    assert(a && a.ok === false, 'the far end of the axis is refused');
    assert(/outside \d of the four clocks' own 95% bars/.test(a.message), `the refusal names how many clocks' bars it misses (${a.message.slice(0, 120)})`);
    const shown = await page.locator('[data-panel="portrait.together"] .kresult').innerText();
    assert(!/\{\{q\|/.test(shown), 'the refusal renders its quantities in the Finder\'s units');
    await shot('refused', 'A time at the far end of the axis, refused: it lies outside the clocks\' bars.');
    log(`refused: ${a.message.slice(0, 160)}`);
  }
  await dragMarkerTo(page, mean);
  const at = await page.evaluate(() => Number(document.querySelector('[data-portrait-marker]').getAttribute('aria-valuenow')));
  log(`marker dragged to ${at} years (combined ${mean.toFixed(1)})`);
  const before = (await page.evaluate(() => window.__finder.state().game.nodes['portrait.together']?.attempts.length ?? 0));
  await page.locator('[data-portrait-propose]').click();
  await page.waitForFunction((n) => (window.__finder.state().game.nodes['portrait.together']?.attempts.length ?? 0) > n, before);
  const ok = await last(page, 'portrait.together');
  assert(ok && ok.ok === true, `the clocks' combined time is confirmed (${ok?.message.slice(0, 160)})`);
  return ok;
}

export default async function run({ page, baseUrl, record, assert, log }) {
  const dir = join(ROOT, 'review', 'archive', `${stamp()}-portrait`);
  mkdirSync(dir, { recursive: true });
  const shots = [];
  const shoot = async (name, shows) => {
    const vp = page.viewportSize();
    const file = `${String(shots.length + 1).padStart(2, '0')}_${name}_${vp.width}x${vp.height}.png`;
    await page.screenshot({ path: join(dir, file) });
    shots.push(`${file}: ${shows}`);
    writeFileSync(join(dir, 'shots.txt'), `${shots.join('\n')}\n`);
  };

  // PORTRAIT_TOUR=1 runs everything below with the guided tour's guide column open beside the plate.
  const q = process.env.PORTRAIT_TOUR === '1' ? '?tour=1' : '';
  // ---- the save, built from the real checkers in the page ----
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const save = await page.evaluate(async (seed) => {
    const ok = (r) => ({ answer: null, ok: r.ok, result: r.result, message: r.message, at: 1 });
    const node = (r, answer) => ({ confirmed: r.ok, attempts: [{ ...ok(r), answer }], hints: 0 });
    const given = (answer) => ({ confirmed: true, attempts: [{ answer, ok: true, result: [], message: '', at: 1 }], hints: 0 });
    const A = await import('/src/chapters/arrival/checkers.ts');
    const AD = await import('/src/chapters/arrival/data.ts');
    const P = await import('/src/chapters/player/checkers.ts');
    const PP = await import('/src/chapters/player/physics.ts');
    const S = await import('/src/chapters/spot/checkers.ts');
    const SD = await import('/src/chapters/spot/data.ts');
    const C = await import('/src/science/clocks.ts');
    const E = await import('/src/chapters/shared/epochModel.ts');
    const T = await import('/src/chapters/trail/checkers.ts');
    const TP = await import('/src/chapters/trail/physics.ts');
    const M5 = await import('/src/chapters/pictures/checkersM5.ts');
    const U = await import('/src/ui/units.ts');
    const VC = await import('/src/chapters/voices/checkers.ts');
    const VD = await import('/src/chapters/voices/data.ts');
    const AL = await import('/src/chapters/pictures/album.ts');
    const MOD = await import('/src/game/model.ts');
    const BUS = await import('/src/game/bus.ts');
    const nodes = {};
    const a = AD.arrivalModel(seed);
    nodes['arrival.purpose'] = node(A.checkPurpose('radio', a), 'radio');
    nodes['arrival.fuelAge'] = node(A.checkFuelAge('pu238', a), 'pu238');
    nodes['player.speed'] = node(P.checkSpeed({ secondsPerTurn: PP.TRUE_PERIOD_S }), { secondsPerTurn: PP.TRUE_PERIOD_S });
    const s = SD.spotModel(seed);
    const spotAnswer = { countingTimeS: 86400, ageYears: C.ageFromU234(s.session.countsAt(86400)).ageYears };
    nodes['spot.age'] = node(S.checkAge(spotAnswer, s), spotAnswer);
    const m = await E.loadEpochModel(seed);
    await E.ensureParts(m, ['trail']);
    const row = TP.originRow(m);
    nodes['trail.origin'] = node(T.checkOrigin(m, { starId: 0 }), { starId: 0 });
    nodes['trail.age'] = node(T.checkAge(m, { years: Math.round(TP.meeting(m, row.star).yearsAgo) }), null);
    nodes['trail.neighbour'] = node(T.checkNeighbour(m, { distancePc: TP.rulerReading(m, row.star).distPc }), null);
    nodes['trail.when'] = node(T.checkWhen(m, { yearsAgo: Math.round(m.ages('sun').combined.estimate), frame: row.star.id }), null);
    const digits = Object.fromEntries(M5.TEACHING.L002.digits.map((d) => [String(d.glyph), d.value]));
    nodes['pictures.numerals'] = node(M5.checkNumerals({ table: digits }), { table: digits });
    nodes['pictures.units'] = node(M5.checkUnits({ secondInBeats: M5.SECOND_BEATS }), { secondInBeats: M5.SECOND_BEATS });
    nodes['pictures.home'] = node(M5.checkHome({ column: M5.HOME }), { column: M5.HOME });
    const reaches = M5.HEIGHTS.map((h) => h.metres / U.REACH_M);
    nodes['pictures.height'] = node(M5.checkHeight({ reaches }), { reaches });
    nodes['voices.many'] = node(VC.checkMany({ threshold: -30, gap: 0.25, groups: 3 }), null);
    const r = 2 ** (VD.V.music.violin.octaveCents / 1200);
    nodes['voices.octave'] = node(VC.checkOctave({ ratio: r, step: r ** (1 / 12) }), null);
    nodes['voices.others'] = node(VC.checkOthers({ track: 'ozma-03', start: 200, end: 220 }), null);
    // The world's colour: its three frames decoded from the tape at the reference settings, then the real checker.
    const ref = MOD.referenceBench();
    await BUS.dispatch({ type: 'decoder.reset' });
    const frames = ['L013', 'L014', 'L015'];
    // the checker also measures the frame before and after the three (they must not be the same scene)
    for (const f of ['L012', ...frames, 'L016']) await AL.developOne(f);
    nodes['pictures.colour'] = node(M5.checkColour((f) => AL.albumPicture(f), { frames }), { frames });
    // The decoder settings The Pictures confirmed: their accepted answers (what resumeSettings reads).
    nodes['pictures.lineTime'] = given({ lineTimeMs: ref.lineTimeMs });
    nodes['pictures.sync'] = given({ syncLock: true });
    nodes['pictures.interlace'] = given({ interlace: true });
    nodes['pictures.polarity'] = given({ polarity: 'negative' });
    nodes['pictures.aspect'] = given({ rows: ref.rows });
    const bad = Object.entries(nodes).filter(([, v]) => !v.confirmed).map(([k, v]) => `${k}: ${v.attempts[0].message.slice(0, 100)}`);
    return { nodes, bad };
  }, SEED);
  assert(save.bad.length === 0, `every prerequisite confirms on its right answer (${save.bad.join('; ')})`);
  await page.addInitScript(
    ([key, nodes, seed]) => {
      if (sessionStorage.getItem('portrait-test-seeded')) return;
      sessionStorage.setItem('portrait-test-seeded', '1');
      localStorage.setItem(key, JSON.stringify({ version: 1, nodes, chapter: 'hub', settings: { humanGloss: true, masterVolume: 0, reducedMotion: false, soundCaptions: true, showWorking: false }, seed }));
    },
    [SAVE_KEY, save.nodes, SEED],
  );
  await page.goto(`${baseUrl}/play/${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const status = await page.evaluate(async () => {
    const D = await import('/src/game/deductions.ts');
    const { confirmedSet } = await import('/src/game/state.ts');
    return { chapter: D.chapterStatus('portrait', confirmedSet.value), node: D.nodeStatus('portrait.together', confirmedSet.value) };
  });
  assert(status.chapter === 'open' && status.node === 'open', `Portrait is open with its deduction open (${JSON.stringify(status)})`);

  // ---- the plate before confirming, at both sizes ----
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'portrait' }));
  await page.waitForSelector('[data-instrument="portrait"] [data-portrait-marker]', { timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-pic-wait]').length === 0, null, { timeout: 120_000 });
  const fits = [];
  for (const [w, h] of [[1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const p = await plate(page);
    fits.push(p);
    assert(p.pageScroll <= 1, `${w}x${h}: the page does not scroll (${p.pageScroll}px over)`);
    assert(p.plateBottom !== null && p.plateBottom <= h + 1, `${w}x${h}: the plate ends on screen (${p.plateBottom})`);
    assert(p.panels.length === 6, `${w}x${h}: six panels (${p.panels.map((x) => x.id).join(', ')})`);
    for (const x of p.panels) assert(x.lines > 0 && x.empty === 0 && x.links >= x.lines, `${w}x${h}: panel ${x.id} filled, every line linked to How it's checked (${x.lines} lines, ${x.empty} empty, ${x.links} links)`);
    assert(p.pictures >= 2, `${w}x${h}: the figures and the world are decoded pictures (${p.pictures} canvases)`);
    assert(!p.rawTokens, `${w}x${h}: no raw quantity tokens on screen`);
    await shoot('plate-before', 'The plate before the clocks are proposed: six panels from the confirmed results, the four clocks\' bars in the band.');
  }
  log(`panels: ${fits[0].panels.map((x) => `${x.id} [${x.text.slice(0, 90)}]`).join(' | ')}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);

  // ---- the keyboard: the marker is a slider ----
  await page.focus('[data-portrait-marker]');
  const v0 = Number(await page.getAttribute('[data-portrait-marker]', 'aria-valuenow'));
  // the first step lands on the marker's grid; the next is one whole step, and a Page key ten
  await page.keyboard.press('ArrowRight');
  const v1 = Number(await page.getAttribute('[data-portrait-marker]', 'aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  const v2 = Number(await page.getAttribute('[data-portrait-marker]', 'aria-valuenow'));
  await page.keyboard.press('PageUp');
  const v3 = Number(await page.getAttribute('[data-portrait-marker]', 'aria-valuenow'));
  await page.keyboard.press('ArrowLeft');
  const v4 = Number(await page.getAttribute('[data-portrait-marker]', 'aria-valuenow'));
  const role = await page.getAttribute('[data-portrait-marker]', 'role');
  assert(role === 'slider' && v1 > v0 && v2 > v1 && Math.abs(v3 - v2 - 10 * (v2 - v1)) <= 1 && Math.abs(v3 - v4 - (v2 - v1)) <= 1, `the marker is a keyboard slider (${v0} -> ${v1} -> ${v2} -> ${v3} -> ${v4})`);

  // ---- wrong, then right ----
  const okAttempt = await playPortrait(page, { assert, log, wrong: true, shot: async (n, s) => shoot(n, s) });
  const when = okAttempt.result.find((r) => r.key === 'when it left');
  assert(when && when.dim === 'time', 'the confirmed result reads "when it left"');
  const momentShots = [];
  // The moment holds about 7 s (src/ui/momentState.ts MOMENT_MS): read it at once, shoot it once its ring has closed
  // (about 4 s of animation) at 1440 x 900, then at 1366 x 768 while it still shows.
  await page.waitForSelector('[data-moment="portrait.together"] [data-senders-star]', { timeout: 5000 });
  const momentText = await page.locator('[data-moment="portrait.together"] .moment-sentence').innerText({ timeout: 3000 });
  assert(/They live there/.test(momentText), `the moment's sentence (${momentText})`);
  await page.waitForTimeout(3600);
  for (const [w, h] of [[1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    if (!(await page.$('[data-moment="portrait.together"]'))) break;
    await shoot('moment', "The sky moment: the Finder's sky, the warm-white star ringed in gold, named in the Finder's script as the senders' star; the combined age as the number.");
    momentShots.push(w);
  }
  assert(momentShots.length >= 1, 'the moment was captured');
  await skipMoments(page, { waitMs: 2000 });
  await page.waitForSelector('[data-sky-strip="ready"]', { timeout: 30_000 });
  for (const [w, h] of [[1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const p = await plate(page);
    assert(p.pageScroll <= 1 && p.plateBottom <= h + 1, `${w}x${h}: after confirming, the plate still fits (${p.pageScroll}px, bottom ${p.plateBottom})`);
    const f = await bandFit(page);
    assert(f.hasSummary && f.overflow <= 1 && f.summaryInside && f.resultInside, `${w}x${h}: the result box is not clipped and "show working" is reachable (${JSON.stringify(f)})`);
    assert(f.labelOverBars === 0, `${w}x${h}: the combined band's label sits clear of the clocks' bars (${f.labelOverBars} overlaps)`);
    assert(f.starsCut === 0, `${w}x${h}: no star of the sky strip is cut off (${f.starsCut})`);
    assert(f.panelsClipped.length === 0, `${w}x${h}: no panel's text is cut off (${f.panelsClipped.join(', ')})`);
    await shoot('plate-after', 'The plate after: the sky strip with the senders\' star ringed, the clocks\' combined 95% band in gold, the result.');
  }
  const band = await page.getAttribute('[data-combined]', 'data-combined');
  assert(Boolean(band), `the combined band is drawn (${band})`);

  record({
    id: 'chapter.portrait',
    claim: 'Portrait plays on its plate: six panels read from the player\'s confirmed results (each line linked to How it\'s checked), the decoded pictures arrive, the marker is a keyboard slider, a wrong time is refused with its message, the clocks\' combined time is confirmed, the sky moment shows the senders\' star, and the plate fits one screen at 1440 x 900 and 1366 x 768.',
    measured: `panels ${fits[0].panels.map((x) => `${x.id} ${x.lines} lines`).join(', ')}; decoded pictures ${fits[0].pictures}; slider ${v0} -> ${v1} -> ${v2} -> ${v3} -> ${v4}; confirmed at ${okAttempt.answer?.yearsAgo?.toFixed?.(1)} years, combined band ${band}; moment shown at ${momentShots.join(' and ')} px wide; page scroll ${fits.map((f) => f.pageScroll).join(', ')} px; shots in review/archive/${dir.split(/[\\/]/).pop()}/`,
    expected: 'every panel filled, no page scroll at either size, the refusal naming the clocks it misses, the confirmation, the moment, no console errors',
    tolerance: 'exact (states)',
    pass: true,
  });
  log(`shots: ${dir}`);
}
