// Start over leaves no chapter half-solved (the Argon review, section 2 item 4). From a save with The Key done,
// the player does a little in The Pictures (develops a frame, turns a picture, fills a numeral cell, sets the
// height), in The Map (rotates the map, assigns a line, sets the clock) and in The Trail (picks a star, sets
// the run-back), and has a recorded attempt. They press Start over through the settings panel. Then: nothing is
// confirmed or attempted, the chapters' instrument state is the first-run state, and re-entering each chapter
// shows an instrument with no assignments, no picked star and an album without the old frame. The models in
// use belong to the new seed. Console errors fail the test (the harness). Id: game.startOver.
const SAVE_KEY = 'finder.save.v1';
const KEY_DONE = ['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths'];

export default async function run({ page, baseUrl, assert, log }) {
  const nodes = Object.fromEntries(KEY_DONE.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));
  await page.addInitScript(
    ([key, nodes]) => {
      if (sessionStorage.getItem('reset-test-seeded')) return;
      sessionStorage.setItem('reset-test-seeded', '1');
      localStorage.setItem(key, JSON.stringify({ version: 1, nodes, chapter: 'hub', settings: { humanGloss: false, masterVolume: 0, reducedMotion: true, soundCaptions: true }, seed: 'reset-browser-test' }));
    },
    [SAVE_KEY, nodes],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const enter = (chapter) => page.evaluate((c) => window.__finder.dispatch({ type: 'chapter.enter', chapter: c }), chapter);
  const game = () => page.evaluate(() => window.__finder.state().game);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const seed0 = (await game()).seed;

  // ---- The Pictures: a developed frame, a turned picture, a numeral cell, a height ----
  await enter('pictures');
  await page.waitForSelector('.picinst[data-pictures-ready="true"]', { timeout: 90_000 });
  const frame = await page.evaluate(async () => (await import('/src/chapters/pictures/checkersM5.ts')).ALBUM_FRAMES[1]);
  const circle = await page.evaluate(async () => (await import('/src/chapters/pictures/measure.ts')).CIRCLE_FRAME);
  assert(frame !== circle, `the test frame ${frame} is not the circle`);
  await page.evaluate(async (f) => (await import('/src/chapters/pictures/album.ts')).developOne(f), frame);
  await page.evaluate(async () => {
    const w = await import('/src/chapters/pictures/workState.ts');
    w.openView('numerals');
    w.quarterTurns.value = 3;
    w.turnFrame.value = 'L002';
    w.numeralTable.value = { 0: 4 };
    w.heightCm.value = 12;
    w.stackStart.value = 'L003';
  });
  const albumBefore = await page.evaluate(async () => Object.keys((await import('/src/chapters/pictures/album.ts')).album.value));
  assert(albumBefore.includes(frame), `the album holds ${frame} before (${albumBefore.join(', ')})`);
  log(`pictures: album ${albumBefore.length} frame(s), numeral cell and height set`);

  // ---- The Map: the dial turned, a line assigned, the clock run back ----
  await enter('map');
  await page.waitForSelector('.mapinst[data-map-phase="ready"]', { timeout: 120_000 });
  await page.evaluate(async () => {
    const s = await import('/src/chapters/map/state.ts');
    s.assign(3, 'J0534+2200');
    s.selectedLine.value = 3;
    s.rotationDeg.value = 20;
    s.clockYears.value = -12345;
    s.origin.value = [5, 5];
  });
  assert(await page.evaluate(async () => Object.keys((await import('/src/chapters/map/state.ts')).assignments.value).length) === 1, 'a line is assigned on the map');

  // ---- The Trail: a star picked, the run-back set ----
  await enter('trail');
  await page.waitForSelector('.trinst[data-trail-ready="true"] .tr-chart[data-chart-ready="true"]', { timeout: 120_000 });
  await page.evaluate(async () => {
    const s = await import('/src/chapters/trail/state.ts');
    s.picked.value = 1;
    s.runYears.value = 20000;
  });
  assert((await page.evaluate(async () => (await import('/src/chapters/trail/state.ts')).picked.value)) === 1, 'a star is picked on the chart');

  // a recorded attempt through the bus (a wrong answer is an attempt, not an error)
  await enter('hub');
  await page.evaluate(() => window.__finder.dispatch({ type: 'deduction.propose', id: 'arrival.heat', answer: 1 }).catch(() => undefined));
  const before = await game();
  assert((before.nodes['arrival.heat']?.attempts.length ?? 0) > 0, 'an attempt is recorded before starting over');

  // ---- Start over, through the settings panel ----
  await page.evaluate(() => window.__finder.dispatch({ type: 'settings.panel', open: true }));
  await page.click('[data-start-over]');
  await page.click('[data-confirm-start-over]');
  await page.waitForFunction(() => window.__finder.state().game.confirmed.length === 0, null, { timeout: 10_000 });
  const after = await game();
  assert(after.chapter === 'hub', `back at the hub (${after.chapter})`);
  assert(after.seed !== seed0, `a new seed (${seed0} -> ${after.seed})`);
  assert(Object.values(after.nodes).every((n) => !n.confirmed && n.attempts.length === 0), 'no deduction is confirmed or attempted');

  // The instruments' state, read at once (before any chapter is entered).
  const state = await page.evaluate(async () => {
    const w = await import('/src/chapters/pictures/workState.ts');
    const a = await import('/src/chapters/pictures/album.ts');
    const sn = await import('/src/chapters/pictures/seen.ts');
    const m = await import('/src/chapters/map/state.ts');
    const t = await import('/src/chapters/trail/state.ts');
    return {
      work: { view: w.view.value, turn: w.turnFrame.value, q: w.quarterTurns.value, nums: w.numeralTable.value, h: w.heightCm.value, stack: w.stackStart.value, sec: w.secondReading.value },
      album: Object.keys(a.album.value), developing: a.developing.value, running: a.runningSide.value,
      watched: sn.watched.value, thumbs: Object.keys(sn.thumbs.value),
      map: { sel: m.selectedLine.value, asg: m.assignments.value, rot: m.rotationDeg.value, clock: m.clockYears.value, origin: m.origin.value, hasModel: m.model.value !== null, stage: m.stage.value },
      trail: { picked: t.picked.value, run: t.runYears.value, tool: t.tool.value, ends: t.rulerEnds.value, hasModel: t.model.value !== null, reading: t.reframeReading.value },
    };
  });
  assert(eq(state.work, { view: 'decoder', turn: null, q: 0, nums: {}, h: 0, stack: null, sec: { whole: 1, num: 0, den: 1, power: 0 } }), `Pictures work state is back to defaults (${JSON.stringify(state.work)})`);
  assert(state.album.length === 0 && state.developing === null && state.running === null, 'the album is empty');
  assert(state.watched.length === 0 && state.thumbs.length === 0, 'nothing is watched');
  assert(state.map.sel === null && eq(state.map.asg, {}) && state.map.rot === 140 && state.map.clock === 0 && eq(state.map.origin, [0, 0]) && !state.map.hasModel && state.map.stage === 'map.periods', `Map state is back to defaults (${JSON.stringify(state.map)})`);
  assert(state.trail.picked === null && state.trail.run === 0 && state.trail.tool === 'trail' && state.trail.ends.length === 0 && !state.trail.hasModel && state.trail.reading === null, `Trail state is back to defaults (${JSON.stringify(state.trail)})`);

  // ---- re-enter each chapter: The Key's nodes reopen them (a save load, not a deduction) ----
  await page.evaluate(async (ids) => {
    const { game: g } = await import('/src/game/state.ts');
    g.records.value = Object.fromEntries(ids.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));
  }, KEY_DONE);

  await enter('pictures');
  await page.waitForSelector('.picinst[data-pictures-ready="true"]', { timeout: 90_000 });
  const pic = await page.evaluate(async () => {
    const a = await import('/src/chapters/pictures/album.ts');
    const w = await import('/src/chapters/pictures/workState.ts');
    return { album: Object.keys(a.album.value), view: w.view.value, h: w.heightCm.value };
  });
  assert(!pic.album.includes(frame), `the old frame ${frame} is not in the new album (${pic.album.join(', ')})`);
  assert(pic.view === 'decoder' && pic.h === 0, 'The Pictures opens on the decoder with the defaults');

  await enter('map');
  await page.waitForSelector('.mapinst[data-map-phase="ready"]', { timeout: 120_000 });
  const map = await page.evaluate(async () => {
    const s = await import('/src/chapters/map/state.ts');
    const { game: g } = await import('/src/game/state.ts');
    return { asg: s.assignments.value, rot: s.rotationDeg.value, clock: s.clockYears.value, modelSeed: s.model.value?.seed, seed: g.seed.value, picks: document.querySelectorAll('[data-line-panel][data-pulsar]').length };
  });
  assert(Object.keys(map.asg).length === 0 && map.rot === 140 && map.clock === 0 && map.picks === 0, `The Map shows no assignments (${JSON.stringify(map)})`);
  assert(map.modelSeed === map.seed, `The Map's model is the new seed's (${map.modelSeed} vs ${map.seed})`);

  await enter('trail');
  await page.waitForSelector('.trinst[data-trail-ready="true"] .tr-chart[data-chart-ready="true"]', { timeout: 120_000 });
  const trail = await page.evaluate(async () => {
    const s = await import('/src/chapters/trail/state.ts');
    const { game: g } = await import('/src/game/state.ts');
    return { picked: s.picked.value, run: s.runYears.value, modelSeed: s.model.value?.seed, seed: g.seed.value, tool: document.querySelector('.trinst')?.getAttribute('data-tool') };
  });
  assert(trail.picked === null && trail.run === 0 && trail.tool === 'trail', `The Trail shows no picked star (${JSON.stringify(trail)})`);
  assert(trail.modelSeed === trail.seed, "The Trail's model is the new seed's");
  const g = await game();
  assert(g.confirmed.length === KEY_DONE.length, 'only the reopening nodes are confirmed after re-entering');
}
