// "Do it for me" in The Pictures, on the decoder's own knobs and the work views' own controls; every proposal is
// the instrument's Propose button. The settings and answers come from the data the checkers use:
//   line time: the cover's picture line (data/cover.json picture.lineTime through the key: COVER_LINE_S,
//     measure.ts; 8.3396 ms), typed into the knob's box in beats;
//   rows: the calibration circle's rows (DECODER_DATA.geometry.nRows, src/dsp/params.ts; 355, README section 7);
//   first frames: FIRST_FRAMES and FRAMES_TO_WATCH (checkers.ts), developed at record speed;
//   album: every frame of the side (ALBUM_FRAMES, checkersM5.ts);
//   colour: L013 to L015, the Earth (the frame the album bot uses, tests/browser/album.browser.mjs; its three
//     frames line up by measurement, not only by the record's list);
//   down: L039 turned by BARRY_TO_CW of its orientation (data/frames.json);
//   numerals: digitTable(TEACHING) (src/science/teaching.ts on data/teaching.json L002);
//   units: their line about the second (data/teaching.json L003 "second" definition, 1 42/100 x 10^9);
//   home and slip: HOME and SLIP (checkersM5.ts from data/teaching.json table);
//   height: the taller figure's number (data/teaching.json L039 heights, 160 cm).

import { decoder as D } from '../../game/state';
import { DECODER_DATA } from '../../dsp/params';
import { digitTable } from '../../science/teaching';
import { BEAT_S } from '../../ui/units';
import { FIRST_FRAMES, FRAMES_TO_WATCH } from '../../chapters/pictures/checkers';
import { ALBUM_FRAMES, BARRY_TO_CW, HEIGHTS, HOME, SLIP, TEACHING, frameRow } from '../../chapters/pictures/checkersM5';
import { COVER_LINE_S } from '../../chapters/pictures/measure';
import { watched } from '../../chapters/pictures/seen';
import { album } from '../../chapters/pictures/album';
import { quarterTurns, turnFrame } from '../../chapters/pictures/workState';
import { click, ensureChapter, finish, key, press, proposeWith, setValue, sleep, waitEnabled, waitFor } from '../actionsKit';

const LINE_MS = COVER_LINE_S * 1000;
const ROWS = DECODER_DATA.geometry.nRows;
const COLOUR_FIRST = 'L013';
const TURN_FRAME = 'L039';

async function ready(): Promise<void> {
  await ensureChapter('pictures');
  await waitFor('.picinst[data-pictures-ready="true"]', 90_000, 'the picture decoder');
}

const idle = (): boolean => D.status.value === 'done' || D.status.value === 'idle' || D.status.value === 'error';

/** Wait for the decoder to finish the decode a knob started. */
async function settled(timeoutMs = 60_000): Promise<void> {
  await sleep(60);
  await waitFor(() => (idle() ? true : null), timeoutMs, 'the decoder to finish');
}

/** Show the decoder (the knobs' own picture), not a work view. */
async function decoderView(): Promise<void> {
  const tab = document.querySelector('button.pic-tab[data-view="decoder"]');
  if (tab && tab.getAttribute('aria-pressed') !== 'true') click(tab);
  await sleep(50);
}

/** A two-way knob: press its "on" side (the second button) unless it is on already. */
async function toggleOn(knob: string, isOn: () => boolean): Promise<void> {
  if (isOn()) return;
  await press(`[data-knob="${knob}"] .pic-seg button:nth-child(2)`, 10_000, `the ${knob} knob`);
  await waitFor(() => (isOn() ? true : null), 10_000, `the ${knob} knob to turn`);
  await settled();
}

async function setLineTime(): Promise<void> {
  if (Math.abs(D.bench.value.lineTimeMs - LINE_MS) < 1e-6) return;
  const box = await waitEnabled<HTMLInputElement>('[data-knob="lineTime"] input.pic-num', 10_000, 'the line time box');
  setValue(box, (LINE_MS / 1000 / BEAT_S).toPrecision(10), 'input');
  await sleep(80); // the box keeps its text in the component's state: let it take it before Enter
  key(box, 'Enter');
  await waitFor(() => (Math.abs(D.bench.value.lineTimeMs - LINE_MS) < 1e-6 ? true : null), 10_000, 'the line time to be set');
  await settled();
}

async function setRows(): Promise<void> {
  if (D.bench.value.rows === ROWS) return;
  const range = await waitEnabled<HTMLInputElement>('#pic-rows', 10_000, 'the rows slider');
  setValue(range, ROWS, 'change');
  await waitFor(() => (D.bench.value.rows === ROWS ? true : null), 10_000, 'the rows to be set');
  await settled();
}

function knobStep(node: string, set: () => Promise<void>): () => Promise<void> {
  return () =>
    finish(node, async () => {
      await ready();
      await decoderView();
      await settled();
      await set();
      await proposeWith(node);
    });
}

const syncOn = (): Promise<void> => toggleOn('syncLock', () => D.bench.value.syncLock);
const interlaceOn = (): Promise<void> => toggleOn('interlace', () => D.bench.value.interlace);
const darker = (): Promise<void> => toggleOn('polarity', () => D.bench.value.polarity === 'negative');

export const lineTime = knobStep('pictures.lineTime', setLineTime);
export const sync = knobStep('pictures.sync', async () => {
  await setLineTime();
  await syncOn();
});
export const interlace = knobStep('pictures.interlace', interlaceOn);
export const polarity = knobStep('pictures.polarity', darker);
export const aspect = knobStep('pictures.aspect', setRows);
export const circle = knobStep('pictures.circle', async () => {
  await setLineTime();
  await syncOn();
  await interlaceOn();
  await darker();
  await setRows();
});

