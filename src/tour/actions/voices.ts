// "Do it for me" in The Voices, on the instrument's own tools once their Worker analyses are in:
//   many: the pause threshold -30 dBFS and the shortest pause 0.25 s (the values the voices bot plays,
//     tests/browser/voices.browser.mjs; inside the reasonable band of data/voices.json greetings.reasonable),
//     and three voices' worth of pitch (the bot's two presses of "+" from one);
//   hearing: a click on the long-spectrum chart where the voices meet the hiss (data/voices.json
//     spectrum.crossingHz; the chart's x mapping, PAD_L 44 and 20,000 Hz across 520 - 44 - 6 units, is the
//     bot's hearX, HearingPanel.tsx);
//   others: a drag on the whale track's spectrogram across the whale song (data/voices.json whale.track and
//     whale.segmentS, 3 s in from each end as the bot does; the track's length from data/record.json);
//   octave: a click on the repetition curve at a doubling (1200 cents; OctavePanel.tsx PAD 30, 2,400 cents
//     across 520 - 30 - 8 units, the bot's octX), then the comb's teeth at data/voices.json music.piano.combK.

import { V, WHALE_TRACK, trackById } from '../../chapters/voices/data';
import { centreOf, clickAt, drag, ensureChapter, finish, press, proposeWith, setValue, sleep, viewBoxToScreen, waitEnabled, waitFor, waitVisible } from '../actionsKit';

const ANALYSIS_MS = 120_000;
const THRESHOLD_DB = -30;
const GAP_S = 0.25;
const GROUPS = 3;
const hearX = (hz: number): number => 44 + (hz / 20_000) * (520 - 44 - 6);
const octX = (cents: number): number => 30 + (cents / 2400) * (520 - 30 - 8);

async function ready(): Promise<void> {
  await ensureChapter('voices');
  await waitFor('[data-instrument="voices"]', 30_000, 'The Voices');
}

export function many(): Promise<void> {
  return finish('voices.many', async () => {
    await ready();
    const th = await waitVisible<HTMLInputElement>('[data-panel="voices.many"] [data-control="threshold"]', ANALYSIS_MS, 'the greetings to be measured');
    setValue(th, THRESHOLD_DB, 'input');
    const gap = await waitVisible<HTMLInputElement>('[data-panel="voices.many"] [data-control="gap"]', 10_000, 'the pause slider');
    setValue(gap, GAP_S, 'input');
    for (let i = 0; i < 12; i++) {
      const n = Number(document.querySelector('[data-groups-value]')?.getAttribute('data-groups-value') ?? NaN);
      if (n === GROUPS) break;
      await press(`[data-groups="${n < GROUPS ? 'plus' : 'minus'}"]`, 10_000, 'the voices\' worth buttons');
      await sleep(120);
    }
    await sleep(150);
    await proposeWith('voices.many', '[data-panel="voices.many"] [data-propose-button="voices.many"]');
  });
}

export function hearing(): Promise<void> {
  return finish('voices.hearing', async () => {
    await ready();
    const svg = await waitVisible<SVGSVGElement>('svg[data-hearing-chart]', ANALYSIS_MS, 'the long spectrum');
    const [x, y] = viewBoxToScreen(svg, hearX(V.spectrum.crossingHz), 60);
    clickAt(svg, x, y);
    await waitFor('[data-hearing-chart] [data-mark-hz]', 5000, 'the mark on the chart');
    await proposeWith('voices.hearing', '[data-panel="voices.hearing"] [data-propose-button="voices.hearing"]');
  });
}

export function others(): Promise<void> {
  return finish('voices.others', async () => {
    await ready();
    await press(`button.vo-name[data-view="${WHALE_TRACK}"]`, 30_000, 'the whale track');
    await waitFor(`[data-spectrogram="${WHALE_TRACK}"][data-ready="true"]`, ANALYSIS_MS, 'the spectrogram');
    const box = await waitVisible<HTMLElement>(`[data-spectrogram="${WHALE_TRACK}"] .vo-specbox`, 10_000, 'the spectrogram');
    const dur = trackById(WHALE_TRACK)?.durationS;
    if (!dur) throw new Error(`data/record.json has no ${WHALE_TRACK}`);
    const [s0, s1] = V.whale.segmentS as [number, number];
    const r = box.getBoundingClientRect();
    const y = centreOf(box)[1];
    const at = (s: number): number => r.left + (s / dur) * r.width;
    await drag(box, [at(s0 + 3), y], [at(s1 - 3), y]);
    await waitFor(`[data-marked^="${WHALE_TRACK}:"]`, 5000, 'the stretch to be marked');
    await proposeWith('voices.others', '[data-panel="voices.others"] [data-propose-button="voices.others"]');
  });
}

export function octave(): Promise<void> {
  return finish('voices.octave', async () => {
    await ready();
    const svg = await waitVisible<SVGSVGElement>('svg[data-octave-chart]', ANALYSIS_MS, 'the repetition curve');
    const [x, y] = viewBoxToScreen(svg, octX(1200), 60);
    clickAt(svg, x, y);
    const teeth = await waitVisible<HTMLInputElement>('[data-control="teeth"]', ANALYSIS_MS, 'the comb');
    setValue(teeth, V.music.piano.combK, 'input');
    await sleep(150);
    await proposeWith('voices.octave', '[data-panel="voices.octave"] [data-propose-button="voices.octave"]');
  });
}
