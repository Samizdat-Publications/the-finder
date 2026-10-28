// "Do it for me" in The Map. The answers come from the playthrough's own epoch model (epochModel(game.seed),
// src/chapters/shared/epochModel.ts) through the instrument's own helpers (mapMath.ts), as the map bot reads them
// (tests/browser/map.browser.mjs, playMap) and the trail bot's confirmMapThroughBus.
//
// Everything is worked on the real controls: the dial (its own arrow and Page keys, until the long line points at
// the Galactic centre), the line buttons, the pulsars on the galaxy chart (clicked where the chart's own handle,
// chartHandle() from GalaxyPane.tsx, projects them, after framing the camera on them), the step chips, the
// spin-down clock's slider, the axis on the sky (a press on the sky plot, then the plot's own arrow keys) and the
// origin on the plane (a press on the plane); each step is then proposed with its own Propose button, so the line
// readouts show their pulsars afterwards. Only if a pulsar cannot be clicked (no chart, or it will not project on
// screen) does a step fall back to deduction.propose on the bus with the answer its Propose button would send.
//
// V1 polish (2026-10-28, "Do it for me" shows its work): the dial turns in visible steps, the chart eases onto a
// pulsar before it is clicked (its halo and line tag then appear), the clock's slider sweeps back to the crossing,
// the axis is dragged across the sky and the origin across the plane, each followed by a short beat on the result.
// All of it is skipped with reduced motion (sweep, beat and the camera's own ease cap honour the setting).

import { game } from '../../game/state';
import { ensureParts, epochModel, type EpochModel } from '../../chapters/shared/epochModel';
import { chartHandle } from '../../chapters/map/GalaxyPane';
import { assignments, selectedLine } from '../../chapters/map/state';
import { bestAxisOnGrid, clockCrossingYearsAgo, isPass1Anchor, isYoung, skyAges } from '../../chapters/map/mapMath';
import { beat, click, ensureChapter, finish, key, press, proposeOnBus, proposeWith, sleep, sweep, tap, waitFor, waitVisible } from '../actionsKit';

/** The clock's slider moves in 50-year steps (SpinClock.tsx, step 50). */
const CLOCK_STEP_YEARS = 50;

/** True when the player asked for reduced motion: the hand then works without the visible in-between steps. */
const calm = (): boolean => game.settings.value.reducedMotion;
/** Pause between two key presses on the dial, ms, so the map is seen to turn (about 1 to 2 s for a whole turn). */
const DIAL_KEY_MS = 35;
/** How long the chart eases onto a pulsar before it is clicked, s (a display choice). */
const FRAME_S = 0.7;
/** Steps and duration of a visible slide across a plot (a display choice: about 1 s). */
const GLIDE_STEPS = 30;
const GLIDE_MS = 1000;

/**
 * Slide the hand across a plot in visible eased steps, each a press and release where the hand is, so a plot that
 * sets its value on pointerdown follows it (the sky map and the plane do; a synthetic press cannot hold pointer
 * capture for a drag in Chromium when no real button is down). The last press lands exactly on `to`.
 */
