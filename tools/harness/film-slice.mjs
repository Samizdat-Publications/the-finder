// node tools/harness/film-slice.mjs [--out <review folder>]
//
// Films the slice: the same right-answer run as the bot (tests/browser/slice.browser.mjs, playSlice) in the
// installed Chrome at 1440 x 900 with Playwright's recordVideo, while the harness audio tap
// (src/harness/audioTap.ts, window.__finder.startAudioTap) records the page's real sound. Pauses where a
// player would look (the opening scene, the first sound, the circle resolving line by line, a frame
// developing at record speed). Then ffmpeg muxes picture and sound into
// review/inbox/<timestamp>-slice/slice.mp4 (H.264 and AAC; review material, never shipped), next to the
// run's screenshots, manifest.json and film.json (lengths, size, the audio offset that was corrected).
//
// Synchronisation: a clapperboard. Right after the tap starts, the page shows a white frame and plays a short
// 1 kHz beep in the same task. ffmpeg finds the first bright frame in the video and the beep's onset in the
// recording; their difference is the offset, and both streams are cut just after the clap so the film starts
// on the ring, in sync. The clap is a harness overlay, not part of the game.
//
// Needs ffmpeg and ffprobe on PATH (or FFMPEG / FFPROBE set). Runs against the Vite dev server (as the
// browser tests do) so the harness handle is on.
import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { freshStart, playSlice, reviewFolder, stamp } from '../../tests/browser/slice.browser.mjs';
import { ROOT, startDevServer } from './serve.mjs';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const W = 1440;
const H = 900;
/** Seconds kept after the clap before the film starts (the flash is 0.25 s long). */
const AFTER_CLAP_S = 0.6;
/** The beep: frequency (Hz), length (s), peak (linear, -6 dBFS). Far above the beds (-34 dBFS, sound.v1). */
const BEEP = { hz: 1000, s: 0.2, peak: 0.5 };
/** Onset threshold for the beep, linear: half its peak, still 22 dB above the loudest bed. */
const BEEP_THRESHOLD = 0.25;
/** A frame is the flash when its mean luma is above this (the game's dark interface averages under 60). */
const FLASH_LUMA = 200;
/** How far (s) from the wall clock's estimate the clap may be found in either stream. */
const SEARCH_S = 1.5;
/** The film must stay under this size (step 8 spec): review material, never shipped. */
const MAX_BYTES = 50 * 1024 * 1024;

const argOut = process.argv.indexOf('--out');
const dir = argOut > 0 ? process.argv[argOut + 1] : join(ROOT, 'review', 'inbox', `${stamp()}-slice`);
const rawDir = join(dir, 'raw');
mkdirSync(rawDir, { recursive: true });

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 1 << 30 });
  if (r.error) throw new Error(`${cmd} could not start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')} failed (${r.status}):\n${String(r.stderr).slice(-2000)}`);
  return r;
}

/**
 * Time (s) of the clap's flash: the start of the first run of bright frames that begins within SEARCH_S of
 * where the wall clock says the clap was (the recording also opens on a blank white page before the game
 * loads, which this skips).
 */
function flashTime(video, expectS) {
  const r = run(FFMPEG, ['-hide_banner', '-i', video, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']);
  const frames = [];
  let t = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /pts_time:([\d.]+)/.exec(line);
    if (m) t = Number(m[1]);
    const y = /YAVG=([\d.]+)/.exec(line);
    if (y && t !== null) frames.push({ t, y: Number(y[1]) });
  }
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].y > FLASH_LUMA && frames[i - 1].y <= FLASH_LUMA && Math.abs(frames[i].t - expectS) < SEARCH_S) return frames[i].t;
  }
  throw new Error(`no flash found in the video near ${expectS.toFixed(2)} s`);
}

/** Time (s) of the beep's onset in the recording, from its decoded samples (48 kHz mono, float). */
function beepTime(audio, expectS) {
  const SR = 48000;
  const r = run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', audio, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { binary: true });
  const buf = r.stdout;
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const from = Math.max(0, Math.floor((expectS - SEARCH_S) * SR));
  for (let i = from; i < x.length && i / SR < expectS + SEARCH_S; i++) if (Math.abs(x[i]) > BEEP_THRESHOLD) return i / SR;
  throw new Error(`no beep found in the recording near ${expectS.toFixed(2)} s`);
}

function duration(file) {
  const r = run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(r.stdout.trim());
}

function streams(file) {
  const r = run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'json', file]);
  return JSON.parse(r.stdout).streams;
}

/** Peak and mean level of a file's sound (dBFS), from ffmpeg's volumedetect. */
function loudness(file) {
  const r = run(FFMPEG, ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
  const mean = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr);
  const max = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  return { meanDb: mean ? Number(mean[1]) : null, maxDb: max ? Number(max[1]) : null };
}

const started = Date.now();
const server = await startDevServer();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--ignore-gpu-blocklist',
    '--force_high_performance_gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
