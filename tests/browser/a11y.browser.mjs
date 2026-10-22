// Accessibility on /play/, the landing page and /checked/ (M6 step 5). The save has every deduction confirmed (as in
// the Our Frame test) so every chapter opens. axe-core (WCAG 2 A and AA rules) runs on:
//   the landing page, the hub, each of the ten chapters, the codex drawer, the settings drawer, the guided tour on
//   one stop, and /checked/.
// Any violation fails the test, except the stated exclusions (EXCLUDED below, each with its reason). Then a
// keyboard check: on the hub Tab reaches every chapter button and Enter opens one; in Portrait the clocks marker
// moves with the arrow keys and Propose is reachable by Tab; in Our Frame the arrow keys move between sections.
// Ids: a11y.axe, a11y.keyboard. Console errors fail the test (the harness).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const SAVE_KEY = 'finder.save.v1';
const SEED = 'finder-1';
const JULIAN_YEAR_S = 365.25 * 86_400;
const CHAPTER_IDS = ['arrival', 'key', 'player', 'pictures', 'map', 'spot', 'trail', 'voices', 'portrait', 'epilogue'];
const RULES = ['wcag2a', 'wcag2aa'];

// Rules axe cannot judge honestly here. Colour contrast over WebGL and canvas pictures is not measurable (axe cannot
// read the pixels behind text laid over a canvas); text on the interface's own surfaces is checked by
// src/ui/contrast.test.ts over the theme tokens and by axe itself where the background is a plain colour.
const EXCLUDED = [];

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

let realCache = null;

/** The save: every deduction confirmed (portraitOpen: all but portrait.together, so the clocks marker can move). */
async function seedSave(page, baseUrl, { portraitOpen = false } = {}) {
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
  const ids = await page.evaluate(async () => (await import('/src/game/graph.ts')).ALL_NODES.map((n) => n.id));
  realCache ??= await realNodes(page, SEED);
  const real = realCache;
  const nodes = Object.fromEntries(ids.map((id) => [id, real[id] ?? { confirmed: true, attempts: [], hints: 0 }]));
  if (portraitOpen) nodes['portrait.together'] = { confirmed: false, attempts: [], hints: 0 };
  nodes['map.old'] = {
    confirmed: true,
    hints: 0,
    attempts: [
      {
        answer: null,
        ok: true,
        message: 'The map is old.',
        at: 1,
        result: [
          { key: 'years ago', value: 43_900 * JULIAN_YEAR_S, dim: 'time' },
          { key: 'youngest line age', value: 41_000 * JULIAN_YEAR_S, dim: 'time' },
          { key: 'oldest line age', value: 47_000 * JULIAN_YEAR_S, dim: 'time' },
        ],
      },
    ],
  };
  const save = JSON.stringify({
    version: 1,
    nodes,
    chapter: 'hub',
    settings: { humanGloss: false, masterVolume: 0.8, reducedMotion: true, soundCaptions: true, showWorking: false },
    seed: SEED,
  });
  await page.evaluate(([k, v]) => {
    localStorage.clear();
    localStorage.setItem(k, v);
  }, [SAVE_KEY, save]);
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
}

