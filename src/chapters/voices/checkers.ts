// The Voices' four checkers (voices.many, voices.hearing, voices.octave, voices.others). Each judges the
// player's reading against the reference analysis of the real record (data/voices.json through data.ts), and a
// wrong answer reports what the analysis computes for it (PLAN.md "Principles"). The accepted ranges are derived
// in tools/voices/analyse.py and stated in docs/HOW_ITS_CHECKED.md row 16. Pure: no DOM.

import { registerChecker, type Answer, type CheckResult, type Reading } from '../../game/deductions';
import { q } from '../../ui/message';
import { ONE_VOICE_SEMITONES, OCTAVE_TOL_CENTS, SPEC, STEP_TOL_CENTS, V, WHALE, WHALE_TRACK, callTimes, combScore, greetingsAt, snrAt, trackById } from './data';

export const VOICES_NODE_IDS = ['voices.many', 'voices.hearing', 'voices.octave', 'voices.others'] as const;

function obj(answer: Answer, what: string): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error(`${what}: the answer must be an object`);
  return answer;
}
function num(o: Record<string, Answer>, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what}: ${key} must be a number`);
  return v;
}
/** A span of semitones as a frequency ratio (the alien reads ratios, not human steps). */
const ratioOf = (semitones: number): string => (2 ** (semitones / 12)).toFixed(2);

const ACC = V.greetings.accepted;
const REASON = V.greetings.reasonable;
/** The fitted mixture's means: the noise between voices and the voices, dBFS. A threshold must lie between them. */
const [NOISE_MEAN, VOICE_MEAN] = V.greetings.levelMixture.meansDb as [number, number];

/** voices.many: { threshold (dBFS), gap (s), groups }. */
export function checkMany(answer: Answer): CheckResult {
  const what = 'voices.many';
  const o = obj(answer, what);
  const th = num(o, 'threshold', what);
  const gap = num(o, 'gap', what);
  const groups = num(o, 'groups', what);
  if (!(gap > 0)) throw new Error(`${what}: gap must be positive`);
  const g = greetingsAt(th, gap);
  const between = th >= NOISE_MEAN && th <= VOICE_MEAN;
  const countOk = between && g.count >= ACC.minVoices && g.count <= ACC.maxVoices;
  const groupsOk = Number.isInteger(groups) && groups >= 2 && groups <= g.voices;
  const result: Reading[] = [
    { key: 'separate voices counted', value: g.count },
    { key: 'fewest over reasonable settings', value: ACC.minVoices },
    { key: 'most over reasonable settings', value: ACC.maxVoices },
    { key: "voices' worth of pitch", value: g.voices },
    { key: 'pause at least', value: gap, dim: 'time' },
  ];
  const range = `Over every reasonable setting (a threshold between the noise between voices and the voices themselves, a pause between ${q('time', REASON.gapS[0]!)} and ${q('time', REASON.gapS[1]!)}) the count runs from ${ACC.minVoices} to ${ACC.maxVoices}`;
  if (countOk && groupsOk) {
    return {
      ok: true,
      result,
      message:
        `${g.count} separate stretches of speech at this setting. ${range}: many voices, a few dozen at least. ` +
        'Silence alone cannot give their exact number: some greetings run into the next with hardly a pause, and some pause inside themselves, so the count depends on where the cut is set. ' +
        `Their pitches span about ${g.voices} single voices' worth (one speaker's own pitch moves within a ratio of about ${ratioOf(ONE_VOICE_SEMITONES)} to 1): high voices and low, not one speaker.`,
    };
  }
  let message: string;
  if (th > VOICE_MEAN) {
    message = `${g.count}: the threshold sits above the typical level of the voices themselves, so only their loudest moments count as sound and everything else as pause. Set it between the hiss and the voices. ${range}.`;
  } else if (th < NOISE_MEAN && g.count >= ACC.minVoices) {
    message = `${g.count}: the threshold sits below the typical level of the hiss between voices, so only its quietest moments count as pause. Set it between the hiss and the voices. ${range}.`;
  } else if (g.count < ACC.minVoices) {
    message =
      th < REASON.thresholdDb[0]!
        ? `Only ${g.count}: the threshold sits down in the hiss between the voices, so most pauses never fall below it and voices run together. ${range}.`
        : `Only ${g.count}: a pause must last ${q('time', gap)} before it counts, longer than most gaps between voices, so voices run together. ${range}.`;
  } else if (g.count > ACC.maxVoices) {
    message =
      th > REASON.thresholdDb[1]!
        ? `${g.count}: the threshold sits up among the voices themselves, so every soft syllable counts as a pause and single voices fall apart. ${range}.`
        : `${g.count}: a pause of only ${q('time', gap)} counts, so the short silences inside words split single voices apart. ${range}.`;
  } else if (groups < 2) {
    message = `The count is right (${g.count}), but not one voice: one speaker's pitch moves within a ratio of about ${ratioOf(ONE_VOICE_SEMITONES)} to 1, and these pitches span about ${g.voices} times that range. High voices and low.`;
  } else {
    message = `The count is right (${g.count}), but pitch alone shows only about ${g.voices} voices' worth of range at this setting (one speaker's own range is a ratio of about ${ratioOf(ONE_VOICE_SEMITONES)} to 1). More voices may share the same pitches; the pitch cannot tell them apart.`;
  }
  return { ok: false, result, message };
}

