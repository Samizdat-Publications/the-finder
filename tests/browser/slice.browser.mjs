// The slice bots (M3 step 8; PLAN.md "How it's checked" item 11). Two passes, each from a fresh save
// (storage cleared), through window.__finder only: the same command bus the interface sends (rule 5). The
// only other inputs are what a player's hands do to an instrument's own view (a scan tab, the lamp, a chain
// on the decay clock, a row of the atlas): clicks and keys on the real page. No game state is written
// directly.
//
// bot.slice: the right answers, in the order the gating allows, Arrival, The Key, The Player and The
//   Pictures to pictures.firstFrames. All 18 slice deductions confirm, the codex holds 18 entries, no console
//   errors (the harness fails the test on any). Screenshots at the key moments go to
//   review/inbox/<timestamp>-slice/frames/ with manifest.json (what each shows, in plain words) and shots.txt
//   (what the player did before each, for the blind critic).
// bot.wrongAnswers: every wrong choice each checker offers, once, each rejected with its result shown in the
//   chapter's notebook (and on the instrument's own result line where it has one), then the right answer.
//
// The right path is exported (playSlice) so tools/harness/film-slice.mjs films exactly the same run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { renderedMessage } from './rendered.mjs';

/** The 18 deductions of the slice (src/game/graph.ts), in the order the bot confirms them. */
export const SLICE_IDS = [
  'arrival.purpose', 'arrival.heat', 'arrival.madeNotMined', 'arrival.fuelAge',
  'key.binary', 'key.unit', 'key.timesNotLengths',
  'player.speed', 'player.start', 'player.direction', 'player.firstSound',
  'pictures.lineTime', 'pictures.sync', 'pictures.interlace', 'pictures.polarity', 'pictures.aspect', 'pictures.circle', 'pictures.firstFrames',
];

/** Hydrogen's spin-flip frequency, Hz (src/science/units.ts; the maser value, cover.md 1a): the cover's unit. */
const HYDROGEN_HZ = 1_420_405_751.768;
/** Where the stylus goes down: the lead-in, outside the music band's 146.05 mm (as tests/browser/player.browser.mjs). */
const OUTER_MM = 147.5;
/** The cover's line time in ms, as the player reads it with the key: 11,845,632 hydrogen periods (cover.md). */
const COVER_LINE_MS = 8.3396;
/** Rows that make the circle round (the cover's raster, PLAN.md check 8 and tests/browser/pictures.browser.mjs). */
const ROUND_ROWS = 355;

export function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

/** A review folder: review/inbox/<timestamp>-slice/ with frames/, manifest.json and shots.txt. */
export function reviewFolder(dir = join(ROOT, 'review', 'inbox', `${stamp()}-slice`)) {
  mkdirSync(join(dir, 'frames'), { recursive: true });
  const shots = [];
  const write = () => {
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), viewport: '1440x900', shots }, null, 2));
    writeFileSync(join(dir, 'shots.txt'), shots.map((s) => `${s.file}: ${s.did}`).join('\n') + '\n');
  };
  return {
    dir,
    shots,
    /** Screenshot the page now. `shows` is what is on screen; `did` is what the player did just before. */
    async shot(page, name, shows, did) {
      const file = `frames/frame_${String(shots.length + 1).padStart(2, '0')}_${name}.png`;
      await page.screenshot({ path: join(dir, file) });
      shots.push({ file, shows, did });
      write();
    },
  };
}

const sleep = (page, ms) => page.waitForTimeout(ms);

async function proposeOn(page, id, answer) {
  return page.evaluate(
    async ([id, answer]) => {
      await window.__finder.dispatch({ type: 'deduction.propose', id, answer });
      const n = window.__finder.state().game.nodes[id];
      return { confirmed: n.confirmed, last: n.attempts[n.attempts.length - 1] };
    },
    [id, answer],
  );
}