/** The nodes the real checkers confirm on their right answers (the same as portrait.browser.mjs), so the plate has its lines. */
async function realNodes(page, seed) {
  return page.evaluate(async (seed) => {
      const ok = (r) => ({ answer: null, ok: r.ok, result: r.result, message: r.message, at: 1 });
      const node = (r, answer) => ({ confirmed: r.ok, attempts: [{ ...ok(r), answer }], hints: 0 });
      const given = (answer) => ({ confirmed: true, attempts: [{ answer, ok: true, result: [], message: '', at: 1 }], hints: 0 });
      const A = await import('/src/chapters/arrival/checkers.ts');
      const AD = await import('/src/chapters/arrival/data.ts');
      const P = await import('/src/chapters/player/checkers.ts');
      const PP = await import('/src/chapters/player/physics.ts');
      const S = await import('/src/chapters/spot/checkers.ts');
      const SD = await import('/src/chapters/spot/data.ts');
      const C = await import('/src/science/clocks.ts');
      const E = await import('/src/chapters/shared/epochModel.ts');
      const T = await import('/src/chapters/trail/checkers.ts');
      const TP = await import('/src/chapters/trail/physics.ts');
      const M5 = await import('/src/chapters/pictures/checkersM5.ts');
      const U = await import('/src/ui/units.ts');
      const VC = await import('/src/chapters/voices/checkers.ts');
      const VD = await import('/src/chapters/voices/data.ts');
      const AL = await import('/src/chapters/pictures/album.ts');
      const MOD = await import('/src/game/model.ts');
      const BUS = await import('/src/game/bus.ts');
      const nodes = {};
      const a = AD.arrivalModel(seed);
      nodes['arrival.purpose'] = node(A.checkPurpose('radio', a), 'radio');
      nodes['arrival.fuelAge'] = node(A.checkFuelAge('pu238', a), 'pu238');
      nodes['player.speed'] = node(P.checkSpeed({ secondsPerTurn: PP.TRUE_PERIOD_S }), { secondsPerTurn: PP.TRUE_PERIOD_S });
      const s = SD.spotModel(seed);
      const spotAnswer = { countingTimeS: 86400, ageYears: C.ageFromU234(s.session.countsAt(86400)).ageYears };
      nodes['spot.age'] = node(S.checkAge(spotAnswer, s), spotAnswer);
      const m = await E.loadEpochModel(seed);
      await E.ensureParts(m, ['trail']);
      const row = TP.originRow(m);
      nodes['trail.origin'] = node(T.checkOrigin(m, { starId: 0 }), { starId: 0 });
      nodes['trail.age'] = node(T.checkAge(m, { years: Math.round(TP.meeting(m, row.star).yearsAgo) }), null);
      nodes['trail.neighbour'] = node(T.checkNeighbour(m, { distancePc: TP.rulerReading(m, row.star).distPc }), null);
      nodes['trail.when'] = node(T.checkWhen(m, { yearsAgo: Math.round(m.ages('sun').combined.estimate), frame: row.star.id }), null);
      const digits = Object.fromEntries(M5.TEACHING.L002.digits.map((d) => [String(d.glyph), d.value]));
      nodes['pictures.numerals'] = node(M5.checkNumerals({ table: digits }), { table: digits });
      nodes['pictures.units'] = node(M5.checkUnits({ secondInBeats: M5.SECOND_BEATS }), { secondInBeats: M5.SECOND_BEATS });
      nodes['pictures.home'] = node(M5.checkHome({ column: M5.HOME }), { column: M5.HOME });
      const reaches = M5.HEIGHTS.map((h) => h.metres / U.REACH_M);
      nodes['pictures.height'] = node(M5.checkHeight({ reaches }), { reaches });
      nodes['voices.many'] = node(VC.checkMany({ threshold: -30, gap: 0.25, groups: 3 }), null);
      const r = 2 ** (VD.V.music.violin.octaveCents / 1200);
      nodes['voices.octave'] = node(VC.checkOctave({ ratio: r, step: r ** (1 / 12) }), null);
      nodes['voices.others'] = node(VC.checkOthers({ track: 'ozma-03', start: 200, end: 220 }), null);
      // The world's colour: its three frames decoded from the tape at the reference settings, then the real checker.
      const ref = MOD.referenceBench();
      await BUS.dispatch({ type: 'decoder.reset' });
      const frames = ['L013', 'L014', 'L015'];
      // the checker also measures the frame before and after the three (they must not be the same scene)
      for (const f of ['L012', ...frames, 'L016']) await AL.developOne(f);
      nodes['pictures.colour'] = node(M5.checkColour((f) => AL.albumPicture(f), { frames }), { frames });
      // The decoder settings The Pictures confirmed: their accepted answers (what resumeSettings reads).
      nodes['pictures.lineTime'] = given({ lineTimeMs: ref.lineTimeMs });
      nodes['pictures.sync'] = given({ syncLock: true });
      nodes['pictures.interlace'] = given({ interlace: true });
      nodes['pictures.polarity'] = given({ polarity: 'negative' });
      nodes['pictures.aspect'] = given({ rows: ref.rows });
      const bad = Object.entries(nodes).filter(([, v]) => !v.confirmed).map(([k, v]) => `${k}: ${v.attempts[0].message.slice(0, 100)}`);
      return nodes;
  }, seed);
}

