// npm run probe:audio: which audio codecs can each browser decode through an OfflineAudioContext, and does a
// 96 kHz FLAC decode with its sample count intact? Makes 1-second test tones with ffmpeg into build/probe/,
// serves them, asks Chrome (and Firefox and WebKit if they are already installed; nothing is downloaded).
// Writes build/probe/report.json and prints a table.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { firefox, webkit } from 'playwright';
import { launchChrome } from './browser.mjs';
import { ROOT } from './serve.mjs';

const OUT = join(ROOT, 'build', 'probe');
const RATES = [96000, 48000];
const FFMPEG =
  process.env.FFMPEG ||
  (existsSync(join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'))
    ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')
    : 'ffmpeg');

/** name, file, source rate, channels, extra encoder args */
const TONES = [
  { name: 'FLAC 96k mono 16-bit', file: 'flac96.flac', rate: 96000, ch: 1, args: ['-c:a', 'flac', '-sample_fmt', 's16'] },
  { name: 'FLAC 44.1k stereo', file: 'flac44.flac', rate: 44100, ch: 2, args: ['-c:a', 'flac', '-sample_fmt', 's16'] },
  { name: 'Opus in Ogg 160k', file: 'opus.opus', rate: 48000, ch: 2, args: ['-c:a', 'libopus', '-b:a', '160k'] },
  { name: 'Opus in WebM 160k', file: 'opus.webm', rate: 48000, ch: 2, args: ['-c:a', 'libopus', '-b:a', '160k'] },
  { name: 'AAC-LC in m4a', file: 'aac.m4a', rate: 44100, ch: 2, args: ['-c:a', 'aac', '-b:a', '160k'] },
];
const MIME = { flac: 'audio/flac', opus: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4' };

function makeTones() {
  mkdirSync(OUT, { recursive: true });
  for (const t of TONES) {
    execFileSync(
      FFMPEG,
      [
        '-y', '-loglevel', 'error',
        '-f', 'lavfi', '-i', `sine=frequency=1000:sample_rate=${t.rate}:duration=1`,
        '-ac', String(t.ch), '-ar', String(t.rate), ...t.args, join(OUT, t.file),
      ],
      { stdio: 'inherit' },
    );
  }
}

function serveProbeFolder() {
  const server = createServer((req, res) => {
    const name = (req.url || '/').split('?')[0].slice(1);
    if (name === '' || name === 'index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>probe</title>');
      return;
    }
    const f = join(OUT, name.replace(/[^A-Za-z0-9_.-]/g, ''));
    if (!existsSync(f)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[name.split('.').pop()] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  return new Promise((res) =>
    server.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${server.address().port}`, server })),
  );
}

/** Runs inside the page. */
async function decodeAll({ files, rates }) {
  const out = [];
  for (const f of files) {
    const bytes = await (await fetch(`/${f}`)).arrayBuffer();
    for (const rate of rates) {
      const row = { file: f, ctxRate: rate };
      try {
        const ctx = new OfflineAudioContext(2, 1, rate);
        const buf = await ctx.decodeAudioData(bytes.slice(0));
        row.ok = true;
        row.sampleRate = buf.sampleRate;
        row.length = buf.length;
        row.channels = buf.numberOfChannels;
      } catch (e) {
        row.ok = false;
        row.error = String(e && e.message ? e.message : e);
      }
      out.push(row);
    }
  }
  return out;
}

async function probeBrowser(name, launcher, base) {
  let browser;
  try {
    browser = await launcher();
  } catch (e) {
    return { browser: name, available: false, reason: String(e.message).split('\n')[0].slice(0, 160) };
  }
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(base, { waitUntil: 'load' });
    const rows = await page.evaluate(decodeAll, { files: TONES.map((t) => t.file), rates: RATES });
    return { browser: name, available: true, version: browser.version(), rows };
  } catch (e) {
    return { browser: name, available: false, reason: `probe failed: ${String(e.message).split('\n')[0].slice(0, 160)}` };
  } finally {
    await browser.close().catch(() => {});
  }
}

makeTones();
const { url, server } = await serveProbeFolder();
const results = [];
results.push(await probeBrowser('chrome', launchChrome, url));
results.push(await probeBrowser('firefox', () => firefox.launch({ headless: true }), url));
results.push(await probeBrowser('webkit', () => webkit.launch({ headless: true }), url));
server.close();

// Exactness check for the 96 kHz FLAC: 1 s at 96000 Hz is 96000 samples; decoding at a 96000 Hz context must keep all of them.
const report = { created: new Date().toISOString(), expectedFlac96Samples: 96000, tones: TONES.map((t) => t.name), results };
for (const r of results) {
  if (!r.available) continue;
  const row = r.rows.find((x) => x.file === 'flac96.flac' && x.ctxRate === 96000);
  r.flac96Exact = Boolean(row && row.ok && row.sampleRate === 96000 && row.length === 96000);
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

for (const r of results) {
  console.log(`\n== ${r.browser}${r.available ? ` ${r.version}` : ''}`);
  if (!r.available) {
    console.log(`   not available (${r.reason})`);
    continue;
  }
  console.log('   codec                  ctx Hz  decoded  rate    length  ch');
  for (const row of r.rows) {
    const t = TONES.find((x) => x.file === row.file);
    const label = t.name.padEnd(22);
    console.log(
      row.ok
        ? `   ${label} ${String(row.ctxRate).padStart(6)}  ok       ${String(row.sampleRate).padStart(6)}  ${String(row.length).padStart(6)}  ${row.channels}`
        : `   ${label} ${String(row.ctxRate).padStart(6)}  FAILED   ${row.error}`,
    );
  }
  console.log(`   96 kHz FLAC keeps exactly 96000 samples at a 96000 Hz context: ${r.flac96Exact ? 'YES' : 'NO'}`);
}
console.log(`\n[probe] report: ${join(OUT, 'report.json')}`);
