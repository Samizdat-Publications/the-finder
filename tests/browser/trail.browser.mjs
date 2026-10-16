// The Trail on /play/, played through the instrument and window.__finder only (the same command bus the
// interface uses). The save starts with The Key confirmed (The Trail needs key.timesNotLengths). On the chart:
// a wrong star picked at its projected point and proposed (rejected with its computed angle), then the
// warm-white star (the Sun), confirmed; the run-back set once too short and then to the meeting; the ruler
// once to the wrong star and then from the alien's own star to the Sun. trail.where and trail.when need The
// Map's map.region and map.motion: when the map chapter is built, its five nodes are confirmed through the bus
// with their right answers taken from the model, and the region view and the reframe are played through the
// instrument; otherwise those steps print SKIPPED (map not built yet). Console errors fail the test.
// Id: chapter.trail. playTrail() is exported for the capture run (review/inbox/<timestamp>-trail/).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { renderedMessage } from './rendered.mjs';

export const SAVE_KEY = 'finder.save.v1';
export const KEY_DONE = ['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths'];
export const MAP_DONE = ['map.periods', 'map.old', 'map.identify', 'map.motion', 'map.region'];
const OUT = join(ROOT, 'harness', 'out', 'trail-captures');

/** Seed the save before the page loads: these nodes confirmed, the test's own seed. */
export async function seedSave(page, nodes, seed = 'trail-browser-test') {
  const done = Object.fromEntries(nodes.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));
  await page.addInitScript(
    ([key, done, seed]) => {
      if (sessionStorage.getItem('trail-test-seeded')) return;
      sessionStorage.setItem('trail-test-seeded', '1');
      localStorage.setItem(key, JSON.stringify({ version: 1, nodes: done, chapter: 'hub', settings: { humanGloss: true, masterVolume: 0, reducedMotion: true, soundCaptions: true }, seed }));
    },
    [SAVE_KEY, done, seed],
  );
}

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));

/**
 * Plays The Trail. opts: { log, assert, shot(name, what) } and mapPlayable ('bus' when the map chapter is
 * built and its nodes must be confirmed here, 'seeded' when the save already has them, or false).
 */
