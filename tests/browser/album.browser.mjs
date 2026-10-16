// The Pictures, complete (M5 step 3) on /play/, through the instrument's own controls (the same command bus the
// interface sends; rule 5): the album fills with every frame of the side decoded from the tape; then each of the
// eight deductions is played on its work view, once wrong (refused, with its computed result shown) and then
// right. The three staged moments show once each and are skipped with their button. The save starts at
// pictures.firstFrames confirmed. Captures at 1440x900 and 1366x768 go to review/inbox/<timestamp>-pictures/ with
// manifest.json. Console errors fail the test (the harness). Id: chapter.picturesComplete.
//
// playPicturesM5 is exported for bot.game (tests/browser/game.browser.mjs) and tests/browser/pictures.browser.mjs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { skipMoments } from './moments.mjs';

const SAVE_KEY = 'finder.save.v1';
const TEACHING = JSON.parse(readFileSync(join(ROOT, 'data', 'teaching.json'), 'utf8'));
const okAttempt = (answer) => [{ answer, ok: true, result: [], message: '', at: 0 }];
/** The save at pictures.firstFrames: the slice's 18 deductions, with the accepted line time and rows (start.ts resumes them). */
const SLICE = {
  'arrival.purpose': [], 'arrival.heat': [], 'arrival.madeNotMined': [], 'arrival.fuelAge': [],
  'key.binary': [], 'key.unit': [], 'key.timesNotLengths': [],
  'player.speed': [], 'player.start': [], 'player.direction': [], 'player.firstSound': [],
  'pictures.lineTime': okAttempt({ lineTimeMs: 8.3396 }), 'pictures.sync': [], 'pictures.interlace': [], 'pictures.polarity': [],
  'pictures.aspect': okAttempt({ rows: 355 }), 'pictures.circle': [], 'pictures.firstFrames': [],
};

export const M5_PICTURE_IDS = ['pictures.album', 'pictures.colour', 'pictures.down', 'pictures.numerals', 'pictures.units', 'pictures.home', 'pictures.slip', 'pictures.height'];

/** A review folder whose manifest records each shot's viewport. */
function reviewFolder(dir) {
  mkdirSync(join(dir, 'frames'), { recursive: true });
  const shots = [];
  return {
    dir,
    shots,
    async shot(page, name, shows, did) {
      const vp = page.viewportSize();
      const file = `frames/frame_${String(shots.length + 1).padStart(2, '0')}_${vp.width}x${vp.height}_${name}.png`;
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(dir, file) });
      shots.push({ file, viewport: `${vp.width}x${vp.height}`, shows, did });
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), shots }, null, 2));
    },
  };
}

const last = (page, id) => page.evaluate((id) => {
  const n = window.__finder.state().game.nodes[id];
  return n ? { confirmed: n.confirmed, a: n.attempts[n.attempts.length - 1] ?? null, count: n.attempts.length } : { confirmed: false, a: null, count: 0 };
}, id);

/**
 * Click a node's propose button and wait for its new attempt. Returns the attempt.
 * @param {import('playwright').Page} page
 */
async function propose(page, id) {
  const before = (await last(page, id)).count;
  await page.locator(`[data-propose-button="${id}"]`).first().click();
  await page.waitForFunction(([id, n]) => (window.__finder.state().game.nodes[id]?.attempts.length ?? 0) > n, [id, before], { timeout: 60_000 });
  return (await last(page, id)).a;
}

const open = (page, work) => page.locator(`.pic-tab[data-view="${work}"]`).first().click();
const pickFrame = (page, f) => page.locator(`[data-album-frame="${f}"] button`).click();

/**
 * Play the eight deductions of The Pictures, complete, through the instrument. Expects the chapter entered and
 * pictures.firstFrames confirmed, with the bench at the settings that made the circle round.
 * Options: wrong (play one meaningful wrong answer per node first), shot(name, shows, did), assert, log.
 * Returns { played: [{ id, ok, message }], ms }.
 */
