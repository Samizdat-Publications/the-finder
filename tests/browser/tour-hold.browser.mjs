// The tour's click-hold (src/tour/Guide.tsx holdInput). From a save with the deductions before The Player's first
// sound confirmed, the tour goes to the "Listen" stop and presses "Do it for me", which drops the needle and waits
// for the first sound (up to 20 s). While it runs, REAL mouse clicks (page.mouse.click, trusted events) land on the
// Lift button and on the other direction button, outside the guide. They must change nothing: the needle stays
// down, the direction stays clockwise, the action still confirms the deduction, and the page has the class
// tour-acting while it runs and not after. Once it is over, the same real click on the other direction works (the
// hold is gone). Console errors fail the test (the harness). Id: bot.tourHold.
const SAVE_KEY = 'finder.save.v1';
const DONE = [
  'arrival.purpose', 'arrival.heat', 'arrival.madeNotMined', 'arrival.fuelAge',
  'key.binary', 'key.unit', 'key.timesNotLengths',
  'player.speed', 'player.direction', 'player.start',
];

/** A real mouse click at the centre of the element (a trusted event, as a child's click would be). */
async function realClick(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export default async function run({ page, baseUrl, record, assert, log }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ([key, ids]) => {
      if (sessionStorage.getItem('tour-hold-seeded')) return;
      sessionStorage.setItem('tour-hold-seeded', '1');
      const done = { confirmed: true, attempts: [], hints: 0 };
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          nodes: Object.fromEntries(ids.map((id) => [id, done])),
          chapter: 'hub',
          settings: { humanGloss: false, masterVolume: 0, reducedMotion: false, soundCaptions: false },
          seed: 'tour-hold-test',
        }),
      );
    },
    [SAVE_KEY, DONE],
  );
  await page.goto(`${baseUrl}/play/?tour=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const step = await page.evaluate(async () => {
    const i = (await import('/src/tour/script.ts')).STOPS.findIndex((s) => s.id === 'player.firstSound');
    await window.__finder.dispatch({ type: 'tour.goto', step: i });
    return i;
  });
  assert(step > 0, 'the Listen stop is in the script');
  const guide = `.guide[data-tour-step="${step}"]`;
  await page.waitForSelector(`${guide} [data-tour-act]`, { state: 'visible', timeout: 60_000 });
  await page.waitForSelector('.playerinst[data-player-ready="true"]', { timeout: 60_000 });
  const acting = () => page.evaluate(() => document.documentElement.classList.contains('tour-acting'));
  assert(!(await acting()), 'before the action the page is not in tour-acting');

  await page.locator(`${guide} [data-tour-act]`).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('tour-acting'), null, { timeout: 5000 });
  // the guide drops the needle at the lead-in, clockwise: wait until it is down
  await page.waitForFunction(
    () => document.querySelector('button.pdir.on[data-direction="cw"]') && !document.querySelector('button[data-lift]')?.disabled,
    null,
    { timeout: 60_000, polling: 50 },
  );
  const lift = () => page.evaluate(() => !document.querySelector('button[data-lift]')?.disabled);
  const cw = () => page.evaluate(() => document.querySelector('button.pdir[data-direction="cw"]')?.getAttribute('aria-pressed') === 'true');
  assert(await acting(), 'while the guide works the page has the class tour-acting');
  const confirmedNow = () => page.evaluate(() => Boolean(window.__finder.state().game.nodes['player.firstSound']?.confirmed));
  const stillRunning = !(await confirmedNow());
  assert(stillRunning, 'the first sound is not yet confirmed when the real clicks are sent (the action is still running)');

  await realClick(page, 'button[data-lift]');
  await realClick(page, 'button.pdir[data-direction="ccw"]');
  await page.waitForTimeout(700);
  assert(await lift(), 'a real click on Lift did not lift the needle while the guide worked');
  assert(await cw(), 'a real click on the other direction did not turn the platter while the guide worked');
  assert(await acting() || (await confirmedNow()), 'the hold stayed on until the action finished');

  await page.waitForFunction(
    () => window.__finder.state().game.nodes['player.firstSound']?.confirmed && !document.documentElement.classList.contains('tour-acting'),
    null,
    { timeout: 120_000, polling: 250 },
  );
  assert(!(await page.$(`${guide} .g-error`)), 'the action ended without an error');
  assert(await confirmedNow(), 'the guide still confirmed the first sound after the clicks were held back');
  assert(!(await acting()), 'after the action the page is not in tour-acting');

  // the hold is gone: the same real click now works (the guide lifted the needle at its end)
  await page.waitForFunction(() => document.querySelector('button.pdir[data-direction="ccw"]') && !document.querySelector('button.pdir[data-direction="ccw"]').disabled, null, { timeout: 10_000 });
  await realClick(page, 'button.pdir[data-direction="ccw"]');
  await page.waitForFunction(() => document.querySelector('button.pdir[data-direction="ccw"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
  log('real clicks held during the action, accepted after it');

  record({
    id: 'bot.tourHold',
    claim: 'While the tour guide runs "Do it for me", real (trusted) clicks outside the guide are held back: the needle stays down, the direction stays clockwise, the deduction still confirms, the page carries tour-acting during the action and not after, and the same click works once it is over.',
    measured: 'real mouse clicks on Lift and on the other direction changed nothing during the action; the first sound confirmed; tour-acting cleared; a real click on the other direction worked afterwards',
    expected: 'no state change while acting, confirmation, class cleared, clicks accepted afterwards',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });
}