/** Open /play/ on a fresh save: storage cleared, then the page loaded, with the harness handle up. */
export async function freshStart(page, baseUrl, query = '') {
  await page.goto(`${baseUrl}/play/${query}`, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/play/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const g = await page.evaluate(() => window.__finder.state().game);
  if (g.confirmed.length !== 0 || g.chapter !== 'hub') throw new Error(`not a fresh save (${g.confirmed.length} confirmed, on ${g.chapter})`);
}

/**
 * The right-answer path through the slice. Options:
 *   shot(name, shows, did)  screenshot hook (the bot's review folder)
 *   linger(ms)              a pause where a player would look (the film); the bot passes nothing
 *   circleSpeed             'fast' (bot) or 'record' (film: the circle resolves line by line)
 *   assert, log
 * Returns { ms per chapter, firstSoundS, framesMs }.
 */
export async function playSlice(page, opts = {}) {
  const shot = opts.shot ?? (async () => undefined);
  const linger = opts.linger ?? (async () => undefined);
  const assert = opts.assert ?? ((c, m) => { if (!c) throw new Error(`assertion failed: ${m}`); });
  const log = opts.log ?? (() => undefined);
  const send = (cmd) => page.evaluate((c) => window.__finder.dispatch(c), cmd);
  const propose = async (id, answer) => {
    const r = await proposeOn(page, id, answer);
    assert(r.confirmed && r.last.ok, `${id} confirms (${r.last?.message})`);
    log(`${id}: ${r.last.message}`);
    return r.last;
  };
  const timing = {};
  let t = Date.now();
  const lap = (k) => {
    timing[k] = Date.now() - t;
    t = Date.now();
  };

  // ---------------- the ring, then Arrival ----------------
  await shot('ring-start', 'The opening screen: a ring of ten chapters drawn in alien glyphs; only Arrival is lit, the rest are dark or marked for later.', 'Opened the game for the first time.');
  await linger(2500);
  await send({ type: 'chapter.enter', chapter: 'arrival' });
  await page.waitForSelector('[data-instrument="arrival"][data-scene="ready"]', { timeout: 90_000 });
  await sleep(page, 2300); // the camera eases for 1.8 s
  await linger(4000);
  await shot('arrival-opening-scene', 'The opening scene: a cold machine drifting in the dark, a big dish and three long arms, under a sky of real stars; the structure scan is open beside it.', 'Chose Arrival on the ring and waited while the camera settled.');
  const scans = [
    { id: 'arrival.purpose', scan: 'structure', right: 'radio' },
    { id: 'arrival.heat', scan: 'heat', right: 'decay', shows: 'The heat scan: the machine in false colour, three cylinders on one arm faintly warm, with the power they give off.' },
    { id: 'arrival.madeNotMined', scan: 'isotopes', right: 'made', shows: 'The isotope scan: a mass spectrum of the warm cylinders, peaks for each kind of atom found inside.' },
    { id: 'arrival.fuelAge', scan: 'clock', right: 'pu238' },
  ];
  for (const s of scans) {
    await page.locator(`[data-scan-tab="${s.scan}"]`).click();
    await page.waitForSelector('[data-panel]');
    if (s.shows) {
      await sleep(page, 2300);
      await shot(`arrival-scan-${s.scan}`, s.shows, `Switched to the ${s.scan} scan.`);
    }
    if (s.scan === 'clock') {
      await page.locator('[data-chain-choice="pu238"]').check();
      await sleep(page, 2300);
      await linger(1500);
      await shot('arrival-decay-clock', 'The decay clock: one chain of decays chosen (plutonium to uranium to thorium) and the age it gives for the fuel, drawn as a curve with its error band.', 'Opened the clock scan and picked a decay chain.');
    }
    await propose(s.id, s.right);
  }
  await sleep(page, 600);
  await shot('arrival-done', 'Arrival finished: the fuel age confirmed, about forty-four thousand years, written in the alien units.', 'Chose the plutonium chain and proposed it.');
  lap('arrival');
  const g1 = await page.evaluate(() => window.__finder.state().game);
  assert(g1.chapterStatus.key === 'open', 'The Key opens after Arrival');

  // ---------------- The Key ----------------
  await send({ type: 'chapter.enter', chapter: 'key' });
  await page.evaluate(() => window.__finder.waitFor(() => document.querySelector('.keyinst[data-key-ready="true"]') !== null, 60_000));
  // Lower the lamp to raking light with the dial's own keys (the instrument's view, not game state): 80 to 10 deg.
  await page.locator('[data-lamp]').focus();
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowDown');
  const lamp = await page.locator('[data-lamp]').getAttribute('data-lamp');
  assert(lamp === '135,10', `the lamp is down to raking light (${lamp})`);
  await sleep(page, 800);
  await linger(2500);
  await shot('key-cover-raking-light', 'The cover of the disc under a low lamp: the etched strokes, circles and lines stand out in relief, lit from the side.', 'Opened The Key and dragged the lamp down low so it skims the plate.');
  await propose('key.binary', { reading: 'positional', one: 'across' });
  await page.locator('[data-atlas="hyperfine"]').click();
  await sleep(page, 500);
  await linger(1500);
  await page.locator('.atlas').scrollIntoViewIfNeeded();
  await shot('key-atlas', 'The atlas of hydrogen: five ways a hydrogen atom can change, each with the time it would make the cover\'s numbers mean; the spin flip is picked.', 'Read the strokes as base-two numbers, then picked a row in the hydrogen atlas.');
  await propose('key.unit', 'hyperfine');
  await propose('key.timesNotLengths', 'times');
  lap('key');

  // ---------------- The Player ----------------
  await send({ type: 'chapter.enter', chapter: 'player' });
  await page.waitForSelector('.playerinst[data-player-ready="true"]', { timeout: 30_000 });
  const cover = await page.evaluate(async () => (await fetch('/data/cover.json')).json());
  const T = parseInt(cover.record.rotationPeriod.binary, 2) / HYDROGEN_HZ;
  await send({ type: 'turntable.setSpeed', secondsPerTurn: T });
  await propose('player.speed', { secondsPerTurn: T });
  await send({ type: 'turntable.load', side: 1 });
  await propose('player.start', { radiusMm: OUTER_MM, secondsPerTurn: T });
  await send({ type: 'turntable.setDirection', direction: 'cw' });
  await propose('player.direction', { direction: 'cw' });
  await window_scrollTop(page);
  await linger(1500);
  await shot('player-turntable', 'The turntable: the gold disc on its platter, the speed set to the turn time read off the cover, the stylus arm over the outer edge, and a microscope view of the groove.', 'Set the platter speed from the cover, chose where the needle goes and the direction of turn.');
  const t0 = Date.now();
  await send({ type: 'turntable.drop', radiusMm: OUTER_MM });
  await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().game.nodes['player.firstSound'].confirmed, 90_000));
  const firstSoundS = (Date.now() - t0) / 1000;
  await page.waitForSelector('[data-heard="lines"]', { timeout: 5_000 });
  await shot('player-first-sound', 'The first sound off the disc: not music or speech but a buzz, one short shape repeating every 8.3 thousandths of a second; the notebook says it is a picture sent line by line.', 'Dropped the needle at the outer edge and listened.');
  await linger(6000);
  await send({ type: 'turntable.lift' });
  lap('player');

  // ---------------- The Pictures ----------------
  await send({ type: 'chapter.enter', chapter: 'pictures' });
  await page.waitForSelector('.picinst[data-pictures-ready="true"]', { timeout: 90_000 });
  await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().decoder.status === 'done', 60_000));
  await window_scrollTop(page);
  await linger(2500);
  await shot('pictures-free-running', 'The picture decoder free-running on the first sound: the lines stack into noise slanting across the screen, nothing recognisable yet.', 'Opened The Pictures; the decoder drew the signal with its own default settings.');
  const set = async (name, value, speed = 'fast') => {
    await page.evaluate(
      async ([name, value, speed]) => {
        await window.__finder.dispatch({ type: 'decoder.setParam', name, value });
        await window.__finder.dispatch({ type: 'decoder.run', speed });
      },
      [name, value, speed],
    );
  };
  const bench = () => page.evaluate(() => window.__finder.state().decoder.bench);
  const settings = async () => {
    const b = await bench();
    return { lineTimeMs: b.lineTimeMs, syncLock: b.syncLock, interlace: b.interlace, polarity: b.polarity, rows: b.rows };
  };
  await set('lineTimeMs', COVER_LINE_MS);
  await propose('pictures.lineTime', { lineTimeMs: (await bench()).lineTimeMs });
  await set('syncLock', true);
  await propose('pictures.sync', { lineTimeMs: COVER_LINE_MS, syncLock: true });
  await set('interlace', true);
  await propose('pictures.interlace', { interlace: true });
  await set('polarity', 'negative');
  await propose('pictures.polarity', { polarity: 'negative' });
  const circleSpeed = opts.circleSpeed ?? 'fast';
  await set('rows', ROUND_ROWS, circleSpeed);
  if (circleSpeed === 'record') await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().decoder.status === 'done', 60_000));
  await propose('pictures.aspect', { rows: ROUND_ROWS });
  await propose('pictures.circle', await settings());
  await page.waitForSelector('.pic-they');
  await window_scrollTop(page);
  await linger(5000);
  await shot('pictures-round-circle', 'The calibration circle, decoded from the disc, comes out perfectly round; the notebook reads "They see."', 'Set the line time from the cover, locked to the sync pulses, turned on interlace, flipped polarity and set the rows.');
  const frames = await page.evaluate(async () => (await import('/src/chapters/pictures/checkers.ts')).FIRST_FRAMES.slice(0, 3));
  const framesMs = [];
  for (const [i, f] of frames.entries()) {
    await page.evaluate((f) => window.__finder.dispatch({ type: 'decoder.select', frame: f }), f);
    const s0 = Date.now();
    const runP = page.evaluate(() => window.__finder.dispatch({ type: 'decoder.run', speed: 'record' }));
    if (i === 0) {
      await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().decoder.revealed > 220, 30_000));
      await shot('pictures-frame-developing', 'A picture developing line by line at the speed the disc plays it: the top half drawn, the rest still dark.', 'Chose the next picture on the disc and let it play at record speed.');
    }
    await runP;
    framesMs.push(Date.now() - s0);
    if (i === 0) await linger(3000);
  }
  await page.waitForFunction((n) => document.querySelectorAll('.pic-seen [data-seen]').length >= n, frames.length);
  await propose('pictures.firstFrames', { watched: frames, settings: await settings() });
  await sleep(page, 400);
  await shot('pictures-seen', 'Three pictures developed after the circle, kept as small gold thumbnails under the decoder.', 'Watched three pictures develop.');
  lap('pictures');

  // ---------------- the codex and the ring at the end ----------------
  await send({ type: 'codex.open', id: 'pictures.circle' });
  await sleep(page, 700); // the drawer slides in
  const entries = await page.locator('[data-entry]').count();
  await linger(2500);
  await shot('codex', 'The codex: a drawer of everything worked out so far, each entry titled in alien glyphs with its notation and a link to how it is checked.', 'Opened the codex.');
  await send({ type: 'codex.close' });
  await send({ type: 'chapter.enter', chapter: 'hub' });
  await sleep(page, 900);
  await linger(3000);
  await shot('ring-end', 'The ring at the end of the slice: Arrival, The Key, The Player and The Pictures done; the chapters they opened now lit.', 'Went back to the ring.');

  const g = await page.evaluate(() => window.__finder.state().game);
  return { timing, firstSoundS, framesMs, frames, entries, confirmed: g.confirmed, chapterStatus: g.chapterStatus };
}

