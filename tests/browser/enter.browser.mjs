// Entering a chapter never freezes the page (M4 step 7e, from the M3/M4 QA audit): from a save with The Key
// confirmed, at 1440 x 900, each of The Map, The Spot and The Trail is entered through the command bus in a
// fresh page load, and a PerformanceObserver for long tasks records every main-thread task from the moment of
// entering until the instrument says it is ready plus a second of quiet. The bound is 100 ms per task (the
// spec; RAIL's 100 ms response budget). The page boot before entering is not counted (it is the same for every
// chapter and has its own load). Records the GPU adapter (WebGL's unmasked renderer) and the CPU, since the
// numbers depend on the machine. Set ENTER_MEASURE_ONLY=1 to log without asserting (the "before" numbers).
// Id: perf.enter.
import { cpus } from 'node:os';

const SAVE_KEY = 'finder.save.v1';
const SEED = 'finder-1';
/** The longest main-thread task allowed while entering, ms (spec step 7e section 4; RAIL response budget). */
const BOUND_MS = 100;
const done = (ids) => Object.fromEntries(ids.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));

const READY = {
  map: () => document.querySelector('[data-map-phase="ready"]') !== null,
  spot: () => document.querySelector('[data-instrument="spot"]') !== null,
  trail: () => document.querySelector('[data-trail-ready="true"]') !== null && document.querySelector('[data-measuring]') === null,
};

async function enterOnce(page, baseUrl, chapter) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.evaluate(
    ([key, nodes, seed]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, nodes, chapter: 'hub', settings: { humanGloss: false, masterVolume: 0, reducedMotion: true, soundCaptions: false }, seed }));
    },
    [SAVE_KEY, done(['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths']), SEED],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  await page.waitForTimeout(1500); // let the page boot settle: its own tasks are not this measurement
  const t0 = await page.evaluate(async (ch) => {
    const t = performance.now();
    await window.__finder.dispatch({ type: 'chapter.enter', chapter: ch });
    return t;
  }, chapter);
  const src = READY[chapter].toString();
  await page.waitForFunction(`(${src})()`, null, { timeout: 60_000 });
  const tReady = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1000);
  const tasks = await page.evaluate((t) => window.__longTasks.filter((e) => e.start >= t - 1).map((e) => ({ ms: Math.round(e.ms), at: Math.round(e.start - t) })), t0);
  const boot = await page.evaluate((t) => window.__longTasks.filter((e) => e.start < t - 1).reduce((m, e) => Math.max(m, Math.round(e.ms)), 0), t0);
  return { chapter, readyMs: Math.round(tReady - t0), tasks, longest: tasks.reduce((m, e) => Math.max(m, e.ms), 0), boot };
}

export default async function run({ page, baseUrl, record, assert, log }) {
  const measureOnly = process.env.ENTER_MEASURE_ONLY === '1';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longTasks.push({ ms: e.duration, start: e.startTime }))).observe({ type: 'longtask', buffered: true });
    } catch {
      // no long-task timing in this browser
    }
  });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no WebGL2';
  });
  const cpu = `${cpus()[0]?.model.trim() ?? 'unknown'} (${cpus().length} threads)`;
  log(`GPU: ${gpu}; CPU: ${cpu}`);
  const out = [];
  for (const ch of ['map', 'spot', 'trail']) {
    const r = await enterOnce(page, baseUrl, ch);
    out.push(r);
    log(`${ch}: ready ${r.readyMs} ms after entering; long tasks ${r.tasks.map((t) => `${t.ms} ms at +${t.at}`).join(', ') || 'none'}; longest ${r.longest} ms (page boot before entering: longest ${r.boot} ms, not counted)`);
    if (!measureOnly) assert(r.longest <= BOUND_MS, `entering ${ch}: no main-thread task over ${BOUND_MS} ms (longest ${r.longest} ms)`);
  }
  record({
    id: 'perf.enter',
    claim: 'Entering The Map, The Spot or The Trail never freezes the page: the epoch model\'s heavy parts (the identification, the trail, the spot\'s sweep table) are computed in a Worker behind the instrument\'s "measuring" state, so no main-thread task is longer than 100 ms from entering until the instrument is ready',
    measured: `${out.map((r) => `${r.chapter}: longest task ${r.longest} ms, ready in ${r.readyMs} ms`).join('; ')}. GPU ${gpu}; CPU ${cpu}`,
    expected: `no long task over ${BOUND_MS} ms at 1440 x 900 (spec M4 step 7e section 4; the RAIL model's 100 ms response budget)`,
    tolerance: `${BOUND_MS} ms per task`,
    pass: !measureOnly && out.every((r) => r.longest <= BOUND_MS),
  });
}
