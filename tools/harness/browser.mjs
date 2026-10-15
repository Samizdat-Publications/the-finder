// Shared launch helper for the harness tools: the INSTALLED Chrome through Playwright (library only,
// no browser downloads; the bundled Chromium does not spawn on this PC), headless, real GPU flags.
import { chromium } from 'playwright';

const GPU_ARGS = [
  '--ignore-gpu-blocklist',
  '--force_high_performance_gpu',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

/** Launch installed Chrome, headless. */
export function launchChrome() {
  return chromium.launch({ channel: 'chrome', headless: true, args: GPU_ARGS });
}

/**
 * Open a URL in a fresh page, wait for load, and collect console errors.
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{ width?: number, height?: number }} [opts]
 * @returns {Promise<{ page: import('playwright').Page, errors: string[], context: import('playwright').BrowserContext }>}
 */
export async function openPage(browser, url, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 500)}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url().slice(0, 200)}`));
  await page.goto(url, { waitUntil: 'load' });
  return { page, errors, context };
}
