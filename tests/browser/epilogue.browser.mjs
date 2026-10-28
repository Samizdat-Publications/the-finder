// Our Frame (chapter 9, the epilogue) on /play/, through the real page. The save starts with every deduction
// confirmed (a player who has finished the chain; map.old carries a real-shaped good attempt so the player's own
// reading can show). The test:
//  1. enters the chapter through the command bus and steps through all six sections with the keyboard (Next and
//     the arrow keys), one section on screen at a time and no page scroll;
//  2. checks the live numbers: the clock ticks, both Voyagers' distances tick and agree with src/science/voyagerNow.ts
//     computed in the page, the light-day sentence names our time and NASA's, the instrument table counts 2 and 3,
//     Gliese 445's numbers match the science's, the map strip draws thirteen dated pulsars and the player's reading;
//  3. checks the record plays through the turntable (track 27, Cavatina, on its side, quiet) and is lifted, with the
//     volume given back, on leaving; the chapter then counts as done and the ring is finished;
//  4. captures every section at 1440 x 900 and 1366 x 768 into review/archive/<timestamp>-epilogue/ with a manifest.
// Console errors fail the test (the harness). Ids: chapter.epilogue. The right path is exported (playEpilogue) for
// the whole-game bot (tests/browser/game.browser.mjs).
import { join } from 'node:path';
import { ROOT } from '../../tools/harness/serve.mjs';
import { freshStart, reviewFolder, stamp } from './slice.browser.mjs';

const SAVE_KEY = 'finder.save.v1';
const JULIAN_YEAR_S = 365.25 * 86_400;
export const SECTION_IDS = ['turn', 'now', 'listening', 'future', 'map', 'line'];