export async function playTrail(page, { log, assert, shot, mapPlayable }) {
  const propose = async (id) => {
    await page.locator(`[data-propose-button="${id}"]`).click();
    await page.waitForFunction((id) => (window.__finder.state().game.nodes[id]?.attempts.length ?? 0) > 0, id);
    const n = await page.evaluate((id) => window.__finder.state().game.nodes[id], id);
    return n.attempts[n.attempts.length - 1];
  };
  const tab = async (t) => {
    await page.locator(`[data-tool-tab="${t}"]`).click();
    await page.waitForSelector(`[data-tool-panel="${t}"]`);
  };
  // Click a star on the chart at its projected screen point, after framing the camera on it (a view move, as a drag would be).
  const clickStar = async (id, frame = true) => {
    const p = await page.evaluate(async ([id, frame]) => {
      const h = (await import('/src/chapters/trail/ChartPane.tsx')).chartHandle();
      if (frame) await h.frame({ starId: id }, { durationS: 0.01 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return h.project(id);
    }, [id, frame]);
    assert(p && p.onScreen, `star ${id} projects on screen`);
    const box = await page.locator('.tr-canvas').boundingBox();
    await page.mouse.click(box.x + p.x, box.y + p.y);
    await settle(page);
  };

  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'trail' }));
  await page.waitForSelector('.trinst[data-trail-ready="true"] .tr-chart[data-chart-ready="true"]', { timeout: 90_000 });
  // The model's own numbers, for the asserts (the same module instance the instrument uses).
  const ref = await page.evaluate(async () => {
    const S = await import('/src/chapters/trail/state.ts');
    const P = await import('/src/chapters/trail/physics.ts');
    const m = S.model.value;
    const origin = P.originRow(m);
    const F = await import('/src/chapters/trail/format.ts');
    const wrong = m.trailRows().find((r) => r.star.id !== 0 && r.star.id !== P.homeId(m) && r.nullAngle95Deg > 0);
    const E = await import('/src/science/epoch.ts');
    const near = E.nearestStars(m.inputs.stars, m.measured.posPc, m.disc.decimalYear, 3, [P.homeId(m)]);
    // the star without a radial velocity nearest the machine (drawn hollow on the chart)
    const hollow = E.nearestStars(m.inputs.stars, m.disc.craft.posPc, m.disc.decimalYear, 60, []).find((x) => !x.fullVelocity);
    return {
      home: P.homeId(m), origin: origin.star.id, angle: origin.measuredAngleDeg, cut: origin.nullAngle95Deg, interval: origin.measuredDistOverSpeedInterval95,
      meet: P.meeting(m, origin.star).yearsAgo, wrong: wrong.star.id, wrongAngle: wrong.measuredAngleDeg, wrongAngleText: F.fmtDeg(wrong.measuredAngleDeg), wrongName: P.starName(wrong.star),
      ruler: P.rulerReading(m, origin.star), noRv: hollow.star.id, noRvName: P.starName(hollow.star), otherNear: near.find((x) => x.star.id !== origin.star.id).star.id, timings: { ...S.timings },
    };
  });
  log(`model: origin ${ref.origin} measured at ${ref.angle.toFixed(4)} deg (95% cut ${ref.cut.toFixed(4)}); meeting ${ref.meet.toFixed(0)} years; ruler ${ref.ruler.distPc.toFixed(4)} +/- ${ref.ruler.sigmaPc.toFixed(4)} pc; trailRows ${ref.timings.trailRows?.toFixed(0)} ms`);
  await shot('1-chart', 'The neighbourhood chart on entry: the stars within 10 pc of the machine, nothing picked.');

  // ---- trail.origin: a wrong star, then the Sun ----
  await clickStar(ref.wrong);
  assert((await page.locator(`[data-readout="${ref.wrong}"]`).count()) === 1, 'the wrong star is picked at its projected point');
  const o0 = await propose('trail.origin');
  assert(!o0.ok && o0.message.includes(ref.wrongAngleText), `a wrong star is rejected with its measured angle (${o0.message})`);
  await shot('2-wrong-star-trail', `A wrong star's trail (${ref.wrongName}): the alien measures the machine moving ${ref.wrongAngle.toFixed(2)} deg from straight away from it; the proposal is rejected with that angle and its 95% cut.`);
  // a star without a radial velocity: drawn hollow; its readout gives the best angle any radial velocity allows
  await clickStar(ref.noRv);
  assert((await page.locator(`[data-readout="${ref.noRv}"] .tr-norv`).count()) === 1, 'a star without a radial velocity says so');
  const oN = await propose('trail.origin');
  assert(!oN.ok && /no measured radial velocity/.test(oN.message), `a star without a radial velocity is rejected with its bound (${oN.message})`);
  await shot('2b-no-radial-velocity', `A star without a radial velocity (${ref.noRvName}): its readout and the rejection give the smallest angle any radial velocity up to 100 or 300 km/s allows.`);
  await clickStar(ref.origin);
  assert((await page.locator(`[data-readout="${ref.origin}"]`).count()) === 1, 'the Sun is picked at its projected point');
  const o1 = await propose('trail.origin');
  assert(o1.ok, `the Sun is accepted (${o1.message})`);
  await shot('3-sun-trail', `The warm-white star's (the Sun's) trail: measured ${ref.angle.toFixed(3)} deg from straight away, inside the 95% cut of ${ref.cut.toFixed(3)} deg; trail.origin confirmed.`);

  // ---- trail.age: the run-back ----
  await tab('runback');
  const setRun = async (y) => {
    await page.locator('[data-run-input]').fill(String(y));
    await page.locator('[data-run-input]').press('Enter');
    await settle(page);
  };
  await setRun(Math.round(ref.interval[0] - 3000));
  const a0 = await propose('trail.age');
  assert(!a0.ok && /95% between/.test(a0.message), `a run-back too short is rejected with the interval (${a0.message})`);
  await setRun(Math.round(ref.meet / 10) * 10);
  await shot('4-runback-meeting', `The run-back at the meeting: run back ${Math.round(ref.meet / 10) * 10} years, the machine (gold dot) has returned to the warm-white star; the separation curve is at its minimum.`);
  const a1 = await propose('trail.age');
  assert(a1.ok, `the meeting is accepted (${a1.message})`);

  // ---- trail.neighbour: the ruler ----
  await tab('ruler');
  await clickStar(ref.home);
  await clickStar(ref.otherNear);
  const n0 = await propose('trail.neighbour');
  assert(!n0.ok && /Your ruler puts/.test(n0.message), `a distance to the wrong star is rejected (${n0.message})`);
  // The rejection judged the ruler as it was; clearing it changes the instrument, so the result is marked as the
  // last proposal (M4 step 7c) until the next proposal.
  const pastOf = (id) => page.locator(`[data-result="${id}"]`).getAttribute('data-past');
  assert((await pastOf('trail.neighbour')) === '0', 'right after the proposal its rejection is the current verdict');
  await page.getByRole('button', { name: 'Clear the ruler' }).click();
  await page.waitForSelector('[data-result="trail.neighbour"][data-past="1"] [data-past-label]', { timeout: 10_000 });
  assert((await page.locator('[data-result="trail.neighbour"] [data-past-label]').innerText()).toLowerCase().includes('your last proposal'), 'the old rejection is labelled as your last proposal once the ruler changes');
  await clickStar(ref.home);
  await clickStar(ref.origin);
  const shown = Number(await page.locator('[data-ruler]').getAttribute('data-ruler'));
  assert(Math.abs(shown - ref.ruler.distPc) < 1e-6, `the ruler reads the model's distance (${shown})`);
  await page.evaluate(async () => (await import('/src/chapters/trail/ChartPane.tsx')).chartHandle().frame('home', { durationS: 0.01, distPc: 4 }));
  await settle(page);
  await shot('5-ruler', `The ruler from the alien's own star to the warm-white star: ${ref.ruler.distPc.toFixed(3)} +/- ${ref.ruler.sigmaPc.toFixed(3)} pc.`);
  assert((await pastOf('trail.neighbour')) === '1', 'measuring to another star keeps the old rejection marked as past');
  await shot('5b-ruler-past', "The ruler re-measured to the warm-white star: the earlier rejection, for the wrong star, is dimmed and labelled as your last proposal.");
  const n1 = await propose('trail.neighbour');
  assert(n1.ok && /nearest/.test(n1.message) && /5th-brightest/.test(n1.message), `the neighbour twist (${n1.message})`);
  assert((await pastOf('trail.neighbour')) === '0' && (await page.locator('[data-result="trail.neighbour"] [data-past-label]').count()) === 0, 'a confirmed result is never marked as past');

  // ---- trail.where and trail.when: need The Map's region and motion ----
  let whereMsg = 'SKIPPED (map not built yet)';
  let whenMsg = whereMsg;
  if (mapPlayable === 'bus') await confirmMapThroughBus(page, assert, log);
  if (mapPlayable) {
    await tab('region');
    await page.waitForSelector('.trinst[data-view="region"] .tr-region', { timeout: 90_000 });
    const pickRegion = async (id) => {
      const c = page.locator(`[data-region-star="${id}"]`);
      const b = await c.boundingBox();
      await page.locator('.tr-region').click({ position: await relTo(page, '.tr-region', b) });
      await settle(page);
    };
    const insideOther = await page.evaluate(async () => {
      const P = await import('/src/chapters/trail/physics.ts');
      const m = (await import('/src/chapters/trail/state.ts')).model.value;
      const rs = P.regionStars(m);
      const o = rs.find((s) => s.star.id === 0);
      // the inside star furthest from the origin star in the plane, so the click is unambiguous
      return rs.filter((s) => s.inside && s.star.id !== 0 && s.star.id !== P.homeId(m)).sort((a, b) => Math.hypot(b.xy[0] - o.xy[0], b.xy[1] - o.xy[1]) - Math.hypot(a.xy[0] - o.xy[0], a.xy[1] - o.xy[1]))[0].star.id;
    });
    await pickRegion(insideOther);
    const w0 = await propose('trail.where');
    assert(!w0.ok && /inside the region too/.test(w0.message), `another star inside the region is rejected (${w0.message})`);
    await pickRegion(ref.origin);
    await shot('6-region', 'The region view: the map\'s 95% origin region at the map epoch, the near stars then, the warm-white star (gold ring) inside it, picked.');
    const w1 = await propose('trail.where');
    assert(w1.ok, `the warm-white star is where the map was drawn from (${w1.message})`);
    whereMsg = w1.message;

    await tab('reframe');
    await page.waitForSelector('.tr-reframe[data-frame="own"] [data-line]', { timeout: 90_000 });
    await shot('7-reframe-own', "The reframe in the alien's own frame: the map's line ages scattered across tens of thousands of years.");
    const est = await page.evaluate(async () => Math.round((await import('/src/chapters/trail/state.ts')).model.value.ages('sun').combined.estimate / 10) * 10);
    await setCursor(page, est);
    const e0 = await propose('trail.when');
    assert(!e0.ok && /spread from/.test(e0.message), `an age read in the alien's own frame is rejected (${e0.message})`);
    // another star's frame first (reframed with datePulsar on the spot), then the origin star's
    const other = await page.locator('[data-frame-select] option').evaluateAll((os, o) => os.map((x) => x.value).find((v) => v && v !== String(o)), ref.origin);
    await page.locator('[data-frame-select]').selectOption(other);
    await page.waitForSelector(`.tr-reframe[data-frame="${other}"]`);
    const agreeOther = Number(await page.locator('[data-agreement]').getAttribute('data-agreement'));
    log(`another star's frame (${other}): old lines' chi-square per degree of freedom ${agreeOther.toFixed(1)}`);
    await page.locator('[data-frame-select]').selectOption(String(ref.origin));
    await page.waitForSelector(`.tr-reframe[data-frame="${ref.origin}"]`);
    await settle(page);
    await setCursor(page, est);
    await shot('8-reframe-sun', "The reframe in the warm-white star's frame: the old lines' ages snap together; the combined age's band (shown after the first proposal) and the cursor on it.");
    const e1 = await propose('trail.when');
    assert(e1.ok, `the map's age in the Sun's frame (${e1.message})`);
    whenMsg = e1.message;
    const g = await page.evaluate(() => window.__finder.state().game);
    assert(g.chapterStatus.trail === 'done', 'The Trail is done');
  } else {
    log('trail.where: SKIPPED (map not built yet)');
    log('trail.when: SKIPPED (map not built yet)');
  }
  const timings = await page.evaluate(async () => ({ ...(await import('/src/chapters/trail/state.ts')).timings }));
  log(`long calls on the main thread: ${Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(', ')}`);
  return { ref, o0, o1, a0, a1, n0, n1, whereMsg, whenMsg, timings };
}

