// node tools/harness/film-tour.mjs [--from <stopId>] [--to <stopId>] [--chapters a,b] [--out <folder>] [--hold 1]
//
// Films the guided tour, with the game's real sound, for the Gemini video critic (tools/critic_gemini).
// It drives the tour exactly as tests/browser/tour.browser.mjs (bot.tour) does: a fresh save, /play/?tour=1 at
// 1440 x 900 on the Vite dev server (harness handle on, so the audio tap works), and ONLY the guide's own
// buttons ([data-tour-act], [data-tour-next]); deduction state is read through window.__finder.state(), never
// written. The picture is Playwright's recordVideo; the sound is the harness audio tap; the clapperboard sync
// and the mux are film-slice.mjs's (exported there), so the film is H.264 and AAC, in sync, under 50 MB.
//
// Selecting a stretch: --from and --to are stop ids (src/tour/script.ts STOPS); --chapters names tour parts
// (PARTS ids such as key, player, pictures; a chapter view name such as hub also works). The film runs from the
// first selected stop to the last. Stops before it are fast-forwarded through the guide's own buttons with
// filming not started (no tap, no clap, no screenshots); the film starts at the first selected stop.
//
// While filming, each stop holds its guide text on screen for a reading time (about 1 s per 15 words, capped
// at 12 s, times --hold), then acts, then holds the result about 4 s.
//
// Output: review/inbox/<timestamp>-tour-film/ with slice.mp4 (the name critic.py expects), frames/ (before and
// after each stop), shots.txt (file: what it shows | what the player just did), manifest.json and film.json.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { freshStart, reviewFolder, stamp } from '../../tests/browser/slice.browser.mjs';
import { AFTER_CLAP_S, CHROME_ARGS, H, MAX_BYTES, W, clap, duration, loudness, streams, syncAndMux } from './film-slice.mjs';
import { ROOT, startDevServer } from './serve.mjs';

/** Longest a single "Do it for me" may take, ms (as the tour bot: the album develops 156 frames). */
const ACT_MS = 420_000;
/** Reading speed for the hold on a stop's text: words per second, and the cap in seconds. */
const WORDS_PER_S = 15;
const READ_CAP_S = 12;
/** How long the result of an action stays on screen, seconds. */
const RESULT_HOLD_S = 4;

/** The guide panel showing step i (as tests/browser/tour.browser.mjs). */
const guideAt = (i) => `.guide[data-tour-step="${i}"]`;

function parseArgs(argv) {
  const get = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const hold = get('--hold') === undefined ? 1 : Number(get('--hold'));
  if (!Number.isFinite(hold) || hold < 0) throw new Error('--hold must be a number of 0 or more');
  return {
    from: get('--from'),
    to: get('--to'),
    chapters: get('--chapters')?.split(',').map((s) => s.trim()).filter(Boolean),
    out: get('--out'),
    hold,
  };
}

/** Words in a text (the markdown double stars and blank lines do not count). */
const words = (...texts) => texts.filter(Boolean).join(' ').replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;

/** Reading time in ms for a number of words. */
const readMs = (n, hold) => Math.min(READ_CAP_S, n / WORDS_PER_S) * 1000 * hold;

/** Indices [first, last] of the filmed stretch. */
function selectStretch(stops, args) {
  const idx = (id) => {
    const i = stops.findIndex((s) => s.id === id);
    if (i < 0) throw new Error(`no stop "${id}" in src/tour/script.ts`);
    return i;
  };
  let first = 0;
  let last = stops.length - 1;
  if (args.chapters?.length) {
    const hit = stops.map((s, i) => (args.chapters.includes(s.part) || args.chapters.includes(s.chapter) ? i : -1)).filter((i) => i >= 0);
    if (!hit.length) throw new Error(`no stops in chapters ${args.chapters.join(', ')}`);
    first = hit[0];
    last = hit[hit.length - 1];
  }
  if (args.from) first = idx(args.from);
  if (args.to) last = idx(args.to);
  if (first > last) throw new Error(`--from ${stops[first].id} comes after --to ${stops[last].id}`);
  return [first, last];
}

