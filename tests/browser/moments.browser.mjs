// The five staged moments (M4 step 7e) in the real page, at 1440 x 900 and 1366 x 768. From a save with
// everything before them confirmed, each moment's deduction is confirmed through the command bus with the
// answer a player reaches (the seed check's answers), on its own chapter's bench: the moment shows once, is
// captured, and ends by a different control each time (a click, Escape, any key, the Continue button, its own
// time), and the game state is the same before and after it. The second size runs with reduced motion: the
// moment is a still (no timer, no animation). Captures go to harness/out/moment-captures/, or with
// MOMENTS_REVIEW=1 to review/inbox/<stamp>-moments/ with a manifest. Id: ui.moments.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { MOMENT_SHOWS } from './map.browser.mjs';

const SAVE_KEY = 'finder.save.v1';
const SEED = 'finder-1';
const BEFORE = [
  'arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths',
  'map.periods', 'map.old', 'map.identify', 'map.motion', 'spot.find',
];
/** How long each moment is given to land before its capture, ms (its camera ease or slide, moment.css). */
const SETTLE_MS = { 'map.region': 4200, 'spot.age': 2000, 'trail.origin': 3600, 'trail.neighbour': 1500, 'trail.when': 3600 };
const stampNow = () => new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, '');

async function answers(page) {
  return page.evaluate(async () => {
    const E = await import('/src/chapters/shared/epochModel.ts');
    const P = await import('/src/chapters/trail/physics.ts');
    const { spotModel } = await import('/src/chapters/spot/data.ts');
    const { ageFromU234 } = await import('/src/science/clocks.ts');
    const seed = window.__finder.state().game.seed;
    const m = await E.loadEpochModel(seed);
    await E.ensureParts(m, ['identification', 'region', 'trail']);
    const row = P.originRow(m);
    const c = m.region().centerPc;
    const day = 86_400;
    return {
      'map.region': { x: c[0], y: c[1] },
      'spot.age': { countingTimeS: day, ageYears: ageFromU234(spotModel(seed).session.countsAt(day)).ageYears },
      'trail.origin': { starId: row.star.id },
      'trail.neighbour': { distancePc: P.rulerReading(m, row.star).distPc },
      'trail.where': { starId: row.star.id },
      'trail.when': { yearsAgo: Math.round(m.ages('sun').combined.estimate), frame: row.star.id },
    };
  });
}