async function window_scrollTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
}

// ---------------- the wrong-answer pass ----------------

/** Propose a wrong answer and check it is rejected and its result is shown. Returns the result's message. */
async function rejectShown(page, assert, id, answer) {
  const r = await proposeOn(page, id, answer);
  assert(!r.confirmed && r.last && r.last.ok === false, `${id}: ${JSON.stringify(answer)} is rejected`);
  assert(r.last.message.length > 20, `${id}: ${JSON.stringify(answer)} gives a result (${r.last.message})`);
  // The chapter's notebook lists every answer that did not hold (src/ui/Workbench.tsx), newest last.
  const shown = await renderedMessage(page, r.last.message);
  const listed = await page.locator(`[data-node="${id}"] details.wrong li`).last().textContent();
  assert(listed === shown, `${id}: the rejected result is shown in the notebook`);
  // The instrument's own result line, where the chapter has one (Arrival, The Key).
  const line = page.locator(`[data-result="${id}"]`);
  if ((await line.count()) > 0) {
    assert(/^(0|false)$/.test((await line.getAttribute('data-ok')) ?? ''), `${id}: the instrument shows the rejection`);
    assert(((await line.innerText()) ?? '').includes(shown.slice(0, 40)), `${id}: the instrument shows the computed result`);
  }
  return r.last.message;
}