async function glide(el: Element, from: [number, number], to: [number, number]): Promise<void> {
  for (let i = 1; i <= GLIDE_STEPS; i++) {
    const f = i / GLIDE_STEPS;
    const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2; // ease in and out
    tap(el, from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
    await sleep(GLIDE_MS / GLIDE_STEPS);
  }
}

async function ready(): Promise<EpochModel> {
  await ensureChapter('map');
  await waitFor('.mapinst[data-map-phase="ready"]', 120_000, 'The Map to finish measuring');
  await waitFor('.map-chart[data-chart-ready="true"]', 60_000, 'the galaxy chart');
  const m = epochModel(game.seed.value);
  await ensureParts(m, ['identification']);
  return m;
}

/** Open a step's tools with its chip. */
async function step(id: string): Promise<void> {
  const chip = await waitFor(() => document.querySelector<HTMLButtonElement>(`button.map-chip[data-step="${id}"]:not([disabled])`), 20_000, `the ${id} step`);
  if (chip.getAttribute('aria-pressed') !== 'true') click(chip);
  await waitFor(`.mapinst[data-stage="${id}"]`, 5000, `the ${id} tools`);
}

/** Turn the dial with its own keys until the long line points at the Galactic centre (0.06 deg, as the bot). */
async function alignDial(): Promise<void> {
  const dial = document.querySelector('svg.map-dial[data-dial]');
  const reading = (): number => Number(document.querySelector('[data-angle-to-centre]')?.getAttribute('data-angle-to-centre') ?? '');
  if (!dial || !Number.isFinite(reading()) || document.querySelector('[data-angle-to-centre=""]')) return;
  for (let i = 0; i < 80; i++) {
    const a = reading();
    if (!Number.isFinite(a) || Math.abs(a) <= 0.06) return;
    const big = Math.abs(a) >= 10;
    const small = Math.abs(a) < 1;
    const k = a > 0 ? (big ? 'PageDown' : 'ArrowRight') : big ? 'PageUp' : 'ArrowLeft';
    key(dial, k, { shift: small });
    await waitFor(() => (reading() !== a ? true : null), 2000, 'the map to turn').catch(() => undefined);
    if (!calm()) await sleep(DIAL_KEY_MS);
  }
}

/** The first old line whose pulsar stands out by period and direction alone (the lines map.periods accepts). */
function firstAnchor(m: EpochModel): { order: number; jname: string } {
  const l = m.lines.find((x) => {
    const e = m.byJ.get(x.jname);
    return e && !isYoung(e) && isPass1Anchor(m, x.order);
  });
  if (!l) throw new Error('The map has no line that stands out by its period alone.');
  return { order: l.order, jname: l.jname };
}

/**
 * Choose a line on the instrument (its line button), then click its pulsar where the chart draws it. True once the
 * line readout shows it. `show`: the chart eases onto the pulsar first and a beat follows, so the click and the halo
 * and line tag it brings are seen. `quick` (all fourteen lines): the pulsar is clicked where the current view draws
 * it when the chart's own pick there finds it, else the chart jumps onto it; a short beat follows each line.
 */
async function assignOnChart(order: number, jname: string, mode: 'show' | 'quick' = 'show'): Promise<boolean> {
  if (assignments.value[String(order)] === jname) return true;
  await press(`button.map-lb[data-line-button="${order}"]`, 10_000, `line ${order}`);
  await waitFor(() => (selectedLine.value === order ? true : null), 5000, `line ${order} to be chosen`);
  const h = chartHandle();
  const canvas = document.querySelector('.map-chart canvas');
  if (!h || !canvas) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const here = attempt === 0 && mode === 'quick' ? h.project(jname) : null;
    const clean = here?.onScreen === true && h.pick(here.x, here.y)?.jname === jname;
    if (!clean) {
      await h.frame({ jname }, { durationS: mode === 'show' && attempt === 0 && !calm() ? FRAME_S : 0.01 });
      await sleep(150);
    }
    const p = h.project(jname);
    if (!p || !p.onScreen) continue;
    const r = canvas.getBoundingClientRect();
    tap(canvas, r.left + p.x, r.top + p.y);
    const ok = await waitFor(() => (assignments.value[String(order)] === jname ? true : null), 3000, `${jname} on line ${order}`).then(() => true, () => false);
    if (ok) {
      await beat(mode === 'show' ? 600 : 180);
      // A quick match that had to jump onto its pulsar goes back to the whole map for the next line.
      if (mode === 'quick' && !clean) await h.frame('map', { durationS: 0.01 }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

/** Back to the whole chart after clicking pulsars close up (the chart's own "overview" frame). */
async function overview(): Promise<void> {
  await chartHandle()?.frame('overview').catch(() => undefined);
}

export function periods(): Promise<void> {
  return finish('map.periods', async () => {
    const m = await ready();
    await alignDial();
    const a = firstAnchor(m);
    if (await assignOnChart(a.order, a.jname)) {
      // The readout and the proposal are for the chosen line: choose it again if another is selected.
      if (selectedLine.value !== a.order) await press(`button.map-lb[data-line-button="${a.order}"]`, 10_000, `line ${a.order}`);
      await overview();
      await proposeWith('map.periods', '[data-panel="map.periods"] [data-propose-button="map.periods"]');
    } else {
      // Fallback: the chart could not be clicked (no chart handle, or the pulsar would not project on screen).
      await proposeOnBus('map.periods', { line: a.order, jname: a.jname });
    }
  });
}

export function old(): Promise<void> {
  return finish('map.old', async () => {
    const m = await ready();
    // The line map.periods accepted (its answer), else the first anchor; on the chart if it is not there yet.
    const rec = game.records.value['map.periods'];
    const ok = rec ? [...rec.attempts].reverse().find((x) => x.ok)?.answer : null;
    const a = ok && typeof ok === 'object' && !Array.isArray(ok) && typeof ok.line === 'number' && typeof ok.jname === 'string' ? { order: ok.line, jname: ok.jname } : firstAnchor(m);
    const onChart = await assignOnChart(a.order, a.jname);
    await step('map.old');
    const e = m.byJ.get(a.jname);
    const line = m.lines.find((x) => x.order === a.order);
    if (!e || !line) throw new Error('The matched line is missing from the model.');
    const cross = clockCrossingYearsAgo(e, line, 3);
    if (cross === null) throw new Error(`Line ${a.order}'s clock never crosses the map's number.`);
    const slider = await waitVisible<HTMLInputElement>('input[data-clock]', 10_000, 'the spin-down clock');
    // The clock runs back visibly until the matched pulsar's curve meets the map's number.
    await sweep(slider, -Math.round(cross / CLOCK_STEP_YEARS) * CLOCK_STEP_YEARS, 1600, 32);
    await sleep(200);
    if (onChart) {
      await waitFor(`[data-clock-line="${a.order}"].agrees`, 5000, `line ${a.order}'s curve to meet the map's number`);
      await beat(700);
      await proposeWith('map.old', '[data-panel="map.old"] [data-propose-button="map.old"]');
    } else {
      await proposeOnBus('map.old', { yearsAgo: -Number(slider.value), matched: { [String(a.order)]: a.jname } });
    }
  });
}

export function identify(): Promise<void> {
  return finish('map.identify', async () => {
    const m = await ready();
    await step('map.identify');
    const id = m.identification();
    const answer: Record<string, string> = {};
    for (const l of id.lines) {
      if (!l.best) throw new Error(`Line ${l.line.order} has no likely pulsar.`);
      answer[String(l.line.order)] = l.best.entry.jname;
    }
    // Every line, one after another, over the whole map: choose it, click its most likely pulsar on the chart, and
    // its halo and line tag appear.
    await chartHandle()?.frame('map', { durationS: calm() ? 0.01 : FRAME_S }).catch(() => undefined);
    let allOnChart = true;
    for (const l of id.lines) {
      if (!(await assignOnChart(l.line.order, answer[String(l.line.order)]!, 'quick'))) {
        allOnChart = false;
        break;
      }
    }
    await beat(500);
    await overview();
    if (allOnChart) await proposeWith('map.identify', '[data-panel="map.identify"] [data-propose-button="map.identify"]');
    else await proposeOnBus('map.identify', answer);
  });
}

export function motion(): Promise<void> {
  return finish('map.motion', async () => {
    const m = await ready();
    await step('map.motion');
    const svg = await waitVisible<SVGSVGElement>('svg[data-sky-plot]', 30_000, 'the ages across the sky');
    // Where the ages line up best: the instrument's own grid search, coarse then fine (as the bot).
    const pts = skyAges(m);
    const c = bestAxisOnGrid(pts, 1);
    const best = bestAxisOnGrid(pts, 0.1, { lDeg: c.lDeg, bDeg: c.bDeg, spanDeg: 1.5 });
    const d = svg.dataset;
    const r = svg.getBoundingClientRect();
    const x0 = Number(d.x0);
    const y0 = Number(d.y0);
    const pw = Number(d.pw);
    const w180 = (l: number): number => ((((l + 180) % 360) + 360) % 360) - 180;
    const at = (lDeg: number, bDeg: number): [number, number] => [r.left + x0 + ((180 - w180(lDeg)) / 360) * pw, r.top + y0 + ((90 - bDeg) / 180) * (pw / 2)];
    // The axis is dragged across the sky from where it stands to where the ages line up (the cost falls as it goes).
    const s0 = document.querySelector<HTMLElement>('.map-skyages')?.dataset;
    const from = at(Number(s0?.axisL ?? 0), Number(s0?.axisB ?? 0));
    if (calm()) tap(svg, ...at(best.lDeg, best.bDeg));
    else await glide(svg, from, at(best.lDeg, best.bDeg));
    await sleep(150);
    const axisNow = (): { l: number; b: number } => {
      const s = document.querySelector<HTMLElement>('.map-skyages')?.dataset;
      return { l: Number(s?.axisL), b: Number(s?.axisB) };
    };
    // Then the plot's own keys: Shift moves 1 deg, plain 0.1 deg (left raises l, up raises b).
    for (let i = 0; i < 120; i++) {
      const n = axisNow();
      const dl = w180(best.lDeg - n.l);
      const db = best.bDeg - n.b;
      if (Math.abs(dl) < 0.05 && Math.abs(db) < 0.05) break;
      if (Math.abs(dl) >= 0.05) key(svg, dl > 0 ? 'ArrowLeft' : 'ArrowRight', { shift: Math.abs(dl) >= 0.95 });
      else key(svg, db > 0 ? 'ArrowUp' : 'ArrowDown', { shift: Math.abs(db) >= 0.95 });
      await sleep(40);
    }
    await beat(700);
    await proposeWith('map.motion', '[data-panel="map.motion"] [data-propose-button="map.motion"]');
  });
}

export function region(): Promise<void> {
  return finish('map.region', async () => {
    const m = await ready();
    await step('map.region');
    await waitFor(() => {
      const d = document.querySelector<HTMLElement>('.mapinst')?.dataset;
      return d && d.msRegion !== '' && d.mapPhase === 'ready' ? true : null;
    }, 120_000, 'the region to be measured');
    await ensureParts(m, ['region']);
    const svg = await waitVisible<SVGSVGElement>('svg[data-plane]', 30_000, 'the plane');
    const [x, y] = m.region().centerPc;
    const r = svg.getBoundingClientRect();
    const d = svg.dataset;
    const k = Number(d.pxPerPc);
    const to: [number, number] = [r.left + Number(d.x0) + x * k, r.top + Number(d.y0) - y * k];
    // The origin is slid across the plane from where it stands to the region's centre (the bearings' rms falls).
    const o = document.querySelector<HTMLElement>('.map-origin')?.dataset;
    const from: [number, number] = [r.left + Number(d.x0) + Number(o?.originX ?? 0) * k, r.top + Number(d.y0) - Number(o?.originY ?? 0) * k];
    if (calm()) tap(svg, ...to);
    else await glide(svg, from, to);
    await sleep(150);
    await beat(700);
    await proposeWith('map.region', '[data-panel="map.region"] [data-propose-button="map.region"]');
  });
}
