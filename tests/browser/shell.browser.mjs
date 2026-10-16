// The game shell on /play/, driven through the command bus (window.__finder, installed by the dev server)
// and the real interface (clicks). Checked: the page loads with no console errors; the ring shows only
// Arrival open; confirming arrival.purpose with the test checker opens The Key; the codex shows the entry
// with a working "How it's checked" link to the matching row; the state survives a reload; Escape closes the
// drawers; the human gloss setting persists; save.reset (Start over, asked first) clears the progress; a
// locked chapter in the URL is refused; no sideways scrolling at phone width. Id: game.shell.

const SAVE_KEY = 'finder.save.v1';

export default async function run({ page, baseUrl, record, assert, log }) {
  const url = `${baseUrl}/play/?testcheckers=1`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const game = () => page.evaluate(() => window.__finder.state().game);

  // ---- 1. a fresh start: the hub, with only Arrival open ----
  let g = await game();
  assert(g.chapter === 'hub', `a fresh game starts on the ring (got ${g.chapter})`);
  assert((await page.locator('.chap').count()) === 10, 'the ring shows ten chapters');
  assert((await page.locator('.chap.open').count()) === 1, 'only Arrival is open at the start');
  assert((await page.locator('.chap.later').count()) === 6, 'six chapters are marked later');
  assert(g.confirmed.length === 0 && g.hintsUsed === 0, 'nothing is confirmed at the start');

  // ---- 2. enter Arrival; the placeholder workbench lists its deductions ----
  await page.getByRole('button', { name: /^Arrival, open/ }).click();
  await page.waitForFunction(() => window.__finder.state().game.chapter === 'arrival');
  assert((await page.evaluate(() => window.location.hash)) === '#arrival', 'the hash follows the chapter');
  assert(await page.getByText('This instrument is being built.').isVisible(), 'the placeholder workbench is shown');
  assert((await page.locator('[data-node]').count()) === 4, 'Arrival lists its four deductions');
  assert((await page.locator('[data-node="arrival.purpose"]').getAttribute('data-status')) === 'open', 'arrival.purpose is open');
  assert((await page.locator('[data-node="arrival.heat"]').getAttribute('data-status')) === 'locked', 'arrival.heat is locked');

  const openText = await page.locator('[data-node="arrival.purpose"]').innerText();
  assert(openText.includes('What is this machine for?') && !/send across distance/.test(openText), 'an open node shows its question, not its conclusion');
  assert(!/made, not mined/.test(await page.locator('[data-node="arrival.madeNotMined"]').innerText()), 'a locked node does not leak its conclusion');

  // ---- 3. a wrong answer is remembered and shown; the right one confirms and opens The Key ----
  const wrong = await page.evaluate(async () => {
    await window.__finder.dispatch({ type: 'deduction.propose', id: 'arrival.purpose', answer: 'a telescope' });
    return window.__finder.state().game.nodes['arrival.purpose'];
  });
  assert(wrong.attempts.length === 1 && wrong.attempts[0].ok === false && !wrong.confirmed, 'a wrong answer is an attempt, not a confirmation');
  assert(await page.locator('[data-node="arrival.purpose"] details.wrong').isVisible(), 'the wrong answer is shown on the workbench');
  await page.evaluate(() => window.__finder.dispatch({ type: 'deduction.propose', id: 'arrival.purpose', answer: 'correct' }));
  g = await game();
  assert(g.nodes['arrival.purpose'].confirmed, 'arrival.purpose is confirmed');
  assert(g.chapterStatus.key === 'open', 'The Key opens');
  assert(g.chapterStatus.player === 'locked' && g.chapterStatus.pictures === 'locked', 'the player and the pictures stay locked');
  const refused = await page.evaluate(async () => {
    try {
      await window.__finder.dispatch({ type: 'chapter.enter', chapter: 'player' });
      return 'entered';
    } catch (e) {
      return String(e.message);
    }
  });
  assert(/locked/.test(refused), `a locked chapter is refused with a reason (${refused})`);
  assert(await page.locator('.notice span').isVisible(), 'the refusal is shown in the notice line');

  // ---- 4. a hint, one tier at a time, only when asked ----
  assert((await page.locator('.hints').count()) === 0, 'no hint is shown until asked');
  await page.locator('[data-hint="arrival.heat"]').click();
  g = await game();
  assert(g.nodes['arrival.heat'].hints === 1 && g.hintsUsed === 1, 'the first hint reveals one tier');
  assert(await page.locator('[data-node="arrival.heat"] .tier', { hasText: 'nudge' }).isVisible(), 'the nudge is shown first');

  // ---- 5. the codex: the entry, its notation, a working How it's checked link ----
  await page.locator('[data-tool="codex"]').click();
  const entry = page.locator('[data-entry="arrival.purpose"]');
  await entry.waitFor();
  assert(await entry.locator('svg.glyph').first().isVisible(), 'the entry has its glyph title');
  assert(await entry.locator('.notation').isVisible(), "the entry has the alien's notation");
  assert((await entry.locator('details.wrong').count()) === 1, 'the entry shows the answer that did not hold');
  const href = await entry.locator('[data-checked-link]').getAttribute('href');
  assert(href === '/checked/#row-1', `the link points at the matching row (${href})`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__finder.state().game.codexOpen);
  assert((await page.locator('#codex').count()) === 0, 'Escape closes the codex');

  // ---- 6. reload: everything persists ----
  await page.waitForTimeout(400); // the save is debounced; it also flushes when the page hides
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder));
  g = await game();
  assert(g.nodes['arrival.purpose'].confirmed, 'the confirmed deduction survives a reload');
  assert(g.nodes['arrival.purpose'].attempts.length === 2, 'the wrong attempt survives a reload');
  assert(g.nodes['arrival.heat'].hints === 1, 'the hint count survives a reload');
  assert(g.chapter === 'arrival', 'the chapter survives a reload');

  // ---- 7. the link works: the checked page has the row, scrolled to ----
  await page.locator('[data-tool="codex"]').click();
  await page.locator('[data-entry="arrival.purpose"] [data-checked-link]').click();
  await page.waitForURL(/\/checked\/#row-1$/);
  await page.waitForSelector('#row-1');
  const rowInView = await page.evaluate(() => {
    const r = document.getElementById('row-1').getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  });
  assert(rowInView, 'the checked page scrolls to row 1');
  const rowText = await page.locator('#row-1').innerText();
  assert(/heat source is about 44,000 years old/.test(rowText), `row 1 is the Arrival heat-source deduction (${rowText.slice(0, 60)})`);

  // ---- 8. settings: the human gloss persists; Escape closes ----
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder));
  await page.locator('[data-tool="settings"]').click();
  assert((await page.locator('[data-setting="humanGloss"]').getAttribute('aria-checked')) === 'false', 'the human gloss is off by default');
  await page.locator('[data-setting="humanGloss"]').click();
  assert((await game()).settings.humanGloss === true, 'the human gloss switches on');
  await page.keyboard.press('Escape');
  assert((await page.locator('#settings').count()) === 0, 'Escape closes settings');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder));
  assert((await game()).settings.humanGloss === true, 'the human gloss setting survives a reload');
  assert((await game()).nodes['arrival.purpose'].confirmed, 'progress still there after the settings change');

  // ---- 8b. a reading with a dimension is written in the alien's unit, with SI after it under the human gloss ----
  await page.evaluate(async () => {
    const d = await import('/src/game/deductions.ts');
    d.registerChecker('arrival.heat', () => ({ ok: true, result: [{ key: 'turn', value: 3.6, dim: 'time' }], message: 'ok' }));
    await window.__finder.dispatch({ type: 'deduction.propose', id: 'arrival.heat', answer: 'x' });
    await window.__finder.dispatch({ type: 'codex.open', id: 'arrival.heat' });
  });
  const reading = page.locator('[data-entry="arrival.heat"] .value');
  await reading.waitFor();
  const readingText = await reading.innerText();
  assert(/^[\d,]{9,}/.test(readingText), `the time is written in hydrogen periods with Arabic digits (${readingText})`);
  assert(/\(3\.6 s\)/.test(readingText), `the human gloss adds SI in parentheses (${readingText})`);
  await page.evaluate(() => window.__finder.dispatch({ type: 'settings.set', name: 'humanGloss', value: false }));
  assert(!/\(3\.6 s\)/.test(await reading.innerText()), 'with the human gloss off there is no SI');
  await page.evaluate(() => window.__finder.dispatch({ type: 'settings.set', name: 'humanGloss', value: true }));
  await page.keyboard.press('Escape');

  // ---- 9. Start over asks first, then clears the progress and keeps the settings ----
  await page.locator('[data-tool="settings"]').click();
  await page.locator('[data-start-over]').click();
  assert((await game()).confirmed.length === 2, 'asking to start over erases nothing yet');
  await page.locator('[data-confirm-start-over]').click();
  g = await game();
  assert(g.confirmed.length === 0 && g.chapter === 'hub' && g.hintsUsed === 0, 'start over clears progress and returns to the ring');
  assert(g.settings.humanGloss === true, 'start over keeps the settings');
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
  assert(stored && Object.keys(stored.nodes).length === 0 && stored.chapter === 'hub', 'the stored save is cleared too');

  // ---- 10. a locked chapter named in the URL is refused ----
  await page.goto('about:blank');
  await page.goto(`${url}#key`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder));
  await page.waitForTimeout(200);
  g = await game();
  assert(g.chapter === 'hub', 'a locked chapter in the URL does not open');
  assert((await page.evaluate(() => window.location.hash)) === '#hub', 'the hash is put back to where the player is');

  // ---- 11. no sideways scrolling at phone width ----
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of ['#hub', '#arrival']) {
    await page.evaluate((h) => window.__finder.dispatch({ type: 'chapter.enter', chapter: h.slice(1) }), hash);
    await page.waitForTimeout(150);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(wide <= 1, `${hash} at 390 px wide scrolls sideways by ${wide} px`);
  }

  // ---- 12. without the flag there are no test checkers ----
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder));
  const plain = await page.evaluate(async () => {
    try {
      await window.__finder.dispatch({ type: 'deduction.propose', id: 'arrival.purpose', answer: 'correct' });
      return 'accepted';
    } catch (e) {
      return String(e.message);
    }
  });
  assert(/no checker/.test(plain), `without ?testcheckers=1 the test checkers are off (${plain})`);

  log('shell: ring, gating, wrong answers, hints, codex link, persistence, settings, start over, URL gating and phone width all hold');
  record({
    id: 'game.shell',
    claim: 'The game shell works end to end through the same commands a player uses: confirming the first Arrival deduction opens The Key, the codex shows the entry and its How it\'s checked link lands on the right row, progress and settings survive a reload, and Start over clears the progress.',
    measured: 'ring of 10 chapters with only Arrival open at the start; arrival.purpose confirmed with the test checker (wrong attempt kept); The Key opened, player and pictures stayed locked; hint tiers revealed one at a time; codex link /checked/#row-1 scrolls to the heat-source row; reload kept the deduction, attempts, hint count, chapter and the human gloss setting; save.reset emptied the stored save; a locked chapter in the URL was refused; no sideways scroll at 390 px',
    expected: 'the behaviour specified in docs/plans/M3_specs/step1-shell-graph-codex.md',
    tolerance: 'exact (interface behaviour, with test checkers: the real checkers arrive in steps 3 to 6)',
    pass: true,
  });
}