/** Press the stop's action button and wait until its deduction is confirmed (the tour bot's wait). */
async function act(page, s, i) {
  const button = page.locator(`${guideAt(i)} [data-tour-act]`);
  await button.waitFor({ state: 'visible', timeout: 30_000 });
  await button.click();
  const outcome = await page
    .waitForFunction(
      ([node, sel]) => {
        const g = window.__finder.state().game;
        const err = document.querySelector(`${sel} .g-error`);
        if (err) return { error: err.textContent };
        const busy = document.querySelector(`${sel} [data-tour-act][disabled]`);
        return g.nodes[node]?.confirmed && !busy && !document.querySelector('[data-moment]') ? { ok: true } : null;
      },
      [s.node, guideAt(i)],
      { timeout: ACT_MS, polling: 250 },
    )
    .then((h) => h.jsonValue());
  if (!outcome.ok) throw new Error(`${s.id}: Do it for me did not confirm it (${outcome.error ?? ''})`);
  await page.waitForSelector(`${guideAt(i)} [data-learned]`, { timeout: 10_000 }).catch(() => undefined);
}

async function next(page, s, i) {
  const button = page.locator(`${guideAt(i)} [data-tour-next]`);
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await button.isEnabled())) throw new Error(`${s.id}: Next is not enabled once the stop is done`);
  await button.click();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.out ?? join(ROOT, 'review', 'inbox', `${stamp()}-tour-film`);
  const rawDir = join(dir, 'raw');
  mkdirSync(rawDir, { recursive: true });
  const review = reviewFolder(dir);

  const started = Date.now();
  const server = await startDevServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: CHROME_ARGS });
  const errors = [];
  let videoPath = null;
  let tap = null;
  let videoWallMs = 0;
  let clapWallMs = 0;
  let first = 0;
  let last = 0;
  let ffSeconds = 0;
  const filmed = [];
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: rawDir, size: { width: W, height: H } } });
    videoWallMs = Date.now(); // the recording starts with the page
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 300)}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.setDefaultTimeout(120_000);
    await freshStart(page, server.url, '?tour=1');
    const stops = await page.evaluate(async () =>
      (await import('/src/tour/script.ts')).STOPS.map((s) => ({ id: s.id, kind: s.kind, node: s.node ?? null, title: s.title, part: s.part, chapter: s.chapter, look: s.look, todo: s.todo ?? '', why: s.why ?? '', human: s.human ?? '', ask: s.ask ?? '' })),
    );
    [first, last] = selectStretch(stops, args);
    console.log(`[film-tour] ${stops.length} stops; filming ${stops[first].id} (step ${first + 1}) to ${stops[last].id} (step ${last + 1}); hold x${args.hold}`);

    // Fast-forward to the first filmed stop with the guide's own buttons, filming not started.
    const f0 = Date.now();
    for (let i = 0; i < first; i++) {
      await page.waitForSelector(guideAt(i), { state: 'visible', timeout: 60_000 });
      await page.waitForTimeout(150);
      if (stops[i].kind !== 'story') await act(page, stops[i], i);
      await next(page, stops[i], i);
    }
    ffSeconds = (Date.now() - f0) / 1000;
    if (first > 0) console.log(`[film-tour] fast-forwarded ${first} stops in ${ffSeconds.toFixed(1)} s`);

    await page.waitForSelector(guideAt(first), { state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1500); // the stage settles before the tap and the clap
    const c = await clap(page);
    clapWallMs = c.clapWallMs;
    await page.waitForTimeout(AFTER_CLAP_S * 1000 + 400);

    for (let i = first; i <= last; i++) {
      const s = stops[i];
      const t0 = (Date.now() - clapWallMs) / 1000;
      await page.waitForSelector(guideAt(i), { state: 'visible', timeout: 60_000 });
      const n = String(i + 1).padStart(2, '0');
      const tag = s.id.replace(/\./g, '-');
      await page.waitForTimeout(400);
      await review.shot(page, `${n}-${tag}-before`, `The guide at step ${i + 1} of ${stops.length}, "${s.title}" (${s.kind}).`, i === first ? 'Opened this stop of the guided tour.' : 'Pressed Next.');
      // A viewer reads: the text on screen now (a story stop also shows what it teaches).
      const onScreen = s.kind === 'story' ? words(s.look, s.todo, s.why, s.human, s.ask) : words(s.look, s.todo);
      await page.waitForTimeout(readMs(onScreen, args.hold));
      if (s.kind !== 'story') {
        await act(page, s, i);
        await page.waitForTimeout(600);
        await review.shot(page, `${n}-${tag}-after`, `Step ${i + 1}, "${s.title}", done by the guide: the instrument shows the confirmed result and the guide says what we learned.`, `Pressed ${s.kind === 'watch' ? 'Show me' : 'Do it for me'} and waited.`);
        await page.waitForTimeout(RESULT_HOLD_S * 1000);
      }
      await next(page, s, i);
      filmed.push({ id: s.id, kind: s.kind, startS: Number(t0.toFixed(1)), endS: Number(((Date.now() - clapWallMs) / 1000).toFixed(1)) });
      console.log(`[film-tour] ${s.id} filmed (${filmed.length} of ${last - first + 1})`);
    }
    await page.waitForTimeout(1500);
    const tapStart = c.tapStart;
    tap = await page.evaluate(() => window.__finder.stopAudioTap());
    tap.tapStartMs = tapStart.startedAtMs;
    tap.sampleRate = tapStart.sampleRate;
    await context.close(); // finishes the video file
    videoPath = await page.video().path();
  } finally {
    await browser.close();
    await server.close();
  }

  if (errors.length) {
    console.error(`[film-tour] console errors during the run:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
  if (!tap || !videoPath) throw new Error('the run did not finish');

  const audioPath = join(rawDir, 'audio.webm');
  writeFileSync(audioPath, Buffer.from(tap.base64, 'base64'));
  const rawVideo = join(rawDir, 'video.webm');
  renameSync(videoPath, rawVideo);

  const out = join(dir, 'slice.mp4');
  const mux = syncAndMux({ rawVideo, audioPath, tap, clapWallMs, videoWallMs, out });
  const lenS = duration(out);
  const info = streams(out);
  const level = loudness(out);
  const film = {
    made: new Date().toISOString(),
    file: 'slice.mp4',
    kind: 'tour',
    seconds: Number(lenS.toFixed(2)),
    bytes: mux.bytes,
    encode: { crf: mux.crf, scale: mux.size },
    streams: info,
    sound: level,
    stopsFilmed: filmed,
    range: { from: filmed[0]?.id ?? null, to: filmed[filmed.length - 1]?.id ?? null },
    hold: args.hold,
    fastForward: { stops: first, seconds: Number(ffSeconds.toFixed(1)) },
    audioOffset: {
      flashInVideoS: Number(mux.flashInVideoS.toFixed(3)),
      beepInRecordingS: Number(mux.beepInRecordingS.toFixed(3)),
      correctedS: Number(mux.offsetS.toFixed(3)),
      note: `both streams are cut ${AFTER_CLAP_S} s after their clap, so the film starts in sync (stop times in stopsFilmed are seconds after the clap)`,
    },
    wallClockS: Number(((Date.now() - started) / 1000).toFixed(1)),
  };
  writeFileSync(join(dir, 'film.json'), JSON.stringify(film, null, 2));
  // shots.txt: one line per shot, "file: what it shows | what the player just did" (reviewFolder wrote the short form).
  writeFileSync(join(dir, 'shots.txt'), review.shots.map((s) => `${s.file}: ${s.shows} | ${s.did}`).join('\n') + '\n');
  rmSync(rawDir, { recursive: true, force: true });

  const hasVideo = info.some((s) => s.codec_type === 'video' && s.codec_name === 'h264');
  const hasAudio = info.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac');
  const audible = level.meanDb !== null && level.meanDb > -60;
  console.log(`[film-tour] ${out}: ${lenS.toFixed(1)} s, ${(mux.bytes / 1e6).toFixed(1)} MB, video ${hasVideo ? 'H.264' : 'MISSING'}, sound ${hasAudio ? 'AAC' : 'MISSING'} (peak ${level.maxDb} dB, mean ${level.meanDb} dB)`);
  if (!hasVideo || !hasAudio || !audible || mux.bytes > MAX_BYTES || filmed.length !== last - first + 1) {
    console.error('[film-tour] FAILED: the film is missing a stream, is silent, is too big, or a stop was not filmed');
    process.exitCode = 1;
  }
  console.log(`[film-tour] review folder: ${dir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
