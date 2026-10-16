// The Pictures on /play/, played through window.__finder only (the same command bus the interface uses): from
// the free-running start, each deduction's wrong setting once (rejected with its measured result), then the
// right one, to the round calibration circle; then three of the following frames developed at record speed
// and confirmed. The save starts with The Key and the turntable speed confirmed (The Pictures needs them).
// Captures at 1440 x 900 go to harness/out/pictures-captures/. Console errors fail the test (the harness).
// Id: chapter.pictures.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';

const SAVE_KEY = 'finder.save.v1';
const OUT = join(ROOT, 'harness', 'out', 'pictures-captures');
const done = (ids) => Object.fromEntries(ids.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));

export default async function run({ page, baseUrl, record, assert, log }) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ([key, nodes]) => {
      if (sessionStorage.getItem('pictures-test-seeded')) return;
      sessionStorage.setItem('pictures-test-seeded', '1');
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          nodes,
          chapter: 'hub',
          settings: { humanGloss: false, masterVolume: 0, reducedMotion: true, soundCaptions: true },
          seed: 'pictures-browser-test',
        }),
      );
    },
    [SAVE_KEY, done(['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths', 'player.speed'])],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });

  const state = () => page.evaluate(() => window.__finder.state());
  const set = (name, value) =>
    page.evaluate(
      async ([name, value]) => {
        await window.__finder.dispatch({ type: 'decoder.setParam', name, value });
        await window.__finder.dispatch({ type: 'decoder.run', speed: 'fast' });
      },
      [name, value],
    );
  const propose = (id, answer) =>
    page.evaluate(
      async ([id, answer]) => {
        await window.__finder.dispatch({ type: 'deduction.propose', id, answer });
        const n = window.__finder.state().game.nodes[id];
        return n.attempts[n.attempts.length - 1];
      },
      [id, answer],
    );
  const reading = (a, k) => a.result.find((r) => r.key === k)?.value;
  const shot = async (name, sel = null) => {
    await page.waitForTimeout(250);
    await page.evaluate((sel) => (sel ? document.querySelector(sel)?.scrollIntoView({ block: 'center' }) : window.scrollTo(0, 0)), sel);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
  };
  const bench = async () => (await state()).decoder.bench;
  const settings = async () => {
    const b = await bench();
    return { lineTimeMs: b.lineTimeMs, syncLock: b.syncLock, interlace: b.interlace, polarity: b.polarity, rows: b.rows };
  };

  // ---- enter; the decoder starts free-running with wrong neutral settings and develops the circle ----
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'pictures' }));
  await page.waitForSelector('.picinst[data-pictures-ready="true"]', { timeout: 90_000 });
  await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().decoder.status === 'done', 60_000));
  const start = await bench();
  assert(!start.syncLock && !start.interlace && start.polarity === 'positive' && start.rows === 512, `free-running start (${JSON.stringify(start)})`);
  assert(Math.abs(start.lineTimeMs - 7.839) < 0.01, `the player's own line time to start, 0.009 beats (${start.lineTimeMs})`);
  await shot('1-free-running');

  const shown = {};
  // ---- pictures.lineTime ----
  const lt0 = await propose('pictures.lineTime', { lineTimeMs: start.lineTimeMs });
  assert(!lt0.ok && Math.abs(reading(lt0, 'slant per line') * 384000) > 100, `the start line time slants (${lt0.message})`);
  shown.lineTime = lt0.message;
  // the cover's line time, read off the cover with the key: 11,845,632 hydrogen periods = 8.3396 ms
  await set('lineTimeMs', 8.3396);
  await shot('2-linetime-right-unlocked');
  const lt = await propose('pictures.lineTime', { lineTimeMs: (await bench()).lineTimeMs });
  assert(lt.ok, `the cover's line time holds (${lt.message})`);

  // ---- pictures.sync ----
  const sy0 = await propose('pictures.sync', { lineTimeMs: 8.3396, syncLock: false });
  assert(!sy0.ok && reading(sy0, 'wobble now') * 384000 > 1.8, `free-running still wobbles (${sy0.message})`);
  shown.sync = sy0.message;
  await set('syncLock', true);
  await shot('3-locked-no-interlace');
  const sy = await propose('pictures.sync', { lineTimeMs: 8.3396, syncLock: (await bench()).syncLock });
  assert(sy.ok && reading(sy, 'wobble now') * 384000 < 0.01, `the lock removes the wobble (${sy.message})`);
  assert((await page.locator('.pic-scope[data-scope-trigger="edge"]').count()) === 1, 'the scope triggers on the edges');

  // ---- pictures.interlace ----
  const il0 = await propose('pictures.interlace', { interlace: false });
  const comb = reading(il0, 'even and odd shift') * 384000;
  assert(!il0.ok && comb > 7 && comb < 10, `without the offset the comb is about 8.4 samples (${comb})`);
  shown.interlace = il0.message;
  await set('interlace', true);
  const il = await propose('pictures.interlace', { interlace: true });
  assert(il.ok && reading(il, 'even and odd shift') * 384000 < 1.1, `with it the comb goes (${il.message})`);

  // ---- pictures.polarity ----
  const po0 = await propose('pictures.polarity', { polarity: 'positive' });
  assert(!po0.ok && reading(po0, 'frames with dark mounts') === '0 of 5', `the positive reading lights the mounts (${po0.message})`);
  shown.polarity = po0.message;
  await shot('4-wrong-polarity');
  await set('polarity', 'negative');
  const po = await propose('pictures.polarity', { polarity: 'negative' });
  assert(po.ok && reading(po, 'frames with dark mounts') === '5 of 5', `the negative reading darkens the mounts (${po.message})`);

  // ---- pictures.aspect ----
  await shot('5-squashed-circle');
  const as0 = await propose('pictures.aspect', { rows: 512 });
  assert(!as0.ok && Math.abs(reading(as0, 'axis ratio') - 355 / 512) < 0.01, `512 rows squash the circle to 355/512 (${reading(as0, 'axis ratio')})`);
  shown.aspect = as0.message;
  await set('rows', 355);
  const as = await propose('pictures.aspect', { rows: 355 });
  assert(as.ok && Math.abs(reading(as, 'axis ratio') - 1) <= 0.01, `355 rows make it round (${reading(as, 'axis ratio')})`);

  // ---- pictures.circle ----
  const ci = await propose('pictures.circle', await settings());
  assert(ci.ok && /They see\./.test(ci.message), `the circle is true (${ci.message})`);
  await page.waitForSelector('.pic-they');
  assert((await page.locator('.pic-caption-sound').count()) === 1, 'the swell is captioned');
  await page.evaluate(() => window.__finder.dispatch({ type: 'decoder.run', speed: 'fast' }));
  await shot('6-round-circle');

  // ---- pictures.firstFrames ----
  const ff0 = await propose('pictures.firstFrames', { watched: [], settings: await settings() });
  assert(!ff0.ok, 'nothing watched yet is not enough');
  const frames = await page.evaluate(async () => (await import('/src/chapters/pictures/checkers.ts')).FIRST_FRAMES.slice(0, 3));
  for (const [i, f] of frames.entries()) {
    await page.evaluate((f) => window.__finder.dispatch({ type: 'decoder.select', frame: f }), f);
    const t0 = Date.now();
    const runP = page.evaluate(() => window.__finder.dispatch({ type: 'decoder.run', speed: 'record' }));
    if (i === 0) {
      await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().decoder.revealed > 220, 30_000));
      await shot('7-frame-developing');
    }
    await runP;
    const ms = Date.now() - t0;
    // 512 lines at the tape's 8.32 ms each is 4.26 s; the fetch and decode come on top
    assert(ms > 4000, `${f} developed at record speed (${ms} ms)`);
    log(`${f} developed in ${ms} ms`);
  }
  await page.waitForFunction((n) => document.querySelectorAll('.pic-seen [data-seen]').length >= n, frames.length);
  const ff = await propose('pictures.firstFrames', { watched: frames, settings: await settings() });
  assert(ff.ok, `three frames developed (${ff.message})`);
  await shot('8-seen', '.pic-seen');
  await shot('9-notebook', '[data-panel="pictures.firstFrames"]');
  const g = (await state()).game;
  assert(g.chapterStatus.pictures === 'done', 'The Pictures is done');

  for (const [k, v] of Object.entries(shown)) log(`${k}: ${v}`);
  record({
    id: 'chapter.pictures',
    claim: 'The Pictures plays in the browser on the real 1977 tape: from the free-running start every wrong setting is rejected with its measured result, the right ones bring the calibration circle round, and the next frames develop line by line at record speed.',
    measured: `start slant ${(reading(lt0, 'slant per line') * 384000).toFixed(1)} samples/line; cover line time accepted (slant ${(reading(lt, 'slant per line') * 384000).toFixed(2)}); wobble ${(reading(sy0, 'wobble now') * 384000).toFixed(2)} free, ${(reading(sy, 'wobble now') * 384000).toFixed(3)} locked; comb ${comb.toFixed(2)} / ${(reading(il, 'even and odd shift') * 384000).toFixed(2)}; mounts ${reading(po0, 'frames with dark mounts')} / ${reading(po, 'frames with dark mounts')}; axis ratio ${reading(as0, 'axis ratio')} at 512 rows, ${reading(as, 'axis ratio')} at 355; ${frames.join(', ')} watched`,
    expected: 'The same results as the Node checkers on the same slices (pictures.lineTime, pictures.sync, pictures.interlace, pictures.polarity, pictures.aspect); no console errors',
    tolerance: 'As each checker (README-sourced thresholds)',
    pass: true,
  });
}
