// Start `vite preview` (the built dist/ folder) on a free port. Vite runs through this same node
// (process.execPath), never npx, because npx.cmd is ENOENT for a bare spawn on Windows.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A random port in 40000-49999: the operating system's own pick once landed in a range Chrome could not
// reach on this PC (ERR_CONNECTION_TIMED_OUT), so stay out of the low ephemeral numbers.
async function freePort() {
  for (let i = 0; i < 20; i++) {
    const port = 40000 + Math.floor(Math.random() * 10000);
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.listen(port, '127.0.0.1', () => s.close(() => res(true)));
    });
    if (ok) return port;
  }
  throw new Error('no free port found in 40000-49999');
}

async function waitUp(url, child, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`vite preview exited early (code ${child.exitCode})`);
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`vite preview did not answer at ${url} within ${ms} ms`);
}

/** @returns {Promise<{ url: string, close: () => Promise<void> }>} */
export async function startServer() {
  const port = await freePort();
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitUp(`${url}/`, child);
  } catch (e) {
    child.kill();
    throw new Error(`${e instanceof Error ? e.message : e}\n${stderr}`);
  }
  const close = () =>
    new Promise((res) => {
      if (child.exitCode !== null) return res();
      child.once('close', () => res());
      child.kill();
    });
  return { url, close };
}