async function relTo(page, sel, b) {
  const box = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2 - box.x, y: b.y + b.height / 2 - box.y };
}

async function setCursor(page, years) {
  const at = await page.evaluate((years) => {
    const svg = document.querySelector('.tr-reframe');
    const a0 = Number(svg.dataset.a0);
    const a1 = Number(svg.dataset.a1);
    const vb = svg.viewBox.baseVal;
    const left = Number(svg.dataset.left);
    const right = Number(svg.dataset.right);
    const x = left + ((years - a0) / (a1 - a0)) * (vb.width - left - right);
    const r = svg.getBoundingClientRect();
    return { x: r.left + (x / vb.width) * r.width, y: r.top + r.height / 2 };
  }, years);
  await page.mouse.click(at.x, at.y);
  await settle(page);
}

/** The Map's five nodes through the bus, with their right answers taken from the shared model. */
async function confirmMapThroughBus(page, assert, log) {
  const answers = await page.evaluate(async () => {
    const S = await import('/src/chapters/trail/state.ts');
    const { toGalacticCartesian } = await import('/src/science/astro.ts');
    const m = S.model.value;
    const id = m.identification();
    const own = m.ages('own').perLine;
    const old = id.lines.filter((l, i) => l.best && !own[i].young && Number.isFinite(l.log10Odds)).sort((a, b) => b.log10Odds - a.log10Odds)[0];
    const order = old.line.order;
    const v = toGalacticCartesian(m.motionFit().velKmS);
    const lDeg = ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
    const bDeg = (Math.atan2(v[2], Math.hypot(v[0], v[1])) * 180) / Math.PI;
    return {
      'map.periods': { line: order, jname: old.best.entry.jname },
      'map.old': { yearsAgo: Math.round(m.ageOf(order, old.best.entry.jname, 'own').median) },
      'map.identify': Object.fromEntries(id.lines.map((l) => [String(l.line.order), l.best.entry.jname])),
      'map.motion': { lDeg, bDeg },
      'map.region': { x: m.region().centerPc[0], y: m.region().centerPc[1] },
    };
  });
  for (const id of MAP_DONE) {
    await page.evaluate(([id, answer]) => window.__finder.dispatch({ type: 'deduction.propose', id, answer }), [id, answers[id]]);
    const ok = await page.evaluate((id) => window.__finder.state().game.nodes[id]?.confirmed === true, id);
    assert(ok, `${id} confirmed through the bus with the model's right answer`);
  }
  log('The Map: five nodes confirmed through the bus');
}

