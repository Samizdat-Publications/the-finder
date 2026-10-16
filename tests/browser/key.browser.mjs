// The Key on /play/, played through window.__finder only (the same command bus the interface uses): every
// wrong answer once (each is rejected and shows its computed wrong result), then the right ones; the
// instrument shows the census counted from the cover's strokes; afterwards the ring opens The Player and The
// Pictures. The save starts with Arrival's first deduction confirmed (a returning player), because The Key
// opens after it. Console errors fail the test (the harness). Id: chapter.key.

const SAVE_KEY = 'finder.save.v1';

export default async function run({ page, baseUrl, record, assert, log }) {
  await page.addInitScript(
    ([key]) => {
      if (sessionStorage.getItem('key-test-seeded')) return;
      sessionStorage.setItem('key-test-seeded', '1');
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          nodes: { 'arrival.purpose': { confirmed: true, attempts: [], hints: 0 } },
          chapter: 'hub',
          settings: { humanGloss: false, masterVolume: 0.8, reducedMotion: true, soundCaptions: false },
          seed: 'key-browser-test',
        }),
      );
    },
    [SAVE_KEY],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });

  const propose = (id, answer) =>
    page.evaluate(
      async ([id, answer]) => {
        await window.__finder.dispatch({ type: 'deduction.propose', id, answer });
        const n = window.__finder.state().game.nodes[id];
        return n.attempts[n.attempts.length - 1];
      },
      [id, answer],
    );
  const reading = (attempt, key) => attempt.result.find((r) => r.key === key)?.value;

  // ---- enter The Key; the instrument is up and the catalogue loaded ----
  assert((await page.evaluate(() => window.__finder.state().game.chapterStatus.key)) === 'open', 'The Key is open after arrival.purpose');
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'key' }));
  await page.evaluate(() => window.__finder.waitFor(() => document.querySelector('.keyinst[data-key-ready="true"]') !== null, 60_000));
  const groupsShown = await page.locator('[data-count="groups"]').innerText();
  const beginAlongShown = await page.locator('[data-count="beginAlong"]').innerText();
  assert(groupsShown === '25' && beginAlongShown === '0', `the census shows 25 strings, none beginning along (${groupsShown}, ${beginAlongShown})`);
  assert((await page.locator('.coverviewer canvas.relief').count()) === 1, 'the cover is drawn');

  // ---- key.binary: each wrong reading, then the right one ----
  const shown = {};
  const along = await propose('key.binary', { reading: 'positional', one: 'along' });
  assert(!along.ok && reading(along, 'numbers beginning with zero') === 25 && reading(along, 'hydrogen mark') === 0, 'dash as one: all 25 begin with zero, the hydrogen mark reads 0');
  shown.alongOne = along.message;
  for (const r of ['tally', 'letters', 'decoration']) {
    const a = await propose('key.binary', { reading: r });
    assert(!a.ok && a.message.length > 60 && a.result.length > 4, `${r} is rejected with a computed result`);
    shown[r] = a.message;
  }
  assert(await page.locator('[data-result="key.binary"][data-ok="false"]').isVisible(), 'the wrong result is shown on the instrument');
  const binary = await propose('key.binary', { reading: 'positional', one: 'across' });
  assert(binary.ok, `bar as one confirms key.binary (${binary.message})`);

  // ---- key.unit: each wrong transition, then the spin flip ----
  for (const t of ['lymanAlpha', 'balmerAlpha', 'paschenAlpha', 'ionization']) {
    const a = await propose('key.unit', t);
    assert(!a.ok && reading(a, 'map numbers among known pulsars') === '0 of 14', `${t}: none of the 14 map numbers is a known pulsar period`);
    shown[t] = a.message;
  }
  const unit = await propose('key.unit', 'hyperfine');
  assert(unit.ok && reading(unit, 'map numbers among known pulsars') === '14 of 14', `the spin flip confirms key.unit (${unit.message})`);

  // ---- key.timesNotLengths ----
  const lengths = await propose('key.timesNotLengths', 'lengths');
  assert(!lengths.ok && reading(lengths, 'round the disc as a length') > 1e9, 'as lengths the disc number is over a million kilometres');
  shown.lengths = lengths.message;
  const times = await propose('key.timesNotLengths', 'times');
  assert(times.ok && Math.abs(reading(times, 'round the disc as a time') - 3.59994) < 1e-4, 'as times the disc turns once in 3.6 s');

  // ---- the ring opens The Player and The Pictures ----
  const g = await page.evaluate(() => window.__finder.state().game);
  assert(g.chapterStatus.key === 'done', 'The Key is done');
  assert(g.chapterStatus.player === 'open' && g.chapterStatus.pictures === 'open', 'The Player and The Pictures open');
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'hub' }));
  assert((await page.locator('.chap.open', { hasText: 'The Player' }).count()) === 1, 'the ring shows The Player open');
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'player' }));
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'pictures' }));
  assert((await page.evaluate(() => window.__finder.state().game.chapter)) === 'pictures', 'The Pictures can be entered');

  for (const [k, v] of Object.entries(shown)) log(`${k}: ${v}`);
  record({
    id: 'chapter.key',
    claim: 'The Key plays in the browser: every wrong reading of the strokes, every wrong hydrogen transition and the length reading are rejected with their computed results, the right answers confirm, and The Player and The Pictures open.',
    measured: `census 25 strings, 0 beginning along; 4 wrong stroke readings, 4 wrong transitions (0 of 14 map numbers each), lengths rejected; spin flip 14 of 14; turn ${reading(times, 'round the disc as a time').toFixed(5)} s`,
    expected: 'the same results as the Node checkers (key.binary, key.unit, key.timesNotLengths); no console errors',
    tolerance: 'exact',
    pass: true,
  });
}
