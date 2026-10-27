// node tools/harness/free-look.mjs [--chapters hub,key,spot] [--sizes 1440x900,390x844] [--open] [--wait <ms>] [--out <folder>]
//
// A quick look at Free play (M7): from a save with every deduction confirmed (the accessibility test's seedSave),
// enters each chapter through the command bus at each window size and screenshots it, so an art or layout change
// to the hub ring or an instrument frame can be seen in seconds. --open leaves every deduction unconfirmed
// (a fresh player's ring: only the first chapters open). Reduced motion is on. Output: review/archive/<stamp>-free/
// (never the critic's inbox). Console errors fail the run.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT, startDevServer } from './serve.mjs';
import { seedSave } from '../../tests/browser/a11y.browser.mjs';
import { stamp } from '../../tests/browser/slice.browser.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const chapters = arg('--chapters', 'hub').split(',');
const sizes = arg('--sizes', '1440x900').split(',').map((s) => s.split('x').map(Number));
const open = process.argv.includes('--open');
const wait = Number(arg('--wait', '2500'));
const outDir = arg('--out', join(ROOT, 'review', 'archive', `${stamp()}-free`));
mkdirSync(outDir, { recursive: true });

const server = await startDevServer();
const browser = await launchChrome();
let shots = 0;
let failed = false;
try {
  for (const [w, h] of sizes) {
    let opened = null;
    for (let t = 0; t < 3 && !opened; t++) opened = await openPage(browser, `${server.url}/play/`, { width: w, height: h }).catch((e) => (t === 2 ? Promise.reject(e) : null));
    const { page, errors, context } = opened;
    const all = open ? await (async () => {
      await page.goto(`${server.url}/play/`, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
      return page.evaluate(async () => (await import('/src/game/graph.ts')).ALL_NODES.map((n) => n.id));
    })() : [];
    await seedSave(page, server.url, { openNodes: all });
    for (const ch of chapters) {
      await page.evaluate((c) => window.__finder.dispatch({ type: 'chapter.enter', chapter: c }), ch);
      await page.waitForTimeout(wait);
      const file = `${ch}-${w}x${h}.png`;
      await page.screenshot({ path: join(outDir, file) });
      shots++;
      console.log(file);
    }
    if (errors.length) {
      failed = true;
      console.error(errors.join('\n'));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`[free-look] ${shots} shots in ${outDir}`);
if (failed) process.exit(1);