/** voices.hearing: { topHz }, where the greetings' long-term spectrum falls into the record's own noise. */
export function checkHearing(answer: Answer): CheckResult {
  const what = 'voices.hearing';
  const top = num(obj(answer, what), 'topHz', what);
  if (!(top > 0)) throw new Error(`${what}: topHz must be positive`);
  const [lo, hi] = SPEC.crossingBandHz as [number, number];
  const ok = top >= lo && top <= hi;
  const snr = snrAt(top);
  const result: Reading[] = [
    { key: 'marked top', value: top, dim: 'frequency' },
    { key: 'falls into the noise', value: SPEC.crossingHz, dim: 'frequency' },
    { key: 'lowest it could be', value: lo, dim: 'frequency' },
    { key: 'highest it could be', value: hi, dim: 'frequency' },
    { key: 'most of the power below', value: SPEC.greetingsEnergy95Hz, dim: 'frequency' },
  ];
  if (snr !== null) result.push({ key: 'voice over noise at the mark', value: Math.round(snr * 10) / 10 });
  if (ok) {
    return {
      ok,
      result,
      message:
        `Their voices stay above the disc's own hiss up to about ${q('frequency', SPEC.crossingHz, 3)} (between ${q('frequency', lo, 3)} and ${q('frequency', hi, 3)}, as measured), though most of their power lies below ${q('frequency', SPEC.greetingsEnergy95Hz, 2)}. ` +
        'They make sounds at least that high, and a voice is made to be heard: they hear at least that high. It is only a lower bound. The disc itself limits the band (cut at half speed, its fine groove, its own hiss), so their hearing may reach higher.',
    };
  }
  const message =
    top < lo
      ? `At this mark their voices still stand well clear of the hiss (${snr === null ? 'clear of it' : `${(10 ** (snr / 10)).toFixed(1)} times its power`}): the sound goes higher. Follow the curve up to where it meets the noise.`
      : `Here the voices add no more than the disc's own hiss: the mark is in the noise. The sound falls into it lower down, near ${q('frequency', SPEC.crossingHz, 3)}.`;
  return { ok: false, result, message };
}

const cents = (ratio: number): number => 1200 * Math.log2(ratio);

