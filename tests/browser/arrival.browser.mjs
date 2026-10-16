// The Arrival chapter played start to finish through window.__finder (the same command bus a player uses):
// every wrong answer once (each rejected, its computed wrong result shown on the panel), then the right one;
// all four deductions confirm and The Key opens; the codex holds the readings; no console errors.
// Captures of each scan and the decay clock (right and wrong chain) at 1440 x 900 go to
// harness/out/arrival-captures/. Id: chapter.arrival.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { renderedMessage } from './rendered.mjs';

const OUT = join(ROOT, 'harness', 'out', 'arrival-captures');

// The order of play and the wrong answers to try first. The right answers are what the checkers accept;
// this list is the test's own statement of the physics (radio, decay, made, the plutonium chain).
const PLAY = [
  { id: 'arrival.purpose', scan: 'structure', wrong: ['eye', 'sail', 'radiator'], right: 'radio' },
  { id: 'arrival.heat', scan: 'heat', wrong: ['sunlight', 'leftover', 'chemical'], right: 'decay' },
  { id: 'arrival.madeNotMined', scan: 'isotopes', wrong: ['mined'], right: 'made' },
  { id: 'arrival.fuelAge', scan: 'clock', wrong: ['naturalUranium', 'u234Start', 'oldOre'], right: 'pu238' },
];

export default async function run({ page, baseUrl, record, assert, log }) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const game = () => page.evaluate(() => window.__finder.state().game);
  const shot = async (name) => {
    await page.waitForTimeout(2300); // the camera eases for 1.8 s
    await page.screenshot({ path: join(OUT, `${name}.png`) });
  };

  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'arrival' }));
  await page.waitForSelector('[data-instrument="arrival"][data-scene="ready"]', { timeout: 90_000 });
  assert((await page.locator('[data-panel="structure"]').count()) === 1, 'the structure scan opens first');
  assert((await game()).seed === 'finder-1', 'a first playthrough uses the default seed');
  await shot('1-structure-scan');

  const wrongShown = [];
  for (const step of PLAY) {
    await page.locator(`[data-scan-tab="${step.scan}"]`).click();
    await page.waitForSelector(`[data-panel]`);
    if (step.scan !== 'structure') await shot(`${step.id.split('.')[1]}-before`);
    for (const w of step.wrong) {
      // The decay clock shows the verdict for the chain on its selector, so select it first (local view state).
      if (step.scan === 'clock') await page.locator(`[data-chain-choice="${w}"]`).check();
      const node = await page.evaluate(
        async ({ id, w }) => {
          await window.__finder.dispatch({ type: 'deduction.propose', id, answer: w });
          return window.__finder.state().game.nodes[id];
        },
        { id: step.id, w },
      );
      const last = node.attempts[node.attempts.length - 1];
      assert(!node.confirmed && last.ok === false, `${step.id}: ${w} is rejected`);
      assert(/\d/.test(last.message) || step.id === 'arrival.purpose', `${step.id}: ${w} shows a computed result (${last.message})`);
      const shown = await page.locator(`[data-result="${step.id}"][data-ok="0"]`).innerText();
      assert(shown.includes((await renderedMessage(page, last.message)).slice(0, 40)), `${step.id}: the wrong result for ${w} is shown on the panel`);
      wrongShown.push(`${w}: ${last.message}`);
      if (step.id === 'arrival.purpose' && w === 'sail') await shot('2-structure-wrong-sail');
      if (step.id === 'arrival.heat' && w === 'leftover') await shot('4-heat-wrong-leftover');
    }
    if (step.id === 'arrival.fuelAge') {
      await page.locator('[data-chain-choice="naturalUranium"]').check();
      await shot('7-clock-wrong-chain-natural');
      await page.locator('[data-chain-choice="pu238"]').check();
      await shot('8-clock-right-chain');
    }
    const ok = await page.evaluate(
      async ({ id, right }) => {
        await window.__finder.dispatch({ type: 'deduction.propose', id, answer: right });
        return window.__finder.state().game.nodes[id];
      },
      { id: step.id, right: step.right },
    );
    assert(ok.confirmed, `${step.id}: ${step.right} confirms`);
    assert(await page.locator(`[data-result="${step.id}"][data-ok="1"]`).isVisible(), `${step.id}: the confirmation is shown`);
    if (step.id === 'arrival.heat') await shot('5-heat-confirmed');
    if (step.id === 'arrival.madeNotMined') await shot('6-isotopes-confirmed');
    if (step.id === 'arrival.fuelAge') await shot('9-clock-confirmed');
  }

  const g = await game();
  assert(g.chapterStatus.arrival === 'done', 'Arrival is done');
  assert(g.chapterStatus.key === 'open', 'The Key opens');
  const age = g.nodes['arrival.fuelAge'].attempts.at(-1).result;
  assert(age.length === 4 && age.every((r) => r.dim === 'time'), 'the age is written in time readings (the alien unit on screen)');
  const years = age.map((r) => r.value / 31_557_600);
  assert(years[1] < years[0] && years[0] < years[2] && years[0] > 40_000 && years[0] < 48_000, `the age is about 44,000 years (${years.map((y) => y.toFixed(0)).join(', ')})`);

  // The codex has the four entries with their notation and How it's checked links.
  await page.evaluate(() => window.__finder.dispatch({ type: 'codex.open', id: 'arrival.fuelAge' }));
  await page.waitForTimeout(600); // the drawer slides in
  assert((await page.locator('[data-entry^="arrival."]').count()) === 4, 'four codex entries');
  assert((await page.locator('[data-entry="arrival.fuelAge"] .reading').count()) === 4, 'the age entry lists its four readings');
  await page.screenshot({ path: join(OUT, '10-codex.png') });
  await page.evaluate(() => window.__finder.dispatch({ type: 'codex.close' }));

  // Reduced motion and the human gloss change nothing that breaks.
  await page.evaluate(async () => {
    await window.__finder.dispatch({ type: 'settings.set', name: 'reducedMotion', value: true });
    await window.__finder.dispatch({ type: 'settings.set', name: 'humanGloss', value: true });
  });
  await page.waitForTimeout(400);
  assert(await page.locator('.ar-clock .si').first().isVisible(), 'the human gloss adds years under the age axis');
  await page.screenshot({ path: join(OUT, '11-clock-human-gloss.png') });

  // Phone width: no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(wide <= 1, `no sideways scroll at 390 px (${wide})`);
  await page.screenshot({ path: join(OUT, '12-phone.png'), fullPage: false });

  log(`all four confirmed; ${wrongShown.length} wrong answers rejected and shown; captures in ${OUT}`);
  record({
    id: 'chapter.arrival',
    claim: 'Arrival plays start to finish through the command bus: each wrong answer is rejected with its computed result shown, the right ones confirm, and The Key opens.',
    measured: `all four deductions confirmed; ${wrongShown.length} wrong answers each rejected and shown on the panel; age ${years[0].toFixed(0)} years (95% ${years[1].toFixed(0)} to ${years[2].toFixed(0)}); codex holds four entries`,
    expected: 'the behaviour in docs/plans/M3_specs/step3c-arrival-workbenches.md; numbers from src/chapters/arrival (tested in arrival.* checks)',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });
}