async function runSize(page, baseUrl, { w, h, calm, dir, shots, assert, log }) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.evaluate(
    ([key, ids, seed, calm]) => {
      const nodes = Object.fromEntries(ids.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));
      localStorage.setItem(key, JSON.stringify({ version: 1, nodes, chapter: 'hub', settings: { humanGloss: !calm, masterVolume: 0, reducedMotion: calm, soundCaptions: true }, seed }));
    },
    [SAVE_KEY, BEFORE, SEED, calm],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const a = await answers(page);
  const send = (cmd) => page.evaluate((c) => window.__finder.dispatch(c), cmd);
  const state = () => page.evaluate(() => JSON.stringify(window.__finder.state().game));
  // Each moment ends by a different control (the first size); the second ends each with its button.
  const ENDS = calm
    ? { 'map.region': 'button', 'spot.age': 'button', 'trail.origin': 'button', 'trail.neighbour': 'button', 'trail.when': 'button' }
    : { 'map.region': 'click', 'spot.age': 'key', 'trail.origin': 'key', 'trail.neighbour': 'button', 'trail.when': 'timeout' };
  const label = `${w}x${h}`;
  const plan = [
    ['map', 'map.region'], ['spot', 'spot.age'], ['trail', 'trail.origin'], ['trail', 'trail.neighbour'], ['trail', 'trail.where'], ['trail', 'trail.when'],
  ];
  const results = [];
  for (const [chapter, id] of plan) {
    if ((await page.evaluate(() => window.__finder.state().game.chapter)) !== chapter) {
      await send({ type: 'chapter.enter', chapter });
      await page.waitForTimeout(800);
    }
    await send({ type: 'deduction.propose', id, answer: a[id] });
    assert(await page.evaluate((i) => window.__finder.state().game.nodes[i].confirmed, id), `${label} ${id} confirmed`);
    if (!(id in SETTLE_MS)) continue;
    const el = await page.waitForSelector(`[data-moment="${id}"]`, { timeout: 5000 });
    const n = await el.getAttribute('data-moment-n');
    await page.waitForFunction(() => !document.querySelector('.moment-num .measuring'), null, { timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MS[id]);
    const look = await page.evaluate(() => ({
      still: document.querySelector('.moment')?.classList.contains('still') ?? false,
      timer: document.querySelector('.moment-timer') !== null,
      number: document.querySelector('[data-moment-number]')?.getAttribute('data-moment-number') ?? '',
      sentence: document.querySelector('.moment-sentence')?.textContent ?? '',
      caption: document.querySelector('.moment-caption')?.textContent ?? '',
      label: document.querySelector('.moment-label .gloss')?.textContent ?? '',
      si: document.querySelector('[data-moment-si]')?.textContent?.trim() ?? null,
      compare: document.querySelector('[data-moment-compare]')?.textContent?.trim() ?? null,
      bg: getComputedStyle(document.querySelector('.moment')).backgroundColor,
      backdropBottom: document.querySelector('.moment-backdrop').getBoundingClientRect().bottom,
      textTop: document.querySelector('.moment-text').getBoundingClientRect().top,
    }));
    assert(look.number.length > 0 && look.sentence.length > 10, `${label} ${id}: a number and a sentence (${look.number} / ${look.sentence})`);
    // M5 step 0c: an opaque screen, nothing of the visual under the text, the SI reading under the number with the
    // human gloss on, and with it off a comparison in the alien's units where the readings hold one.
    assert(/^rgb\((\d+, ){2}\d+\)$/.test(look.bg) || /, 1\)$/.test(look.bg), `${label} ${id}: the moment's screen is opaque (${look.bg})`);
    assert(look.backdropBottom <= look.textTop + 1, `${label} ${id}: the visual ends above the text strip (${look.backdropBottom} <= ${look.textTop})`);
    if (calm) {
      assert(look.si === null, `${label} ${id}: no SI reading with the human gloss off`);
      if (['map.region', 'trail.origin', 'trail.when'].includes(id)) assert(look.compare && look.compare.length > 10, `${label} ${id}: a comparison in the alien's units (${look.compare})`);
    } else {
      assert(look.si && /\d/.test(look.si), `${label} ${id}: the SI reading under the number with the human gloss on (${look.si})`);
      assert(look.compare === null, `${label} ${id}: no comparison with the human gloss on`);
    }
    if (id === 'trail.origin') assert(look.label === 'distance behind it', `${label} ${id}: the label reads as plain English (${look.label})`);
    assert(look.caption.startsWith('['), `${label} ${id}: the sound's caption line (${look.caption})`);
    assert(look.still === calm && look.timer === !calm, `${label} ${id}: reduced motion ${calm ? 'is a still' : 'off: animated, with its timer'}`);
    const file = `${label}_moment-${id.replace('.', '-')}.png`;
    await page.screenshot({ path: join(dir, file) });
    shots.push({ file, size: label, id, shows: MOMENT_SHOWS[id], number: look.number, si: look.si, compare: look.compare, sentence: look.sentence, caption: look.caption });
    const before = await state();
    const how = ENDS[id];
    if (how === 'click') await page.mouse.click(Math.round(w * 0.5), Math.round(h * 0.3));
    else if (how === 'key') await page.keyboard.press(id === 'spot.age' ? 'Escape' : 'a');
    else if (how === 'button') await page.click('[data-moment-skip]');
    // 'timeout': wait for the moment to return on its own (MOMENT_MS, src/ui/momentState.ts).
    await page.waitForFunction((k) => document.querySelector(`[data-moment-n="${k}"]`) === null, n, { timeout: 15_000 });
    assert((await state()) === before, `${label} ${id}: the game state is unchanged by the moment`);
    results.push(`${id} (${how})`);
  }
  const log2 = await page.evaluate(async () => (await import('/src/ui/momentState.ts')).momentLog().map((e) => ({ id: e.id, ended: e.ended })));
  for (const id of Object.keys(SETTLE_MS)) {
    const seen = log2.filter((e) => e.id === id);
    assert(seen.length === 1 && seen[0].ended === ENDS[id], `${label} ${id} showed once and ended by ${ENDS[id]} (${JSON.stringify(seen)})`);
  }
  // The codex did not open on Escape (the moment took the key), and no moment is left on screen.
  const g = JSON.parse(await state());
  assert(!g.codexOpen && (await page.locator('[data-moment]').count()) === 0, `${label}: no moment left and no drawer opened by its keys`);
  log(`${label}: ${results.join(', ')}`);
  return results;
}

export default async function run({ page, baseUrl, record, assert, log }) {
  const review = process.env.MOMENTS_REVIEW === '1';
  const dir = review ? join(ROOT, 'review', 'inbox', `${stampNow()}-moments`) : join(ROOT, 'harness', 'out', 'moment-captures');
  mkdirSync(dir, { recursive: true });
  const shots = [];
  const r1 = await runSize(page, baseUrl, { w: 1440, h: 900, calm: false, dir, shots, assert, log });
  const r2 = await runSize(page, baseUrl, { w: 1366, h: 768, calm: true, dir, shots, assert, log });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), note: 'The five staged moments (M4 step 7e), each just after its deduction was confirmed; 1440x900 with the human gloss on (the SI reading under the number); 1366x768 with reduced motion (a still) and the gloss off (a comparison in the alien\'s units).', shots }, null, 2));
  log(`captures: ${dir}`);
  record({
    id: 'ui.moments',
    claim: 'The five staged moments (where the map was drawn, the spot\'s age, the star it came from, the neighbour, when the map was made) each show once when their deduction is confirmed, with a number in the alien\'s units, one sentence and the sound\'s caption; each can be skipped by a click, Escape, any key or its button, or returns on its own; reduced motion makes it a still; the game state is unchanged by it',
    measured: `1440x900: ${r1.join(', ')}; 1366x768 (reduced motion, stills): ${r2.join(', ')}; each once, state unchanged, ${shots.length} captures`,
    expected: 'spec M4 step 7e section 2',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });
}
