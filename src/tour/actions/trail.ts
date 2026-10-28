// "Do it for me" in The Trail, on the instrument's own controls. The answers come from the playthrough's model
// (the instrument's own, src/chapters/trail/state.ts model, built from epochModel(game.seed)) through the
// instrument's physics (physics.ts), as the trail bot reads them (tests/browser/trail.browser.mjs, playTrail):
//   origin: the star the trail fits best (originRow; the warm-white star, id 0), clicked on the chart;
//   age: the run-back to that star's meeting (meeting(m, star).yearsAgo, to the input's 10-year step);
//   neighbour: the ruler from the alien's own star (homeId) to that star;
//   where: that star picked on the region view;
//   when: that star's frame, then the cursor at its combined age (ages('sun').combined.estimate, 10-year step).
// A star on the chart is clicked where the chart's own handle (chartHandle(), exported by ChartPane.tsx) projects
// it, after framing the camera on it (a view move, as a drag would be).
//
// V1 polish (2026-10-28, "Do it for me" shows its work): the chart eases onto each star before it is clicked, the
// run-back slider sweeps until the machine meets the star, the frame is chosen and the ages are seen to snap
// together before the mark is dragged onto them, each followed by a short beat on the result. All of it is skipped
// with reduced motion (sweep, beat and the camera's own ease cap honour the setting).

import { chartHandle } from '../../chapters/trail/ChartPane';
import { meeting, homeId, originRow } from '../../chapters/trail/physics';
import { cursorYears, model, picked, regionPick, rulerEnds, runYears } from '../../chapters/trail/state';
import type { EpochModel } from '../../chapters/shared/epochModel';
import { game } from '../../game/state';
import { beat, centreOf, click, drag, ensureChapter, finish, proposeWith, setValue, sleep, sweep, tap, waitFor, waitVisible } from '../actionsKit';

/** True when the player asked for reduced motion: the hand then works without the visible in-between steps. */
const calm = (): boolean => game.settings.value.reducedMotion;
/** How long the chart eases onto a star before it is clicked, s (a display choice). */
const FRAME_S = 0.7;

async function ready(): Promise<EpochModel> {
  await ensureChapter('trail');
  await waitFor('.trinst[data-trail-ready="true"] .tr-chart[data-chart-ready="true"]', 90_000, 'the neighbourhood chart');
  const m = model.value;
  if (!m) throw new Error('The Trail\'s model is not ready.');
  return m;
}

async function tab(t: string): Promise<void> {
  const b = await waitFor(() => document.querySelector<HTMLButtonElement>(`button.tr-tab[data-tool-tab="${t}"]`), 20_000, `the ${t} tab`);
  if (b.getAttribute('aria-pressed') !== 'true') click(b);
  await waitFor(`[data-tool-panel="${t}"]`, 10_000, `the ${t} tool`);
}

/** Click a star on the chart where the chart draws it. */
async function clickStar(id: number): Promise<void> {
  const h = chartHandle();
  const canvas = document.querySelector('.tr-canvas');
  if (!h || !canvas) throw new Error('The chart is not ready.');
  await h.frame({ starId: id }, { durationS: calm() ? 0.01 : FRAME_S });
  await sleep(120);
  const p = h.project(id);
  if (!p || !p.onScreen) throw new Error(`Star ${id} is not on the chart's screen.`);
  const r = canvas.getBoundingClientRect();
  tap(canvas, r.left + p.x, r.top + p.y);
  await sleep(120);
  await beat(350);
}

export function origin(): Promise<void> {
  return finish('trail.origin', async () => {
    const m = await ready();
    await tab('trail');
    const star = originRow(m).star.id;
    if (picked.value !== star) await clickStar(star);
    await waitFor(() => (picked.value === star ? true : null), 5000, 'the star to be picked');
    await beat(600);
    await proposeWith('trail.origin', '[data-tool-panel="trail"] [data-propose-button="trail.origin"]');
  });
}