export async function playPicturesM5(page, opts = {}) {
  const assert = opts.assert ?? ((c, m) => { if (!c) throw new Error(`assertion failed: ${m}`); });
  const log = opts.log ?? (() => undefined);
  const shot = opts.shot ?? (async () => undefined);
  const wrong = opts.wrong ?? false;
  const played = [];
  const t0 = Date.now();
  const note = (id, a) => played.push({ id, ok: a.ok, message: a.message });
  const refuse = async (id, what) => {
    const a = await propose(page, id);
    assert(a && !a.ok, `${id}: ${what} is refused (${a?.message})`);
    note(id, a);
    await page.waitForSelector(`[data-panel="${id}"] [data-ok="false"], [data-panel="${id}"] .bad, [data-panel="${id}"] [data-result]`, { timeout: 10_000 }).catch(() => undefined);
    log(`${id} wrong (${what}): ${a.message}`);
    return a;
  };
  const accept = async (id) => {
    const a = await propose(page, id);
    assert(a && a.ok, `${id} is confirmed (${a?.message})`);
    note(id, a);
    log(`${id}: ${a.message}`);
    return a;
  };
  const moment = async (id, shows) => {
    const seen = await skipMoments(page, { waitMs: 6000, settleMs: 3400, shot: async (m) => shot(`moment-${m}`, shows, `Proposed the answer for ${id}; it was confirmed.`) });
    assert(seen.includes(id), `the ${id} moment showed (${seen.join(', ')})`);
  };

  // ---- the album ----
  await open(page, 'album');
  await page.waitForSelector('[data-work="album"]');
  if (wrong) await refuse('pictures.album', 'a side with most frames not developed yet');
  const td = Date.now();
  await page.locator('[data-album-develop]').click();
  await page.waitForSelector(`[data-album-count="156"]`, { timeout: 300_000 });
  const developMs = Date.now() - td;
  log(`album: 156 frames developed in ${(developMs / 1000).toFixed(1)} s`);
  await shot('album', 'The album: every frame of the side decoded from the tape in gold thumbnails, both tracks, with a count in the alien numerals.', 'Opened the album and developed the rest of the side at once.');
  await accept('pictures.album');

  // ---- colour ----
  await open(page, 'colour');
  if (wrong) {
    await pickFrame(page, 'L024');
    await page.waitForSelector('[data-composite="L024,L025,L026"]');
    await refuse('pictures.colour', 'three anatomy drawings, not a triple');
    await shot('colour-wrong', 'The colour mixer with three frames that are not one picture: the stack comes out a misregistered smear; refused with the likeness numbers.', 'Picked three neighbouring anatomy drawings on the mixer and proposed them.');
  }
  await pickFrame(page, 'L013');
  await page.waitForSelector('[data-composite="L013,L014,L015"]');
  await shot('colour-right', 'The colour mixer: three grey frames of the Earth, stacked as red, green and blue light, bloom into one colour picture.', 'Picked the three frames of the Earth on the mixer.');
  await accept('pictures.colour');
  await moment('pictures.colour', 'The colour moment: three grey frames beside the colour picture they make, the tape time of the three as its number.');

  // ---- down ----
  await open(page, 'turn');
  await pickFrame(page, 'L039');
  if (wrong) {
    await page.locator('[data-turn="-1"]').click();
    await shot('turn-wrong', 'The two figures turned a quarter turn the wrong way: heads down.', 'Picked the diagram of two figures and turned it anticlockwise.');
    await refuse('pictures.down', 'a quarter turn anticlockwise');
    await page.locator('[data-turn="1"]').click();
  }
  await page.locator('[data-turn="1"]').click();
  await shot('turn-right', 'The two figures turned a quarter turn clockwise: they stand upright.', 'Turned the picture clockwise until the figures stood.');
  await accept('pictures.down');
  await page.locator(".pic-tab[data-view=\"album\"]").click();
  await shot('album-upright', 'The album after "which way is up": every picture stored on its side now shown upright.', 'Went back to the album.');

  // ---- numerals ----
  await open(page, 'numerals');
  const digits = TEACHING.L002.digits;
  const set = (g, v) => page.locator(`[data-numeral-pick="${g}:${v}"]`).click();
  for (const d of digits.slice(0, 5)) await set(d.glyph, d.value);
  await shot('numerals-half', 'The counting picture: dots, the cover\'s strokes and their marks in rows; five of their marks matched to the alien numerals, the rest still open.', 'Matched the first five of their marks to its own numerals.');
  for (const d of digits.slice(5)) await set(d.glyph, wrong && d.value === 7 ? 6 : d.value);
  if (wrong) {
    await refuse('pictures.numerals', 'their seven set as six');
    await set(digits.find((d) => d.value === 7).glyph, 7);
  }
  await page.waitForSelector('[data-sum="2 + 3 = 5"][data-holds="true"]');
  await shot('numerals-done', 'The counting table finished: every mark of theirs beside an alien numeral, and their sums read back in the alien numerals, each holding.', 'Matched the rest and read their sums back.');
  await accept('pictures.numerals');

  // ---- units ----
  await open(page, 'units');
  const fill = async (k, v) => page.locator(`[data-reading="${k}"]`).fill(String(v));
  await fill('whole', 1);
  await fill('num', 42);
  await fill('den', 100);
  if (wrong) {
    await fill('power', 8);
    await refuse('pictures.units', 'ten to the eighth for ten to the ninth');
  }
  await fill('power', 9);
  await shot('units', 'The unit picture: the atom drawings, their line "1 42/100 x 10^9 t = 1 s" and the converter set to it, reading their second in beats.', 'Read their line about the spin flip into the converter.');
  await accept('pictures.units');

  // ---- home and the slip ----
  await open(page, 'planets');
  if (wrong) {
    await page.locator('[data-column="2"]').click();
    await refuse('pictures.home', 'the second planet\'s column');
  }
  await page.locator('[data-column="3"]').click();
  await accept('pictures.home');
  await moment('pictures.home', 'The home moment: the circles of their table with their own world ringed in gold; its distance from their star as the number.');
  await shot('planets-home', 'The planets table, both pictures side by side, with home ringed.', 'Marked the column of ones as home.');
  if (wrong) {
    await page.locator('[data-cell="8:distance"]').click();
    await refuse('pictures.slip', 'a distance that fits');
  }
  await page.locator('[data-cell="9:distance"]').click();
  await accept('pictures.slip');
  await shot('planets-slip', 'The planets table with the outermost distance marked as the slip, and the result saying what it would have to be.', 'Marked the last distance as breaking the order.');

  // ---- height ----
  await open(page, 'height');
  if (wrong) {
    await fill('cm', 155);
    await refuse('pictures.height', 'the shorter figure\'s number for the taller');
  }
  await fill('cm', 160);
  await shot('height', 'The two figures with their scale bars, the numbers read off them and the converter turning 160 of their centimetres into reaches.', 'Read the taller figure\'s number into the converter.');
  await accept('pictures.height');
  await moment('pictures.height', 'The height moment: the two figures upright beside one of the alien\'s reaches to the same scale; the taller figure\'s height as the number.');
  return { played, ms: Date.now() - t0, developMs };
}

