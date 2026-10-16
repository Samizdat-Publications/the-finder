// The Map on /play/, played through its instrument (the same command bus the bots use): turn the cover's map
// with the dial until its long line points at the Galactic centre, choose lines and click their pulsars on the
// chart, run the spin-down clock, drag the axis across the sky, slide the map's origin. Each deduction is
// proposed once wrong (and refused with what it computed), then right. Played at 1440 x 900 and again at
// 1366 x 768; console errors fail the test (the harness); frame times and the main thread's longest tasks are
// recorded. Captures go to harness/out/map-captures/, or with MAP_REVIEW=1 to review/inbox/<stamp>-map/ with
// a manifest.json. The save starts with The Key confirmed (The Map needs key.timesNotLengths). Id: chapter.map.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';

const SAVE_KEY = 'finder.save.v1';
const SEED = 'finder-1';
const done = (ids) => Object.fromEntries(ids.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));
const stampNow = () => new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, '');

export default async function run({ page, baseUrl, record, assert, log }) {
  const review = process.env.MAP_REVIEW === '1';
  const outRoot = review ? join(ROOT, 'review', 'inbox', `${stampNow()}-map`) : join(ROOT, 'harness', 'out', 'map-captures');
  const manifest = { made: new Date().toISOString(), note: 'The Map (M4 step 3): each frame says what it shows; measured: page scroll and text under the clue sizes.', sizes: {} };
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longTasks.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
    } catch {
      // no long-task timing in this browser
    }
  });
  const results = [];
  for (const [w, h] of [[1440, 900], [1366, 768]]) {
    const label = `${w}x${h}`;
    const dir = join(outRoot, label);
    mkdirSync(dir, { recursive: true });
    manifest.sizes[label] = [];
    await page.setViewportSize({ width: w, height: h });
    results.push(await playOnce({ page, baseUrl, assert, log, label, dir, shots: manifest.sizes[label], review }));
  }
  writeFileSync(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`captures: ${outRoot}`);
  const r = results[0];
  record({
    id: 'chapter.map',
    claim: 'The Map plays in the browser through its instrument: the dial aligns the map, lines are assigned by clicking pulsars on the chart, the clock dates the map, the axis is dragged on the sky and the origin slid on the plane; every wrong proposal is refused with what it computed.',
    measured: `${r.summary}; frames ${results.map((x) => `${x.label} ${x.frameMs.toFixed(1)} ms mean`).join(', ')}; longest main-thread task ${Math.max(...results.map((x) => x.longest))} ms; identification ${r.ms.identify} ms, region ${r.ms.region} ms on the main thread`,
    expected: 'The same results as the Node checkers for the default seed (map.periods, map.old, map.identify, map.motion, map.region); no console errors',
    tolerance: 'As each checker; the spec allows a single blocking computation up to 1 s',
    pass: true,
  });
}

async function playOnce({ page, baseUrl, assert, log, label, dir, shots, review }) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.evaluate(
    ([key, nodes, seed]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, nodes, chapter: 'hub', settings: { humanGloss: false, masterVolume: 0, reducedMotion: true, soundCaptions: true }, seed }));
    },
    [SAVE_KEY, done(['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths']), SEED],
  );
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const shot = async (name, shows) => {
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const doc = document.scrollingElement;
      const small = new Set();
      const walker = document.createTreeWalker(document.querySelector('.bench-main') ?? document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !(n.textContent || '').trim()) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 12.9) small.add(`${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]} ${px}px`);
      }
      return { pageScrollPx: doc.scrollHeight - window.innerHeight, textUnder13px: [...small] };
    });
    const file = `frame_${String(shots.length + 1).padStart(2, '0')}_${name}.png`;
    await page.screenshot({ path: join(dir, file) });
    shots.push({ file: `${label}/${file}`, shows, ...m });
    if (m.pageScrollPx > 0 || m.textUnder13px.length) log(`[${label}] ${name}: page scroll ${m.pageScrollPx}px; small text ${m.textUnder13px.join(', ')}`);
  };
  return playMap(page, { assert, log, label, shot, review });
}

/**
 * The Map played through its instrument from the ring (The Key done), every proposal from its buttons:
 * exported for the whole-game bot (tests/browser/game.browser.mjs). shot(name, shows, did) takes each capture;
 * with `game` set, one more frame is taken (the map aligned). The model is the page's own (its save's seed).
 */
