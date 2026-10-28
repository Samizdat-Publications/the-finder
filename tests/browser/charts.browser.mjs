// The two M4 charts (src/world/galaxy.ts and neighbourhood.ts, dev page /play/charts/):
// - picking at a pulsar's or star's projected screen point returns that pulsar or star;
// - the trail drawn for the Sun and for a wrong star carries kinematics.trail's angle, recomputed here
//   in the page from the science modules (not from the chart);
// - every pulsar matched to a cover line wears a tag with its line number (11 to 12 px), beside its halo and clear of
//   the other labels; the Galactic centre's label is its name and one distance; the dial's ring labels are 11 px or more
//   (V1 polish, docs/plans/V1_polish.md C1);
// - frame times at 1440 x 900; no console errors; dispose runs clean;
// - captures for looking at: harness/out/charts/*.png.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';

const OUT = join(ROOT, 'harness', 'out', 'charts');

async function settle(page, ms = 400) {
  await page.waitForTimeout(ms);
}

export default async function run({ page, baseUrl, record, assert, log }) {
  mkdirSync(OUT, { recursive: true });

  // ---- The galaxy chart ----
  await page.goto(`${baseUrl}/play/charts/?chart=galaxy&demo=map&reduced=1&clean=1`, { waitUntil: 'load' });
  const demo = await page.evaluate(async () => {
    const d = await window.__chartsDemo;
    const r = d.region;
    return { semi: r.semiAxesPc, rms: r.fit.rmsDeg, elapsed: d.elapsedYears };
  });
  const gInfo = await page.evaluate(() => window.__galaxy.ready);
  log(`galaxy: ${gInfo.counts.shown} pulsars shown of ${gInfo.counts.catalogue} (${gInfo.counts.noDistance} without a distance; young ${gInfo.counts.young}, old ${gInfo.counts.old}, millisecond ${gInfo.counts.millisecond}, no spin-down ${gInfo.counts.noSpinDown})`);
  log(`map demo: fit rms ${demo.rms.toFixed(2)} deg, region ${(2 * demo.semi[0]).toFixed(0)} by ${(2 * demo.semi[1]).toFixed(0)} pc (elapsed ${demo.elapsed.toFixed(0)} yr)`);

  // Picking every map pulsar at its own projected point (framed on it, so it is on screen).
  const mapJ = await page.evaluate(async () => (await import('/data/cover.json')).default.pulsarMap.lines.map((l) => l.jname));
  const picks = [];
  for (const j of mapJ) {
    const r = await page.evaluate(async (jname) => {
      const g = window.__galaxy;
      await g.frame({ jname }, { durationS: 0.01 });
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const p = g.project(jname);
      const hit = g.pick(p.x, p.y);
      return { want: jname, got: hit?.jname ?? null, onScreen: p.onScreen, x: p.x, y: p.y };
    }, j);
    picks.push(r);
  }
  const badPicks = picks.filter((p) => p.got !== p.want || !p.onScreen);
  log(`galaxy picks: ${picks.length - badPicks.length} of ${picks.length} map pulsars picked at their projected points${badPicks.length ? `; wrong: ${JSON.stringify(badPicks)}` : ''}`);

  // Real pointer input: a click at Vela's projected point reaches pick through the canvas listeners.
  const vela = await page.evaluate(async () => {
    const g = window.__galaxy;
    await g.frame({ jname: 'J0835-4510' }, { durationS: 0.01 });
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return g.project('J0835-4510');
  });
  await page.mouse.move(vela.x, vela.y);
  await settle(page, 200);
  await page.mouse.move(1, 1); // away again, so the hover label is not in the captures
  await settle(page, 100);

  // Captures: the overview, the map laid over the chart, the fitted region.
  await page.evaluate(() => window.__galaxy.frame('overview', { durationS: 0.01 }));
  await settle(page);
  await page.screenshot({ path: join(OUT, 'galaxy-overview.png') });
  await page.evaluate(async () => {
    const g = window.__galaxy;
    await g.setViewMode('top');
    await g.frame('map', { durationS: 0.01 });
  });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'galaxy-map-top.png') });
  await page.evaluate(async () => {
    const g = window.__galaxy;
    await g.setViewMode('perspective');
    await g.frame('map', { durationS: 0.01 });
  });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'galaxy-map-perspective.png') });
  await page.evaluate(async () => {
    const g = window.__galaxy;
    await g.setViewMode('top');
    await g.frame('region', { durationS: 0.01 });
  });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'galaxy-region.png') });

  // ---- The labels (V1 polish C1) ----
  // Close on each matched pulsar: its tag is shown, reads its line number, and stands off the pulsar's point.
  const tagChecks = await page.evaluate(async (lines) => {
    const g = window.__galaxy;
    await g.setViewMode('top');
    const out = [];
    for (const l of lines) {
      await g.frame({ jname: l.jname }, { durationS: 0.01 });
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const tag = g.labels().find((x) => x.line === l.order);
      const p = g.project(l.jname);
      const b = tag?.box;
      const gap = b ? Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom)) : null;
      out.push({ order: l.order, text: tag?.text ?? null, font: tag?.fontPx ?? null, shown: tag?.shown ?? false, gap });
    }
    return out;
  }, (await page.evaluate(async () => (await import('/data/cover.json')).default.pulsarMap.lines.map((l) => ({ order: l.order, jname: l.jname })))));
  // The tag text is 11 to 12 px (the spec), reads "line N", and its box starts at least 6 px from its pulsar: past the
  // halo's bright core (galaxy.ts HALO_CLEAR_PX = 6, TAG_GAP_PX = 7; 1 px of float and rounding slack).
  const badTags = tagChecks.filter((t) => !t.shown || t.text !== `line ${t.order}` || t.font < 11 || t.font > 12 || t.gap === null || t.gap < 6);
  // Over the whole map: no two shown labels overlap (the declutter's own 2 px padding is not required, only no overlap).
  const overMap = await page.evaluate(async () => {
    const g = window.__galaxy;
    await g.frame('map', { durationS: 0.01 });
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return g.labels().filter((l) => l.shown);
  });
  const overlaps = [];
  for (let i = 0; i < overMap.length; i++)
    for (let j = i + 1; j < overMap.length; j++) {
      const a = overMap[i].box;
      const b = overMap[j].box;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${overMap[i].text} / ${overMap[j].text}`);
    }
  const tagsOverMap = overMap.filter((l) => l.line !== undefined).length;
  const all = await page.evaluate(() => window.__galaxy.labels());
  const gcLabel = all.find((l) => l.text.startsWith('Galactic centre'));
  const gcKpc = gInfo.gc.distKpc;
  // The dev page writes lengths as whole parsecs (galaxy.ts lenText default), so the label must read the model's distance to 1 pc.
  const gcMatch = /^Galactic centre, ([\d.]+) pc$/.exec(gcLabel?.text ?? '');
  const gcOk = gcMatch !== null && Math.abs(Number(gcMatch[1]) - gcKpc * 1000) <= 0.5;
  const ringFonts = all.filter((l) => l.line === undefined && /^[\d.]+ pc$/.test(l.text)).map((l) => l.fontPx);
  const ringOk = ringFonts.length === 5 && ringFonts.every((f) => f >= 11);
  await page.screenshot({ path: join(OUT, 'galaxy-tags-map.png') });
  log(`galaxy labels: ${tagChecks.length - badTags.length} of ${tagChecks.length} line tags shown and readable close up${badTags.length ? `; bad: ${JSON.stringify(badTags)}` : ''}; ${tagsOverMap} tags shown over the whole map, ${overlaps.length} overlapping labels${overlaps.length ? ` (${overlaps.join('; ')})` : ''}; centre label "${gcLabel?.text}"; ring labels ${ringFonts.join(', ')} px`);
  record({
    id: 'chart.galaxy.labels',
    claim: "On the galaxy chart every pulsar matched to a cover line wears a readable tag with its line number beside its halo, labels never overlap, the Galactic centre's label is its name and one distance, and the ring labels stay readable.",
    measured: `${tagChecks.length - badTags.length} of ${tagChecks.length} tags shown, 11 to 12 px, at least 6 px off their pulsar; ${tagsOverMap} tags over the whole map with ${overlaps.length} overlaps; centre "${gcLabel?.text}"; ring labels ${ringFonts.join(', ')} px`,
    expected: `every tag "line N" at 11 to 12 px; no overlaps; "Galactic centre, ${(gcKpc * 1000).toFixed(0)} pc" (the model's modern distance); five ring labels at 11 px or more`,
    tolerance: 'tag gap 6 px (halo core, galaxy.ts); centre distance to 0.5 pc (the label rounds to whole parsecs)',
    pass: badTags.length === 0 && overlaps.length === 0 && gcOk && ringOk,
  });
  assert(badTags.length === 0, 'every matched pulsar wears a readable line tag beside its halo');
  assert(overlaps.length === 0, 'no two labels on the galaxy chart overlap');
  assert(gcOk, `the Galactic centre's label is its name and one distance (${gcLabel?.text})`);
  assert(ringOk, `the ring labels are 11 px or more (${ringFonts.join(', ')})`);

  await page.evaluate(() => window.__galaxy.frame('overview', { durationS: 0.01 }));
  await settle(page, 2000);
  const gPerf = await page.evaluate(() => ({ bench: window.__galaxy.benchmark(120), live: window.__galaxy.frameStats(), w: innerWidth, h: innerHeight }));
  log(`galaxy frame time at ${gPerf.w} x ${gPerf.h}: ${gPerf.bench.toFixed(2)} ms back to back; live ${gPerf.live.meanIntervalMs.toFixed(2)} ms over ${gPerf.live.frames} frames`);
  const gOk = badPicks.length === 0 && gPerf.w === 1440 && gPerf.h === 900 && gPerf.bench < 16.7;
  record({
    id: 'chart.galaxy.view',
    claim: 'On the galaxy chart, pointing at a pulsar picks that pulsar, and the chart draws at 60 frames per second at 1440 x 900.',
    measured: `${picks.length - badPicks.length} of ${picks.length} map pulsars picked at their projected points; ${gInfo.counts.shown} pulsars drawn; ${gPerf.bench.toFixed(2)} ms per frame (120 frames, each waited for)`,
    expected: 'every map pulsar picked; under 16.7 ms per frame',
    tolerance: 'pick radius 12 CSS px; frame budget 16.7 ms on this PC (headless Chrome)',
    pass: gOk,
  });
  assert(badPicks.length === 0, 'every map pulsar is picked at its projected point');
  assert(gPerf.bench < 16.7, 'the galaxy chart renders within a 60 fps budget');
  await page.evaluate(() => window.__galaxy.dispose());

  // ---- The neighbourhood chart ----
  await page.goto(`${baseUrl}/play/charts/?chart=neighbourhood&demo=sun&reduced=1&clean=1`, { waitUntil: 'load' });
  const nDemo = await page.evaluate(() => window.__chartsDemo);
  const nInfo = await page.evaluate(() => window.__neighbourhood.ready);
  log(`neighbourhood: ${nInfo.count} stars (${nInfo.census.noRadialVelocity} without a radial velocity)`);

  // The trail angles, recomputed here from the science modules with the dev page's seed.
  const ref = await page.evaluate(async (wrongId) => {
    const epoch = await import('/src/science/epoch.ts');
    const kin = await import('/src/science/kinematics.ts');
    const types = await import('/src/science/types.ts');
    const scenario = (await import('/data/scenario.json')).default;
    const st = (await import('/data/stars.json')).default;
    const sky = (await import('/data/sky.json')).default;
    const cat = { meta: {}, near: st.near, sky: types.expandColumnar(sky) };
    const d = epoch.discoveryState(scenario, cat);
    const obs = epoch.homeObserver(scenario, cat, d.decimalYear);
    const rows = kin.trail(d.craft, cat, obs, { maxDistPc: 10, draws: 400, seed: 'charts.dev' });
    const pick = (id) => rows.find((r) => r.star.id === id);
    return { sun: pick(0).angleDeg, wrong: pick(wrongId).angleDeg };
  }, nDemo.wrongStarId);

  const nPicks = await page.evaluate(async (ids) => {
    const n = window.__neighbourhood;
    const out = [];
    for (const id of ids) {
      await n.frame({ starId: id }, { durationS: 0.01 });
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const p = n.project(id);
      const hit = n.pick(p.x, p.y);
      out.push({ want: id, got: hit?.star.star.id ?? null, onScreen: p.onScreen, row: hit?.trail?.angleDeg ?? null });
    }
    return out;
  }, [0, nDemo.wrongStarId]);
  const nBad = nPicks.filter((p) => p.got !== p.want || !p.onScreen);
  log(`neighbourhood picks: ${JSON.stringify(nPicks)}`);

  const sunTrail = await page.evaluate(async () => {
    const n = window.__neighbourhood;
    const g = n.showTrail(0);
    await n.frame({ starId: 0 }, { durationS: 0.01 });
    return { angle: g.angleDeg, sigma: g.angleSigmaDeg, dos: g.distOverSpeedYears };
  });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'neighbourhood-sun-trail.png') });
  await page.evaluate(async () => {
    const n = window.__neighbourhood;
    n.showTrail(0);
    await n.frame('overview', { durationS: 0.01 });
  });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'neighbourhood-sun-trail-overview.png') });
  const wrongTrail = await page.evaluate(async (id) => {
    const n = window.__neighbourhood;
    const g = n.showTrail(id);
    await n.frame({ starId: id }, { durationS: 0.01 });
    return { angle: g.angleDeg, sigma: g.angleSigmaDeg, label: n.model().stars[g.starIndex].label };
  }, nDemo.wrongStarId);
  await settle(page);
  await page.screenshot({ path: join(OUT, 'neighbourhood-wrong-trail.png') });
  await page.evaluate(async () => {
    const n = window.__neighbourhood;
    n.showTrail(null);
    n.showAll(n.trailRows());
    await n.frame('overview', { durationS: 0.01 });
  });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'neighbourhood-tinted.png') });

  // Same doubles, same function: the chart's numbers must equal the in-page recomputation exactly (1e-9 deg).
  const angleErr = Math.max(Math.abs(sunTrail.angle - ref.sun), Math.abs(wrongTrail.angle - ref.wrong));
  log(`trails: Sun ${sunTrail.angle.toFixed(4)} +/- ${sunTrail.sigma.toFixed(4)} deg (distance over speed ${sunTrail.dos.toFixed(0)} yr); ${wrongTrail.label} ${wrongTrail.angle.toFixed(2)} +/- ${wrongTrail.sigma.toFixed(2)} deg; largest difference from kinematics.trail ${angleErr.toExponential(1)} deg`);

  await settle(page, 2000);
  const nPerf = await page.evaluate(() => ({ bench: window.__neighbourhood.benchmark(120), live: window.__neighbourhood.frameStats(), w: innerWidth, h: innerHeight }));
  log(`neighbourhood frame time at ${nPerf.w} x ${nPerf.h}: ${nPerf.bench.toFixed(2)} ms back to back; live ${nPerf.live.meanIntervalMs.toFixed(2)} ms over ${nPerf.live.frames} frames`);
  const nOk = nBad.length === 0 && angleErr < 1e-9 && nPerf.bench < 16.7;
  record({
    id: 'chart.neighbourhood.view',
    claim: "On the neighbourhood chart, pointing at a star picks that star, and the trail drawn for it shows the kinematics' own angle.",
    measured: `Sun and ${wrongTrail.label} picked at their projected points (${nPicks.length - nBad.length} of ${nPicks.length}); Sun ${sunTrail.angle.toFixed(4)} deg, ${wrongTrail.label} ${wrongTrail.angle.toFixed(2)} deg drawn; ${nInfo.count} stars; ${nPerf.bench.toFixed(2)} ms per frame`,
    expected: "kinematics.trail recomputed in the page from the science modules (seed 'charts.dev'); under 16.7 ms per frame",
    tolerance: '1e-9 deg (same computation); pick radius 12 CSS px; frame budget 16.7 ms',
    pass: nOk,
  });
  assert(nBad.length === 0, 'the Sun and the wrong star are picked at their projected points');
  assert(angleErr < 1e-9, 'the drawn trail angles are kinematics.trail angles');
  assert(nPerf.bench < 16.7, 'the neighbourhood chart renders within a 60 fps budget');
  await page.evaluate(() => window.__neighbourhood.dispose());
  await settle(page, 200);
}