const errors = [];
let videoPath = null;
let tap = null;
let result = null;
let videoWallMs = 0;
let clapWallMs = 0;
const review = reviewFolder(dir);
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: rawDir, size: { width: W, height: H } } });
  videoWallMs = Date.now(); // the recording starts with the page
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.setDefaultTimeout(120_000);
  await freshStart(page, server.url);
  await page.waitForTimeout(1500); // the ring settles before the tap and the clap

  const tapStart = await page.evaluate(() => window.__finder.startAudioTap());
  // The clap: a white frame and a beep in the same task (harness overlay, removed after 0.25 s).
  clapWallMs = await page.evaluate(async (BEEP) => {
    const { sharedContext, sharedOutput } = await import('/src/audio/mixer.ts');
    const ctx = sharedContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = BEEP.hz;
    g.gain.value = BEEP.peak;
    o.connect(g).connect(sharedOutput());
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:2147483647';
    document.body.appendChild(flash);
    o.start();
    o.stop(ctx.currentTime + BEEP.s);
    setTimeout(() => flash.remove(), 250);
    return Date.now();
  }, BEEP);
  await page.waitForTimeout(AFTER_CLAP_S * 1000 + 400);

  result = await playSlice(page, {
    shot: (n, s, d) => review.shot(page, n, s, d),
    linger: (ms) => page.waitForTimeout(ms),
    circleSpeed: 'record',
    log: (line) => console.log(`  ${line.slice(0, 160)}`),
  });
  await page.waitForTimeout(1500);
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
  console.error(`[film] console errors during the run:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
if (!tap || !videoPath) throw new Error('the run did not finish');

const audioPath = join(rawDir, 'audio.webm');
writeFileSync(audioPath, Buffer.from(tap.base64, 'base64'));
const rawVideo = join(rawDir, 'video.webm');
renameSync(videoPath, rawVideo);

const vFlash = flashTime(rawVideo, (clapWallMs - videoWallMs) / 1000);
const aBeep = beepTime(audioPath, (clapWallMs - tap.tapStartMs) / 1000);
// Video time t shows what the recording has at audio time t - offset.
const offsetS = vFlash - aBeep;
const vStart = vFlash + AFTER_CLAP_S;
const aStart = aBeep + AFTER_CLAP_S;
console.log(`[film] flash at ${vFlash.toFixed(3)} s in the video, beep at ${aBeep.toFixed(3)} s in the recording: offset ${offsetS.toFixed(3)} s corrected`);

const out = join(dir, 'slice.mp4');
run(FFMPEG, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-ss', vStart.toFixed(3), '-i', rawVideo,
  '-ss', aStart.toFixed(3), '-i', audioPath,
  '-map', '0:v:0', '-map', '1:a:0',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  '-shortest', '-movflags', '+faststart',
  out,
]);

const bytes = statSync(out).size;
const lenS = duration(out);
const info = streams(out);
const level = loudness(out);
const film = {
  made: new Date().toISOString(),
  file: 'slice.mp4',
  seconds: Number(lenS.toFixed(2)),
  bytes,
  streams: info,
  sound: level,
  audioOffset: {
    flashInVideoS: Number(vFlash.toFixed(3)),
    beepInRecordingS: Number(aBeep.toFixed(3)),
    correctedS: Number(offsetS.toFixed(3)),
    wallClockEstimateS: { video: Number(((clapWallMs - videoWallMs) / 1000).toFixed(3)), recording: Number(((clapWallMs - tap.tapStartMs) / 1000).toFixed(3)) },
    note: `the recording's time zero falls correctedS into the raw video; both streams are cut ${AFTER_CLAP_S} s after their clap, so the film starts in sync; precision about one video frame (Playwright records about 25 frames a second)`,
  },
  run: result && { timing: result.timing, firstSoundS: result.firstSoundS, framesMs: result.framesMs, confirmed: result.confirmed.length, codexEntries: result.entries },
  wallClockS: Number(((Date.now() - started) / 1000).toFixed(1)),
};
writeFileSync(join(dir, 'film.json'), JSON.stringify(film, null, 2));
rmSync(rawDir, { recursive: true, force: true });

const hasVideo = info.some((s) => s.codec_type === 'video' && s.codec_name === 'h264' && s.width === W && s.height === H);
const hasAudio = info.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac');
const audible = level.maxDb !== null && level.maxDb > -40;
console.log(`[film] ${out}: ${lenS.toFixed(1)} s, ${(bytes / 1e6).toFixed(1)} MB, video ${hasVideo ? 'H.264 1440x900' : 'MISSING'}, sound ${hasAudio ? 'AAC' : 'MISSING'} (peak ${level.maxDb} dB, mean ${level.meanDb} dB)`);
if (!hasVideo || !hasAudio || !audible || bytes > MAX_BYTES || (result && result.confirmed.length !== 18)) {
  console.error('[film] FAILED: the film is missing a stream, is silent, is too big, or the run did not confirm all 18');
  process.exitCode = 1;
}
console.log(`[film] review folder: ${dir}`);