export function firstFrames(): Promise<void> {
  return finish('pictures.firstFrames', async () => {
    await ready();
    await decoderView();
    await settled();
    // Develop the pictures that follow the circle, one at a time, at record speed (the player watches them).
    for (const f of FIRST_FRAMES) {
      if (watched.value.length >= FRAMES_TO_WATCH) break;
      if (watched.value.includes(f)) continue;
      await press(`[data-develop="${f}"]`, 60_000, `the button for frame ${f}`);
      await waitFor(() => (watched.value.includes(f) ? true : null), 120_000, `frame ${f} to develop`);
    }
    await settled();
    await proposeWith('pictures.firstFrames');
  });
}

/** Open a work view by its tab. */
async function openView(v: string): Promise<void> {
  await press(`button.pic-tab[data-view="${v}"]`, 20_000, `the ${v} tab`);
  await waitFor(`[data-work="${v}"]`, 10_000, `the ${v} view`);
}

export function albumAll(): Promise<void> {
  return finish('pictures.album', async () => {
    await ready();
    await openView('album');
    const all = (): boolean => ALBUM_FRAMES.every((f) => album.value[f]);
    if (!all()) {
      if (!document.querySelector('[data-album-stop]')) await press('[data-album-develop]', 60_000, 'Develop the rest at once');
      await waitFor(() => (all() ? true : null), 300_000, `all ${ALBUM_FRAMES.length} frames to develop`);
    }
    await settled();
    await proposeWith('pictures.album', '[data-work="album"] [data-propose-button="pictures.album"]');
  });
}

/** Click a frame in the album grid of the open work view. */
async function pickFrame(view: string, frame: string): Promise<void> {
  await press(`[data-work="${view}"] [data-album-frame="${frame}"] button`, 30_000, `frame ${frame} in the album`);
}

export function colour(): Promise<void> {
  return finish('pictures.colour', async () => {
    await ready();
    await openView('colour');
    if (!document.querySelector(`[data-work="colour"] [data-composite^="${COLOUR_FIRST},"]`)) await pickFrame('colour', COLOUR_FIRST);
    await waitFor(`[data-work="colour"] [data-composite^="${COLOUR_FIRST},"]`, 30_000, 'the three frames on the mixer');
    await proposeWith('pictures.colour', '[data-work="colour"] [data-propose-button="pictures.colour"]');
  });
}

export function down(): Promise<void> {
  return finish('pictures.down', async () => {
    await ready();
    await openView('turn');
    if (turnFrame.value !== TURN_FRAME) await pickFrame('turn', TURN_FRAME);
    await waitFor(() => (turnFrame.value === TURN_FRAME ? true : null), 10_000, `frame ${TURN_FRAME} on the turntable`);
    const want = BARRY_TO_CW[frameRow(TURN_FRAME).orientationBarry] ?? 0;
    for (let i = 0; i < 4 && quarterTurns.value !== want; i++) {
      await press('[data-work="turn"] [data-turn="1"]', 10_000, 'Turn clockwise');
      await sleep(250);
    }
    await proposeWith('pictures.down', '[data-work="turn"] [data-propose-button="pictures.down"]');
  });
}

export function numerals(): Promise<void> {
  return finish('pictures.numerals', async () => {
    await ready();
    await openView('numerals');
    const truth = digitTable(TEACHING);
    for (const d of TEACHING.L002.digits) {
      const v = truth.get(d.glyph);
      if (v === undefined) throw new Error(`no numeral for mark ${d.glyph}`);
      const btn = await waitEnabled(`[data-numeral-pick="${d.glyph}:${v}"]`, 10_000, `the numeral ${v}`);
      if (!btn.classList.contains('on')) click(btn);
      await sleep(120);
    }
    await proposeWith('pictures.numerals', '[data-work="numerals"] [data-propose-button="pictures.numerals"]');
  });
}

export function units(): Promise<void> {
  return finish('pictures.units', async () => {
    await ready();
    await openView('units');
    const def = TEACHING.L003.lines.find((l) => l.id === 'second')?.definition;
    if (!def) throw new Error('data/teaching.json has no second');
    for (const k of ['whole', 'num', 'den', 'power'] as const) {
      const input = await waitEnabled<HTMLInputElement>(`[data-work="units"] [data-reading="${k}"]`, 10_000, `the ${k} box`);
      setValue(input, def[k], 'input');
      await sleep(60);
    }
    await proposeWith('pictures.units', '[data-work="units"] [data-propose-button="pictures.units"]');
  });
}

export function home(): Promise<void> {
  return finish('pictures.home', async () => {
    await ready();
    await openView('planets');
    await press(`[data-work="planets"] button.pic-tcircle[data-column="${HOME}"]`, 10_000, 'the home circle');
    await proposeWith('pictures.home', '[data-work="planets"] [data-propose-button="pictures.home"]');
  });
}

export function slip(): Promise<void> {
  return finish('pictures.slip', async () => {
    if (!SLIP) throw new Error('The table has no slip.');
    await ready();
    await openView('planets');
    await press(`[data-work="planets"] button.pic-tcell[data-cell="${SLIP.column}:${SLIP.row}"]`, 10_000, 'the cell that breaks the order');
    await proposeWith('pictures.slip', '[data-work="planets"] [data-propose-button="pictures.slip"]');
  });
}

export function height(): Promise<void> {
  return finish('pictures.height', async () => {
    await ready();
    await openView('height');
    const tallest = Math.max(...HEIGHTS.map((h) => Number(h.cm)));
    const input = await waitEnabled<HTMLInputElement>('[data-work="height"] [data-reading="cm"]', 10_000, 'the centimetre box');
    setValue(input, tallest, 'input');
    await sleep(60);
    await proposeWith('pictures.height', '[data-work="height"] [data-propose-button="pictures.height"]');
  });
}
