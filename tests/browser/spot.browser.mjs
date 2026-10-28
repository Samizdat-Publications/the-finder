// The Spot on /play/, through the real instrument: the save starts with The Key done (a returning player; The
// Spot opens after key.timesNotLengths). The test sweeps the probe across the plate with the mouse (away from
// the spot, then over it), marks a wrong point and then the right one, counts a little and proposes a wrong
// age, counts about a day and proposes the age its own ratio gives, then dials natural uranium (rejected) and
// a pure start (confirmed). Every proposal goes through the instrument's buttons (the command bus). Console
// errors fail the test (the harness). Played at 1440 x 900 and 1366 x 768; captures go to
// harness/out/spot-captures/, or to review/inbox/<timestamp>-spot/ with a manifest when SPOT_REVIEW=1.
// Id: chapter.spot.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { MOMENT_SHOWS } from './map.browser.mjs';
import { skipMoments } from './moments.mjs';

const SAVE_KEY = 'finder.save.v1';
const SPOT = JSON.parse(readFileSync(join(ROOT, 'data', 'spot.json'), 'utf8'));
// The test's own statement of the physics: LNHB half-lives (docs/research/clocks.md 4a), years, and the
// two-member ingrowth inverted in closed form: t = -ln(1 - R (l234 - l238) / l234) / (l234 - l238).
const L238 = Math.LN2 / 4.468e9;
const L234 = Math.LN2 / 2.455e5;
const ageFromRatio = (R) => -Math.log(1 - (R * (L234 - L238)) / L234) / (L234 - L238);
const stamp = () => new Date().toISOString().slice(0, 19).replace(/:/g, '-');

function saveJson(seed) {
  const done = { confirmed: true, attempts: [], hints: 0 };
  return JSON.stringify({
    version: 1,
    nodes: { 'arrival.purpose': done, 'key.binary': done, 'key.unit': done, 'key.timesNotLengths': done },
    chapter: 'hub',
    settings: { humanGloss: false, masterVolume: 0.8, reducedMotion: true, soundCaptions: false },
    seed,
  });
}

/** Cover millimetres to page pixels, through the stroke layer's screen transform. */
async function mmToPage(page, x, y) {
  return page.evaluate(([x, y]) => {
    const svg = document.querySelector('.spotinst .coverviewer svg.strokes');
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, [x, y]);
}

async function setRange(page, sel, value) {
  await page.evaluate(([sel, value]) => {
    const el = document.querySelector(sel);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, value]);
}

async function play(page, baseUrl, size, { assert, log, shot }) {
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [SAVE_KEY, saveJson('finder-1')]);
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
  return playSpot(page, { assert, log, shot, label: `${size.w}x${size.h}` });
}

/**
 * The Spot played through its instrument from the ring (The Key done): exported for the whole-game bot
 * (tests/browser/game.browser.mjs). shot(name, shows, did) takes each capture.
 */