async function wrongAnswerPass(page, baseUrl, assert, log) {
  await freshStart(page, baseUrl);
  const send = (cmd) => page.evaluate((c) => window.__finder.dispatch(c), cmd);
  const played = [];
  const wrong = async (id, answer, label) => {
    const message = await rejectShown(page, assert, id, answer);
    played.push({ id, wrong: label ?? JSON.stringify(answer), message });
  };
  const right = async (id, answer) => {
    const r = await proposeOn(page, id, answer);
    assert(r.confirmed, `${id}: the right answer confirms after the wrong ones (${r.last?.message})`);
  };

  // The choices the instruments offer, read from the source (data, not interface code).
  const offered = await page.evaluate(async () => {
    const arrival = (await import('/src/chapters/arrival/choices.ts')).CHOICES;
    const transitions = (await import('/src/chapters/key/physics.ts')).TRANSITIONS.map((t) => t.id);
    const spotAt = (await import('/src/chapters/player/physics.ts')).spotAt;
    const radii = [155, 150.6, 150.2, 149.6, 120, 55, 30].map((r) => ({ r, spot: spotAt(r) }));
    return { arrival: Object.fromEntries(Object.entries(arrival).map(([k, v]) => [k, v.map((c) => c.id)])), transitions, radii };
  });

  // ---- Arrival ----
  await send({ type: 'chapter.enter', chapter: 'arrival' });
  await page.waitForSelector('[data-instrument="arrival"][data-scene="ready"]', { timeout: 90_000 });
  const arrivalRight = { 'arrival.purpose': 'radio', 'arrival.heat': 'decay', 'arrival.madeNotMined': 'made', 'arrival.fuelAge': 'pu238' };
  const scanOf = { 'arrival.purpose': 'structure', 'arrival.heat': 'heat', 'arrival.madeNotMined': 'isotopes', 'arrival.fuelAge': 'clock' };
  for (const [id, ok] of Object.entries(arrivalRight)) {
    await page.locator(`[data-scan-tab="${scanOf[id]}"]`).click();
    await page.waitForSelector(`[data-panel]`);
    const choices = offered.arrival[id];
    assert(choices.includes(ok), `${id}: the right answer is among the choices offered`);
    for (const w of choices.filter((c) => c !== ok)) {
      if (id === 'arrival.fuelAge') await page.locator(`[data-chain-choice="${w}"]`).check();
      await wrong(id, w);
    }
    if (id === 'arrival.fuelAge') await page.locator('[data-chain-choice="pu238"]').check();
    await right(id, ok);
  }

  // ---- The Key ----
  await send({ type: 'chapter.enter', chapter: 'key' });
  await page.evaluate(() => window.__finder.waitFor(() => document.querySelector('.keyinst[data-key-ready="true"]') !== null, 60_000));
  // The four wrong readings the strokes panel offers (src/chapters/key/BinaryPanel.tsx).
  for (const a of [{ reading: 'positional', one: 'along' }, { reading: 'tally' }, { reading: 'letters' }, { reading: 'decoration' }]) await wrong('key.binary', a);
  await right('key.binary', { reading: 'positional', one: 'across' });
  assert(offered.transitions.includes('hyperfine') && offered.transitions.length === 5, `the atlas offers five transitions (${offered.transitions})`);
  for (const tr of offered.transitions.filter((x) => x !== 'hyperfine')) await wrong('key.unit', tr);
  await right('key.unit', 'hyperfine');
  await wrong('key.timesNotLengths', 'lengths');
  await right('key.timesNotLengths', 'times');

  // ---- The Player ----
  await send({ type: 'chapter.enter', chapter: 'player' });
  await page.waitForSelector('.playerinst[data-player-ready="true"]', { timeout: 30_000 });
  await send({ type: 'turntable.setVolume', value: 0 });
  const cover = await page.evaluate(async () => (await fetch('/data/cover.json')).json());
  const T = parseInt(cover.record.rotationPeriod.binary, 2) / HYDROGEN_HZ;
  for (const s of [3.47, 3.8]) {
    await send({ type: 'turntable.setSpeed', secondsPerTurn: s });
    await wrong('player.speed', { secondsPerTurn: s }, `${s} s per turn`);
  }
  await send({ type: 'turntable.setSpeed', secondsPerTurn: T });
  await right('player.speed', { secondsPerTurn: T });
  // One radius for each wrong place the needle can land (off the disc, the rim, partway into the music, the
  // run-out, the label), each classified by the instrument's own spotAt.
  const bySpot = new Map();
  for (const { r, spot } of offered.radii) if (spot !== 'leadin' && !bySpot.has(spot)) bySpot.set(spot, r);
  assert(['off', 'rim', 'music', 'runout', 'label'].every((s) => bySpot.has(s)), `a radius for every wrong landing (${[...bySpot.keys()]})`);
  for (const [spot, r] of bySpot) await wrong('player.start', { radiusMm: r, secondsPerTurn: T }, `needle at ${r} mm (${spot})`);
  await right('player.start', { radiusMm: OUTER_MM, secondsPerTurn: T });
  await send({ type: 'turntable.setDirection', direction: 'ccw' });
  await wrong('player.direction', { direction: 'ccw' }, 'counter-clockwise');
  await send({ type: 'turntable.setDirection', direction: 'cw' });
  await right('player.direction', { direction: 'cw' });
  // player.firstSound is a turntable state the instrument proposes once it is right; the wrong states it can
  // be in (what the stylus hears), proposed through the bus as the player test does for the opening.
  const base = { side: 1, secondsPerTurn: T, direction: 'cw', down: true, region: 'music', timeS: 30, listenedS: 4 };
  const states = [
    ['the other side', { ...base, side: 2 }],
    ['needle up', { ...base, down: false, region: null, timeS: null }],
    ['turning backward', { ...base, direction: 'ccw' }],
    ['too fast', { ...base, secondsPerTurn: 3.47 }],
    ['locked in the run-out', { ...base, region: 'runout', timeS: 1700 }],
    ['still in the lead-in', { ...base, region: 'leadin', timeS: 0 }],
    ['the opening, before the first line', { ...base, timeS: 6 }],
    ['partway into the side', { ...base, timeS: 1500 }],
    ['the lines only just begun', { ...base, listenedS: 1 }],
  ];
  for (const [label, st] of states) await wrong('player.firstSound', st, label);
  const fsMessages = played.filter((p) => p.id === 'player.firstSound').map((p) => p.message);
  assert(new Set(fsMessages).size === states.length, `each wrong turntable state gives its own result (${new Set(fsMessages).size} distinct of ${states.length})`);
  await send({ type: 'turntable.load', side: 1 });
  await send({ type: 'turntable.drop', radiusMm: OUTER_MM });
  await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().game.nodes['player.firstSound'].confirmed, 90_000));
  await send({ type: 'turntable.lift' });

  // ---- The Pictures ----
  await send({ type: 'chapter.enter', chapter: 'pictures' });
  await page.waitForSelector('.picinst[data-pictures-ready="true"]', { timeout: 90_000 });
  await page.evaluate(() => window.__finder.waitFor(() => window.__finder.state().decoder.status === 'done', 60_000));
  const set = (name, value) =>
    page.evaluate(
      async ([name, value]) => {
        await window.__finder.dispatch({ type: 'decoder.setParam', name, value });
        await window.__finder.dispatch({ type: 'decoder.run', speed: 'fast' });
      },
      [name, value],
    );
  const bench = () => page.evaluate(() => window.__finder.state().decoder.bench);
  const startMs = (await bench()).lineTimeMs;
  await wrong('pictures.lineTime', { lineTimeMs: startMs }, `the player's own line time, ${startMs.toFixed(3)} ms`);
  await set('lineTimeMs', COVER_LINE_MS);
  await right('pictures.lineTime', { lineTimeMs: (await bench()).lineTimeMs });
  await wrong('pictures.sync', { lineTimeMs: COVER_LINE_MS, syncLock: false }, 'free-running');
  await set('syncLock', true);
  await right('pictures.sync', { lineTimeMs: COVER_LINE_MS, syncLock: true });
  await wrong('pictures.interlace', { interlace: false }, 'no interlace');
  await set('interlace', true);
  await right('pictures.interlace', { interlace: true });
  await wrong('pictures.polarity', { polarity: 'positive' }, 'positive');
  await set('polarity', 'negative');
  await right('pictures.polarity', { polarity: 'negative' });
  await wrong('pictures.aspect', { rows: 512 }, '512 rows');
  await set('rows', ROUND_ROWS);
  await right('pictures.aspect', { rows: ROUND_ROWS });
  const good = { lineTimeMs: COVER_LINE_MS, syncLock: true, interlace: true, polarity: 'negative', rows: ROUND_ROWS };
  await wrong('pictures.circle', { ...good, polarity: 'positive' }, 'every setting but polarity');
  await right('pictures.circle', good);
  await wrong('pictures.firstFrames', { watched: [], settings: good }, 'nothing watched');
  const frames = await page.evaluate(async () => (await import('/src/chapters/pictures/checkers.ts')).FIRST_FRAMES.slice(0, 3));
  for (const f of frames) {
    await page.evaluate((f) => window.__finder.dispatch({ type: 'decoder.select', frame: f }), f);
    await page.evaluate(() => window.__finder.dispatch({ type: 'decoder.run', speed: 'record' }));
  }
  await page.waitForFunction((n) => document.querySelectorAll('.pic-seen [data-seen]').length >= n, frames.length);
  await right('pictures.firstFrames', { watched: frames, settings: good });

  const g = await page.evaluate(() => window.__finder.state().game);
  return { played, confirmed: g.confirmed };
}

