// node tools/showcase/film.mjs [--stops a,b,c] [--dist] [--out build/showcase/film]
//
// Films the landing page's clips: the guided tour from a fresh save on the production build (vite preview
// of dist/, no harness handle), driven only by the guide's own buttons ("Do it for me", "Show me", Next), as
// tools/harness/live-tour.mjs does. The game's seed is fixed on a fresh save, so every run shows the same
// deductions with the same numbers.
//
// Only the stops listed in STOPS (or --stops) are filmed. For each one a Chrome DevTools screencast runs from
// the moment the guide shows the stop until a few seconds after the result is in; every frame is saved with
// the browser's own timestamp, and ffmpeg turns the frames into a constant 30 fps H.264 clip (frames held for
// their real duration). Silent: the landing page plays its clips muted.
//
// The viewport is 1366 x 768 CSS pixels (a layout the game is tested at) rendered at 1.5x and scaled by the
// browser to 1280 x 720, so the text stays sharp.
//
// Output: <out>/<stop>.mp4 and <out>/film.json (lengths and timings). Raw frames go to <out>/raw/ (build/ is
// gitignored). Needs ffmpeg on PATH (or FFMPEG set) and dist/ built (npm run build).
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome } from '../harness/browser.mjs';
import { ROOT, startServer } from '../harness/serve.mjs';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const STOPS = (opt('stops', 'arrival.purpose,key.binary,pictures.circle,pictures.firstFrames,pictures.colour,spot.age,map.periods,map.identify,trail.origin,finale.now')).split(',');
const out = join(ROOT, opt('out', 'build/showcase/film'));
const raw = join(out, 'raw');
rmSync(raw, { recursive: true, force: true });
mkdirSync(raw, { recursive: true });

const FPS = 30;
/** Seconds of the guide's explanation kept before pressing the button, and of the result after. */
const LEAD_S = 2.5;
const TAIL_S = 4;
/** Longest a single "Do it for me" may take (the album develops 156 frames). */
const ACT_MS = 420_000;

const t0 = Date.now();
const log = (...a) => console.log(`[film ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer();
const browser = await launchChrome();
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console.error: ${m.text().slice(0, 300)}`));
const cdp = await context.newCDPSession(page);

/** The current recording: frames with browser timestamps (s). */
let rec = null;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  if (!rec) return;
  const file = join(rec.dir, `${String(rec.frames.length).padStart(5, '0')}.jpg`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  rec.frames.push({ file, t: metadata.timestamp });
});

async function startRec(id) {
  const dir = join(raw, id);
  mkdirSync(dir, { recursive: true });
  rec = { id, dir, frames: [], wall0: Date.now() / 1000 };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
}

async function stopRec() {
  const r = rec;
  await cdp.send('Page.stopScreencast');
  await sleep(200);
  rec = null;
  r.wall1 = Date.now() / 1000;
  return r;
}

/** Frames to a constant-rate clip; each frame lasts until the next one, the last until the recording ended. */
function encode(r) {
  if (r.frames.length < 2) throw new Error(`${r.id}: only ${r.frames.length} frames`);
  const end = r.frames[r.frames.length - 1].t + (r.wall1 - r.frames[r.frames.length - 1].t > 0 && r.wall1 - r.frames[r.frames.length - 1].t < 30 ? r.wall1 - r.frames[r.frames.length - 1].t : 1);
  const lines = [];
  for (let i = 0; i < r.frames.length; i++) {
    const next = i + 1 < r.frames.length ? r.frames[i + 1].t : end;
    lines.push(`file '${r.frames[i].file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - r.frames[i].t).toFixed(4)}`);
  }
  lines.push(`file '${r.frames[r.frames.length - 1].file.replace(/\\/g, '/')}'`);
  const list = join(r.dir, 'list.txt');
  writeFileSync(list, lines.join('\n'));
  const mp4 = join(out, `${r.id}.mp4`);
  const res = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=${FPS},scale=1280:720:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-movflags', '+faststart', '-an', mp4], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`ffmpeg failed for ${r.id}: ${res.stderr}`);
  return { mp4, seconds: end - r.frames[0].t, frames: r.frames.length };
}

const step = async () => Number(await page.locator('.guide[data-tour-step]').first().getAttribute('data-tour-step'));
const results = [];
try {
  await page.goto(`${server.url}/play/?tour=1`, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${server.url}/play/?tour=1`, { waitUntil: 'load' });
  await page.waitForSelector('.guide[data-tour-step="0"]', { timeout: 60_000 });
  let last = -1;
  for (;;) {
    const i = await step();
    if (i === last) throw new Error(`stuck on step ${i}`);
    last = i;
    const guide = page.locator(`.guide[data-tour-step="${i}"]`);
    await guide.waitFor({ state: 'visible' });
    const id = (await guide.getAttribute('data-stop')) ?? `step-${String(i).padStart(2, '0')}`;
    const filming = STOPS.includes(id) || STOPS.includes(`step-${i}`);
    if (filming) {
      await sleep(1200);
      await startRec(id);
      await sleep(LEAD_S * 1000);
    }
    const act = guide.locator('[data-tour-act]');
    const a0 = Date.now();
    if (await act.count()) {
      await act.first().click();
      await page.waitForSelector(`.guide[data-tour-step="${i}"] [data-tour-next]:not([disabled])`, { timeout: ACT_MS });
      await page.waitForFunction(() => !document.querySelector('[data-moment]'), null, { timeout: ACT_MS }).catch(() => undefined);
    }
    if (filming) {
      await sleep(TAIL_S * 1000);
      const r = await stopRec();
      const e = encode(r);
      results.push({ id, step: i, ...e, actS: (Date.now() - a0) / 1000 });
      log(`filmed ${id}: ${e.seconds.toFixed(1)} s, ${e.frames} frames`);
    } else {
      log(`step ${i} ${id} done in ${((Date.now() - a0) / 1000).toFixed(1)} s`);
    }
    const next = guide.locator('[data-tour-next]');
    await next.waitFor({ state: 'visible', timeout: 10_000 });
    const label = (await next.textContent()) ?? '';
    await next.click();
    if (/finish/i.test(label)) break;
    await page.waitForFunction((n) => document.querySelector('.guide[data-tour-step]')?.getAttribute('data-tour-step') !== String(n), i, { timeout: 60_000 });
  }
} finally {
  writeFileSync(join(out, 'film.json'), JSON.stringify({ when: new Date().toISOString(), errors, results }, null, 2));
  await context.close();
  await browser.close();
  await server.close();
}
log(`done: ${results.length} clips in ${out}${errors.length ? `; console errors: ${errors.join(' | ')}` : ''}`);