export async function playSpot(page, { assert, log, shot, label = '' }) {
  const game = () => page.evaluate(() => window.__finder.state().game);
  assert((await game()).chapterStatus.spot === 'open', 'The Spot is open once The Key is done');
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'spot' }));
  await page.waitForSelector('[data-instrument="spot"] .coverviewer svg.strokes');
  await page.waitForTimeout(500);
  const last = async (id) => (await game()).nodes[id].attempts.at(-1);
  const rate = async () => Number((await page.locator('[data-rate]').getAttribute('data-rate')) || 'NaN');
  const [cx, cy] = SPOT.centreMm;

  // ---- sweep: far from the spot, then over it ----
  const far = await mmToPage(page, 150, 250);
  await page.mouse.move(far.x, far.y, { steps: 4 });
  await page.waitForTimeout(3400);
  const rateFar = await rate();
  await shot('sweep-away', 'The detector probe over the lower plate, far from anything: the count rate at its background and the strip chart nearly empty.', 'Moved the probe to the lower middle of the plate.');
  // Sweep up toward the spot in steps, as a player would.
  for (const y of [200, 140, 90, 60]) {
    const p = await mmToPage(page, 150, y);
    await page.mouse.move(p.x, p.y, { steps: 6 });
    await page.waitForTimeout(400);
  }
  const over = await mmToPage(page, cx, cy);
  await page.mouse.move(over.x, over.y, { steps: 6 });
  await page.waitForTimeout(3400);
  const rateOver = await rate();
  assert(rateOver > 50 * Math.max(rateFar, 1e-3), `the rate over the spot (${rateOver} /s) is far above the rate away from it (${rateFar} /s)`);
  await shot('sweep-over', 'The probe over the hidden spot at the top of the plate: the count rate high, the strip chart full of counts.', 'Swept the probe up the plate to where the counts rise.');

  // ---- spot.find: a wrong mark (near, outside the spot), then the right one ----
  const near = await mmToPage(page, cx + 25, cy + 10);
  await page.mouse.click(near.x, near.y);
  await page.locator('[data-propose="spot.find"]').click();
  await page.waitForSelector('[data-result="spot.find"][data-ok="0"]');
  const wrongFind = await last('spot.find');
  assert(!wrongFind.ok && /background/.test(wrongFind.message), `a mark beside the spot is rejected with the computed rate (${wrongFind.message})`);
  await page.mouse.click(over.x, over.y);
  await page.locator('[data-propose="spot.find"]').click();
  await page.waitForFunction(() => window.__finder.state().game.nodes['spot.find'].confirmed);
  assert(await page.locator('[data-result="spot.find"][data-ok="1"]').isVisible(), 'the confirmation is shown');

  // ---- spot.age: a short count and a wrong age, then about a day and the right age ----
  const counted = () => page.locator('[data-counted-s]').getAttribute('data-counted-s').then(Number);
  const countFor = async (beats) => {
    const before = await counted();
    // The counting steps other than +10^5 are folded under the panel's "Other counting times" (the hero-control
    // pass, 2026-10-28): open the fold first, as a player would.
    const btn = page.locator(`[data-count-beats="${beats}"]`);
    if (!(await btn.isVisible())) await page.locator('[data-panel="spot.age"] details[data-fine] > summary').click();
    await btn.click();
    await page.waitForFunction((b) => {
      const v = document.querySelector('[data-counted-s]')?.getAttribute('data-counted-s');
      return v !== '' && Number(v) > b;
    }, before, { timeout: 30_000 });
  };
  await countFor(100);
  const tShort = await counted();
  await setRange(page, '[data-age-input]', 150_000);
  await page.locator('[data-propose="spot.age"]').click();
  await page.waitForSelector('[data-result="spot.age"][data-ok="0"]');
  const wrongAge = await last('spot.age');
  assert(!wrongAge.ok && /\d/.test(wrongAge.message), `an age far outside a short count's interval is rejected (${wrongAge.message})`);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.sp-curve')?.scrollIntoView({ block: 'center' }));
  await shot('count-short', `A short count (${tShort.toFixed(0)} s): a few dozen alphas, a wide ratio band, and the wide 95% age interval drawn once an age was proposed; the wrong age is rejected.`, 'Counted 10^2 beats, set the age marker far out and proposed it.');
  // The rejection stands for the count it judged; counting on changes the instrument, so the result is marked
  // as the last proposal (M4 step 7c), dimmed and labelled, until the next proposal.
  const pastOf = (id) => page.locator(`[data-result="${id}"]`).getAttribute('data-past');
  assert((await pastOf('spot.age')) === '0', 'right after the proposal its rejection is the current verdict');
  await countFor(100_000);
  const tLong = await counted();
  await page.waitForSelector('[data-result="spot.age"][data-past="1"] [data-past-label]', { timeout: 10_000 });
  assert((await page.locator('[data-result="spot.age"] [data-past-label]').innerText()).toLowerCase().includes('your last proposal'), 'the old rejection is labelled as your last proposal once the counting time changes');
  await page.evaluate(() => document.querySelector('[data-result="spot.age"]')?.scrollIntoView({ block: 'center' }));
  await shot('count-past', 'After counting on: the rejection of the short count is dimmed and labelled as your last proposal; it judged the count of then, not the count shown now.', 'Proposed a wrong age on a short count, then counted 10^5 more beats.');
  const R = Number(await page.locator('[data-ratio]').getAttribute('data-ratio'));
  const ageYears = ageFromRatio(R);
  // Drag the marker on the curve once (the pointer control), then set it exactly with the slider (the keyboard control).
  const box = await page.locator('.sp-curve').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5, { steps: 3 });
  await page.mouse.up();
  const dragged = Number(await page.locator('.sp-curve').getAttribute('data-age-years'));
  assert(dragged > 0 && Math.abs(dragged - 150_000) > 1, `dragging on the curve moves the age marker (${dragged.toFixed(0)} y)`);
  await setRange(page, '[data-age-input]', Math.round(ageYears / 50) * 50);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.sp-curve')?.scrollIntoView({ block: 'center' }));
  await shot('count-long', `About a day of counting (${(tLong / 3600).toFixed(1)} h): thousands of alphas, the spectrum's three lines, a narrow ratio band, the age marker where the curve meets it, and a narrow 95% interval.`, 'Counted 10^5 more beats, set the marker where the curve meets the measured ratio.');
  await page.locator('[data-propose="spot.age"]').click();
  await page.waitForFunction(() => window.__finder.state().game.nodes['spot.age'].confirmed);
  const seen = await skipMoments(page, { shot: (id) => shot(`moment-${id}`, MOMENT_SHOWS[id] ?? id, 'Proposed the age where the curve meets the ratio; it was confirmed.'), settleMs: 2500 });
  assert(seen.includes('spot.age'), `the spot.age moment shows once and is skipped (${seen.join(', ')})`);
  await page.waitForTimeout(300);
  assert((await pastOf('spot.age')) === '0' && (await page.locator('[data-result="spot.age"] [data-past-label]').count()) === 0, 'a confirmed result is never marked as past');
  const ageRes = (await last('spot.age')).result;
  const yrs = (k) => ageRes.find((r) => r.key === k).value / 31_557_600;

  // ---- spot.purity: natural uranium rejected, a pure start confirmed ----
  await setRange(page, '[data-start-input]', 1);
  await page.waitForTimeout(400);
  await shot('purity-natural', 'The purity dial at ore in balance (a start of 1): the uranium-234 clock never reaches the measured ratio and the thorium-230 clock reads a few thousand years; the meter says they do not fit.', 'Dialled the start to ore in balance.');
  await page.locator('[data-propose="spot.purity"]').click();
  await page.waitForSelector('[data-result="spot.purity"][data-ok="0"]');
  const wrongPurity = await last('spot.purity');
  assert(!wrongPurity.ok && /reject a start of 1/.test(wrongPurity.message), `natural uranium is rejected (${wrongPurity.message})`);
  await setRange(page, '[data-start-input]', 0);
  await page.waitForTimeout(400);
  assert((await page.locator('.sp-meter').getAttribute('data-agree')) === '1', 'the meter shows a pure start fitting');
  await shot('purity-pure', 'The purity dial at a pure start (0): both clocks read about 44,000 years and the meter says the counts fit.', 'Dialled the start to zero.');
  await page.locator('[data-propose="spot.purity"]').click();
  await page.waitForFunction(() => window.__finder.state().game.nodes['spot.purity'].confirmed);
  await page.waitForTimeout(300);
  await shot('spot-done', 'The Spot done: three confirmed instruments folded to their verdicts.', 'Proposed the pure start.');
  const g = await game();
  assert(g.chapterStatus.spot === 'done', 'The Spot is done');
  log(`${label}: rate far ${rateFar.toFixed(5)} /s, over ${rateOver.toFixed(3)} /s; short ${tShort.toFixed(0)} s; long ${tLong.toFixed(0)} s, ratio ${R}, age ${yrs('age').toFixed(0)} (${yrs('age low, 95%').toFixed(0)} to ${yrs('age high, 95%').toFixed(0)})`);
  return { rateFar, rateOver, tShort, tLong, R, age: [yrs('age'), yrs('age low, 95%'), yrs('age high, 95%')], wrong: [wrongFind.message, wrongAge.message, wrongPurity.message] };
}

