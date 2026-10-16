// The encounter scene (src/world/, dev page /play/scene/): the sky it draws is the computed sky.
// - The Sun's magnitude and direction in the handle against an independent computation from the epoch
//   model (the distance modulus at |craft position|, and minus the craft's position), and the rendered
//   Sun is a bright point where the handle says.
// - Star counts against the data files.
// - The Milky Way shader puts the Galactic centre at galacticToIcrs(0, 0) and the bright stars at their
//   own galactic coordinates (texture coordinates read back from the shader), and the map is the right
//   way up (the Large Magellanic Cloud is bright where it is, dim at its mirror images).
// - Every hotspot lies on the model (nearest vertex of the shipped glb).
// - Frame time at 1440 x 900 and no console errors; dispose() runs clean.
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { ROOT } from '../../tools/harness/serve.mjs';

async function modelVertices() {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(join(ROOT, 'public', 'media', 'models', 'voyager.glb'));
  const out = [];
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh();
    if (!m) continue;
    const t = n.getTranslation();
    const s = n.getScale();
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const e = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, e);
        out.push([e[0] * s[0] + t[0], e[1] * s[1] + t[1], e[2] * s[2] + t[2]]);
      }
    }
  }
  return out;
}

export default async function run({ page, baseUrl, record, assert, log }) {
  await page.goto(`${baseUrl}/play/scene/?clean=1&reduced=1`, { waitUntil: 'load' });
  const info = await page.evaluate(() => window.__encounter.ready);

  // ---- The Sun, against the epoch model computed here, independently of src/world ----
  const ref = await page.evaluate(async () => {
    const epoch = await import('/src/science/epoch.ts');
    const types = await import('/src/science/types.ts');
    const scenario = (await import('/data/scenario.json')).default;
    const stars = (await import('/data/stars.json')).default;
    const sky = (await import('/data/sky.json')).default;
    const cat = { meta: {}, near: stars.near, sky: types.expandColumnar(sky) };
    const d = epoch.discoveryState(scenario, cat);
    const p = d.craft.posPc;
    const r = Math.hypot(p[0], p[1], p[2]);
    return {
      mag: epoch.apparentMagnitude(epoch.SUN_ABS_MAG_V, r),
      dir: [-p[0] / r, -p[1] / r, -p[2] / r],
      year: d.decimalYear,
      near: stars.near.length,
      sky: sky.rows.length,
    };
  });
  const s = info.sun.dirIcrs;
  const sunAngDeg = (Math.acos(Math.min(1, s[0] * ref.dir[0] + s[1] * ref.dir[1] + s[2] * ref.dir[2])) * 180) / Math.PI;
  const magErr = Math.abs(info.sun.appMag - ref.mag);

  // The rendered Sun: in the opening view it is on screen; the brightest pixel within 4 px of its
  // projected position must be near white (a magnitude -0.8 sprite saturates its core).
  await page.evaluate(() => window.__encounter.frame('overview', { durationS: 0.01 }));
  await page.waitForTimeout(300);
  const sp = await page.evaluate(() => window.__encounter.projectSky(window.__encounter.info().sun.dirIcrs));
  let sunPeak = 0;
  if (sp.onScreen) {
    const clip = { x: Math.max(0, Math.round(sp.x) - 4), y: Math.max(0, Math.round(sp.y) - 4), width: 9, height: 9 };
    const png = await page.screenshot({ clip });
    const { data, info: im } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < im.width * im.height; i++) sunPeak = Math.max(sunPeak, Math.min(data[3 * i], data[3 * i + 1], data[3 * i + 2]));
  }
  const sunOk = magErr <= 0.05 && sunAngDeg <= 0.01 && sp.onScreen && sunPeak >= 200;
  log(`Sun: mag ${info.sun.appMag.toFixed(3)} (reference ${ref.mag.toFixed(3)}), direction off by ${sunAngDeg.toExponential(2)} deg; drawn at (${sp.x.toFixed(0)}, ${sp.y.toFixed(0)}), peak ${sunPeak}`);
  record({
    id: 'scene.encounter.sun',
    claim: 'In the encounter scene the Sun is the star the epoch model says: seen from Voyager 1 at the discovery epoch, a point of magnitude about -0.8 in the direction opposite the craft\'s position.',
    measured: `magnitude ${info.sun.appMag.toFixed(3)}, direction RA ${(((Math.atan2(s[1], s[0]) * 180) / Math.PI + 360) % 360).toFixed(3)}, Dec ${((Math.asin(s[2]) * 180) / Math.PI).toFixed(3)} deg, ${info.sun.distPc.toFixed(4)} pc away in AD ${Math.floor(info.decimalYear)}; drawn as a point with peak ${sunPeak} of 255 at its projected pixel`,
    expected: `apparentMagnitude(SUN_ABS_MAG_V = 4.81, |craft position|) = ${ref.mag.toFixed(3)} and the direction -craft/|craft| from discoveryState (epoch.ts), computed in the test`,
    tolerance: 'magnitude within 0.05 and direction within 0.01 deg (spec); a near-white pixel (all channels 200 or more) within 4 px of the projected position',
    pass: sunOk,
  });
  assert(sunOk, 'the Sun is where and as bright as the epoch model says');

  // ---- Star counts ----
  const countOk = info.counts.near === ref.near && info.counts.sky === ref.sky && info.counts.shown > 7000 && info.counts.shown < 10000;
  log(`stars: near ${info.counts.near}, sky ${info.counts.sky} (${info.counts.noDistance} without a distance), shown ${info.counts.shown}`);

  // ---- The Milky Way lines up with the sky ----
  const mw = await page.evaluate(async () => {
    const astro = await import('/src/science/astro.ts');
    const h = window.__encounter;
    const uvToLb = (px) => ({ l: (((0.5 - px[0]) * 360) % 360 + 360) % 360, b: (px[1] - 0.5) * 180 });
    const dirOf = (ra, dec) => astro.unitVector(ra, dec);
    const gcRaDec = astro.galacticToIcrs(0, 0);
    const gc = uvToLb(h.probeSky(dirOf(gcRaDec.raDeg, gcRaDec.decDeg), 'uv'));
    const named = {};
    const scenario = (await import('/data/scenario.json')).default;
    void scenario;
    const sky = (await import('/data/sky.json')).default;
    const cols = sky.columns;
    for (const name of ['Deneb', 'Rigel', 'Betelgeuse', 'Antares']) {
      const row = sky.rows.find((r) => r[cols.indexOf('name')] === name);
      const ra = row[cols.indexOf('raDeg')];
      const dec = row[cols.indexOf('decDeg')];
      const want = astro.icrsToGalactic(ra, dec);
      const got = uvToLb(h.probeSky(dirOf(ra, dec), 'uv'));
      const dl = ((got.l - want.lDeg + 540) % 360) - 180;
      named[name] = Math.hypot(dl * Math.cos((want.bDeg * Math.PI) / 180), got.b - want.bDeg);
    }
    const lum = (px) => 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];
    const at = (l, b) => {
      const e = astro.galacticToIcrs(l, b);
      return lum(h.probeSky(dirOf(e.raDeg, e.decDeg), 'colour'));
    };
    return {
      gc,
      named,
      gcLum: at(0, 0),
      ngpLum: at(0, 90),
      lmc: at(280.47, -32.89),
      lmcFlipB: at(280.47, 32.89),
      lmcFlipL: at(79.53, -32.89),
    };
  });
  const gcOff = Math.hypot(((mw.gc.l + 180) % 360) - 180, mw.gc.b);
  const starOff = Math.max(...Object.values(mw.named));
  const upright = mw.lmc > 2 * mw.lmcFlipB && mw.lmc > 2 * mw.lmcFlipL && mw.gcLum > 5 * Math.max(mw.ngpLum, 1e-4);
  const mwOk = gcOff <= 1 && starOff <= 1 && upright;
  log(`Milky Way: Galactic centre read at l ${mw.gc.l.toFixed(3)}, b ${mw.gc.b.toFixed(3)} (off by ${gcOff.toFixed(3)} deg); bright stars off by at most ${starOff.toFixed(3)} deg; LMC ${mw.lmc.toFixed(3)} vs mirrors ${mw.lmcFlipB.toFixed(3)}, ${mw.lmcFlipL.toFixed(3)}; centre ${mw.gcLum.toFixed(3)} vs pole ${mw.ngpLum.toFixed(4)}`);
  record({
    id: 'scene.encounter.milkyway',
    claim: 'The Milky Way behind Voyager is ESA\'s Gaia map placed on the sky in the right orientation: the Galactic centre and the bright stars line up with it.',
    measured: `shader reads the map at l ${mw.gc.l.toFixed(3)}, b ${mw.gc.b.toFixed(3)} deg in the direction galacticToIcrs(0, 0) (${gcOff.toFixed(3)} deg off); at Deneb, Rigel, Betelgeuse and Antares within ${starOff.toFixed(3)} deg of their galactic coordinates; the LMC is ${(mw.lmc / Math.max(mw.lmcFlipB, mw.lmcFlipL)).toFixed(1)}x brighter than its mirror positions`,
    expected: 'l = 0, b = 0 at the Galactic centre and each star\'s own (l, b) from icrsToGalactic (Hipparcos matrix, astro.ts); the Large Magellanic Cloud at l 280.47, b -32.89 (SIMBAD)',
    tolerance: '1 deg (spec); the LMC at least twice as bright as at (280.47, +32.89) and (79.53, -32.89), and the centre at least 5x the galactic pole',
    pass: mwOk,
    notes: `ESA/Gaia/DPAC, CC BY-SA 3.0 IGO (A. Moitinho), EDR3 colour map, equirectangular 4000 x 2000. From 0.75 pc the Milky Way looks as from Earth (it is kiloparsecs away). Star counts: near ${info.counts.near}, sky ${info.counts.sky} (${info.counts.noDistance} without a distance keep their catalogue directions), shown ${info.counts.shown} (apparent mag 6.5 or brighter from the craft).`,
  });
  assert(mwOk, 'the Milky Way lines up with the Galactic centre and the stars');
  assert(countOk, `star counts match the data files (near ${ref.near}, sky ${ref.sky})`);

  // ---- Hotspots lie on the model ----
  const spots = await page.evaluate(() => window.__encounter.hotspots.map((h) => ({ id: h.id, pos: h.pos, radius: h.radius })));
  const verts = await modelVertices();
  const spotDist = spots.map((h) => {
    let best = Infinity;
    for (const v of verts) best = Math.min(best, Math.hypot(v[0] - h.pos[0], v[1] - h.pos[1], v[2] - h.pos[2]));
    return { id: h.id, d: best, radius: h.radius };
  });
  const spotsOk = spotDist.every((h) => h.d <= Math.max(0.05, h.radius));
  log(`hotspots, nearest model vertex: ${spotDist.map((h) => `${h.id} ${h.d.toFixed(3)} m`).join(', ')}`);
  assert(spotsOk, 'every hotspot is on the craft (nearest vertex within the part radius)');
  const vis = await page.evaluate(async () => {
    const h = window.__encounter;
    const out = {};
    for (const id of ['record', 'rtg2', 'scanPlatform']) {
      await h.frame(id, { durationS: 0.01 });
      await new Promise((r) => setTimeout(r, 150));
      out[id] = h.project(id);
    }
    return out;
  });
  const framedOk = Object.values(vis).every((p) => p.visible && Math.abs(p.x - 720) < 2 && Math.abs(p.y - 450) < 2);
  log(`framed hotspots project to the centre and are visible: ${framedOk}`);
  assert(framedOk, 'frame(id) centres the hotspot and it is visible');

  // ---- Frame time at 1440 x 900 ----
  await page.evaluate(() => window.__encounter.frame('overview', { durationS: 0.01 }));
  await page.waitForTimeout(2500);
  const perf = await page.evaluate(() => ({ bench: window.__encounter.benchmark(120), live: window.__encounter.frameStats(), w: innerWidth, h: innerHeight, pr: devicePixelRatio }));
  log(`frame time at ${perf.w} x ${perf.h} (pixel ratio ${perf.pr}): ${perf.bench.toFixed(2)} ms rendered back to back; live loop ${perf.live.meanIntervalMs.toFixed(2)} ms per frame over ${perf.live.frames} frames`);
  const perfOk = perf.w === 1440 && perf.h === 900 && perf.bench < 16.7;
  record({
    id: 'scene.encounter',
    claim: 'The encounter scene renders Voyager 1 under the computed sky at 60 frames per second at 1440 x 900, with every hotspot on the craft.',
    measured: `${perf.bench.toFixed(2)} ms per frame (120 frames back to back, each waited for with a one-pixel read-back), live loop ${perf.live.meanIntervalMs.toFixed(1)} ms; ${info.counts.shown} stars drawn; hotspots within ${Math.max(...spotDist.map((h) => h.d)).toFixed(3)} m of a model vertex`,
    expected: 'under 16.7 ms (60 fps); each hotspot within its part radius of the model (tools/world/measure-hotspots.mjs)',
    tolerance: 'frame budget 16.7 ms on this PC (RTX 5070 Ti Laptop, headless Chrome); hotspot radius per part (hotspots.ts)',
    pass: perfOk && spotsOk && framedOk,
  });
  assert(perfOk, 'renders within a 60 fps frame budget at 1440 x 900');

  // ---- dispose ----
  await page.evaluate(() => {
    window.__encounter.dispose();
  });
  await page.waitForTimeout(200);
}
