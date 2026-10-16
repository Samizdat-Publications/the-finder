// The tour bot (docs/plans/tour_specs/T2-actions.md; D-A33). From a fresh save (storage cleared, as freshStart
// does), /play/?tour=1 at 1440 x 900, using ONLY the guide's own buttons: at each stop it screenshots the guide,
// presses "Do it for me" or "Show me" ([data-tour-act]) on a do or watch stop, waits until the stop's deduction
// is confirmed (read through window.__finder.state(), never written), screenshots again, and presses Next
// ([data-tour-next]; "Finish" on the last stop). It asserts the guide's step counter ([data-tour-step]) went
// through every stop in order and that every deduction in the script is confirmed at the end. Captures go to
// review/inbox/<timestamp>-tour/frames/ with manifest.json and shots.txt. Console errors fail the test (the
// harness). Id: bot.tour.
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { freshStart, reviewFolder, stamp } from './slice.browser.mjs';

/** Longest a single "Do it for me" may take, ms: the album develops 156 frames (up to 300 s, T2 spec) plus margin. */
const ACT_MS = 420_000;

/** The guide panel showing step i (the column on a chapter, the card on the hub). */
const guideAt = (i) => `.guide[data-tour-step="${i}"]`;

export default async function run({ page, baseUrl, record, assert, log }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const t0 = Date.now();
  await freshStart(page, baseUrl, '?tour=1');
  const stops = await page.evaluate(async () => (await import('/src/tour/script.ts')).STOPS.map((s) => ({ id: s.id, kind: s.kind, node: s.node ?? null, title: s.title, chapter: s.chapter })));
  const nodes = stops.filter((s) => s.node).map((s) => s.node);
  log(`${stops.length} stops, ${nodes.length} deductions`);
  const review = reviewFolder(join(ROOT, 'review', 'inbox', `${stamp()}-tour`));
  const shot = (name, shows, did) => review.shot(page, name, shows, did);

  const seen = [];
  const timing = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    await page.waitForSelector(guideAt(i), { state: 'visible', timeout: 60_000 });
    const stepNow = Number(await page.locator('.guide[data-tour-step]').first().getAttribute('data-tour-step'));
    assert(stepNow === i, `the guide shows step ${i} (${s.id}); it shows ${stepNow}`);
    seen.push(i);
    await page.waitForTimeout(400);
    const n = String(i + 1).padStart(2, '0');
    const tag = s.id.replace(/\./g, '-');
    await shot(`${n}-${tag}-before`, `The guide at step ${i + 1} of ${stops.length}, "${s.title}" (${s.kind}).`, i === 0 ? 'Opened the game with the guided tour on a fresh save.' : 'Pressed Next.');
    if (s.kind !== 'story') {
      const a0 = Date.now();
      const act = page.locator(`${guideAt(i)} [data-tour-act]`);
      await act.waitFor({ state: 'visible', timeout: 30_000 });
      await act.click();
      // Done when the node is confirmed and the guide is no longer working; a shown error fails at once.
      const outcome = await page.waitForFunction(
        ([node, sel]) => {
          const g = window.__finder.state().game;
          const err = document.querySelector(`${sel} .g-error`);
          if (err) return { error: err.textContent };
          const busy = document.querySelector(`${sel} [data-tour-act][disabled]`);
          return g.nodes[node]?.confirmed && !busy && !document.querySelector('[data-moment]') ? { ok: true } : null;
        },
        [s.node, guideAt(i)],
        { timeout: ACT_MS, polling: 250 },
      ).then((h) => h.jsonValue());
      const secs = (Date.now() - a0) / 1000;
      timing.push({ id: s.id, ok: Boolean(outcome.ok), s: secs });
      assert(outcome.ok, `${s.id}: Do it for me confirms it (${outcome.error ?? ''})`);
      log(`${s.id}: confirmed in ${secs.toFixed(1)} s`);
      await page.waitForSelector(`${guideAt(i)} [data-learned]`, { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      await shot(`${n}-${tag}-after`, `Step ${i + 1}, "${s.title}", done by the guide: the instrument shows the confirmed result and the guide says what we learned.`, `Pressed ${s.kind === 'watch' ? 'Show me' : 'Do it for me'} and waited.`);
    }
    const next = page.locator(`${guideAt(i)} [data-tour-next]`);
    await next.waitFor({ state: 'visible', timeout: 10_000 });
    assert(await next.isEnabled(), `${s.id}: Next is enabled once the stop is done`);
    await next.click();
  }
  await page.waitForTimeout(800);
  const g = await page.evaluate(() => window.__finder.state().game);
  const missing = nodes.filter((id) => !g.confirmed.includes(id));
  assert(missing.length === 0, `every deduction in the script is confirmed (missing: ${missing.join(', ')})`);
  assert(seen.length === stops.length && seen.every((v, k) => v === k), `the step counter went through every stop in order (${seen.length} of ${stops.length})`);
  assert(g.tour.on === false, 'Finish leaves the tour');
  await shot('99-finished', 'After Finish: the tour is closed and the game is back on the ring with every chapter done.', 'Pressed Finish on the last stop.');
  const seconds = (Date.now() - t0) / 1000;
  for (const t of timing) log(`timing ${t.id} ${t.ok ? 'ok' : 'FAIL'} ${t.s.toFixed(1)} s`);
  log(`${review.shots.length} screenshots in ${review.dir}`);
  record({
    id: 'bot.tour',
    claim: 'A bot completes the guided tour from a fresh save using only the guide\'s buttons (Do it for me, Show me, Next): every do and watch stop is done by the guide\'s own action through the instruments and the command bus, and every deduction in the script confirms.',
    measured: `${seen.length} of ${stops.length} stops passed in order; ${nodes.length - missing.length} of ${nodes.length} deductions confirmed; ${seconds.toFixed(0)} s (slowest: ${[...timing].sort((a, b) => b.s - a.s).slice(0, 3).map((t) => `${t.id} ${t.s.toFixed(0)} s`).join(', ')})`,
    expected: `${stops.length} stops and ${nodes.length} deductions (src/tour/script.ts STOPS), no console errors`,
    tolerance: 'exact (interface behaviour)',
    pass: missing.length === 0 && seen.length === stops.length,
  });
}
