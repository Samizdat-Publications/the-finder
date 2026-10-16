// npm run capture: screenshots of /, /play/ (the game's ring), /play/bench/ and /checked/ at desktop and phone
// size into review/inbox/<timestamp>/ with a manifest.json, plus the game shell in set states (the hub, a
// placeholder workbench, the codex open, settings open; each at both sizes) and the instrument bench in set
// states (driven through window.__finder on /play/?harness=1, the same command bus the interface uses). Builds first when dist/
// is missing.
// Fails (exit 1) on any console error, failed request or page error.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT, startServer } from './serve.mjs';

const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'play', path: '/play/' },
  { name: 'bench', path: '/play/bench/' },
  { name: 'checked', path: '/checked/' },
];
const SIZES = [
  { label: '1440x900', width: 1440, height: 900 },
  { label: '390x844', width: 390, height: 844 },
];

const COVER_LINE_FACTOR = 1.05;
const wait = (page, ms) => page.waitForTimeout(ms);
const done = (page) => page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().decoder.status === 'done', 60000));
/** Instrument states: name, and the steps that set them up through the bus. */
const INSTRUMENT_STATES = [
  {
    name: 'bench_L000_reference',
    run: async (page) => {
      await page.evaluate(async () => {
        await window.__finder.dispatch({ type: 'decoder.select', frame: 'L000' });
        await window.__finder.dispatch({ type: 'decoder.run', speed: 'fast' });
      });
      await done(page);
    },
  },
  {
    name: 'bench_L000_linetime_plus5',
    run: async (page) => {
      await page.evaluate(async (k) => {
        const f = window.__finder;
        const ms = f.state().decoder.bench.lineTimeMs;
        await f.dispatch({ type: 'decoder.select', frame: 'L000' });
        await f.dispatch({ type: 'decoder.setParam', name: 'syncLock', value: false });
        await f.dispatch({ type: 'decoder.setParam', name: 'lineTimeMs', value: ms * k });
        await f.dispatch({ type: 'decoder.run', speed: 'fast' });
      }, COVER_LINE_FACTOR);
      await done(page);
    },
  },
  {
    name: 'bench_R072_titan',
    run: async (page) => {
      await page.evaluate(async () => {
        await window.__finder.dispatch({ type: 'decoder.select', frame: 'R072' });
        await window.__finder.dispatch({ type: 'decoder.run', speed: 'fast' });
      });
      await done(page);
    },
  },
  {
    name: 'bench_earth_colour',
    run: async (page) => {
      await page.evaluate(async () => {
        await window.__finder.dispatch({ type: 'decoder.select', frame: 'L013' });
        await window.__finder.dispatch({ type: 'decoder.composeColour', image: 12 });
      });
      await done(page);
    },
  },
  {
    name: 'bench_turntable_johnny_b_goode',
    run: async (page) => {
      await page.evaluate(() => window.__finder.dispatch({ type: 'turntable.load', side: 1 }));
      await page.getByRole('button', { name: /Johnny B\. Goode/ }).click();
      await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().turntable.needle?.itemId === 'ozma-11', 90000));
      await wait(page, 2500);
    },
  },
];

/** Game shell states (test checkers on, a fresh browser each time so the save is empty). */
const SHELL_URL = '/play/?harness=1&testcheckers=1';
const propose = (page, steps) =>
  page.evaluate(async (list) => {
    const f = window.__finder;
    for (const s of list) {
      try {
        await f.dispatch(s);
      } catch {
        // a refused command is part of the state being shown
      }
    }
  }, steps);
const confirm = (id) => ({ type: 'deduction.propose', id, answer: 'correct' });
const SHELL_STATES = [
  { name: 'shell_hub_fresh', run: async () => {} },
  {
    name: 'shell_hub_progress',
    run: (page) => propose(page, [confirm('arrival.purpose'), confirm('arrival.heat'), confirm('arrival.madeNotMined'), confirm('arrival.fuelAge'), confirm('key.binary')]),
  },
  {
    name: 'shell_workbench_arrival',
    run: (page) =>
      propose(page, [
        { type: 'deduction.propose', id: 'arrival.purpose', answer: 'a telescope' },
        confirm('arrival.purpose'),
        { type: 'hint.request', id: 'arrival.heat' },
        { type: 'hint.request', id: 'arrival.heat' },
        { type: 'chapter.enter', chapter: 'arrival' },
      ]),
  },
  {
    name: 'shell_codex',
    run: (page) =>
      propose(page, [
        { type: 'deduction.propose', id: 'arrival.purpose', answer: 'a telescope' },
        confirm('arrival.purpose'),
        confirm('arrival.heat'),
        confirm('arrival.madeNotMined'),
        { type: 'chapter.enter', chapter: 'key' },
        { type: 'codex.open', id: 'arrival.madeNotMined' },
      ]),
  },
  {
    name: 'shell_settings',
    run: (page) =>
      propose(page, [
        { type: 'chapter.enter', chapter: 'arrival' },
        { type: 'settings.set', name: 'humanGloss', value: true },
        { type: 'settings.panel', open: true },
      ]),
  },
];

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.log('[capture] dist/ is missing: building');
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.log('[capture] ERROR build failed');
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = join(ROOT, 'review', 'inbox', stamp);
mkdirSync(dir, { recursive: true });

