// "Do it for me" in The Map. The answers come from the playthrough's own epoch model (epochModel(game.seed),
// src/chapters/shared/epochModel.ts) through the instrument's own helpers (mapMath.ts), as the map bot reads them
// (tests/browser/map.browser.mjs, playMap) and the trail bot's confirmMapThroughBus.
//
// What is worked on the real controls: the dial (its own arrow and Page keys, until the long line points at the
// Galactic centre), the line buttons, the step chips, the spin-down clock's slider, the axis on the sky (a press
// on the sky plot, then the plot's own arrow keys) and the origin on the plane (a press on the plane), each step
// then proposed with its own Propose button.
//
// What falls back to the bus: putting a pulsar on a line is a click on the WebGL galaxy chart, and the chart's
// projection is not reachable in-page on the live site (window.__mapChart is installed only with the harness).
// So map.periods and map.identify are proposed with deduction.propose (the answer the Propose button would send
// once the lines carry those pulsars), after the line is chosen on the instrument; map.old likewise, after the
// clock's slider is set on the instrument (its answer carries the matched line, as the button's would).

import { dispatch } from '../../game/bus';
import { game } from '../../game/state';
import { ensureParts, epochModel, type EpochModel } from '../../chapters/shared/epochModel';
import { bestAxisOnGrid, clockCrossingYearsAgo, isPass1Anchor, isYoung, skyAges } from '../../chapters/map/mapMath';
import { click, ensureChapter, finish, key, press, proposeAndConfirm, proposeWith, setValue, sleep, tap, waitFor, waitVisible } from '../actionsKit';

/** The clock's slider moves in 50-year steps (SpinClock.tsx, step 50). */
const CLOCK_STEP_YEARS = 50;

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

export function periods(): Promise<void> {
  return finish('map.periods', async () => {
    const m = await ready();
    await alignDial();
    const a = firstAnchor(m);
    await press(`button.map-lb[data-line-button="${a.order}"]`, 10_000, `line ${a.order}`);
    await proposeAndConfirm('map.periods', () => dispatch({ type: 'deduction.propose', id: 'map.periods', answer: { line: a.order, jname: a.jname } }).catch(() => undefined));
  });
}

export function old(): Promise<void> {
  return finish('map.old', async () => {
    const m = await ready();
    await step('map.old');
    // The line map.periods accepted (its answer), else the first anchor.
    const rec = game.records.value['map.periods'];
    const ok = rec ? [...rec.attempts].reverse().find((x) => x.ok)?.answer : null;
    const a = ok && typeof ok === 'object' && !Array.isArray(ok) && typeof ok.line === 'number' && typeof ok.jname === 'string' ? { order: ok.line, jname: ok.jname } : firstAnchor(m);
    const e = m.byJ.get(a.jname);
    const line = m.lines.find((x) => x.order === a.order);
    if (!e || !line) throw new Error('The matched line is missing from the model.');
    const cross = clockCrossingYearsAgo(e, line, 3);
    if (cross === null) throw new Error(`Line ${a.order}'s clock never crosses the map's number.`);
    const slider = await waitVisible<HTMLInputElement>('input[data-clock]', 10_000, 'the spin-down clock');
    setValue(slider, -Math.round(cross / CLOCK_STEP_YEARS) * CLOCK_STEP_YEARS, 'input');
    await sleep(200);
    const yearsAgo = -Number(slider.value);
    await proposeAndConfirm('map.old', () => dispatch({ type: 'deduction.propose', id: 'map.old', answer: { yearsAgo, matched: { [String(a.order)]: a.jname } } }).catch(() => undefined));
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
    // Walk the lines on the instrument as the player would, one after another.
    for (const l of id.lines) {
      const b = document.querySelector(`button.map-lb[data-line-button="${l.line.order}"]`);
      if (b) {
        click(b);
        await sleep(120);
      }
    }
    await proposeAndConfirm('map.identify', () => dispatch({ type: 'deduction.propose', id: 'map.identify', answer }).catch(() => undefined));
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
    tap(svg, r.left + x0 + ((180 - w180(best.lDeg)) / 360) * pw, r.top + y0 + ((90 - best.bDeg) / 180) * (pw / 2));
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
    tap(svg, r.left + Number(d.x0) + x * k, r.top + Number(d.y0) - y * k);
    await sleep(150);
    await proposeWith('map.region', '[data-panel="map.region"] [data-propose-button="map.region"]');
  });
}
