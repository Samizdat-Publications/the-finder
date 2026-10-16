// bot.m4Wrong's pass (a helper of tests/browser/game.browser.mjs, not a browser test of its own): from a fresh
// save, The Key through the command bus, then in The Map, The Spot and The Trail every meaningful wrong result
// each checker distinguishes (the chapters' Node tests list them: src/chapters/map/map.test.ts "meaningful wrong
// answers", src/chapters/spot/checkers.test.ts, src/chapters/trail/trail.test.ts), once each, through the same
// bus command the instruments' buttons send, with the answer shapes those buttons send. Each one must be
// rejected, its computed result shown on the instrument (its result line, on the step or tool that holds the
// node) and in the chapter's notebook; then the right answer confirms. The wrong and right answers are worked
// out in the page from the chapter's own model and helpers, as the Node tests do; no game state is written.
//
// map.periods' "weak line" is a real one: an old line that is not a pass-1 anchor (B1929+10 on line 2 for the
// seeds tried, map.test.ts); if a seed has none, it is skipped and said so.
import { MOMENT_IDS, skipMoments } from './moments.mjs';
import { renderedMessage } from './rendered.mjs';

/** The arrival and key answers the slice bot proposes (tests/browser/slice.browser.mjs). */
const KEY_PATH = [
  ['arrival.purpose', 'radio'],
  ['key.binary', { reading: 'positional', one: 'across' }],
  ['key.unit', 'hyperfine'],
  ['key.timesNotLengths', 'times'],
];