const server = await startServer();
const browser = await launchChrome();
const manifest = { created: new Date().toISOString(), server: server.url, shots: [], errors: [] };
let failed = false;
try {
  for (const size of SIZES) {
    for (const p of PAGES) {
      const { page, errors, context } = await openPage(browser, `${server.url}${p.path}`, size);
      await page.waitForTimeout(300);
      const file = `${p.name}_${size.label}.png`;
      await page.screenshot({ path: join(dir, file), fullPage: size.width < 800 });
      manifest.shots.push({ file, path: p.path, viewport: size.label });
      for (const e of errors) manifest.errors.push({ file, error: e });
      await context.close();
      console.log(`[capture] ${file}`);
    }
  }
  // The game shell in set states, at both sizes, through the test handle.
  for (const size of SIZES) {
    for (const st of SHELL_STATES) {
      const { page, errors, context } = await openPage(browser, `${server.url}${SHELL_URL}`, size);
      try {
        await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30000 });
        await st.run(page);
        await wait(page, 500);
      } catch (e) {
        manifest.errors.push({ file: st.name, error: e instanceof Error ? e.message : String(e) });
      }
      const file = `${st.name}_${size.label}.png`;
      // A drawer is fixed to the viewport, so a drawer state is shot as the screen shows it, not full page.
      await page.screenshot({ path: join(dir, file), fullPage: size.width < 800 && !/codex|settings/.test(st.name) });
      manifest.shots.push({ file, path: SHELL_URL, viewport: size.label, state: st.name });
      for (const e of errors) manifest.errors.push({ file, error: e });
      await context.close();
      console.log(`[capture] ${file}`);
    }
  }
  // The instrument bench in set states, through the test handle (never installed without ?harness=1).
  {
    for (const path of ['/play/', '/play/bench/']) {
      const plain = await openPage(browser, `${server.url}${path}`, SIZES[0]);
      await wait(plain.page, 300);
      const leaked = await plain.page.evaluate(() => typeof window.__finder);
      if (leaked !== 'undefined') manifest.errors.push({ file: '', error: `window.__finder exists on ${path} without ?harness=1` });
      for (const e of plain.errors) manifest.errors.push({ file: `${path} (plain)`, error: e });
      await plain.context.close();
    }
    for (const st of INSTRUMENT_STATES) {
      const { page, errors, context } = await openPage(browser, `${server.url}/play/bench/?harness=1`, SIZES[0]);
      try {
        await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30000 });
        await st.run(page);
        await wait(page, 400);
      } catch (e) {
        manifest.errors.push({ file: st.name, error: e instanceof Error ? e.message : String(e) });
      }
      const file = `${st.name}_1440x900.png`;
      await page.screenshot({ path: join(dir, file), fullPage: true });
      manifest.shots.push({ file, path: '/play/bench/?harness=1', viewport: SIZES[0].label, state: st.name });
      for (const e of errors) manifest.errors.push({ file, error: e });
      await context.close();
      console.log(`[capture] ${file}`);
    }
  }
  if (manifest.errors.length) {
    failed = true;
    for (const e of manifest.errors) console.log(`[capture] ERROR ${e.file}: ${e.error}`);
  } else {
    console.log('[capture] no console errors');
  }
} catch (e) {
  failed = true;
  manifest.errors.push({ file: '', error: e instanceof Error ? e.message : String(e) });
  console.log(`[capture] ERROR ${e instanceof Error ? e.message : String(e)}`);
} finally {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
console.log(`[capture] folder: ${dir}`);
process.exit(failed ? 1 : 0);