/** voices.octave: { ratio (the repeating interval, as a frequency ratio), step (one step, as a ratio) }. */
export function checkOctave(answer: Answer): CheckResult {
  const what = 'voices.octave';
  const o = obj(answer, what);
  const ratio = num(o, 'ratio', what);
  const step = num(o, 'step', what);
  if (!(ratio > 1) || !(step > 1)) throw new Error(`${what}: ratio and step must be above 1`);
  const c = cents(ratio);
  const s = cents(step);
  const k = Math.round(c / s);
  const ratioOk = Math.abs(c - 1200) <= OCTAVE_TOL_CENTS;
  const stepOk = Math.abs(s - 100) <= STEP_TOL_CENTS;
  const result: Reading[] = [
    { key: 'repeating ratio', value: Number(ratio.toFixed(4)) },
    { key: 'steps in it', value: k },
    { key: 'one step, as a ratio', value: Number(step.toFixed(5)) },
    { key: 'comb fit', value: Number(combScore(c, k).toFixed(3)) },
  ];
  const pieces = 'the repeat on the tenth piece of music (one bowed instrument, alone), the steps on the seventeenth (one keyboard)';
  if (ratioOk && stepOk) {
    return {
      ok: true,
      result,
      message:
        `Their notes repeat their pattern at a doubled frequency (${ratio.toFixed(4)} to 1), and the doubling is cut into ${k} equal steps, each a ratio of ${step.toFixed(5)}: ${pieces}. ` +
        'Notes a doubling apart do the same work in their music. This holds for these pieces; other music on the disc (the second, the 24th and the 25th pieces among them) is tuned in other ways.',
    };
  }
  let message: string;
  if (!ratioOk) {
    const near = (t: number): boolean => Math.abs(c - t) < 50;
    message = near(701.955)
      ? `About 3 to 2. Notes this far apart are common in their music too, but the pattern of notes does not repeat there. Look for the ratio where the whole pattern comes back.`
      : near(498.045)
        ? `About 4 to 3: common too, but not where the pattern comes back. Look further up the curve.`
        : `The notes' pattern does not come back at ${ratio.toFixed(3)} to 1. Find the ratio where the curve rises again, and the whole pattern repeats.`;
  } else {
    message = `The repeat is right, but ${k} equal steps do not fit the piano's notes as well: a comb of ${k} fits ${combScore(c, k).toFixed(2)}, and the best comb fits ${combScore(c, 12).toFixed(2)}. Try other numbers of teeth.`;
  }
  return { ok: false, result, message };
}

/** voices.others: { track, start, end } (s): a stretch marked on a track. Right inside the whale song. */
export function checkOthers(answer: Answer): CheckResult {
  const what = 'voices.others';
  const o = obj(answer, what);
  const track = o.track;
  if (typeof track !== 'string' || !trackById(track)) throw new Error(`${what}: unknown track ${String(track)}`);
  const start = num(o, 'start', what);
  const end = num(o, 'end', what);
  if (!(end > start)) throw new Error(`${what}: end must be after start`);
  const [s0, s1] = WHALE.segmentS as [number, number];
  const inside = track === WHALE_TRACK ? callTimes.filter((c) => c.startS >= start && c.startS < end) : [];
  const result: Reading[] = [
    { key: 'marked from', value: start, dim: 'time' },
    { key: 'marked to', value: end, dim: 'time' },
    { key: 'long high calls inside', value: inside.length },
    { key: "speakers' highest held pitch", value: V.greetings.speechCeilingHz, dim: 'frequency' },
  ];
  if (inside.length) {
    result.push({ key: 'longest call', value: Math.max(...inside.map((c) => c.endS - c.startS)), dim: 'time' });
    result.push({ key: 'highest call', value: Math.max(...inside.map((c) => c.hz)), dim: 'frequency' });
  }
  const ok = track === WHALE_TRACK && start >= s0 && end <= s1 && inside.length > 0;
  if (ok) {
    const longest = Math.max(...inside.map((c) => c.endS - c.startS));
    const glide = Math.max(...inside.map((c) => c.glide));
    return {
      ok,
      result,
      message:
        `Here the voices are not speaking. Long calls hold one sliding pitch for up to ${q('time', longest, 2)}, gliding by a ratio of as much as ${(2 ** (glide / 1200)).toFixed(2)} to 1, higher than any speaker in the greetings ever holds a note (${q('frequency', V.greetings.speechCeilingHz, 3)}). ` +
        'Another animal of their world, singing: they sent its voice beside their own.',
    };
  }
  let message: string;
  if (track !== WHALE_TRACK) message = 'Every voice on this track is one of theirs: speech or music, no call held long and high like the singing elsewhere among the greetings.';
  else if (inside.length === 0) message = `Speakers only in this stretch: nothing held long and higher than ${q('frequency', V.greetings.speechCeilingHz, 3)}. Listen on, near the end of the track.`;
  else message = 'Part of this stretch is the singing, but part is speech: mark only the stretch where the long calls are.';
  return { ok: false, result, message };
}

export function registerVoicesCheckers(): void {
  registerChecker('voices.many', (a) => checkMany(a));
  registerChecker('voices.hearing', (a) => checkHearing(a));
  registerChecker('voices.octave', (a) => checkOctave(a));
  registerChecker('voices.others', (a) => checkOthers(a));
}