/** A save with every deduction in the graph confirmed, map.old with a real-shaped good attempt, reduced motion as asked. */
async function seedSave(page, baseUrl, { reducedMotion, soundCaptions }) {
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
  const ids = await page.evaluate(async () => (await import('/src/game/graph.ts')).ALL_NODES.map((n) => n.id));
  const nodes = Object.fromEntries(ids.map((id) => [id, { confirmed: true, attempts: [], hints: 0 }]));
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
  // trail.when: the confirmed message carries the map's age read from the warm-white star (estimate, 95% low, high),
  // then the travel time, as quantity tokens (the shape src/chapters/trail/checkers.ts writes; values the default seed's).
  const y = (v) => v * JULIAN_YEAR_S;
  nodes['trail.when'] = {
    confirmed: true,
    hints: 0,
    attempts: [
      {
        answer: null,
        ok: true,
        message: `The map's age: {{q|time|${y(44_068)}|5}}, 95% between {{q|time|${y(43_930)}|5}} and {{q|time|${y(44_210)}|5}}; the machine has travelled {{q|time|${y(44_100)}|5}}.`,
        at: 1,
        result: [],
      },
    ],
  };
  const save = JSON.stringify({
    version: 1,
    nodes,
    chapter: 'hub',
    settings: { humanGloss: false, masterVolume: 0.8, reducedMotion, soundCaptions, showWorking: false },
    seed: 'finder-1',
  });
  await page.evaluate(([k, v]) => {
    localStorage.clear();
    localStorage.setItem(k, v);
  }, [SAVE_KEY, save]);
  await page.goto(`${baseUrl}/play/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 90_000 });
}

const current = (page) => page.evaluate(() => document.querySelector('[data-epilogue]')?.getAttribute('data-epilogue-current') ?? null);
const sections = (page) => page.evaluate(() => [...document.querySelectorAll('[data-epilogue-section]')].map((e) => e.getAttribute('data-epilogue-section')));

async function expectSection(page, id, assert) {
  await page.waitForSelector(`[data-epilogue-section="${id}"]`, { timeout: 30_000 });
  const here = await sections(page);
  assert(here.length === 1 && here[0] === id, `only the ${id} section is on screen (${here.join(', ')})`);
  assert((await current(page)) === id, `the chapter says it is on ${id}`);
}

/**
 * After the turn, each section leads with its picture: the section's first element, as wide as the section, at the
 * top of the stage (no empty band above it), with the words beneath.
 */
async function expectPictureFirst(page, id, assert) {
  await page.waitForSelector(`[data-epilogue-section="${id}"] > [data-epilogue-picture="${id}"]`, { timeout: 30_000 });
  const g = await page.evaluate((sid) => {
    const sec = document.querySelector(`[data-epilogue-section="${sid}"]`);
    const stage = document.querySelector('.epi-stage');
    const pic = sec.firstElementChild;
    const r = pic.getBoundingClientRect();
    const sr = sec.getBoundingClientRect();
    const st = stage.getBoundingClientRect();
    const head = sec.querySelector('.epi-head').getBoundingClientRect();
    return { first: pic.getAttribute('data-epilogue-picture'), top: r.top - st.top, width: r.width, secWidth: sr.width, h: r.height, headBelow: head.top >= r.bottom - 1 };
  }, id);
  assert(g.first === id, `the ${id} section leads with its picture (${g.first})`);
  // 16 px: the stage's own top padding (0.4rem) plus the section's entry slide (8 px), with a little room
  assert(g.top <= 16, `the ${id} picture sits at the top of the stage, no empty band above (${g.top.toFixed(1)} px)`);
  assert(g.width >= g.secWidth - 1 && g.h > 120, `the ${id} picture is full width (${g.width.toFixed(0)} of ${g.secWidth.toFixed(0)} px, ${g.h.toFixed(0)} px tall)`);
  assert(g.headBelow, `the ${id} words sit beneath the picture`);
}

const utcHms = (ms) => new Date(Math.round(ms / 1000) * 1000).toISOString().slice(11, 19);
const sig3 = (x) => Number(x.toPrecision(3)).toLocaleString('en-US', { maximumFractionDigits: 20 });

/**
 * The right path through the chapter, from the hub of a save that has opened it. `shot(name, shows)` is called on
 * every section when given. Returns what it measured.
 */
export async function playEpilogue(page, { assert, log, shot } = {}) {
  const say = log ?? (() => {});
  const snap = (name, shows) => (shot ? shot(name, shows) : Promise.resolve());
  const state = () => page.evaluate(() => window.__finder.state());
  const before = await state();
  const volumeBefore = before.turntable.volume;
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'epilogue' }));
  await page.waitForSelector('[data-epilogue]', { timeout: 60_000 });
  assert((await state()).game.chapter === 'epilogue', 'the chapter opened through the bus');
  const out = {};

  // ---- 1. the turn ----
  await expectSection(page, 'turn', assert);
  const rule = await page.locator('.epi-rule').innerText();
  assert(/now, our side of the story/i.test(rule), `the break from the fiction reads in plain type (${rule})`);
  const glyphs = await page.evaluate(() => [...document.querySelectorAll('.bench-area[data-chapter="epilogue"] .glyph, .bench-area[data-chapter="epilogue"] svg.glyph')].filter((e) => e.getClientRects().length > 0).length);
  assert(glyphs === 0, `no glyphs are visible in the chapter (${glyphs})`);
  const t1 = await page.locator('[data-epilogue-clock] .epi-time').innerText();
  await page.waitForTimeout(2100);
  const t2 = await page.locator('[data-epilogue-clock] .epi-time').innerText();
  assert(t1 !== t2, `the clock ticks (${t1} then ${t2})`);
  const lead = await page.locator('.epi-turn .epi-lead').innerText();
  assert(/step back to your own time: the year the machine is still flying/.test(lead), 'the turn says what it says');
  const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  assert(noScroll, 'the page does not scroll');
  await snap('turn', 'The turn: the plain-type rule at the top, the sentence stepping out of the story, and the live date and time of the device.');

  // The record starts with the chapter: track 27 on its side, quiet.
  await page
    .waitForFunction(() => {
      const t = window.__finder.state().turntable;
      return t.needle?.down === true && t.needle.itemId === 'ozma-31';
    }, null, { timeout: 90_000 })
    .catch(async (e) => {
      const t = await state();
      throw new Error(`the record did not start: ${JSON.stringify({ side: t.turntable.side, status: t.turntable.status, error: t.turntable.error, load: t.turntable.load, needle: t.turntable.needle })} (${e.message})`);
    });
  const playing = (await state()).turntable;
  const last = await page.evaluate(async () => {
    const r = (await import('/data/record.json')).default;
    const all = r.sides.flatMap((s) => s.items.map((i) => ({ ...i, side: s.side })));
    return all.find((i) => i.musicNumber === 27);
  });
  assert(playing.side === last.side && playing.needle.itemId === last.id, `the record plays track 27 (${last.id}, ${last.title}) on side ${last.side}`);
  assert(playing.volume <= Math.min(0.3, volumeBefore) && playing.volume > 0, `the record is quiet (volume ${playing.volume}, was ${volumeBefore})`);
  out.track = { id: last.id, side: last.side, volume: playing.volume };
  {
    const cap = await page.locator('[data-epilogue-caption]').innerText();
    assert(/^(Sound is off\. )?Playing: the record, track 27, Cavatina$/.test(cap), `the playing line names the sound (${cap})`);
  }

  // ---- 2. right now ----
  await page.keyboard.press('ArrowRight');
  await expectSection(page, 'now', assert);
  await page.waitForSelector('[data-epilogue-craft="-31"]');
  const read = () =>
    page.evaluate(() => {
      const one = (id) => {
        const e = document.querySelector(`[data-epilogue-craft="${id}"]`);
        return { km: Number(e.getAttribute('data-km')), hours: Number(e.getAttribute('data-hours')), au: Number(e.getAttribute('data-au')), kms: Number(e.getAttribute('data-kms')), text: e.innerText };
      };
      return { at: Date.now(), v1: one('-31'), v2: one('-32') };
    });
  const a = await read();
  await page.waitForTimeout(2200);
  const b = await read();
  assert(a.v1.km !== b.v1.km && a.v2.km !== b.v2.km, `both distances tick (${a.v1.km} to ${b.v1.km} km)`);
  const calc = await page.evaluate(async () => {
    const { voyagerNow, lightDayUtcMs } = await import('/src/science/voyagerNow.ts');
    const bodies = (await import('/data/ephemeris.json')).default.bodies;
    const n = voyagerNow(bodies, new Date());
    return { at: Date.now(), craft: n.craft.map((c) => ({ id: c.id, km: c.km, hours: c.hours, au: c.au, kms: c.speedKmS })), ld: lightDayUtcMs(bodies) };
  });
  const pageNow = await read();
  // The page shows the last tick (at most about a second old); Voyager 1 moves 17 km/s and Earth up to 30 km/s, so 1.2 s is under 60 km.
  assert(Math.abs(pageNow.v1.km - calc.craft[0].km) < 100, `Voyager 1's distance matches voyagerNow (${pageNow.v1.km} vs ${calc.craft[0].km.toFixed(0)} km)`);
  assert(Math.abs(pageNow.v2.km - calc.craft[1].km) < 100, `Voyager 2's distance matches voyagerNow (${pageNow.v2.km} vs ${calc.craft[1].km.toFixed(0)} km)`);
  assert(Math.abs(pageNow.v1.au - calc.craft[0].au) < 1e-3 && Math.abs(pageNow.v1.kms - calc.craft[0].kms) < 0.01, 'distance from the Sun and speed match voyagerNow');
  assert(/km from Earth/.test(a.v1.text) && /Light from Earth takes/.test(a.v1.text), `plain human units (${a.v1.text.replace(/\s+/g, ' ').slice(0, 80)})`);
  assert(calc.ld !== null, 'the light-day moment is found in the tables');
  const ldText = await page.locator('[data-epilogue-lightday]').innerText();
  const nasa = Date.parse('2026-11-18T10:16:07Z');
  assert(ldText.includes('18 November 2026') && ldText.includes(`NASA gives ${utcHms(nasa)}`) && ldText.includes(`these tables give ${utcHms(calc.ld)}`), `the light-day sentence names NASA's time and ours (${ldText})`);
  assert(calc.ld > calc.at ? /is one light-day from Earth/.test(ldText) : /became one light-day from Earth/.test(ldText), 'the sentence is in the right tense');
  await expectPictureFirst(page, 'now', assert);
  // The picture places both craft from the same tables, turned into the plane of Earth's orbit: the angle between
  // them around the drawn Sun is the angle between their true ecliptic longitudes (a squeezed distance never turns
  // a direction), and the drawing is seen from the north (not mirrored).
  const sky = await page.evaluate(async () => {
    const { skyTonight } = await import('/src/chapters/epilogue/nowPicture.ts');
    const bodies = (await import('/data/ephemeris.json')).default.bodies;
    const teaching = (await import('/data/teaching.json')).default;
    const t = skyTonight(bodies, teaching, new Date());
    const svg = document.querySelector('[data-epilogue-sky]');
    const [sx, sy] = svg.getAttribute('data-sun').split(',').map(Number);
    const dot = (id) => {
      const g = svg.querySelector(`[data-sky-craft="${id}"]`);
      return { x: Number(g.getAttribute('data-x')) - sx, y: Number(g.getAttribute('data-y')) - sy, lon: Number(g.getAttribute('data-lon')) };
    };
    const rings = [...svg.querySelectorAll('[data-sky-ring]')].map((e) => e.getAttribute('data-sky-ring'));
    const planets = [...svg.querySelectorAll('[data-sky-planet]')].map((e) => e.getAttribute('data-sky-planet'));
    return { v1: dot('-31'), v2: dot('-32'), lon: t.craft.map((c) => c.lonDeg), rings, planets, key: document.querySelector('.epi-sky-key')?.textContent ?? '' };
  });
  {
    const ang = (p) => Math.atan2(-p.y, p.x) * (180 / Math.PI);
    const drawn = (((ang(sky.v2) - ang(sky.v1)) % 360) + 540) % 360 - 180;
    const truth = (((sky.lon[1] - sky.lon[0]) % 360) + 540) % 360 - 180;
    // 0.2 deg: the dots' pixel positions are written to 0.01 px at radii above 50 px (under 0.02 deg), and the page
    // computes at its last tick (within a minute); Voyager 1's longitude moves about 0.001 deg a day
    assert(Math.abs(drawn - truth) < 0.2, `the picture keeps the true angle between the Voyagers (${drawn.toFixed(2)} drawn, ${truth.toFixed(2)} deg true)`);
    assert(Math.abs(sky.v1.lon - sky.lon[0]) < 0.01, `Voyager 1 is drawn at its ecliptic longitude (${sky.v1.lon} vs ${sky.lon[0].toFixed(4)})`);
    assert(sky.rings.join(',') === '1,10,100' && /rings at 1, 10 and 100 times Earth's distance/.test(sky.key) && /squeezed/.test(sky.key), `the squeezed scale is stated on the picture (${sky.rings.join(',')}; ${sky.key})`);
    assert(sky.planets.join(',') === 'Mercury,Venus,Mars,Jupiter,Saturn,Uranus,Neptune', `the planets' orbits come from the record's table, Pluto's slip left out (${sky.planets.join(',')})`);
  }
  out.now = { v1km: pageNow.v1.km, v2km: pageNow.v2.km, lightDay: utcHms(calc.ld) };
  await snap('now', "Right now: the picture of where they are tonight (the Sun, Earth's orbit, the planets' orbits, both Voyagers in their true directions on a squeezed scale), then both Voyagers' distance from Earth in kilometres, the light time, the distance from the Sun and the speed, ticking; the light-day sentence with NASA's time and ours.");

  // ---- 3. still listening ----
  await page.keyboard.press('PageDown');
  await expectSection(page, 'listening', assert);
  const counts = await page.evaluate(() => ({
    v1on: document.querySelectorAll('.epi-lamp[data-craft="-31"][data-state="on"]').length,
    v1all: document.querySelectorAll('.epi-lamp[data-craft="-31"]').length,
    v2on: document.querySelectorAll('.epi-lamp[data-craft="-32"][data-state="on"]').length,
    v2all: document.querySelectorAll('.epi-lamp[data-craft="-32"]').length,
    sentence: document.querySelector('[data-epilogue-counts]')?.textContent ?? '',
    link: document.querySelector('[data-epilogue-fuel-link]')?.getAttribute('href') ?? '',
    why: document.querySelector('.epi-why')?.textContent ?? '',
    asOf: document.querySelector('.epi-asof')?.textContent ?? '',
  }));
  assert(counts.v1on === 2 && counts.v1all === 10, `Voyager 1 runs 2 of 10 (${counts.v1on} of ${counts.v1all})`);
  assert(counts.v2on === 3 && counts.v2all === 10, `Voyager 2 runs 3 of 10 (${counts.v2on} of ${counts.v2all})`);
  assert(/Voyager 1 runs 2 of its 10 instruments, Voyager 2 runs 3/.test(counts.sentence), `the sentence says it (${counts.sentence})`);
  assert(/about 4 watts a year, partly because the plutonium decays and partly because the generators' thermocouples/.test(counts.why), `the power loss and both its causes are stated (${counts.why})`);
  assert(/^\/checked\/#row-\d+$/.test(counts.link), `the fuel-clock link opens a row of How it's checked (${counts.link})`);
  assert(/4 August 2026/.test(counts.asOf), `the table says when NASA's status is from (${counts.asOf})`);
  await expectPictureFirst(page, 'listening', assert);
  await snap('listening', 'Still listening: the ten instruments of each Voyager, two running on the first and three on the second, the rest with the date each was switched off and why.');

  // ---- 4. the slow future ----
  await page.keyboard.press('ArrowRight');
  await expectSection(page, 'future', assert);
  await page.waitForSelector('[data-epilogue-diagram]');
  const pass = await page.evaluate(() => ({
    ours: document.querySelector('[data-pass="ours"]')?.innerText ?? '',
    published: document.querySelector('[data-pass="published"]')?.innerText ?? '',
    nasa: document.querySelector('[data-pass="nasa"]')?.innerText ?? '',
    lead: document.querySelector('.epi-future .epi-lead')?.textContent ?? '',
  }));
  const sci = await page.evaluate(async () => {
    const { discoveryState } = await import('/src/science/epoch.ts');
    const scenario = (await import('/data/scenario.json')).default;
    const stars = (await import('/data/stars.json')).default;
    const d = discoveryState(scenario, { meta: {}, near: stars.near, sky: [] });
    return { pc: d.minDistPc, years: d.yearsAfterLaunch, ad: d.decimalYear };
  });
  assert(pass.ours.includes(`${sig3(sci.pc)} pc`) && pass.ours.includes(`${sig3(sci.years)} years after launch`) && pass.ours.includes(`AD ${sig3(sci.ad)}`), `our pass is the science's (${pass.ours.replace(/\s+/g, ' ')})`);
  assert(/0\.573 pc/.test(pass.ours) && /44,100 years/.test(pass.ours), `0.573 pc at 44,100 years (${pass.ours.replace(/\s+/g, ' ')})`);
  assert(/0\.575 pc/.test(pass.published) && /44\.0 thousand years from about 2019/.test(pass.published), `the published numbers sit beside it, counted from about 2019 (${pass.published.replace(/\s+/g, ' ')})`);
  assert(/about 1\.7 light-years/.test(pass.nasa) && /40,000/.test(pass.nasa), `NASA's wording too (${pass.nasa.replace(/\s+/g, ' ')})`);
  assert(/That is where this story was set/.test(pass.lead), 'the premise is said aloud');
  await expectPictureFirst(page, 'future', assert);
  out.future = { ours: pass.ours.replace(/\s+/g, ' '), pc: sci.pc, years: sci.years, ad: sci.ad };
  await snap('future', "The slow future: the drawing of the Sun, Voyager 1's path, Gliese 445's path and the closest approach, with our number beside the published ones.");

  // ---- 5. the map is older than the machine ----
  await page.keyboard.press('ArrowRight');
  await expectSection(page, 'map', assert);
  await page.waitForSelector('[data-epilogue-strip] circle.dot', { timeout: 60_000 });
  const mapInfo = await page.evaluate(() => ({
    dots: [...document.querySelectorAll('[data-epilogue-strip] circle.dot')].map((e) => ({ b: e.getAttribute('data-map-epoch'), y: Number(e.getAttribute('data-year')) })),
    lead: document.querySelector('.epi-map .epi-lead')?.textContent ?? '',
    yours: document.querySelector('[data-epilogue-yours]')?.textContent ?? '',
    why: document.querySelector('.epi-map .epi-why')?.textContent ?? '',
  }));
  assert(mapInfo.dots.length === 13, `thirteen pulsars are dated (${mapInfo.dots.length})`);
  assert(mapInfo.dots.every((d) => d.y > 1966 && d.y < 1973), 'every dot lies between 1966 and 1973, before the launch');
  assert(/published as the 1970\/1971 epoch; the periods themselves date from 1966\.6 to 1971\.8, on average about eight years before launch/.test(mapInfo.lead), `the map's age is stated (${mapInfo.lead})`);
  assert(/Your own reading in The Trail dated the map/.test(mapInfo.yours) && /flying for/.test(mapInfo.yours) && /either way/.test(mapInfo.yours), `the player's own reading is shown (${mapInfo.yours.slice(0, 120)})`);
  assert(/far too small to see beside clocks each uncertain by a century or more/.test(mapInfo.why), `the line tying back to Portrait is there (${mapInfo.why})`);
  await expectPictureFirst(page, 'map', assert);
  out.map = { dots: mapInfo.dots.length, mean: mapInfo.dots.reduce((s, d) => s + d.y, 0) / mapInfo.dots.length };
  await snap('map', "The map is older than the machine: each of the map's pulsars on a 1966 to 1979 timeline, the 1970/1971 epoch band, the launch line, and the player's own reading from The Map.");

  // ---- 6. the line in the run-out groove ----
  await page.keyboard.press('ArrowRight');
  await expectSection(page, 'line', assert);
  const reduced = (await state()).game.settings.reducedMotion;
  await page.waitForFunction((r) => Number(document.querySelector('[data-epilogue-record]')?.getAttribute('data-zoom')) >= (r ? 1 : 0.999), reduced, { timeout: 30_000 });
  const line = await page.evaluate(() => ({
    quote: document.querySelector('[data-epilogue-inscription]')?.textContent ?? '',
    ferris: document.querySelector('[data-epilogue-ferris]')?.textContent ?? '',
    etched: document.querySelector('[data-epilogue-etched]')?.textContent?.trim() ?? '',
    credits: [...document.querySelectorAll('[data-epilogue-credits] li')].length,
    people: document.querySelector('.epi-people')?.textContent ?? '',
    checked: document.querySelector('[data-epilogue-checked]')?.getAttribute('href') ?? '',
    ring: document.querySelector('[data-epilogue-ring]')?.textContent ?? '',
    next: document.querySelector('[data-epilogue-next]')?.hasAttribute('disabled') ?? false,
  }));
  assert(line.quote === 'To the makers of music - all worlds, all times', `the line is set with a spaced hyphen (${line.quote})`);
  assert(line.etched === line.quote, 'the same line is set along the record');
  assert(/Etched by hand between the label and the grooves\. Timothy Ferris asked for one line made by a human hand\./.test(line.ferris), `the Ferris sentence (${line.ferris})`);
  assert(line.credits >= 5 && /Carl Sagan/.test(line.people) && /Ann Druyan/.test(line.people), `the credits roll lists the sources and people (${line.credits} sources)`);
  assert(line.checked === '/checked/' && /Back to the ring/.test(line.ring), 'the two ways out are there');
  assert(line.next, 'Next is finished on the last section');
  await expectPictureFirst(page, 'line', assert);
  await snap('line', 'The line in the run-out groove: the record\'s centre, drawn, closed in on the space between the label and the grooves, where the hand-etched line is set along the circle; Ferris\'s sentence, the credits and the two ways out.');

  // The guided tour owns the sections: with it on, the chapter's own Next, dots and arrow keys are gone, and the
  // last section's "Back to the ring" is hidden (the guide's Finish ends the tour). Off again, all of them are back.
  const stops = await page.evaluate(async () => {
    const { STOPS } = await import('/src/tour/script.ts');
    return { turn: STOPS.findIndex((x) => x.id === 'finale.turn'), line: STOPS.findIndex((x) => x.id === 'finale.line') };
  });
  assert(stops.turn >= 0 && stops.line > stops.turn, `the finale stops are in the tour (${JSON.stringify(stops)})`);
  await page.evaluate((step) => window.__finder.dispatch({ type: 'tour.start', step }), stops.turn);
  await page.waitForFunction(() => window.__finder.state().game.tour.on === true, null, { timeout: 15_000 });
  await expectSection(page, 'turn', assert);
  const nav = () =>
    page.evaluate(() => ({
      next: document.querySelectorAll('[data-epilogue-next]').length,
      dots: document.querySelectorAll('[data-epilogue-dot]').length,
      sound: document.querySelectorAll('[data-epilogue-mute]').length,
      ring: document.querySelectorAll('[data-epilogue-ring]').length,
      checked: document.querySelectorAll('[data-epilogue-checked]').length,
    }));
  const touring = await nav();
  assert(touring.next === 0 && touring.dots === 0 && touring.sound === 0, `on the tour Next and the dots are hidden and there is no second sound button (the top bar has one) (${JSON.stringify(touring)})`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  assert((await current(page)) === 'turn', 'on the tour the arrow keys do not move Our Frame on their own');
  await page.evaluate((step) => window.__finder.dispatch({ type: 'tour.goto', step }), stops.line);
  await expectSection(page, 'line', assert);
  const lineTour = await nav();
  assert(lineTour.ring === 0 && lineTour.checked === 1, `on the tour "Back to the ring" is hidden and "How every step is checked" stays (${JSON.stringify(lineTour)})`);
  await page.evaluate(() => window.__finder.dispatch({ type: 'tour.exit' }));
  await page.waitForFunction(() => window.__finder.state().game.chapter === 'hub', null, { timeout: 15_000 });
  await page.evaluate(() => window.__finder.dispatch({ type: 'chapter.enter', chapter: 'epilogue' }));
  await page.waitForSelector('[data-epilogue]', { timeout: 60_000 });
  await expectSection(page, 'turn', assert);
  const free = await nav();
  assert(free.next === 1 && free.dots === 6, `off the tour Next and the dots are back (${JSON.stringify(free)})`);
  await page.keyboard.press('ArrowRight');
  await expectSection(page, 'now', assert);
  await page.locator('[data-epilogue-dot="line"]').click();
  await expectSection(page, 'line', assert);
  assert((await nav()).ring === 1, 'off the tour "Back to the ring" is back');

  // Back through the dots to the first section, then leave by the button.
  await page.locator('[data-epilogue-dot="turn"]').click();
  await expectSection(page, 'turn', assert);
  await page.keyboard.press('ArrowLeft');
  assert((await current(page)) === 'turn', 'the first section is the floor');
  await page.locator('[data-epilogue-dot="line"]').click();
  await expectSection(page, 'line', assert);
  await page.locator('[data-epilogue-ring]').click();
  await page.waitForFunction(() => window.__finder.state().game.chapter === 'hub', null, { timeout: 15_000 });
  await page.waitForFunction(() => window.__finder.state().turntable.needle?.down !== true, null, { timeout: 15_000 });
  const after = await state();
  assert(after.turntable.needle?.down !== true, 'the needle is lifted on leaving');
  assert(Math.abs(after.turntable.volume - volumeBefore) < 1e-9, `the volume is given back (${after.turntable.volume})`);
  assert(after.game.chapterStatus.epilogue === 'done', `Our Frame is done once entered (${after.game.chapterStatus.epilogue})`);
  out.status = after.game.chapterStatus.epilogue;
  say(`epilogue: ${out.track.id} at volume ${out.track.volume}; V1 ${out.now.v1km} km; light-day ${out.now.lightDay}; ${out.future.ours}; map mean ${out.map.mean.toFixed(1)}`);
  return out;
}

async function pass(page, baseUrl, size, { assert, log, review, reducedMotion }) {
  await page.setViewportSize({ width: size.w, height: size.h });
  await seedSave(page, baseUrl, { reducedMotion, soundCaptions: true });
  const g0 = await page.evaluate(() => window.__finder.state().game);
  assert(g0.chapterStatus.epilogue === 'open', `Our Frame is open before it is entered (${g0.chapterStatus.epilogue})`);
  const res = await playEpilogue(page, {
    assert,
    log,
    shot: async (name, shows) => {
      await page.waitForTimeout(name === 'line' ? 400 : 700);
      await review.shot(page, `${name}-${size.w}x${size.h}`, shows, `Stepped to the "${name}" section of Our Frame with the keyboard at ${size.w} x ${size.h}.`);
    },
  });
  // The caption of the sound shows with the captions setting on: checked on the first pass only (it needs the chapter open).
  return res;
}

export default async function run({ page, baseUrl, record, assert, log }) {
  const dir = join(ROOT, 'review', 'archive', `${stamp()}-epilogue`);
  const review = reviewFolder(dir);
  const r1 = await pass(page, baseUrl, { w: 1440, h: 900 }, { assert, log, review, reducedMotion: false });
  const r2 = await pass(page, baseUrl, { w: 1366, h: 768 }, { assert, log, review, reducedMotion: true });
  log(`captures: ${dir}`);
  record({
    id: 'chapter.epilogue',
    claim: 'Our Frame steps out of the fiction into our own time: the live positions, the instruments, the Gliese 445 pass, the map older than the machine and the hand-etched line, with the record playing quietly and lifted on leaving.',
    measured: `1440x900: ${r1.track.id}, V1 ${r1.now.v1km} km, light-day ${r1.now.lightDay}, ${r1.future.ours}, ${r1.map.dots} dated pulsars, ${r1.status}; 1366x768: ${r2.status}`,
    expected: 'two of ten instruments on Voyager 1 and three on Voyager 2; 0.573 pc at 44,100 years; thirteen dated pulsars before launch; track 27 playing quietly then lifted',
    tolerance: 'exact counts; positions within 100 km of the shared maths; Gliese 445 numbers equal the science core',
    pass: true,
  });
  await freshStart(page, baseUrl);
}
