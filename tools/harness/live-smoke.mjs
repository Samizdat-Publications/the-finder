// Live smoke test of a deployed build: opens /play/bench/?harness=1 on the given site in installed Chrome,
// decodes L000 and R072 through the command bus, composes image 12 in colour, loads side 1 and drops the
// needle on music 7, then screenshots each state into review/inbox/live-<timestamp>/. Fails on any
// console error. Usage: node tools/harness/live-smoke.mjs [https://the-finder.stewartgregerson.workers.dev]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT } from './serve.mjs';

const base = (process.argv[2] ?? 'https://the-finder.stewartgregerson.workers.dev').replace(/\/$/, '');
const out = join(ROOT, 'review', 'inbox', `live-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
mkdirSync(out, { recursive: true });

const browser = await launchChrome();
const { page, errors, context } = await openPage(browser, `${base}/play/bench/?harness=1`);
page.setDefaultTimeout(120_000);
const shots = [];
const shot = async (name) => {
  const file = join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  shots.push(file);
};
let failed = false;
try {
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  for (const frame of ['L000', 'R072']) {
    const ms = await page.evaluate(async (fr) => {
      const f = window.__finder;
      const t0 = performance.now();
      await f.dispatch({ type: 'decoder.select', frame: fr });
      await f.dispatch({ type: 'decoder.run', speed: 'fast' });
      await f.waitFor(() => f.state().decoder.status === 'done', 60_000);
      return performance.now() - t0;
    }, frame);
    console.log(`decoded ${frame} on the live site in ${ms.toFixed(0)} ms (fetch included)`);
    await shot(`live_${frame}`);
  }
  await page.evaluate(async () => {
    const f = window.__finder;
    await f.dispatch({ type: 'decoder.select', frame: 'L013' });
    await f.dispatch({ type: 'decoder.composeColour', image: 12 });
    await f.waitFor(() => f.state().decoder.status === 'done', 90_000);
  });
  await shot('live_earth_colour');
  // The production build has no source modules to import, so drop the needle by radius: 100 mm is well
  // inside side 1's music band (146.05 to 60.3 mm), and the bus reports which item it landed on.
  const needle = await page.evaluate(async () => {
    const f = window.__finder;
    await f.dispatch({ type: 'turntable.load', side: 1 });
    await f.dispatch({ type: 'turntable.drop', radiusMm: 100 });
    await f.waitFor(() => Boolean(f.state().turntable?.needle?.itemId), 60_000);
    const t0 = f.state().turntable.needle.timeS;
    await new Promise((r) => setTimeout(r, 3000));
    const n = f.state().turntable.needle;
    return { itemId: n.itemId, region: n.region, t0, t1: n.timeS };
  });
  console.log(`needle at 100 mm: ${JSON.stringify(needle)}`);
  if (!needle.itemId || needle.region !== 'music' || !(needle.t1 > needle.t0)) throw new Error('the needle did not play music');
  await shot('live_turntable_playing');
} catch (e) {
  failed = true;
  console.log(`FAIL: ${e instanceof Error ? e.message : e}`);
} finally {
  await context.close();
  await browser.close();
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ base, shots, errors }, null, 2));
if (errors.length) {
  failed = true;
  console.log(`console errors:\n${errors.join('\n')}`);
}
console.log(`${failed ? 'FAIL' : 'PASS'}  live smoke on ${base}; screenshots in ${out}`);
process.exitCode = failed ? 1 : 0;
