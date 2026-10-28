// "Do it for me" in The Voices, on the instrument's own tools once their Worker analyses are in. Each action shows
// its work (docs/plans/V1_polish.md rule 5): the hand is seen to move the controls before the answer lands.
//   many: the pause threshold swept to -30 dBFS and the shortest pause to 0.25 s (the values the voices bot plays,
//     tests/browser/voices.browser.mjs; inside the reasonable band of data/voices.json greetings.reasonable), so the
//     cut bars and the count move; then three voices' worth of pitch (the bot's two presses of "+" from one);
//   hearing: the mark walked up the long-spectrum chart in clicks from well inside the voices to where they meet the
//     hiss (data/voices.json spectrum.crossingHz; the chart's x mapping, PAD_L 44 and 20,000 Hz across 520 - 44 - 6
//     units, is the bot's hearX, HearingPanel.tsx);
//   others: the whale track's face and name pressed, then a slow drag on its spectrogram across the whale song
//     (data/voices.json whale.track and whale.segmentS, 3 s in from each end as the bot does: held calls and no
//     speech, so voices.others accepts it; the track's length from data/record.json) over about 1.5 s, so the held
//     calls light up inside the growing stretch; the release plays the stretch (Disc.tsx playStretch);
//   octave: a click on the fold chart at a doubling (1200 cents; OctavePanel.tsx PAD 30, 2,400 cents across
//     520 - 30 - 8 units, the bot's octX; the click snaps to the fold's peak there, about 1198.8 cents, inside
//     data/voices.json music.violin.octaveTolCents), then the comb's teeth swept to data/voices.json
//     music.piano.combK, so the comb is seen to settle over the keyboard's peaks.

import { V, WHALE_TRACK, trackById } from '../../chapters/voices/data';
import { game } from '../../game/state';
import { beat, centreOf, clickAt, drag, ensureChapter, finish, press, proposeWith, sleep, sweep, viewBoxToScreen, waitFor, waitVisible } from '../actionsKit';

const ANALYSIS_MS = 120_000;
const THRESHOLD_DB = -30;
const GAP_S = 0.25;
const GROUPS = 3;
/** Where the hearing mark starts its walk up the chart, Hz: well inside the voices (data/voices.json spectrum). */
const HEAR_FROM_HZ = 6000;
const hearX = (hz: number): number => 44 + (hz / 20_000) * (520 - 44 - 6);
const octX = (cents: number): number => 30 + (cents / 2400) * (520 - 30 - 8);
const calm = (): boolean => game.settings.value.reducedMotion;

async function ready(): Promise<void> {
  await ensureChapter('voices');
  await waitFor('[data-instrument="voices"]', 30_000, 'The Voices');
}

export function many(): Promise<void> {
  return finish('voices.many', async () => {
    await ready();
    const th = await waitVisible<HTMLInputElement>('[data-panel="voices.many"] [data-control="threshold"]', ANALYSIS_MS, 'the greetings to be measured');
    await sweep(th, THRESHOLD_DB, 1200);
    const gap = await waitVisible<HTMLInputElement>('[data-panel="voices.many"] [data-control="gap"]', 10_000, 'the pause slider');
    await sweep(gap, GAP_S, 900);
    await beat(300);
    for (let i = 0; i < 12; i++) {
      const n = Number(document.querySelector('[data-groups-value]')?.getAttribute('data-groups-value') ?? NaN);
      if (n === GROUPS) break;
      await press(`[data-groups="${n < GROUPS ? 'plus' : 'minus'}"]`, 10_000, 'the voices\' worth buttons');
      await (calm() ? sleep(120) : sleep(350));
    }
    await beat(400);
    await proposeWith('voices.many', '[data-panel="voices.many"] [data-propose-button="voices.many"]');
  });
}

export function hearing(): Promise<void> {
  return finish('voices.hearing', async () => {
    await ready();
    const svg = await waitVisible<SVGSVGElement>('svg[data-hearing-chart]', ANALYSIS_MS, 'the long spectrum');
    const top = V.spectrum.crossingHz;
    const steps = calm() ? 1 : 8;
    for (let i = 1; i <= steps; i++) {
      const hz = HEAR_FROM_HZ + ((top - HEAR_FROM_HZ) * i) / steps;
      const [x, y] = viewBoxToScreen(svg, hearX(hz), 60);
      clickAt(svg, x, y);
      if (i < steps) await sleep(150);
    }
    await waitFor('[data-hearing-chart] [data-mark-hz]', 5000, 'the mark on the chart');
    await beat(500);
    await proposeWith('voices.hearing', '[data-panel="voices.hearing"] [data-propose-button="voices.hearing"]');
  });
}

export function others(): Promise<void> {
  return finish('voices.others', async () => {
    await ready();
    const t = trackById(WHALE_TRACK);
    if (!t) throw new Error(`data/record.json has no ${WHALE_TRACK}`);
    await press(`[data-tracks] [data-face="${t.side}"]`, 30_000, 'the face the whale track is on');
    await press(`button.vo-name[data-view="${WHALE_TRACK}"]`, 30_000, 'the whale track');
    await waitFor(`[data-spectrogram="${WHALE_TRACK}"][data-ready="true"]`, ANALYSIS_MS, 'the spectrogram');
    const box = await waitVisible<HTMLElement>(`[data-spectrogram="${WHALE_TRACK}"] .vo-specbox`, 10_000, 'the spectrogram');
    await beat(300);
    const [s0, s1] = V.whale.segmentS as [number, number];
    const r = box.getBoundingClientRect();
    const y = centreOf(box)[1];
    const at = (s: number): number => r.left + (s / t.durationS) * r.width;
    // About 1.5 s of drag (90 moves, 16 ms apart), so the stretch is seen to grow over the calls.
    await drag(box, [at(s0 + 3), y], [at(s1 - 3), y], calm() ? 6 : 90);
    await waitFor(`[data-marked^="${WHALE_TRACK}:"]`, 5000, 'the stretch to be marked');
    await beat(1500);
    await proposeWith('voices.others', '[data-panel="voices.others"] [data-propose-button="voices.others"]');
  });
}

export function octave(): Promise<void> {
  return finish('voices.octave', async () => {
    await ready();
    const svg = await waitVisible<SVGSVGElement>('svg[data-octave-chart]', ANALYSIS_MS, 'the repetition curve');
    const [x, y] = viewBoxToScreen(svg, octX(1200), 60);
    clickAt(svg, x, y);
    await beat(500);
    const teeth = await waitVisible<HTMLInputElement>('[data-control="teeth"]', ANALYSIS_MS, 'the comb');
    await sweep(teeth, V.music.piano.combK, 1500, 30);
    await beat(500);
    await proposeWith('voices.octave', '[data-panel="voices.octave"] [data-propose-button="voices.octave"]');
  });
}
