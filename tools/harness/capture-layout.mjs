// node tools/harness/capture-layout.mjs [--out <folder>] [--sizes 1440x900,1366x768,390x844]
//
// The layout review (M3 step 8b): plays the slice's right-answer path (the same run as the bot, through
// window.__finder) at each viewport size, takes a screenshot at every key moment, and measures what a
// player would hit: does the page scroll, which boxes scroll on their own, does anything run past the
// window, and what text is smaller than the clue sizes (13 px labels, 15 px values). Everything goes to
// review/inbox/<timestamp>-layout/<size>/frames/ with manifest.json (what each shows, in plain words, and the
// measurements). Runs against the Vite dev server so the harness handle is on.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { freshStart, playSlice, stamp } from '../../tests/browser/slice.browser.mjs';
import { ROOT, startDevServer } from './serve.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const sizes = arg('--sizes', '1440x900,1366x768,390x844').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { w, h, label: s };
});
const outDir = arg('--out', join(ROOT, 'review', 'inbox', `${stamp()}-layout`));

/** Runs in the page: the measurements for one frame. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.scrollingElement;
  const sel = (el) => {
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (c ? `.${c}` : '');
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  // boxes that scroll on their own
  const scrollers = [];
  for (const el of document.querySelectorAll('*')) {
    const o = getComputedStyle(el).overflowY;
    if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 2 && visible(el)) {
      scrollers.push({ box: sel(el), hiddenPx: el.scrollHeight - el.clientHeight });
    }
  }
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 2) return true;
    }
    return false;
  };
  // elements that run past the window (and are not inside a box that scrolls)
  const clipped = [];
  for (const el of document.querySelectorAll('.shell *')) {
    if (!visible(el) || inScroller(el)) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > vh + 1 || r.right > vw + 1) {
      const text = (el.textContent || '').trim().slice(0, 30);
      if (!el.children.length || el.matches('button, canvas, svg, section, aside, figure')) clipped.push({ el: sel(el), bottom: Math.round(r.bottom), right: Math.round(r.right), text });
    }
  }
  // text smaller than the clue sizes
  const small = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent || '').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || !visible(el) || el.closest('.sr, script, style')) continue;
    let px = parseFloat(getComputedStyle(el).fontSize);
    const svg = el.closest('svg');
    if (svg && el instanceof SVGElement) {
      const m = el.getScreenCTM();
      if (m) px *= Math.hypot(m.a, m.b);
    }
    if (px < 12.9) {
      const k = `${sel(el.closest('[class]') || el)} ${px.toFixed(1)}px`;
      small.set(k, (small.get(k) || 0) + 1);
    }
  }
  return {
    viewport: `${vw}x${vh}`,
    pageScrollPx: { y: doc.scrollHeight - vh, x: doc.scrollWidth - vw },
    ownScrollBoxes: scrollers,
    runsPastWindow: clipped.slice(0, 12),
    textUnder13px: [...small.entries()].map(([k, n]) => `${k} x${n}`),
  };
}

const server = await startDevServer();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--force_high_performance_gpu', '--autoplay-policy=no-user-gesture-required'],
});
const manifest = { made: new Date().toISOString(), note: 'Layout review, M3 step 8b. Each frame lists what it shows and what was measured.', sizes: {} };
const errors = [];
try {
  for (const s of sizes) {
    const dir = join(outDir, s.label);
    mkdirSync(join(dir, 'frames'), { recursive: true });
    const context = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`${s.label} console.error: ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => errors.push(`${s.label} pageerror: ${e.message}`));
    page.setDefaultTimeout(120_000);
    await freshStart(page, server.url);
    const shots = [];
    manifest.sizes[s.label] = shots;
    const shot = async (name, shows, did) => {
      const file = `frames/frame_${String(shots.length + 1).padStart(2, '0')}_${name}.png`;
      const m = await page.evaluate(measure);
      // A narrow window scrolls: its frames are the whole page. A wide one never scrolls: the window is the frame.
      await page.screenshot({ path: join(dir, file), fullPage: s.w < 1000 });
      shots.push({ file: `${s.label}/${file}`, shows, did, ...m });
      console.log(`  [${s.label}] ${name}: page scroll ${m.pageScrollPx.y}px, own scroll boxes ${m.ownScrollBoxes.length}, past window ${m.runsPastWindow.length}`);
    };
    await playSlice(page, { shot, linger: (ms) => page.waitForTimeout(Math.min(ms, 400)), circleSpeed: 'fast', log: () => undefined });
    // The finished ring again after a pause, so the glow is on screen.
    await page.waitForTimeout(2500);
    await shot('ring-finished-glow', 'The ring after the whole slice, a while later: the lit arcs carry a slow glow.', 'Waited on the ring.');
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (errors.length) {
  console.error(`[layout] console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
console.log(`[layout] ${outDir}`);