async function runAxe(page) {
  const has = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (!has) await page.addScriptTag({ content: axeSource });
  return page.evaluate(
    async ([rules, excluded]) => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: rules },
        rules: Object.fromEntries(excluded.map((id) => [id, { enabled: false }])),
        resultTypes: ['violations'],
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 200), why: (n.any[0] ?? n.all[0] ?? n.none[0])?.message?.slice(0, 200) ?? '' })),
      }));
    },
    [RULES, EXCLUDED],
  );
}

const send = (page, cmd) => page.evaluate((c) => window.__finder.dispatch(c), cmd);

export default async function run({ page, baseUrl, record, assert, log }) {
  const counts = {};
  const failures = [];
  const scan = async (name, settle = 1500) => {
    await page.waitForTimeout(settle);
    const v = await runAxe(page);
    for (const x of v) counts[x.id] = (counts[x.id] ?? 0) + x.nodes.length;
    log(`${name}: ${v.length === 0 ? 'no violations' : v.map((x) => `${x.id} x${x.nodes.length}`).join(', ')}`);
    for (const x of v) for (const n of x.nodes.slice(0, 3)) log(`    ${x.id} [${x.impact}] ${n.target} :: ${n.why} :: ${n.html}`);
    if (v.length > 0) failures.push(`${name}: ${v.map((x) => `${x.id} x${x.nodes.length}`).join(', ')}`);
  };

  // ---- the landing page and /checked/ ----
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await scan('landing', 800);
  await page.goto(`${baseUrl}/checked/`, { waitUntil: 'load' });
  await scan('checked', 800);

  // ---- the game ----
  await seedSave(page, baseUrl);
  await scan('hub', 800);

  for (const id of CHAPTER_IDS) {
    await send(page, { type: 'chapter.enter', chapter: id });
    await page.waitForFunction((c) => window.__finder.state().game.chapter === c, id, { timeout: 30_000 });
    await page.waitForSelector(`.bench-area[data-chapter="${id}"], [data-instrument="${id}"], [data-epilogue]`, { timeout: 60_000 });
    await scan(`chapter ${id}`, 2500);
  }

  await send(page, { type: 'chapter.enter', chapter: 'hub' });
  await send(page, { type: 'codex.open' });
  await page.waitForSelector('.codex, [data-codex]', { timeout: 10_000 }).catch(() => undefined);
  await scan('codex drawer', 600);
  await send(page, { type: 'codex.close' });
  await send(page, { type: 'settings.panel', open: true });
  await scan('settings drawer', 600);
  await send(page, { type: 'settings.panel', open: false });
  await send(page, { type: 'tour.start' });
  await page.waitForSelector('[data-tour-step]', { timeout: 30_000 });
  await scan('guided tour (first stop)', 1500);
  await send(page, { type: 'tour.exit' });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  record({
    id: 'a11y.axe',
    claim: 'axe-core finds no WCAG 2 A or AA violation on the landing page, the hub, the ten chapters, the codex and settings drawers, the guided tour and How it\'s checked',
    measured: `${total} violating elements over 17 pages${total ? ` (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`,
    expected: '0',
    tolerance: 'none',
    pass: total === 0,
    notes: `axe-core ${JSON.parse(readFileSync(createRequire(import.meta.url).resolve('axe-core/package.json'), 'utf8')).version}, tags ${RULES.join(', ')}; excluded rules: ${EXCLUDED.length ? EXCLUDED.join(', ') : 'none'}. The save has every deduction confirmed and reduced motion on.`,
  });
  assert(failures.length === 0, `axe violations:\n  ${failures.join('\n  ')}`);

  // ---- keyboard ----
  await send(page, { type: 'chapter.enter', chapter: 'hub' });
  await page.waitForSelector('.chap');
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const reached = new Set();
  for (let i = 0; i < 80 && reached.size < CHAPTER_IDS.length; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => (document.activeElement?.classList.contains('chap') ? document.activeElement.getAttribute('aria-label') : null));
    if (label) reached.add(label);
  }
  assert(reached.size === CHAPTER_IDS.length, `Tab reaches all ${CHAPTER_IDS.length} chapter buttons (reached ${reached.size}: ${[...reached].join('; ')})`);
  // Enter opens the focused one (the last reached).
  const focused = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  const wanted = await page.evaluate(async (label) => {
    const { CHAPTERS } = await import('/src/game/graph.ts');
    return CHAPTERS.find((c) => label.startsWith(`${c.title},`))?.id ?? null;
  }, focused);
  await page.keyboard.press('Enter');
  await page.waitForFunction((c) => window.__finder.state().game.chapter === c, wanted, { timeout: 30_000 });
  log(`hub: Tab reached ${reached.size} chapter buttons; Enter opened ${wanted}`);

  // Our Frame: the arrow keys move between sections.
  await send(page, { type: 'chapter.enter', chapter: 'epilogue' });
  await page.waitForSelector('[data-epilogue]', { timeout: 60_000 });
  const cur = () => page.evaluate(() => document.querySelector('[data-epilogue]').getAttribute('data-epilogue-current'));
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const s0 = await cur();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((a) => document.querySelector('[data-epilogue]').getAttribute('data-epilogue-current') !== a, s0, { timeout: 10_000 });
  const s1 = await cur();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((a) => document.querySelector('[data-epilogue]').getAttribute('data-epilogue-current') === a, s0, { timeout: 10_000 });
  log(`Our Frame: ArrowRight ${s0} to ${s1}, ArrowLeft back to ${s0}`);

  // Portrait: the marker moves with the arrows; Propose is reachable by Tab.
  await seedSave(page, baseUrl, { portraitOpen: true });
  await send(page, { type: 'chapter.enter', chapter: 'portrait' });
  await page.waitForSelector('[data-instrument="portrait"] [data-portrait-marker]', { timeout: 60_000 });
  await page.focus('[data-portrait-marker]');
  const val = () => page.evaluate(() => Number(document.querySelector('[data-portrait-marker]').getAttribute('aria-valuenow')));
  const v0 = await val();
  // The first step lands on the marker's grid; the next is one whole step; the left arrow steps back.
  await page.keyboard.press('ArrowRight');
  const v1 = await val();
  await page.keyboard.press('ArrowRight');
  const v2 = await val();
  await page.keyboard.press('ArrowLeft');
  const v3 = await val();
  assert(v1 > v0 && v2 > v1 && v3 < v2, `the clocks marker moves with the arrow keys (${v0}, ${v1}, ${v2}, ${v3})`);
  let proposeReached = false;
  for (let i = 0; i < 30 && !proposeReached; i++) {
    await page.keyboard.press('Tab');
    proposeReached = await page.evaluate(() => document.activeElement?.hasAttribute('data-portrait-propose') ?? false);
  }
  assert(proposeReached, 'Propose is reachable by Tab from the marker');

  record({
    id: 'a11y.keyboard',
    claim: 'The hub, Portrait and Our Frame work from the keyboard alone',
    measured: `Tab reached ${reached.size} of ${CHAPTER_IDS.length} chapter buttons and Enter opened ${wanted}; the Portrait marker moved ${v0} to ${v1} to ${v2} to ${v3} on the arrows and Propose took focus by Tab; Our Frame moved ${s0} to ${s1} and back on the arrows`,
    expected: 'all ten chapter buttons reached; the marker moves; Propose reachable; sections move',
    tolerance: 'none',
    pass: true,
  });
}
