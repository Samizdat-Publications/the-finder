#!/usr/bin/env node
// Downloads the raw sources listed in tools/sources.json into sources/<id>/ (gitignored).
// Resumable (HTTP Range), verified by size, MD5 (where published) and SHA-256 (recorded on first
// download). Never executes or unpacks anything it downloads (CLAUDE.md rule 9).
//
// Usage:
//   node tools/fetch-sources.mjs                 fetch every source
//   node tools/fetch-sources.mjs image-tape atnf fetch only these ids
//   node tools/fetch-sources.mjs --verify        re-check what is already on disk, download nothing

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'tools', 'sources.json');
const USER_AGENT = 'TheFinder-build/0.1 (private research build; github.com/Samizdat-Publications)';
const MAX_ATTEMPTS = 8;

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
const wanted = args.filter((a) => !a.startsWith('--'));

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
let manifestChanged = false;

const selected = manifest.sources.filter((s) => wanted.length === 0 || wanted.includes(s.id));
for (const id of wanted) {
  if (!manifest.sources.some((s) => s.id === id)) {
    console.error(`unknown source id: ${id}`);
    process.exit(2);
  }
}

let failures = 0;
for (const src of selected) {
  try {
    await handle(src);
  } catch (err) {
    failures++;
    console.error(`[${src.id}] FAILED: ${err.message}`);
  }
}

if (manifestChanged) {
  // Re-read before writing so two fetch runs in parallel (the long tape download and the small
  // sources) never overwrite each other's recorded values.
  const fresh = JSON.parse(await readFile(MANIFEST, 'utf8'));
  for (const src of selected) {
    const entry = fresh.sources.find((s) => s.id === src.id);
    if (entry && !entry.sha256 && src.sha256) entry.sha256 = src.sha256;
    if (entry && entry.bytes == null && src.bytes != null) entry.bytes = src.bytes;
  }
  await writeFile(MANIFEST, JSON.stringify(fresh, null, 2) + '\n');
  console.log('recorded new sizes and SHA-256 values in tools/sources.json');
}
process.exit(failures ? 1 : 0);

async function handle(src) {
  const dir = join(ROOT, 'sources', src.id);
  const dest = join(dir, src.file);
  mkdirSync(dir, { recursive: true });

  if (!existsSync(dest)) {
    if (verifyOnly) throw new Error('not downloaded');
    const urls = [src.url, ...(src.mirrors ?? [])];
    let lastErr;
    for (const url of urls) {
      try {
        await download(src, url, dest);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        console.error(`[${src.id}] ${url} failed: ${err.message}`);
      }
    }
    if (lastErr) throw lastErr;
  }

  const size = statSync(dest).size;
  if (src.bytes != null && size !== src.bytes) {
    throw new Error(`size ${size} differs from expected ${src.bytes}; delete ${dest} and re-run`);
  }
  const { md5, sha256 } = await hashFile(dest);
  if (src.md5 && md5 !== src.md5) {
    renameSync(dest, dest + '.bad');
    throw new Error(`MD5 ${md5} differs from published ${src.md5}; file moved to .bad`);
  }
  if (src.sha256 && sha256 !== src.sha256) {
    renameSync(dest, dest + '.bad');
    throw new Error(`SHA-256 ${sha256} differs from recorded ${src.sha256}; file moved to .bad`);
  }
  if (!src.sha256) {
    src.sha256 = sha256;
    manifestChanged = true;
  }
  if (src.bytes == null) {
    src.bytes = size;
    manifestChanged = true;
  }
  console.log(`[${src.id}] OK ${size} bytes${src.md5 ? `, MD5 ${md5} matches` : ''}, SHA-256 ${sha256}`);
}

async function download(src, url, dest) {
  const part = dest + '.part';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const have = existsSync(part) ? statSync(part).size : 0;
    const headers = { 'User-Agent': USER_AGENT };
    if (have > 0) headers.Range = `bytes=${have}-`;
    let res;
    try {
      res = await fetch(url, { headers, redirect: 'follow' });
    } catch (err) {
      console.error(`[${src.id}] attempt ${attempt}: ${err.message}; retrying`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 416 && src.bytes != null && have === src.bytes) {
      renameSync(part, dest);
      return;
    }
    if (!res.ok) {
      if (attempt === MAX_ATTEMPTS || res.status < 500) throw new Error(`HTTP ${res.status}`);
      await sleep(2000 * attempt);
      continue;
    }
    // A 200 to a ranged request means the server ignored the range: start over.
    const resuming = have > 0 && res.status === 206;
    if (have > 0 && !resuming) {
      console.log(`[${src.id}] server ignored the range request; restarting from zero`);
      unlinkSync(part);
    }
    const start = resuming ? have : 0;
    const total = src.bytes ?? (Number(res.headers.get('content-length')) + start || null);
    console.log(`[${src.id}] ${resuming ? `resuming at ${start}` : 'downloading'} from ${url}`);
    try {
      await pipeBody(src, res.body, part, start, total);
    } catch (err) {
      console.error(`[${src.id}] attempt ${attempt} interrupted: ${err.message}; resuming`);
      await sleep(2000 * attempt);
      continue;
    }
    const got = statSync(part).size;
    if (total != null && got < total) {
      console.error(`[${src.id}] attempt ${attempt} ended early (${got} of ${total}); resuming`);
      continue;
    }
    renameSync(part, dest);
    return;
  }
  throw new Error(`gave up after ${MAX_ATTEMPTS} attempts`);
}

async function pipeBody(src, body, part, start, total) {
  const out = createWriteStream(part, { flags: start > 0 ? 'a' : 'w' });
  let written = start;
  let nextReport = 0;
  const t0 = Date.now();
  try {
    for await (const chunk of body) {
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      written += chunk.length;
      if (total && written >= nextReport) {
        const pct = (100 * written) / total;
        const mbps = (written - start) / 1e6 / Math.max(0.001, (Date.now() - t0) / 1000);
        console.log(`[${src.id}] ${pct.toFixed(1)}% (${(written / 1e6).toFixed(1)} MB, ${mbps.toFixed(1)} MB/s)`);
        nextReport = written + total * 0.05;
      }
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
}

function hashFile(path) {
  return new Promise((res, rej) => {
    const md5 = createHash('md5');
    const sha = createHash('sha256');
    createReadStream(path)
      .on('data', (c) => {
        md5.update(c);
        sha.update(c);
      })
      .on('error', rej)
      .on('end', () => res({ md5: md5.digest('hex'), sha256: sha.digest('hex') }));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
