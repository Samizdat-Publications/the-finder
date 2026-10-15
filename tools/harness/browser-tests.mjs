// Browser tests: runs every tests/browser/*.browser.mjs in the installed Chrome against the Vite DEV
// server, so a test can import any source module by URL inside page.evaluate, for example
//   await page.evaluate(async () => (await import('/src/dsp/decode.ts')).decodeFrame(...))
//
// A test file default-exports `async function run({ page, baseUrl, record, assert, log })`:
//   page     a Playwright page already on `${baseUrl}/` (the landing page)
//   record   writes a check record for How it's checked (same shape as tests/support/record.ts)
//   assert   assert(condition, message): throws on failure
//   log      prints a line under the test's name
// It throws (or a failed assert throws) to fail. Console errors on the page also fail the test.
// Usage: node tools/harness/browser-tests.mjs [name-filter]. Exit code 1 if any test failed.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT, startDevServer } from './serve.mjs';

const TEST_DIR = join(ROOT, 'tests', 'browser');
const CHECKS_DIR = join(ROOT, 'harness', 'out', 'checks');
const filter = process.argv[2] ?? '';

let files = [];
try {
  files = readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.browser.mjs') && f.includes(filter))
    .sort();
} catch {
  // no tests folder yet
}
if (files.length === 0) {
  console.log('[browser-tests] no browser tests found (tests/browser/*.browser.mjs)');
  process.exit(0);
}

function record(rec) {
  for (const k of ['id', 'claim', 'measured', 'expected', 'tolerance', 'pass']) {
    if (!(k in rec)) throw new Error(`record(): missing field ${k}`);
  }
  mkdirSync(CHECKS_DIR, { recursive: true });
  const safe = rec.id.replace(/[^A-Za-z0-9._-]/g, '_');
  writeFileSync(join(CHECKS_DIR, `${safe}.json`), JSON.stringify({ ...rec, at: new Date().toISOString() }, null, 2));
}

function assert(cond, message) {
  if (!cond) throw new Error(`assertion failed: ${message}`);
}

const server = await startDevServer();
const browser = await launchChrome();
let failed = 0;
try {
  for (const file of files) {
    const name = file.replace(/\.browser\.mjs$/, '');
    const started = Date.now();
    const { page, errors, context } = await openPage(browser, `${server.url}/`);
    page.setDefaultTimeout(120_000);
    const log = (line) => console.log(`  [${name}] ${line}`);
    try {
      const mod = await import(pathToFileURL(join(TEST_DIR, file)).href);
      await mod.default({ page, baseUrl: server.url, record, assert, log });
      if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);
      console.log(`PASS  ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${name}: ${e instanceof Error ? e.stack ?? e.message : e}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`[browser-tests] ${files.length - failed} of ${files.length} passed`);
process.exitCode = failed ? 1 : 0;