export function age(): Promise<void> {
  return finish('trail.age', async () => {
    const m = await ready();
    const star = originRow(m).star;
    if (picked.value !== star.id) {
      await tab('trail');
      await clickStar(star.id);
    }
    await tab('runback');
    const years = Math.round(meeting(m, star).yearsAgo / 10) * 10;
    // The run-back slider sweeps back until the machine meets the star (its glyph runs back along the track).
    const slider = await waitVisible<HTMLInputElement>('[data-tool-panel="runback"] input[data-run-slider]', 10_000, 'the run-back slider');
    await sweep(slider, years, 1800, 36);
    await waitFor(() => (runYears.value === years ? true : null), 5000, 'the run-back to be set');
    await beat(700);
    await proposeWith('trail.age', '[data-tool-panel="runback"] [data-propose-button="trail.age"]');
  });
}

export function neighbour(): Promise<void> {
  return finish('trail.neighbour', async () => {
    const m = await ready();
    await tab('ruler');
    const home = homeId(m);
    const star = originRow(m).star.id;
    const ends = rulerEnds.value;
    if (!(ends.length === 2 && ends.includes(home) && ends.includes(star))) {
      if (ends.length) {
        const clear = [...document.querySelectorAll<HTMLButtonElement>('[data-tool-panel="ruler"] button')].find((b) => b.textContent?.trim() === 'Clear the ruler');
        if (clear) click(clear);
        await waitFor(() => (rulerEnds.value.length === 0 ? true : null), 5000, 'the ruler to clear');
      }
      await clickStar(home);
      await clickStar(star);
    }
    await waitFor('[data-tool-panel="ruler"] [data-ruler]:not([data-ruler=""])', 5000, 'the ruler to measure');
    await beat(600);
    await proposeWith('trail.neighbour', '[data-tool-panel="ruler"] [data-propose-button="trail.neighbour"]');
  });
}

export function where(): Promise<void> {
  return finish('trail.where', async () => {
    const m = await ready();
    await tab('region');
    const star = originRow(m).star.id;
    const svg = await waitVisible<SVGSVGElement>('.trinst[data-view="region"] svg.tr-region', 90_000, 'the region view');
    if (regionPick.value !== star) {
      const dot = await waitFor(() => svg.querySelector(`[data-region-star="${star}"]`), 10_000, 'the star in the region');
      const [x, y] = centreOf(dot);
      svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
    }
    await waitFor(() => (regionPick.value === star ? true : null), 5000, 'the star to be picked');
    await beat(700);
    await proposeWith('trail.where', '[data-tool-panel="region"] [data-propose-button="trail.where"]');
  });
}

export function when(): Promise<void> {
  return finish('trail.when', async () => {
    const m = await ready();
    await tab('reframe');
    const star = originRow(m).star.id;
    await waitVisible('.trinst[data-view="reframe"] svg.tr-reframe', 90_000, 'the reframe');
    const select = await waitVisible<HTMLSelectElement>('[data-tool-panel="reframe"] select[data-frame-select]', 10_000, 'the frame list');
    if (document.querySelector('svg.tr-reframe')?.getAttribute('data-frame') !== String(star)) {
      setValue(select, String(star), 'change');
      await waitFor(`svg.tr-reframe[data-frame="${star}"]`, 60_000, 'the ages to be read in that star\'s frame');
      // A beat to see the old lines' ages snap together in that star's frame.
      await beat(900);
    }
    const est = Math.round(m.ages('sun').combined.estimate / 10) * 10;
    const svg = document.querySelector<SVGSVGElement>('svg.tr-reframe');
    if (!svg) throw new Error('The reframe is not drawn.');
    // The cursor goes where the ages are clicked (ReframeView.tsx: LEFT and RIGHT margins, a0 to a1 across).
    const d = svg.dataset;
    const a0 = Number(d.a0);
    const a1 = Number(d.a1);
    const left = Number(d.left);
    const right = Number(d.right);
    const vb = svg.viewBox.baseVal;
    const vx = left + ((est - a0) / (a1 - a0)) * (vb.width - left - right);
    const r = svg.getBoundingClientRect();
    const to: [number, number] = [r.left + (vx / vb.width) * r.width, r.top + r.height / 2];
    // The mark is dragged along the age axis from its left end onto where the ages bunch.
    if (calm()) tap(svg, ...to);
    else await drag(svg, [r.left + ((left + 2) / vb.width) * r.width, to[1]], to, 45);
    await waitFor(() => (cursorYears.value !== null ? true : null), 5000, "the mark on the ages");
    await beat(700);
    await proposeWith('trail.when', '[data-tool-panel="reframe"] [data-propose-button="trail.when"]');
  });
}