export async function playMap(page, { assert, log, label = '', shot, review = false, game = false }) {
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'map' }));
  await page.waitForSelector('.mapinst[data-map-phase="ready"]', { timeout: 120_000 });
  await page.waitForSelector('.map-chart[data-chart-ready="true"]', { timeout: 60_000 });
  const ms = await page.evaluate(() => {
    const d = document.querySelector('.mapinst').dataset;
    return { load: Number(d.msLoad), identify: Number(d.msIdentify) };
  });
  log(`[${label}] loaded in ${ms.load} ms; identification held the page ${ms.identify} ms`);

  const state = () => page.evaluate(() => window.__finder.state().game);
  const attempts = async (id) => (await state()).nodes[id].attempts.length;
  const propose = async (id) => {
    const before = await attempts(id);
    await page.click(`[data-propose-button="${id}"]`);
    await page.waitForFunction(([id, n]) => window.__finder.state().game.nodes[id].attempts.length > n, [id, before], { timeout: 60_000 });
    const a = (await state()).nodes[id].attempts;
    return a[a.length - 1];
  };
  // What a bot reads off the instrument, computed in the page from the same model and helpers.
  await page.evaluate(async () => {
    const { epochModel } = await import('/src/chapters/shared/epochModel.ts');
    window.__mapTest = { m: epochModel(window.__finder.state().game.seed), mm: await import('/src/chapters/map/mapMath.ts') };
  });
  const selectLine = (n) => page.click(`[data-line-button="${n}"]`);
  const clickPulsar = async (jname) => {
    const p = await page.evaluate(async (j) => {
      const g = window.__mapChart;
      await g.frame({ jname: j }, { durationS: 0.01 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = g.project(j);
      const r = document.querySelector('.map-chart canvas').getBoundingClientRect();
      return { x: r.left + s.x, y: r.top + s.y, on: s.onScreen };
    }, jname);
    assert(p.on, `${jname} is on screen to click`);
    await page.mouse.click(p.x, p.y);
    await page.mouse.move(2, 2);
  };
  const assignLine = async (order, jname) => {
    await selectLine(order);
    await clickPulsar(jname);
    await page.waitForSelector(`[data-line-panel="${order}"][data-pulsar="${jname}"]`, { timeout: 10_000 });
  };
  const frameNear = () => page.evaluate(async () => {
    await window.__mapChart.frame({ pointKpc: [0, 0, 0] }, { distKpc: 7, durationS: 0.01 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const lines = await page.evaluate(() => {
    const { m, mm } = window.__mapTest;
    return m.lines.map((l) => ({ order: l.order, jname: l.jname, bname: l.bname, young: mm.isYoung(m.byJ.get(l.jname)) }));
  });

  // ---- the unaligned map ----
  await shot('map-unaligned', 'The galaxy chart from above with the cover\'s map laid over it, still turned the way the cover was picked up; beside it the cover\'s own map in gold and the steps.');

  // ---- turn the dial until the long line points at the centre ----
  const gcL = await page.evaluate(() => window.__mapChart.model().gc.lDeg);
  const dial = await page.locator('[data-dial]').boundingBox();
  const a = (gcL * Math.PI) / 180;
  await page.mouse.click(dial.x + dial.width / 2 + 20 * Math.cos(a), dial.y + dial.height / 2 - 20 * Math.sin(a));
  const angle = async () => Number(await page.getAttribute('[data-angle-to-centre]', 'data-angle-to-centre'));
  await page.focus('[data-dial]');
  for (let i = 0; i < 80 && Math.abs(await angle()) > 0.06; i++) await page.keyboard.press((await angle()) > 0 ? 'Shift+ArrowRight' : 'Shift+ArrowLeft');
  const aligned = await angle();
  assert(Math.abs(aligned) <= 0.1, `the dial aligns the long line with the centre (${aligned} deg)`);
  log(`[${label}] dial: long line ${aligned.toFixed(2)} deg from the centre`);
  if (game) await shot('map-aligned', `The dial turned until the cover map's long line points at the Galactic centre (${aligned.toFixed(2)} deg off); nothing matched yet.`, 'Turned the dial until the long line points at the centre of the galaxy.');

  // ---- map.periods: a young line first (refused), then an old one ----
  const crab = lines.find((l) => l.bname === 'B0531+21');
  await assignLine(crab.order, crab.jname);
  const p0 = await propose('map.periods');
  assert(!p0.ok && /too fast to match by period alone/.test(p0.message), `a young line is refused (${p0.message})`);
  const firstOld = lines.filter((l) => !l.young).slice(0, 3);
  for (const l of firstOld) await assignLine(l.order, l.jname);
  await frameNear();
  await shot('three-lines-matched', `The map turned so its long line points at the Galactic centre; three old lines linked to their pulsars on the chart; the readout for line ${firstOld[2].order} shows the map's period, the pulsar's period now, the direction and latitude offsets and the match quality (its odds against every other pulsar along the line).`);
  await selectLine(firstOld[0].order);
  const quality = await page.getAttribute(`[data-line-panel="${firstOld[0].order}"] [data-match-quality]`, 'data-match-quality');
  const p1 = await propose('map.periods');
  assert(p1.ok, `line ${firstOld[0].order} is accepted (${p1.message})`);
  log(`[${label}] map.periods: ${p1.message}`);

  // ---- map.old: the future (refused), then the clock at a crossing ----
  await page.waitForSelector('.map-clock');
  const setClock = (v) => page.locator('[data-clock]').evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await setClock(5000);
  const o0 = await propose('map.old');
  assert(!o0.ok && /cannot be from the future/.test(o0.message), `the future is refused (${o0.message})`);
  const cross = await page.evaluate(({ j, o }) => {
    const { m, mm } = window.__mapTest;
    return mm.clockCrossingYearsAgo(m.byJ.get(j), m.lines.find((l) => l.order === o), 3);
  }, { j: firstOld[0].jname, o: firstOld[0].order });
  await setClock(-Math.round(cross / 50) * 50);
  await page.waitForSelector(`[data-clock-line="${firstOld[0].order}"].agrees`);
  await shot('spin-down-clock', `The spin-down clock run back ${Math.round(cross)} years: line ${firstOld[0].order}'s curve crosses the map's number (gold), the other matched lines cross nearby but not at the same time.`);
  const o1 = await propose('map.old');
  assert(o1.ok, `the clock's crossing is accepted (${o1.message})`);
  log(`[${label}] map.old: ${o1.message}`);

  // ---- map.identify: one line wrong (refused), then every line right ----
  await page.waitForSelector('[data-panel="map.identify"][data-status="open"]');
  const runner = await page.evaluate((o) => window.__mapTest.mm.matchOf(window.__mapTest.m, o).runnerUp.entry.jname, firstOld[1].order);
  for (const l of lines.filter((x) => !x.young)) await assignLine(l.order, l.jname);
  await assignLine(firstOld[1].order, runner);
  for (const l of lines.filter((x) => x.young)) await assignLine(l.order, l.jname);
  const i0 = await propose('map.identify');
  assert(!i0.ok && /not have (its|their) most likely pulsar/.test(i0.message), `a wrong pulsar on one line is refused (${i0.message})`);
  await assignLine(firstOld[1].order, firstOld[1].jname);
  const i1 = await propose('map.identify');
  assert(i1.ok, `every line right is accepted (${i1.message})`);
  log(`[${label}] map.identify: ${i1.message}`);

  // ---- map.motion: the starting axis (refused), then the axis dragged to where the ages line up ----
  await page.click('[data-step="map.motion"]');
  await page.waitForSelector('[data-sky-plot]');
  await frameNear();
  await shot('ages-before-axis', 'Ages across the sky: the old lines\' own-frame ages placed where their pulsars lie, coloured older or younger than their median; beside them the ages against the axis (still at the pole) scatter widely.');
  const m0 = await propose('map.motion');
  assert(!m0.ok, `the starting axis is refused (${m0.message})`);
  // The bot finds the axis as a player would: where the misfit beside the sky is smallest.
  const best = await page.evaluate(() => {
    const { m, mm } = window.__mapTest;
    const p = mm.skyAges(m);
    const c = mm.bestAxisOnGrid(p, 1);
    return mm.bestAxisOnGrid(p, 0.1, { lDeg: c.lDeg, bDeg: c.bDeg, spanDeg: 1.5 });
  });
  const sky = await page.evaluate(() => {
    const s = document.querySelector('[data-sky-plot]');
    const r = s.getBoundingClientRect();
    return { left: r.left, top: r.top, x0: Number(s.dataset.x0), y0: Number(s.dataset.y0), pw: Number(s.dataset.pw) };
  });
  const w180 = (l) => ((((l + 180) % 360) + 360) % 360) - 180;
  await page.mouse.click(sky.left + sky.x0 + ((180 - w180(best.lDeg)) / 360) * sky.pw, sky.top + sky.y0 + ((90 - best.bDeg) / 180) * (sky.pw / 2));
  const axisNow = async () => page.evaluate(() => {
    const d = document.querySelector('.map-skyages').dataset;
    return { l: Number(d.axisL), b: Number(d.axisB) };
  });
  const press = (t) => page.click(`button.map-nudge:text-is("${t}")`);
  for (let i = 0; i < 60; i++) {
    const n = await axisNow();
    const dl = w180(best.lDeg - n.l);
    const db = best.bDeg - n.b;
    if (Math.abs(dl) < 0.05 && Math.abs(db) < 0.05) break;
    if (Math.abs(dl) >= 0.95) await press(dl > 0 ? 'l +1' : 'l -1');
    else if (Math.abs(dl) >= 0.05) await press(dl > 0 ? 'l +0.1' : 'l -0.1');
    else if (Math.abs(db) >= 0.95) await press(db > 0 ? 'b +1' : 'b -1');
    else await press(db > 0 ? 'b +0.1' : 'b -0.1');
  }
  const rms = Number(await page.getAttribute('.map-skyages', 'data-rms-years'));
  await shot('ages-after-axis', `The axis dragged to l ${best.lDeg.toFixed(1)}, b ${best.bDeg.toFixed(1)} deg: beside the sky the ages now fall on one straight line (scatter about ${Math.round(rms)} years), its slope the speed along the axis.`);
  const finalAxis = await axisNow();
  const m1 = await propose('map.motion');
  assert(m1.ok, `the axis where the ages line up is accepted (${m1.message})`);
  log(`[${label}] map.motion: axis ${JSON.stringify(finalAxis)}, rms ${rms} yr; ${m1.message}`);

  // ---- map.region: an origin far off (refused), then the origin slid into the region ----
  await page.click('[data-step="map.region"]');
  await page.waitForSelector('[data-plane]');
  await page.waitForFunction(() => document.querySelector('.mapinst').dataset.msRegion !== '' && document.querySelector('.mapinst').dataset.mapPhase === 'ready', null, { timeout: 60_000 });
  const plane = async () => page.evaluate(() => {
    const s = document.querySelector('[data-plane]');
    const r = s.getBoundingClientRect();
    return { left: r.left, top: r.top, x0: Number(s.dataset.x0), y0: Number(s.dataset.y0), k: Number(s.dataset.pxPerPc) };
  });
  const clickPlane = async (x, y) => {
    const p = await plane();
    await page.mouse.click(p.left + p.x0 + x * p.k, p.top + p.y0 - y * p.k);
  };
  await clickPlane(20, -20);
  const g0 = await propose('map.region');
  assert(!g0.ok && /outside the 95% region/.test(g0.message), `an origin far off is refused (${g0.message})`);
  const centre = await page.evaluate(() => window.__mapTest.m.region().centerPc);
  await clickPlane(centre[0], centre[1]);
  const g1 = await propose('map.region');
  assert(g1.ok, `the origin slid into the region is accepted (${g1.message})`);
  await page.waitForSelector('[data-region-stars]');
  await page.evaluate(async () => {
    await window.__mapChart.frame('region', { durationS: 0.01 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await shot('region-and-stars', 'Where the map was drawn from: on the plane, the 95% region (about 30 by 14 pc) with the catalogued stars inside it when the map was made lit gold, your own star among them; on the chart, the same region at the map\'s origin.');
  log(`[${label}] map.region: ${g1.message}`);

  const g = await state();
  assert(g.chapterStatus.map === 'done', 'The Map is done');
  const ms2 = await page.evaluate(() => Number(document.querySelector('.mapinst').dataset.msRegion));
  const frame = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return window.__mapChart.frameStats();
  });
  const longest = await page.evaluate(() => Math.max(0, ...(window.__longTasks ?? [])));
  log(`[${label}] frames: ${frame.meanIntervalMs.toFixed(1)} ms mean over ${frame.frames}; longest task ${longest} ms; region held the page ${ms2} ms`);
  assert(ms.identify < 1000 && ms2 < 1000, `no single computation blocks the page over 1 s (identify ${ms.identify} ms, region ${ms2} ms)`);
  return {
    label,
    frameMs: frame.meanIntervalMs,
    longest,
    ms: { load: ms.load, identify: ms.identify, region: ms2 },
    summary: `periods: young line refused, line ${firstOld[0].order} accepted (match quality log10 ${Number(quality).toFixed(1)}); old: future refused, ${Math.round(cross)} years ago accepted; identify: one wrong line refused, all 14 accepted; motion: pole refused, l ${best.lDeg.toFixed(1)} b ${best.bDeg.toFixed(1)} accepted (scatter ${Math.round(rms)} yr); region: (20, -20) pc refused, (${centre[0].toFixed(1)}, ${centre[1].toFixed(1)}) accepted`,
    review,
  };
}
