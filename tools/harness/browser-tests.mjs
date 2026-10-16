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
const failures = [];
const flaky = [];

// One attempt of one test file in a fresh browser context. Returns null on a pass, or the error text.
async function attempt(file, name) {
  // The dev server occasionally drops the first connection of a page load (net::ERR_CONNECTION_RESET,
  // seen in M4): open the page up to three times before calling it a failed attempt, and never let a
  // failed open crash the whole run.
  let opened = null;
  let openError = '';
  for (let i = 0; i < 3 && !opened; i++) {
    try {
      opened = await openPage(browser, `${server.url}/`);
    } catch (e) {
      openError = e instanceof Error ? e.message : String(e);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!opened) return `could not open the page three times: ${openError}`;
  const { page, errors, context } = opened;
  page.setDefaultTimeout(120_000);
  const log = (line) => console.log(`  [${name}] ${line}`);
  try {
    const mod = await import(pathToFileURL(join(TEST_DIR, file)).href);
    await mod.default({ page, baseUrl: server.url, record, assert, log });
    if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);
    return null;
  } catch (e) {
    return e instanceof Error ? e.stack ?? e.message : String(e);
  } finally {
    await context.close();
  }
}

try {
  for (const file of files) {
    const name = file.replace(/\.browser\.mjs$/, '');
    const started = Date.now();
    const first = await attempt(file, name);
    if (first === null) {
      console.log(`PASS  ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      continue;
    }
    // One retry, reported loudly: a test that passes only on retry is FLAKY, never silently green.
    console.log(`RETRY ${name}: first attempt failed: ${first.split('\n')[0]}`);
    const second = await attempt(file, name);
    if (second === null) {
      flaky.push({ name, error: first });
      console.log(`PASS  ${name} on retry (FLAKY) (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    } else {
      failed++;
      failures.push({ name, error: second });
      console.log(`FAIL  ${name}: ${second}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
mkdirSync(join(ROOT, 'harness', 'out'), { recursive: true });
writeFileSync(join(ROOT, 'harness', 'out', 'browser-tests.json'), JSON.stringify({ failures, flaky }, null, 2));
// Repeat the outcome at the end so a truncated log tail still shows it.
for (const f of flaky) console.log(`FLAKY ${f.name}: passed on retry; first failure: ${f.error.split('\n')[0]}`);
for (const f of failures) console.log(`FAIL  ${f.name}: ${f.error.split('\n')[0]}`);
console.log(`[browser-tests] ${files.length - failed} of ${files.length} passed${flaky.length ? `, ${flaky.length} flaky` : ''}`);
process.exitCode = failed ? 1 : 0;
