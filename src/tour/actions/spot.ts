// "Do it for me" in The Spot, on the plate and the instrument's own controls:
//   find: the probe moved over the spot and the point marked there (data/spot.json centreMm, the hidden spot
//     the checker measures against), then "Something is here";
//   age: "+10^5" beats of counting (as the spot bot does, tests/browser/spot.browser.mjs: about a day, enough for
//     a narrow interval), then the age slider at the age the instrument's own counts give (the same seeded
//     session the checker reads, spotModel(seed), through the clock the checker uses, ageFromU234 in
//     src/science/clocks.ts), rounded to the slider's 50-year step;
//   purity: the start dial at zero, a pure start (the right answer of clocks.md section 4: the counts accept a
//     start near zero and reject natural uranium's 1).

import { game } from '../../game/state';
import { BEAT_S } from '../../ui/units';
import { ageFromU234 } from '../../science/clocks';
import { SPOT, spotModel } from '../../chapters/spot/data';
import { ensureChapter, finish, pointer, press, proposeWith, setValue, sleep, waitEnabled, waitFor } from '../actionsKit';

const COUNT_BEATS = 100_000;

async function ready(): Promise<void> {
  await ensureChapter('spot');
  await waitFor('[data-instrument="spot"] .coverviewer svg.strokes', 30_000, 'the plate');
  await sleep(300);
}

/** Cover millimetres to the screen, through the stroke layer's own transform (as the plate draws them). */
function mmToScreen(x: number, y: number): [number, number] {
  const svg = document.querySelector<SVGSVGElement>('.spotinst .coverviewer svg.strokes');
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) throw new Error('The plate is not drawn yet.');
  const p = new DOMPoint(x, y).matrixTransform(ctm);
  return [p.x, p.y];
}

export function find(): Promise<void> {
  return finish('spot.find', async () => {
    await ready();
    const svg = document.querySelector('.spotinst .coverviewer svg.strokes');
    if (!svg) throw new Error('The plate is not drawn yet.');
    const [cx, cy] = SPOT.centreMm as [number, number];
    // Sweep the probe up the plate to the spot, then press and release there (a click marks the point).
    for (const yMm of [200, 140, 90, 60]) {
      const [x, y] = mmToScreen(cx, yMm);
      pointer(svg, 'pointermove', x, y, false);
      await sleep(250);
    }
    const [x, y] = mmToScreen(cx, cy);
    pointer(svg, 'pointermove', x, y, false);
    await sleep(1200); // the counts rise under the probe
    pointer(svg, 'pointerdown', x, y, true);
    pointer(svg, 'pointerup', x, y, false);
    await proposeWith('spot.find', '[data-propose="spot.find"]');
  });
}

export function age(): Promise<void> {
  return finish('spot.age', async () => {
    await ready();
    const counted = (): number => Number(document.querySelector('[data-counted-s]')?.getAttribute('data-counted-s') || 'NaN');
    // Count until about a day of counting has run (one press of "+10^5"; more only if it has not).
    const enough = COUNT_BEATS * BEAT_S * 0.9;
    if (!(counted() >= enough)) {
      const before = Number.isFinite(counted()) ? counted() : 0;
      await press(`[data-count-beats="${COUNT_BEATS}"]`, 20_000, 'the "+10^5" counting button');
      await waitFor(() => (counted() > before ? true : null), 60_000, 'the counting to finish');
    }
    const t = counted();
    const counts = spotModel(game.seed.value).session.countsAt(t);
    const years = Math.round(ageFromU234(counts).ageYears / 50) * 50;
    const slider = await waitEnabled<HTMLInputElement>('input[data-age-input]', 10_000, 'the age slider');
    setValue(slider, years, 'input');
    await sleep(150);
    await proposeWith('spot.age', '[data-propose="spot.age"]');
  });
}

export function purity(): Promise<void> {
  return finish('spot.purity', async () => {
    await ready();
    const dial = await waitEnabled<HTMLInputElement>('input[data-start-input]', 20_000, 'the start dial');
    setValue(dial, 0, 'input');
    await waitFor('.sp-meter[data-agree="1"]', 10_000, 'the meter to agree');
    await proposeWith('spot.purity', '[data-propose="spot.purity"]');
  });
}