export default async function run({ page, baseUrl, record, assert, log }) {
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---------------- bot.slice ----------------
  const started = Date.now();
  await freshStart(page, baseUrl);
  const review = reviewFolder();
  const res = await playSlice(page, { shot: (n, s, d) => review.shot(page, n, s, d), assert, log: () => undefined });
  const sliceS = (Date.now() - started) / 1000;
  const missing = SLICE_IDS.filter((id) => !res.confirmed.includes(id));
  assert(missing.length === 0, `all 18 slice deductions confirmed (missing: ${missing.join(', ')})`);
  assert(res.confirmed.length === 18, `exactly 18 confirmed (${res.confirmed.length})`);
  assert(res.entries === 18, `the codex holds 18 entries (${res.entries})`);
  for (const c of ['arrival', 'key', 'player', 'pictures']) assert(res.chapterStatus[c] === 'done', `${c} is done`);
  log(`right path: ${res.confirmed.length} confirmed, codex ${res.entries} entries, ${sliceS.toFixed(1)} s (${Object.entries(res.timing).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`).join(', ')}); first sound ${res.firstSoundS.toFixed(1)} s after the drop; frames ${res.framesMs.join(', ')} ms`);
  log(`${review.shots.length} screenshots in ${review.dir}`);
  record({
    id: 'bot.slice',
    claim: 'A bot plays the slice from a fresh save through the command bus the interface uses (Arrival, The Key, The Player, The Pictures) with the right answers: every deduction confirms, the codex holds every entry, and nothing errors.',
    measured: `${res.confirmed.length} of 18 deductions confirmed; codex ${res.entries} entries; chapters done: arrival, key, player, pictures; ${sliceS.toFixed(0)} s; ${review.shots.length} screenshots`,
    expected: '18 of 18 confirmed (src/game/graph.ts: 4 Arrival, 3 Key, 4 Player, 7 Pictures), 18 codex entries, no console errors (PLAN.md How it\'s checked item 11)',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });

  // ---------------- bot.wrongAnswers ----------------
  const w0 = Date.now();
  const wr = await wrongAnswerPass(page, baseUrl, assert, log);
  const wrongS = (Date.now() - w0) / 1000;
  const missingW = SLICE_IDS.filter((id) => !wr.confirmed.includes(id));
  assert(missingW.length === 0, `after the wrong answers every slice deduction still confirms (missing: ${missingW.join(', ')})`);
  const perNode = Object.fromEntries(SLICE_IDS.map((id) => [id, wr.played.filter((p) => p.id === id).length]));
  const without = SLICE_IDS.filter((id) => perNode[id] === 0);
  assert(without.length === 0, `every deduction had at least one wrong answer played (none for: ${without.join(', ')})`);
  for (const p of wr.played) log(`${p.id} ${p.wrong}: ${p.message}`);
  log(`wrong answers: ${wr.played.length} played, all rejected and shown; ${wrongS.toFixed(1)} s`);
  record({
    id: 'bot.wrongAnswers',
    claim: 'From a fresh save, every wrong choice each slice checker offers is played once through the command bus, rejected, and its computed result shown in the notebook (and on the instrument where it has a result line); then the right answer confirms.',
    measured: `${wr.played.length} wrong answers over 18 deductions, all rejected and shown (${SLICE_IDS.map((id) => `${id} ${perNode[id]}`).join(', ')}); all 18 then confirmed; ${wrongS.toFixed(0)} s`,
    expected: 'each wrong answer rejected with its result shown; the arrival choices and hydrogen transitions read from the source; the player and picture wrong states one per distinct result',
    tolerance: 'exact (interface behaviour)',
    pass: true,
  });
}
