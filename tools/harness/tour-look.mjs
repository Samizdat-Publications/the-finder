// node tools/harness/tour-look.mjs [--stops 1,2,3,6] [--sizes 1440x900,1366x768] [--motion] [--click <css>] [--open] [--wait <ms>] [--out <folder>]
//
// A quick look at guided-tour stops (M7): from a save with every deduction confirmed (the accessibility test's
// seedSave), opens the tour at each stop (numbers as the guide shows them, 1 to 65; ids such as arrival.heat
// work too) at each window size and screenshots it, so a layout or art change can be seen in seconds instead of
// a whole tour run. Every do stop shows its confirmed result. Also measures, per shot, what a player would hit:
// labels or text cut off at their box's edge, boxes that scroll, and whether the spotlit control and the guide's
// Next button are inside the window. Reduced motion is on unless --motion. --click clicks that element on every stop
// before the shot (for example a scan tab: '[data-scan-tab=heat]'). --open leaves the chosen stops' deductions (and
// every later one) unconfirmed, so each shows as the player meets it: spotlit, the rest dimmed. Output: review/archive/<stamp>-look/
// (never the critic's inbox), with manifest.json. Console errors fail the run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT, startDevServer } from './serve.mjs';
import { seedSave } from '../../tests/browser/a11y.browser.mjs';
import { stamp } from '../../tests/browser/slice.browser.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const want = arg('--stops', '1,2,3').split(',');
const sizes = arg('--sizes', '1440x900,1366x768').split(',').map((s) => s.split('x').map(Number));
const motion = process.argv.includes('--motion');
const click = arg('--click', '');
const open = process.argv.includes('--open');
/** How long to let each stop settle before the shot, ms (charts that measure first need longer). */
const wait = Number(arg('--wait', motion ? '3500' : '1500'));
const outDir = arg('--out', join(ROOT, 'review', 'archive', `${stamp()}-look`));
mkdirSync(outDir, { recursive: true });

/** Runs in the page: what is cut off, what scrolls, and whether the step's controls are in the window. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const inView = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw;
  };
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
  const scrolls = [...document.querySelectorAll('*')]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0;
    })
    .map((el) => `${name(el)} (${el.scrollHeight - el.clientHeight}px more)`);
  // Text cut off by an ancestor that clips (overflow hidden): its box reaches past the clipping box.
  const clipped = [];
  for (const el of document.querySelectorAll('.lbl, .ar-marker, .g-title, button, h2, h3')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || getComputedStyle(el).visibility === 'hidden' || Number(getComputedStyle(el).opacity) === 0) continue;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue;
      const q = p.getBoundingClientRect();
      if (r.right > q.right + 1 || r.left < q.left - 1) clipped.push(`${name(el)} "${(el.textContent ?? '').trim().slice(0, 40)}" past ${name(p)}`);
      break;
    }
  }
  const spot = document.querySelector('.spotlight');
  return {
    pageScroll: document.scrollingElement.scrollHeight > vh + 2,
    scrolls,
    clipped,
    nextInView: inView(document.querySelector('[data-tour-next]')),
    spotlight: spot ? inView(spot) : null,
  };
}

const server = await startDevServer();
const browser = await launchChrome();
const manifest = [];
let failed = false;
try {
  for (const [w, h] of sizes) {
    // A cold dev server sometimes drops the first page load (as browser-tests.mjs knows): three tries.
    let opened = null;
    for (let t = 0; t < 3 && !opened; t++) opened = await openPage(browser, `${server.url}/play/`, { width: w, height: h }).catch((e) => (t === 2 ? Promise.reject(e) : null));
    const { page, errors, context } = opened;
    await seedSave(page, server.url, { reducedMotion: !motion });
    const script = await page.evaluate(async () => (await import('/src/tour/script.ts')).STOPS.map((s) => ({ id: s.id, node: s.node ?? null })));
    const stops = script.map((s) => s.id);
    for (const s of want) {
      const i = /^\d+$/.test(s) ? Number(s) - 1 : stops.indexOf(s);
      if (i < 0 || i >= stops.length) throw new Error(`no such stop: ${s}`);
      // With --open, this stop's deduction and every later one in the tour are left open (a save per stop).
      if (open) await seedSave(page, server.url, { reducedMotion: !motion, openNodes: script.slice(i).map((x) => x.node).filter(Boolean) });
      await page.evaluate((step) => window.__finder.dispatch({ type: 'tour.start', step }), i);
      await page.waitForSelector(`.guide[data-tour-step="${i}"]`, { state: 'visible', timeout: 60_000 });
      if (click) await page.locator(click).first().click();
      await page.waitForTimeout(wait);
      const file = `${String(i + 1).padStart(2, '0')}-${stops[i].replace(/\./g, '-')}-${w}x${h}.png`;
      await page.screenshot({ path: join(outDir, file) });
      const m = await page.evaluate(measure);
      manifest.push({ file, stop: stops[i], size: `${w}x${h}`, ...m });
      console.log(`${file}: next ${m.nextInView}, spotlight ${m.spotlight}, scrolls ${m.scrolls.length}, clipped ${m.clipped.length}${m.clipped.length ? ' ' + m.clipped.join('; ') : ''}`);
    }
    if (errors.length) {
      failed = true;
      console.error(errors.join('\n'));
    }
    await context.close();
  }
} finally {
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  await server.close();
}
console.log(`[tour-look] ${manifest.length} shots in ${outDir}`);
if (failed) process.exit(1);
