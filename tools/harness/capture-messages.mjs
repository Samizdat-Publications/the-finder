// M4 step 7c captures: one checker result per chapter with the human gloss off and on, and the two "your last
// proposal" cases (The Spot's counter counted on after a refusal; The Trail's ruler moved after a refusal), at
// 1440x900 into review/inbox/<timestamp>-messages/ with manifest.json and shots.txt. Each chapter starts from a
// seeded save (its prerequisites confirmed) and proposes through the command bus, as a player's button does.
// Usage: node tools/harness/capture-messages.mjs
import { join } from 'node:path';
import { reviewFolder, stamp } from '../../tests/browser/slice.browser.mjs';
import { playTrail } from '../../tests/browser/trail.browser.mjs';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT, startDevServer } from './serve.mjs';

const SAVE_KEY = 'finder.save.v1';
const KEY_DONE = ['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths'];
const MAP_DONE = ['map.periods', 'map.old', 'map.identify', 'map.motion', 'map.region'];

/** One result per chapter: the save's confirmed nodes, the chapter, a proposal (answer or an in-page function), and the tool tab to show. */
const CASES = [
  { chapter: 'arrival', done: ['arrival.purpose'], id: 'arrival.heat', answer: 'leftover', what: 'Arrival: heat left over from the making, refused with the cooling it computes' },
  { chapter: 'key', done: ['arrival.purpose', 'key.binary', 'key.unit'], id: 'key.timesNotLengths', answer: 'lengths', what: 'The Key: the cover numbers read as lengths, refused with the sizes they would give' },
  { chapter: 'player', done: KEY_DONE, id: 'player.speed', answer: { secondsPerTurn: 1.8 }, what: 'The Player: the platter at twice the speed; the right speed' },
  { chapter: 'pictures', done: [...KEY_DONE, 'player.speed'], id: 'pictures.lineTime', answer: { lineTimeMs: 8.0 }, what: 'The Pictures: a line time too short, refused with the slant it decodes (the tape\'s sample rate is a quantity)' },
  { chapter: 'map', done: [...KEY_DONE, 'map.periods'], id: 'map.old', answer: { yearsAgo: 150_000 }, what: 'The Map: a time far in the past, refused with the nearest line\'s interval' },
  { chapter: 'spot', done: [...KEY_DONE, 'spot.find'], id: 'spot.age', answer: { countingTimeS: 86_400, ageYears: 150_000 }, what: 'The Spot: an age outside a day\'s count, refused with the interval' },
  { chapter: 'trail', done: [...KEY_DONE, 'trail.origin'], id: 'trail.age', answer: { years: 30_000 }, tab: 'runback', what: 'The Trail: a run-back time too short, refused with the measured interval' },
];

function saveJson(done, gloss) {
  const nodes = Object.fromEntries(done.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));
  return JSON.stringify({ version: 1, nodes, chapter: 'hub', settings: { humanGloss: gloss, masterVolume: 0, reducedMotion: true, soundCaptions: false }, seed: 'finder-1' });
}

async function seeded(page, baseUrl, done) {
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [SAVE_KEY, saveJson(done, false)]);
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
}

/** Propose through the bus, retrying while the chapter's data is still loading (the bus refuses until then). */
async function propose(page, id, answer) {
  for (let i = 0; i < 120; i++) {
    const r = await page.evaluate(async ([id, answer]) => {
      try {
        await window.__finder.dispatch({ type: 'deduction.propose', id, answer });
        return 'ok';
      } catch (e) {
        return String(e instanceof Error ? e.message : e);
      }
    }, [id, answer]);
    if (r === 'ok') return;
    await page.waitForTimeout(500);
  }
  throw new Error(`${id}: the bus kept refusing`);
}

const gloss = (page, on) => page.evaluate((v) => window.__finder.dispatch({ type: 'settings.set', name: 'humanGloss', value: v }), on);

