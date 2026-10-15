// npm run deploy: build the site, then publish dist/ with wrangler.
// Both tools run through this same node (process.execPath) from the project folder with relative
// paths, because npx.cmd is ENOENT for a bare spawn on Windows and this folder name has a space.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function step(label, entry, args) {
  console.log(`\n[deploy] ${label}`);
  const r = spawnSync(process.execPath, [entry, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`[deploy] ${label} failed`);
    process.exit(r.status ?? 1);
  }
}

step('build', join('node_modules', 'vite', 'bin', 'vite.js'), ['build']);
step('wrangler deploy', join('node_modules', 'wrangler', 'bin', 'wrangler.js'), ['deploy']);
