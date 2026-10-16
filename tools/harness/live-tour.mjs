// Live tour check: opens the deployed site's landing page, presses "Start the guided tour", walks the first
// stops with Next and "Do it for me" through Arrival and The Key (no harness handle on the live site, so this
// proves the tour's own buttons work there), and screenshots each stop into review/archive/live-tour-<stamp>/.
// Usage: node tools/harness/live-tour.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT } from './serve.mjs';

const base = process.argv[2] ?? 'https://the-finder.stewartgregerson.workers.dev';
const out = join(ROOT, 'review', 'archive', `live-tour-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`);
mkdirSync(out, { recursive: true });

const browser = await launchChrome();
const { page, errors, context } = await openPage(browser, `${base}/`);
await page.setViewportSize({ width: 1440, height: 900 });
page.setDefaultTimeout(90_000);
let failed = false;
const step = () => page.locator('.guide[data-tour-step]').first().getAttribute('data-tour-step');
try {
  await page.getByRole('link', { name: /Start the guided tour/ }).click();
  await page.waitForSelector('.guide[data-tour-step="0"]');
  await page.screenshot({ path: join(out, '00.png') });
  // Walk to the end of The Key: story stops take Next; do stops take Do it for me, then Next.
  for (let i = 0; i < 12; i++) {
    const n = Number(await step());
    const act = page.locator('[data-tour-act]');
    if (await act.count()) {
      await act.first().click();
      await page.waitForSelector('[data-tour-next]:not([disabled])', { timeout: 90_000 });
    }
    await page.screenshot({ path: join(out, `${String(n).padStart(2, '0')}-done.png`) });
    await page.locator('[data-tour-next]').click();
    await page.waitForFunction((n) => document.querySelector('.guide[data-tour-step]')?.getAttribute('data-tour-step') !== String(n), n);
  }
  const at = await step();
  if (at !== '12') throw new Error(`expected to reach step 12, at ${at}`);
  if (errors.length) throw new Error(`console errors: ${errors.join(' | ')}`);
  console.log(`PASS  live tour on ${base}: 12 stops through The Key; screenshots in ${out}`);
} catch (e) {
  failed = true;
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => undefined);
  console.log(`FAIL  live tour: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await context.close();
  await browser.close();
}
process.exit(failed ? 1 : 0);
