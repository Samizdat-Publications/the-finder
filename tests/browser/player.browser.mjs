// The Player on /play/, played through window.__finder only (the same command bus the interface uses), with
// the live audio context muted (volume 0): each wrong answer once (each rejected with its computed result:
// k and semitones, the run-out's click every turn, the label's silence, the groove carried outward and the
// side played backward, the opening before the first line), then the right sequence; the first sound is
// confirmed by the instrument itself once the stylus has heard the picture lines. Then the bench's radius
// readout follows a needle dropped through the bus (item 6). The save starts with The Key done (a returning
// player). Captures go to harness/out/player-captures/. Console errors fail the test. Id: chapter.player.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';

const OUT = join(ROOT, 'harness', 'out', 'player-captures');
const SAVE_KEY = 'finder.save.v1';
/** Hydrogen's spin-flip frequency, Hz (src/science/units.ts; the maser value, cover.md 1a): the cover's unit. */
const HYDROGEN_HZ = 1_420_405_751.768;

export default async function run({ page, baseUrl, record, assert, log }) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ([key]) => {
      if (sessionStorage.getItem('player-test-seeded')) return;
      sessionStorage.setItem('player-test-seeded', '1');
      const done = { confirmed: true, attempts: [], hints: 0 };
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          nodes: { 'arrival.purpose': done, 'key.binary': done, 'key.unit': done, 'key.timesNotLengths': done },
          chapter: 'hub',
          settings: { humanGloss: false, masterVolume: 0.8, reducedMotion: false, soundCaptions: false },
          seed: 'player-browser-test',
        }),
      );
    },
    [SAVE_KEY],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });

  const f = (fn, arg) => page.evaluate(fn, arg);
  const send = (cmd) => f((c) => window.__finder.dispatch(c), cmd);
  const propose = (id, answer) =>
    f(
      async ([id, answer]) => {
        await window.__finder.dispatch({ type: 'deduction.propose', id, answer });
        const n = window.__finder.state().game.nodes[id];
        return n.attempts[n.attempts.length - 1];
      },
      [id, answer],
    );
  const reading = (attempt, key) => attempt.result.find((r) => r.key === key)?.value;
  const tt = () => f(() => window.__finder.state().turntable);
  const shot = (name, selector) => (selector ? page.locator(selector).first() : page).screenshot({ path: join(OUT, `${name}.png`) });

  // The cover's turn time, from the cover's binary and hydrogen's period (cover.md 1b: 3.59994 s).
  const cover = await f(async () => (await fetch('/data/cover.json')).json());
  const T = parseInt(cover.record.rotationPeriod.binary, 2) / HYDROGEN_HZ;

  assert((await f(() => window.__finder.state().game.chapterStatus.player)) === 'open', 'The Player is open after The Key');
  await send({ type: 'chapter.enter', chapter: 'player' });
  await page.waitForSelector('.playerinst[data-player-ready="true"]', { timeout: 30_000 });
  await send({ type: 'turntable.setVolume', value: 0 });
  const start = await tt();
  assert(Math.abs(start.secondsPerTurn - T) > 0.1, `the platter does not start at the cover's speed (${start.secondsPerTurn.toFixed(3)} s)`);

  // ---- capture: the cover's record drawings read through the key ----
  await page.locator('[data-group="record.rotationPeriod"] line.hit').first().hover({ force: true });
  await page.waitForTimeout(400);
  await shot('1-cover-record-drawing', '.pview');
  const shown = {};

  // ---- player.speed: 3.47 s per turn first (heard at k on the engine), then the cover's ----
  await send({ type: 'turntable.setSpeed', secondsPerTurn: 3.47 });
  await send({ type: 'turntable.load', side: 1 });
  await send({ type: 'turntable.drop', radiusMm: 140 });
  const kHeard = (await tt()).needle.speedRatio;
  const fast = await propose('player.speed', { secondsPerTurn: 3.47 });
  const kExpected = T / 3.47;
  assert(!fast.ok && Math.abs(reading(fast, 'speed ratio') - kExpected) < 1e-9 && Math.abs(kHeard - kExpected) < 1e-9, `3.47 s per turn: k ${reading(fast, 'speed ratio')} reported, ${kHeard} on the engine`);
  assert(Math.abs(reading(fast, 'semitones') - 12 * Math.log2(kExpected)) < 1e-9, 'semitones = 12 log2 k');
  shown.speed = fast.message;
  await send({ type: 'turntable.setSpeed', secondsPerTurn: T });
  const speed = await propose('player.speed', { secondsPerTurn: T });
  assert(speed.ok, `the cover's turn time confirms player.speed (${speed.message})`);

  // ---- player.start: the run-out, the label, then the outer edge ----
  const s = 2.4;
  await send({ type: 'turntable.setSpeed', secondsPerTurn: s });
  await send({ type: 'turntable.drop', radiusMm: 55 });
  await f(() => window.__finder.waitFor(() => window.__finder.state().turntable.needle?.region === 'runout', 10_000));
  const run = await propose('player.start', { radiusMm: 55, secondsPerTurn: s });
  assert(!run.ok && reading(run, 'needle lands on') === 'runout' && Math.abs(reading(run, 'click every') - T / (T / s)) < 1e-9, `the run-out clicks every T/k = ${s} s`);
  await page.waitForSelector('[data-heard="clicks"]', { timeout: 10_000 });
  await shot('4-needle-at-runout', '.pdeck');
  shown.runout = run.message;
  await send({ type: 'turntable.lift' });
  const label = await propose('player.start', { radiusMm: 30 });
  assert(!label.ok && reading(label, 'needle lands on') === 'label', 'the label plays nothing');
  shown.label = label.message;
  await send({ type: 'turntable.setSpeed', secondsPerTurn: T });
  const outer = 147.5; // the lead-in, outside the music band's 146.05 mm (where the cover draws the stylus)
  const startOk = await propose('player.start', { radiusMm: outer, secondsPerTurn: T });
  assert(startOk.ok, `a drop at the outer edge confirms player.start (${startOk.message})`);

  // ---- player.direction: counter-clockwise plays backward and the microscope shows the groove going out ----
  await send({ type: 'turntable.setDirection', direction: 'ccw' });
  await send({ type: 'turntable.drop', radiusMm: 120 });
  const t0 = (await tt()).needle.timeS;
  await page.waitForTimeout(1500);
  const t1 = (await tt()).needle.timeS;
  const ccw = await propose('player.direction', { direction: 'ccw' });
  assert(!ccw.ok && reading(ccw, 'groove carries the needle') === 'outward' && reading(ccw, 'plays') === 'backward' && t1 < t0, `ccw: outward and backward (side time ${t0.toFixed(2)} to ${t1.toFixed(2)} s)`);
  assert((await page.locator('.microscope[data-microscope="ccw"] [data-carried="outward"]').count()) === 1, 'the microscope shows the groove carried outward');
  await shot('3b-microscope-ccw', '.microscope');
  shown.direction = ccw.message;
  await send({ type: 'turntable.setDirection', direction: 'cw' });
  await page.waitForTimeout(600);
  assert((await page.locator('.microscope[data-microscope="cw"] [data-carried="inward"]').count()) === 1, 'the microscope shows the groove carried inward');
  await shot('3a-microscope-cw', '.microscope');
  const cw = await propose('player.direction', { direction: 'cw' });
  assert(cw.ok && reading(cw, 'groove carries the needle') === 'inward', 'clockwise confirms player.direction');

  // ---- player.firstSound: a wrong state once, then the instrument hears the lines itself ----
  const st = await tt();
  const early = await propose('player.firstSound', { side: 1, secondsPerTurn: T, direction: 'cw', down: true, region: 'music', timeS: 6, listenedS: 4 });
  assert(!early.ok && /opening/.test(early.message), 'before the first line: not yet');
  shown.opening = early.message;
  assert(st.direction === 'cw', 'direction set');
  const t0ms = Date.now();
  await send({ type: 'turntable.drop', radiusMm: outer });
  await f(() => window.__finder.waitFor(() => window.__finder.state().game.nodes['player.firstSound'].confirmed, 90_000));
  const waitedS = (Date.now() - t0ms) / 1000;
  const fs = await f(() => {
    const n = window.__finder.state().game.nodes['player.firstSound'];
    return n.attempts[n.attempts.length - 1];
  });
  const period = reading(fs, 'repeats every');
  // images-and-audio.md section 1: the tape's line period measured at 8.326 ms (quoted to 0.001 ms).
  assert(fs.ok && Math.abs(period * 1000 - 8.326) < 0.001 && /picture, sent line by line/.test(fs.message), `the first sound: a pattern every ${(period * 1000).toFixed(4)} ms`);
  await page.waitForSelector('[data-heard="lines"]', { timeout: 5_000 });
  await shot('2-turntable-right-speed-first-sound', '.ppanels');
  await shot('5-whole-chapter');
  const g = await f(() => window.__finder.state().game);
  assert(g.chapterStatus.player === 'done', 'The Player is done');
  log(`first sound confirmed ${waitedS.toFixed(1)} s after the drop: every ${(period * 1000).toFixed(4)} ms`);
  for (const [k, v] of Object.entries(shown)) log(`${k}: ${v}`);
  await send({ type: 'turntable.lift' });

  // ---- item 6: the bench's radius readout follows a needle dropped through the bus ----
  await page.goto(`${baseUrl}/play/bench/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  await send({ type: 'turntable.setVolume', value: 0 });
  await send({ type: 'turntable.load', side: 1 });
  await send({ type: 'turntable.drop', radiusMm: 120 });
  await page.waitForFunction(() => /^120\.0\d mm/.test(document.querySelector('label[for="radius"] output')?.textContent ?? ''), null, { timeout: 10_000 });
  const benchReadout = await page.locator('label[for="radius"] output').innerText();
  await send({ type: 'turntable.lift' });
  log(`bench readout after a bus drop at 120 mm: ${benchReadout}`);

  record({
    id: 'chapter.player',
    claim: 'The Player plays in the browser: a wrong speed is heard shifted by exactly k, the run-out clicks once per turn, the label is silent, the wrong direction carries the groove outward and plays backward, and with all three right the first sound off side 1 is the picture signal, a pattern repeating every line.',
    measured: `3.47 s per turn: k ${kExpected.toFixed(5)} on the engine and in the result, ${reading(fast, 'semitones').toFixed(3)} semitones; run-out clicks every ${reading(run, 'click every')} s at 2.4 s per turn; ccw side time ${t0.toFixed(2)} to ${t1.toFixed(2)} s in 1.5 s; first sound every ${(period * 1000).toFixed(4)} ms, confirmed ${waitedS.toFixed(1)} s after a drop at ${outer} mm; bench readout "${benchReadout}"`,
    expected: 'k = 3.59994 / 3.47 from the cover (cover.md 1b); one click per turn; the tape\'s 8.326 ms line period (images-and-audio.md section 1); the Node checkers\' results',
    tolerance: 'k and semitones to 1e-9 (same arithmetic); line period within 0.001 ms (the research quotes it to that place)',
    pass: true,
  });
}
