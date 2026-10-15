// npm run capture: screenshots of /, /play/ and /checked/ at desktop and phone size into
// review/inbox/<timestamp>/ with a manifest.json. Builds first when dist/ is missing.
// Fails (exit 1) on any console error, failed request or page error.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, openPage } from './browser.mjs';
import { ROOT, startServer } from './serve.mjs';

const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'play', path: '/play/' },
  { name: 'checked', path: '/checked/' },
];
const SIZES = [
  { label: '1440x900', width: 1440, height: 900 },
  { label: '390x844', width: 390, height: 844 },
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