export async function m4WrongPass(page, { assert, log, freshStart, baseUrl }) {
  await freshStart(page, baseUrl);
  const send = (cmd) => page.evaluate((c) => window.__finder.dispatch(c), cmd);
  const propose = (id, answer) =>
    page.evaluate(
      async ([id, answer]) => {
        await window.__finder.dispatch({ type: 'deduction.propose', id, answer });
        const n = window.__finder.state().game.nodes[id];
        return { confirmed: n.confirmed, last: n.attempts[n.attempts.length - 1] };
      },
      [id, answer],
    );
  const played = [];
  const skipped = [];
  const wrong = async (id, answer, label, show) => {
    if (show) await show();
    const r = await propose(id, answer);
    assert(!r.confirmed && r.last && r.last.ok === false, `${id} ${label}: rejected (${r.last?.message})`);
    assert(r.last.message.length > 20, `${id} ${label}: gives a computed result (${r.last.message})`);
    const shown = await renderedMessage(page, r.last.message);
    const listed = await page.locator(`[data-node="${id}"] details.wrong li`).last().textContent();
    assert(listed === shown, `${id} ${label}: the result is in the notebook`);
    const line = page.locator(`[data-result="${id}"]`);
    await line.first().waitFor({ state: 'visible', timeout: 10_000 });
    assert(/^(0|false)$/.test((await line.first().getAttribute('data-ok')) ?? ''), `${id} ${label}: the instrument shows the rejection`);
    const text = (await line.first().innerText()).replace(/\s+/g, ' ');
    assert(text.includes(shown.replace(/\s+/g, ' ').slice(0, 40)), `${id} ${label}: the instrument shows the computed result`);
    played.push({ id, wrong: label, message: r.last.message });
  };
  const right = async (id, answer) => {
    const r = await propose(id, answer);
    assert(r.confirmed, `${id}: the right answer confirms after the wrong ones (${r.last?.message})`);
    // A staged moment follows; the bot skips it with its Continue button, as a player would.
    if (MOMENT_IDS.includes(id)) assert((await skipMoments(page)).includes(id), `${id}: its moment shows and is skipped`);
  };

  // ---- Arrival's first deduction and The Key, through the bus (the slice bot's answers), on The Key's bench
  // once it has loaded what its checkers read (the pulsar catalogue) ----
  await right(KEY_PATH[0][0], KEY_PATH[0][1]);
  await send({ type: 'chapter.enter', chapter: 'key' });
  await page.evaluate(() => window.__finder.waitFor(() => document.querySelector('.keyinst[data-key-ready="true"]') !== null, 60_000));
  for (const [id, a] of KEY_PATH.slice(1)) await right(id, a);

  // ---- The Map ----
  await send({ type: 'chapter.enter', chapter: 'map' });
  await page.waitForSelector('.mapinst[data-map-phase="ready"]', { timeout: 120_000 });
  const mapA = await page.evaluate(async () => {
    const { epochModel, ensureParts } = await import('/src/chapters/shared/epochModel.ts');
    const mm = await import('/src/chapters/map/mapMath.ts');
    const A = await import('/src/science/astro.ts');
    const m = epochModel(window.__finder.state().game.seed);
    // The heavy parts come from the epoch Worker (M4 step 7e): wait for them before reading the model.
    await ensureParts(m, ['identification', 'region', 'trail']);
    const truth = Object.fromEntries(m.lines.map((l) => [String(l.order), l.jname]));
    const l1 = m.lines.find((l) => l.order === 1);
    const runner = mm.matchOf(m, 1, 1).runnerUp.entry.jname;
    const weak = m.lines.find((l) => !mm.isYoung(m.byJ.get(l.jname)) && !mm.isPass1Anchor(m, l.order));
    const crab = m.lines.find((l) => l.bname === 'B0531+21');
    const old = m.lines.filter((l) => !mm.isYoung(m.byJ.get(l.jname)));
    const first = old.find((l) => mm.isPass1Anchor(m, l.order));
    const v = m.motionFit().velKmS;
    const c = A.cross(v, [0, 0, 1]);
    const perp = A.scale(c, 1 / A.norm(c));
    const g = (x) => mm.galacticOf(x);
    const right = g(v);
    const reg = m.region();
    const phi = (reg.majorAxisDeg * Math.PI) / 180;
    return {
      periods: {
        runner: { line: 1, jname: runner },
        weak: weak ? { line: weak.order, jname: weak.jname } : null,
        far: { line: 1, jname: m.lines.find((l) => l.order === 11).jname },
        young: { line: crab.order, jname: crab.jname },
        right: { line: first.order, jname: first.jname },
      },
      old: { right: { yearsAgo: Math.round(mm.clockCrossingYearsAgo(m.byJ.get(first.jname), first, mm.CLOCK_N)), matched: { [String(first.order)]: first.jname } } },
      identify: { swap: { ...truth, 1: runner }, missing: { 1: l1.jname }, right: truth },
      motion: { perp: g(perp), right },
      region: {
        out: { x: reg.centerPc[0] + 2 * reg.semiAxesPc[0] * Math.cos(phi), y: reg.centerPc[1] + 2 * reg.semiAxesPc[0] * Math.sin(phi) },
        right: { x: reg.centerPc[0], y: reg.centerPc[1] },
      },
    };
  });
  const step = (id) => async () => {
    await page.click(`[data-step="${id}"]`);
    await page.waitForSelector(`[data-panel="${id}"]`);
  };
  await wrong('map.periods', mapA.periods.runner, 'the runner-up pulsar on line 1', step('map.periods'));
  if (mapA.periods.weak) await wrong('map.periods', mapA.periods.weak, `line ${mapA.periods.weak.line}, not a pass-1 anchor (needs the map's age)`);
  else skipped.push('map.periods: a line that is not a pass-1 anchor (this seed has none)');
  await wrong('map.periods', mapA.periods.far, "line 11's pulsar on line 1");
  await wrong('map.periods', mapA.periods.young, 'a young line first (the Crab)');
  await right('map.periods', mapA.periods.right);
  await wrong('map.old', { yearsAgo: -2000 }, 'the future, 2,000 years ahead', step('map.old'));
  await wrong('map.old', { yearsAgo: 150_000 }, 'a far past, 150,000 years ago');
  await right('map.old', mapA.old.right);
  await wrong('map.identify', mapA.identify.swap, 'one line given its runner-up', step('map.identify'));
  await wrong('map.identify', mapA.identify.missing, 'only one line given');
  await right('map.identify', mapA.identify.right);
  await wrong('map.motion', mapA.motion.perp, 'an axis at right angles to the fit', step('map.motion'));
  await right('map.motion', mapA.motion.right);
  await wrong('map.region', mapA.region.out, 'an origin two semi-axes off', step('map.region'));
  await right('map.region', mapA.region.right);

  // ---- The Spot ----
  await send({ type: 'chapter.enter', chapter: 'spot' });
  await page.waitForSelector('[data-instrument="spot"] .coverviewer svg.strokes');
  const spotA = await page.evaluate(async () => {
    const D = await import('/src/chapters/spot/data.ts');
    const C = await import('/src/science/clocks.ts');
    const S = await import('/src/science/spot.ts');
    const m = D.spotModel(window.__finder.state().game.seed);
    const DAY = 86_400;
    const [cx, cy] = D.SPOT.centreMm;
    const a = C.ageFromU234(m.session.countsAt(DAY));
    const nat = S.naturalStartRatio();
    let shortAge = null;
    let shortPurity = null;
    for (let t = 1; t <= 600 && (shortAge === null || shortPurity === null); t++) {
      const c = m.session.countsAt(t);
      if (shortAge === null && c.u234 === 0) shortAge = t;
      if (shortPurity === null && C.testStartHypothesis(c, nat).pValue >= 0.05 && C.testStartHypothesis(c, 0).pValue >= 0.05) shortPurity = t;
    }
    return { cx, cy, DAY, hi: a.hi, age: Math.round(a.ageYears), nat, shortAge, shortPurity };
  });
  assert(spotA.shortAge !== null && spotA.shortPurity !== null, `short counts found (${spotA.shortAge} s, ${spotA.shortPurity} s)`);
  await wrong('spot.find', { xMm: 150, yMm: 270 }, 'far from the spot, on the lower plate');
  await wrong('spot.find', { xMm: spotA.cx + 18, yMm: spotA.cy }, 'beside the spot, where the rate is rising');
  await right('spot.find', { xMm: spotA.cx, yMm: spotA.cy });
  await wrong('spot.age', { countingTimeS: spotA.DAY, ageYears: Math.round(spotA.hi * 1.2) }, "an age above a day's interval");
  await wrong('spot.age', { countingTimeS: spotA.shortAge, ageYears: spotA.age }, `a count of ${spotA.shortAge} s, too short`);
  await right('spot.age', { countingTimeS: spotA.DAY, ageYears: spotA.age });
  await wrong('spot.purity', { countingTimeS: spotA.DAY, startA234overA238: Math.round(spotA.nat * 1000) / 1000 }, 'natural uranium (ore in balance)');
  await wrong('spot.purity', { countingTimeS: spotA.shortPurity, startA234overA238: 0 }, `a count of ${spotA.shortPurity} s, too short to tell`);
  await right('spot.purity', { countingTimeS: spotA.DAY, startA234overA238: 0 });

  // ---- The Trail ----
  await send({ type: 'chapter.enter', chapter: 'trail' });
  await page.waitForSelector('.trinst[data-trail-ready="true"]', { timeout: 90_000 });
  const trA = await page.evaluate(async () => {
    const St = await import('/src/chapters/trail/state.ts');
    const P = await import('/src/chapters/trail/physics.ts');
    const m = St.model.value;
    const origin = P.originRow(m);
    const nx = P.nextBest(m).row.star;
    // the star without a radial velocity nearest the machine (drawn hollow on the chart; as trail.browser.mjs)
    const E = await import('/src/science/epoch.ts');
    const noRv = E.nearestStars(m.inputs.stars, m.disc.craft.posPc, m.disc.decimalYear, 60, []).find((x) => !x.fullVelocity);
    const [lo, hi] = origin.measuredDistOverSpeedInterval95;
    const rs = P.regionStars(m);
    const sun = m.ages('sun').combined;
    return {
      home: P.homeId(m),
      next: nx.id,
      noRv: noRv ? noRv.star.id : null,
      lo, hi,
      meet: Math.round(P.meeting(m, origin.star).yearsAgo),
      nextDist: P.rulerReading(m, nx).distPc,
      dist: P.rulerReading(m, origin.star).distPc,
      inside: rs.find((s) => s.inside && s.star.id !== 0 && s.star.id !== P.homeId(m)).star.id,
      outside: rs.find((s) => !s.inside).star.id,
      est: Math.round(sun.estimate),
      sunHi: sun.hi,
    };
  });
  const tool = (t) => async () => {
    await page.click(`[data-tool-tab="${t}"]`);
    await page.waitForSelector(`[data-tool-panel="${t}"]`, { timeout: 90_000 });
  };
  await wrong('trail.origin', { starId: trA.next }, 'the next-best star, at a large angle', tool('trail'));
  if (trA.noRv !== null) await wrong('trail.origin', { starId: trA.noRv }, 'a star without a radial velocity');
  else skipped.push('trail.origin: a star without a radial velocity (none within reach of the chart)');
  await wrong('trail.origin', { starId: trA.home }, "the alien's own star");
  await right('trail.origin', { starId: 0 });
  await wrong('trail.age', { years: Math.round(trA.lo - 2000) }, 'a run-back 2,000 years too short', tool('runback'));
  await wrong('trail.age', { years: Math.round(trA.hi + 2000) }, 'a run-back 2,000 years too long');
  await right('trail.age', { years: trA.meet });
  await wrong('trail.neighbour', { distancePc: trA.nextDist }, "the distance to the wrong star", tool('ruler'));
  await right('trail.neighbour', { distancePc: trA.dist });
  await wrong('trail.where', { starId: trA.inside }, 'another star inside the region', tool('region'));
  await wrong('trail.where', { starId: trA.outside }, 'a star outside the region');
  await right('trail.where', { starId: 0 });
  await wrong('trail.when', { yearsAgo: trA.est, frame: trA.next }, "the age read in another star's frame", tool('reframe'));
  await wrong('trail.when', { yearsAgo: trA.est, frame: 'own' }, "the age read in the alien's own frame");
  await wrong('trail.when', { yearsAgo: Math.round(trA.sunHi + 3000), frame: 0 }, 'an age outside the interval in the right frame');
  await right('trail.when', { yearsAgo: trA.est, frame: 0 });

  const g = await page.evaluate(() => window.__finder.state().game);
  for (const p of played) log(`${p.id} ${p.wrong}: ${p.message}`);
  for (const s of skipped) log(`not played: ${s}`);
  return { played, skipped, confirmed: g.confirmed, chapterStatus: g.chapterStatus };
}