const server = await startDevServer();
const browser = await launchChrome();
const review = reviewFolder(join(ROOT, 'review', 'inbox', `${stamp()}-messages`));
try {
  const { page, context } = await openPage(browser, `${server.url}/`, { width: 1440, height: 900 });
  page.setDefaultTimeout(120_000);
  for (const c of CASES) {
    await seeded(page, server.url, c.done);
    await page.evaluate((ch) => window.__finder.dispatch({ type: 'chapter.enter', chapter: ch }), c.chapter);
    await page.waitForTimeout(1500);
    await propose(page, c.id, c.answer);
    if (c.tab) await page.locator(`[data-tool-tab="${c.tab}"]`).click();
    const res = page.locator(`[data-result="${c.id}"]`).first();
    await res.waitFor({ state: 'visible', timeout: 30_000 });
    for (const on of [false, true]) {
      await gloss(page, on);
      await page.waitForTimeout(400);
      await res.scrollIntoViewIfNeeded();
      const text = (await res.innerText()).replace(/\s+/g, ' ');
      await review.shot(page, `${c.chapter}-gloss-${on ? 'on' : 'off'}`, `${c.what}; human gloss ${on ? 'on: each quantity in the alien\'s units with the human reading in parentheses' : 'off: the alien\'s units only'}. The result reads: ${text.slice(0, 400)}`, `Proposed ${JSON.stringify(c.answer)} for ${c.id}, then turned the human gloss ${on ? 'on' : 'off'}.`);
    }
  }

  // ---- The Spot's counter: a short count refused, then counted on: the refusal is the last proposal ----
  await seeded(page, server.url, [...KEY_DONE, 'spot.find']);
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'spot' }));
  await page.waitForSelector('[data-count-beats="100"]');
  const countFor = async (beats) => {
    const before = Number((await page.locator('[data-counted-s]').getAttribute('data-counted-s')) || 0);
    await page.locator(`[data-count-beats="${beats}"]`).click();
    await page.waitForFunction((b) => Number(document.querySelector('[data-counted-s]')?.getAttribute('data-counted-s') || 0) > b, before, { timeout: 60_000 });
  };
  await countFor(100);
  await page.evaluate(() => {
    const el = document.querySelector('[data-age-input]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '150000');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-propose="spot.age"]').click();
  await page.waitForSelector('[data-result="spot.age"][data-ok="0"][data-past="0"]');
  await page.locator('[data-result="spot.age"]').scrollIntoViewIfNeeded();
  await review.shot(page, 'spot-refused-now', 'The Spot\'s counter right after a refused age on a short count: the refusal is the verdict on what the counter shows.', 'Counted 100 beats, set the age marker far out and proposed it.');
  await countFor(100_000);
  await page.waitForSelector('[data-result="spot.age"][data-past="1"] [data-past-label]');
  await page.locator('[data-result="spot.age"]').scrollIntoViewIfNeeded();
  await review.shot(page, 'spot-last-proposal', 'The Spot\'s counter after counting on: the refusal is dimmed and labelled "your last proposal"; it judged the short count, not the day-long count now shown.', 'Counted 10^5 more beats after the refusal.');

  // ---- The Trail's ruler: a wrong star refused, the ruler moved to the right star: the last proposal ----
  await context.close();
  const t = await openPage(browser, `${server.url}/`, { width: 1440, height: 900 });
  t.page.setDefaultTimeout(120_000);
  await t.page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [SAVE_KEY, saveJson([...KEY_DONE, ...MAP_DONE], false)]);
  await t.page.goto(`${server.url}/play/`, { waitUntil: 'load' });
  await t.page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
  const assert = (ok, m) => { if (!ok) throw new Error(m); };
  await playTrail(t.page, {
    log: () => undefined,
    assert,
    mapPlayable: 'seeded',
    shot: async (name) => {
      if (name !== '5b-ruler-past') return;
      await t.page.locator('[data-result="trail.neighbour"]').scrollIntoViewIfNeeded();
      await review.shot(t.page, 'trail-ruler-last-proposal', 'The Trail\'s ruler re-measured from home to the warm-white star after a wrong star was refused: the refusal is dimmed and labelled "your last proposal"; the ruler now shows the new distance.', 'Measured to a wrong star and proposed it (refused), cleared the ruler, measured to the warm-white star.');
    },
  });
  await t.context.close();
  console.log(`[capture-messages] ${review.shots.length} frames in ${review.dir}`);
} finally {
  await browser.close();
  await server.close();
}