export default async function run({ page, baseUrl, record, assert, log }) {
  const stampDir = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const review = reviewFolder(join(ROOT, 'review', 'inbox', `${stampDir}-pictures`));
  await page.setViewportSize({ width: 1440, height: 900 });
  const nodes = Object.fromEntries(Object.entries(SLICE).map(([id, attempts]) => [id, { confirmed: true, attempts, hints: 0 }]));
  await page.addInitScript(
    ([key, nodes]) => {
      if (sessionStorage.getItem('album-test-seeded')) return;
      sessionStorage.setItem('album-test-seeded', '1');
      localStorage.setItem(key, JSON.stringify({ version: 1, nodes, chapter: 'hub', settings: { humanGloss: false, masterVolume: 0, reducedMotion: false, soundCaptions: true }, seed: 'album-browser-test' }));
    },
    [SAVE_KEY, nodes],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'pictures' }));
  await page.waitForSelector('.picinst[data-pictures-ready="true"]', { timeout: 90_000 });
  const bench = await page.evaluate(() => window.__finder.state().decoder.bench);
  assert(bench.rows === 355 && bench.syncLock && bench.interlace && bench.polarity === 'negative', `the bench resumes the confirmed settings (${JSON.stringify(bench)})`);

  const shot = (name, shows, did) => review.shot(page, name, shows, did);
  const res = await playPicturesM5(page, { wrong: true, shot, assert, log });

  // every node: one wrong answer, then confirmed
  const g = await page.evaluate(() => window.__finder.state().game);
  for (const id of M5_PICTURE_IDS) {
    const p = res.played.filter((x) => x.id === id);
    assert(p.some((x) => !x.ok) && p.some((x) => x.ok), `${id}: wrong once, then right (${p.map((x) => x.ok).join(', ')})`);
    assert(g.confirmed.includes(id), `${id} confirmed`);
  }
  assert(g.chapterStatus.pictures === 'done', `The Pictures is done (${g.chapterStatus.pictures})`);

  // the same views at the smaller laptop size
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const [work, name, shows] of [
    ['album', 'album', 'The album at 1366x768, every picture upright.'],
    ['colour', 'colour', 'The colour mixer at 1366x768 with the Earth in colour.'],
    ['numerals', 'numerals', 'The finished counting table at 1366x768.'],
    ['planets', 'planets', 'The planets table at 1366x768, home ringed.'],
    ['height', 'height', 'The two figures and the converter at 1366x768.'],
  ]) {
    await open(page, work);
    await review.shot(page, name, shows, `Opened the ${work} view again on a smaller screen.`);
  }
  const scroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 2 || document.documentElement.scrollWidth > window.innerWidth + 2);
  assert(!scroll, 'the page itself does not scroll at 1366x768');

  log(`played ${res.played.length} proposals in ${(res.ms / 1000).toFixed(0)} s (album ${(res.developMs / 1000).toFixed(1)} s); ${review.shots.length} captures in ${review.dir}`);
  record({
    id: 'chapter.picturesComplete',
    claim: 'The Pictures, complete, plays in the browser on the real tape: the album fills with all 156 frames decoded from the tape, and each of the eight deductions (album, colour, down, numerals, units, home, slip, height) is refused once with its computed result and then confirmed on its work view; the three moments show once each.',
    measured: `${res.played.filter((p) => !p.ok).length} wrong answers refused, 8 confirmed; album of 156 developed in ${(res.developMs / 1000).toFixed(1)} s; ${review.shots.length} captures`,
    expected: 'The same results as the Node checkers (pictures.album, pictures.colour, pictures.down, pictures.units, pictures.home, pictures.height); no console errors',
    tolerance: 'As each checker',
    pass: true,
  });
}