export default async function run({ page, baseUrl, record, assert, log }) {
  const review = process.env.SPOT_REVIEW === '1';
  const outDir = review ? join(ROOT, 'review', 'inbox', `${stamp()}-spot`) : join(ROOT, 'harness', 'out', 'spot-captures');
  const manifest = { made: new Date().toISOString(), note: 'M4 step 4, The Spot, played through the instrument (tests/browser/spot.browser.mjs).', shots: [] };
  const results = {};
  for (const size of [{ w: 1440, h: 900 }, { w: 1366, h: 768 }]) {
    const label = `${size.w}x${size.h}`;
    mkdirSync(join(outDir, label), { recursive: true });
    let n = 0;
    const shot = async (name, shows, did) => {
      const file = `${label}/frame_${String(++n).padStart(2, '0')}_${name}.png`;
      await page.screenshot({ path: join(outDir, file) });
      const pageScroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
      manifest.shots.push({ file, shows, did, pageScrollPx: pageScroll });
    };
    results[label] = await play(page, baseUrl, size, { assert, log, shot });
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const r = results['1440x900'];
  assert(r.age[1] < 44_100 && 44_100 < r.age[2], `the day's interval holds about 44,100 years (${r.age.map((y) => y.toFixed(0)).join(', ')})`);
  log(`captures in ${outDir}`);
  record({
    id: 'chapter.spot',
    claim: 'The Spot plays start to finish through its instrument: the sweep finds the hidden spot by its counts, a short count gives a wide interval, a day\'s count dates the spot, and natural uranium is rejected while a pure start fits.',
    measured: `1440x900: rate ${r.rateFar.toFixed(5)} /s away, ${r.rateOver.toFixed(3)} /s over the spot; age ${r.age[0].toFixed(0)} y (95% ${r.age[1].toFixed(0)} to ${r.age[2].toFixed(0)}) after ${(r.tLong / 3600).toFixed(1)} h; one wrong answer per node rejected with its computed result; same at 1366x768`,
    expected: 'the behaviour in docs/plans/M4_specs/step4-the-spot.md; the age from the test\'s own closed-form inversion of the measured ratio (LNHB half-lives)',
    tolerance: 'exact (interface behaviour); the proposed age is the closed-form age rounded to 50 years, well inside the interval',
    pass: true,
  });
}