export default async function run({ page, baseUrl, record, assert, log }) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSave(page, KEY_DONE);
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });
  const mapBuilt = await page.evaluate(async () => (await import('/src/game/graph.ts')).chapterDef('map').built);
  const shot = async (name) => {
    await settle(page);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
  };
  const r = await playTrail(page, { log, assert, shot, mapPlayable: mapBuilt ? 'bus' : false });
  const perf = await page.evaluate(async () => {
    const h = (await import('/src/chapters/trail/ChartPane.tsx')).chartHandle();
    const S = await import('/src/chapters/trail/state.ts');
    return { bench: h ? h.benchmark(120) : NaN, live: h ? h.frameStats() : null, timings: { ...S.timings }, w: innerWidth, h: innerHeight };
  });
  log(`frame time at ${perf.w} x ${perf.h}: ${perf.bench.toFixed(2)} ms back to back; live ${perf.live?.meanIntervalMs.toFixed(2)} ms over ${perf.live?.frames} frames; long calls ${Object.entries(perf.timings).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(', ')}`);
  const longest = Math.max(...Object.values(perf.timings));
  assert(longest < 1000, `no single measurement blocks the page for more than 1 s (${longest.toFixed(0)} ms)`);
  log(`trail.where: ${await renderedMessage(page, r.whereMsg)}`);
  log(`trail.when: ${await renderedMessage(page, r.whenMsg)}`);
  record({
    id: 'chapter.trail',
    claim: 'The Trail plays in the browser through its instrument: a wrong star, a short run-back and a wrong distance are each rejected with their computed results; the warm-white star, the meeting and the ruler\'s distance confirm; with The Map built, the region view and the reframe confirm WHERE and WHEN.',
    measured: `wrong star rejected (${r.ref.wrongName} ${r.ref.wrongAngle.toFixed(2)} deg); Sun measured ${r.ref.angle.toFixed(3)} deg (95% cut ${r.ref.cut.toFixed(3)}) accepted; meeting ${r.ref.meet.toFixed(0)} years accepted (95% ${r.ref.interval[0].toFixed(0)} to ${r.ref.interval[1].toFixed(0)}); ruler ${r.ref.ruler.distPc.toFixed(3)} +/- ${r.ref.ruler.sigmaPc.toFixed(3)} pc accepted; where and when: ${mapBuilt ? 'played' : 'skipped, map not built'}; ${perf.bench.toFixed(2)} ms per chart frame; longest measurement ${longest.toFixed(0)} ms`,
    expected: 'the same results as the Node checkers (trail.check.*); no console errors; no measurement over 1 s on the main thread (spec)',
    tolerance: 'exact (interface behaviour); 1 s for a blocking call',
    pass: true,
  });
}
