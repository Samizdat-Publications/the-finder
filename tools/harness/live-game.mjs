// Live check of the deployed GAME (/play/): loads it in installed Chrome with no harness handle, waits
// for the ring, enters Arrival through the real interface (clicks), waits for the encounter scene, and
// screenshots both into review/inbox/live-game-<timestamp>/. Fails on any console error or failed request.
// Usage: node tools/harness/live-game.mjs [https://the-finder.stewartgregerson.workers.dev]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT } from './serve.mjs';

const base = (process.argv[2] ?? 'https://the-finder.stewartgregerson.workers.dev').replace(/\/$/, '');
const out = join(ROOT, 'review', 'inbox', `live-game-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
mkdirSync(out, { recursive: true });

const browser = await launchChrome();
const { page, errors, context } = await openPage(browser, `${base}/play/`);
page.setDefaultTimeout(60_000);
let failed = false;
try {
  await page.waitForSelector('[data-tour-start]');
  await page.screenshot({ path: join(out, 'ring.png') });
  const leaked = await page.evaluate(() => 'window.__finder' in globalThis && Boolean(window.__finder));
  if (leaked) throw new Error('the harness handle is present on the plain game page');
  await page.getByRole('button', { name: /Arrival/ }).first().click();
  await page.waitForSelector('[data-instrument="arrival"]');
  await page.waitForTimeout(4000); // let the scene load and the camera settle
  await page.screenshot({ path: join(out, 'arrival.png') });
} catch (e) {
  failed = true;
  console.log(`FAIL: ${e instanceof Error ? e.message : e}`);
} finally {
  await context.close();
  await browser.close();
}
if (errors.length) {
  failed = true;
  console.log(`console errors:\n${errors.join('\n')}`);
}
console.log(`${failed ? 'FAIL' : 'PASS'}  live game on ${base}; screenshots in ${out}`);
process.exitCode = failed ? 1 : 0;
