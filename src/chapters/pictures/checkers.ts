// The Pictures' seven checkers. Each decodes real slices of the 1977 tape with the player's settings and
// measures the decoded picture (rule 3): the slant of a free-running decode, the wobble a sync lock
// removes, the even/odd comb, the shade of the slide mounts, the roundness of the calibration circle.
// Pure: the slices come from a provider (the browser's signal store, or the WAV copies in Node tests).
// A checker whose slice is not loaded yet throws, so the bus refuses the proposal instead of recording it.

import framesData from '../../../data/frames.json';
import { registerChecker, type Answer, type Checker, type CheckResult, type Reading } from '../../game/deductions';
import { BASE_RATE, type Channel } from '../../dsp/params';
import {
  CIRCLE_FRAME, COMB_TOLERANCE_384, REFERENCE_SETTINGS, ROUND_TOLERANCE, SYNC_JITTER_RMS_384, TAPE_SPEED_OFFSET_MAX, circleFit, decodeWith,
  evenOddComb, lineTiming, mountCue, type FrameSignal, type PictureSettings, type SliceInfo,
} from './measure';

export const PICTURE_NODE_IDS = [
  'pictures.lineTime', 'pictures.sync', 'pictures.interlace', 'pictures.polarity', 'pictures.aspect', 'pictures.circle', 'pictures.firstFrames',
] as const;
export type PictureNodeId = (typeof PICTURE_NODE_IDS)[number];

interface FrameRow extends SliceInfo {
  title: string;
  tapeStartSample384k: number;
}
const FRAMES = (framesData.frames as unknown as FrameRow[]).map((f) => ({ ...f, channel: f.channel as Channel }));

export function sliceInfo(frame: string): FrameRow {
  const f = FRAMES.find((e) => e.frame === frame);
  if (!f) throw new Error(`unknown frame ${frame}`);
  return f;
}

/** The pictures after the circle, L001 to L004 and their right-channel partners, in the order the tape plays them. */
export const FIRST_FRAMES: readonly string[] = ['L001', 'L002', 'L003', 'L004', 'R001', 'R002', 'R003', 'R004']
  .map(sliceInfo)
  .sort((a, b) => a.tapeStartSample384k - b.tapeStartSample384k || a.frame.localeCompare(b.frame))
  .map((f) => f.frame);

/** Frames the polarity checker reads the mounts on: the circle and the four pictures after it on its channel. */
export const POLARITY_FRAMES: readonly string[] = ['L000', 'L001', 'L002', 'L003', 'L004'];

/** Watched frames needed to confirm pictures.firstFrames (spec: at least three). */
export const FRAMES_TO_WATCH = 3;

/** Every frame a checker of this chapter may read. */
export const CHECKER_FRAMES: readonly string[] = [...new Set([CIRCLE_FRAME, ...POLARITY_FRAMES, ...FIRST_FRAMES])];

export type SignalProvider = (frame: string) => FrameSignal | undefined;

function need(get: SignalProvider, frame: string): FrameSignal {
  const s = get(frame);
  if (!s) throw new Error(`The signal of frame ${frame} is not loaded yet. Wait for it to come off the tape.`);
  return s;
}

/** Seconds from samples at 384 kHz. */
const s384 = (n: number): number => n / BASE_RATE;
const time = (key: string, seconds: number): Reading => ({ key, value: seconds, dim: 'time' });
const fmt = (x: number, d = 2): string => x.toFixed(d);

function obj(answer: Answer): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('Propose the decoder settings as an object.');
  return answer;
}
function num(a: Record<string, Answer>, k: string, min: number, max: number): number {
  const v = a[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${k} must be a number from ${min} to ${max}.`);
  return v;
}
function bool(a: Record<string, Answer>, k: string): boolean {
  const v = a[k];
  if (typeof v !== 'boolean') throw new Error(`${k} must be true or false.`);
  return v;
}
function polarity(a: Record<string, Answer>): 'negative' | 'positive' {
  const v = a.polarity;
  if (v !== 'negative' && v !== 'positive') throw new Error('polarity must be "negative" or "positive".');
  return v;
}
/** Line time limits, ms: anything a decoder knob could be set to (the bench's 7.5 to 9.2 with room). */
const LINE_MS = [1, 50] as const;
function rows(a: Record<string, Answer>): number {
  const v = num(a, 'rows', 2, 2000);
  if (!Number.isInteger(v)) throw new Error('rows must be a whole number.');
  return v;
}

/** pictures.lineTime: free-running at the proposed line time, does the picture stand straight? */
export function checkLineTime(get: SignalProvider, answer: Answer): CheckResult {
  const lineTimeMs = num(obj(answer), 'lineTimeMs', ...LINE_MS);
  const t = lineTiming(need(get, CIRCLE_FRAME), { ...REFERENCE_SETTINGS, syncLock: false, interlace: false, lineTimeMs });
  const ok = Math.abs(t.slant384) <= t.slantLimit384;
  const driftLines = (Math.abs(t.slant384) * 512) / t.period384;
  const result: Reading[] = [
    time('line time', lineTimeMs / 1000),
    time('slant per line', s384(t.slant384)),
    time('allowed slant', s384(t.slantLimit384)),
    { key: 'drift over the picture', value: `${fmt(driftLines, 2)} lines` },
  ];
  const way = t.slant384 < 0 ? 'too long' : 'too short';
  return {
    ok,
    result,
    message: ok
      ? `This is the line time: the real line starts drift only ${fmt(Math.abs(t.slant384))} samples a line against it, within the ${fmt(t.slantLimit384)} the tape's own speed error allows (the 1977 tape runs up to ${fmt(TAPE_SPEED_OFFSET_MAX * 100, 2)}% fast). Even so, over the picture the start drifts ${fmt(driftLines, 1)} lines: no fixed clock holds this tape still.`
      : `The line time is ${way}: each line starts ${fmt(Math.abs(t.slant384))} samples (at 384 kHz) off the last one's pulse, so over the picture the start drifts by ${fmt(driftLines, 1)} lines. The picture slants and tears.`,
  };
}

/** pictures.sync: does locking every line to its own falling edge remove the wobble? */
export function checkSync(get: SignalProvider, answer: Answer): CheckResult {
  const a = obj(answer);
  const lineTimeMs = num(a, 'lineTimeMs', ...LINE_MS);
  const syncLock = bool(a, 'syncLock');
  const sig = need(get, CIRCLE_FRAME);
  const base = { ...REFERENCE_SETTINGS, interlace: false, lineTimeMs };
  const before = lineTiming(sig, { ...base, syncLock: false });
  const after = lineTiming(sig, { ...base, syncLock });
  const ok = syncLock && after.wobble384 <= SYNC_JITTER_RMS_384 && before.wobble384 > SYNC_JITTER_RMS_384;
  return {
    ok,
    result: [
      time('wobble free-running', s384(before.wobble384)),
      time('wobble now', s384(after.wobble384)),
      time('edge jitter', s384(SYNC_JITTER_RMS_384)),
    ],
    message: ok
      ? `Each line now starts at its own falling edge: the wobble of the line starts drops from ${fmt(before.wobble384)} to ${fmt(after.wobble384)} samples rms, below the edges' own jitter of ${fmt(SYNC_JITTER_RMS_384, 1)}.`
      : `The lines still start on a fixed clock: they wobble ${fmt(after.wobble384)} samples rms about their drift (the 1977 tape's wow and flutter), more than the edges' own jitter of ${fmt(SYNC_JITTER_RMS_384, 1)}.`,
  };
}

/** pictures.interlace: does undoing the stagger between long-pulse and short-pulse lines straighten the edges? */
export function checkInterlace(get: SignalProvider, answer: Answer): CheckResult {
  const interlace = bool(obj(answer), 'interlace');
  const comb = evenOddComb(need(get, CIRCLE_FRAME), interlace);
  const ok = Number.isFinite(comb) && Math.abs(comb) <= COMB_TOLERANCE_384;
  return {
    ok,
    result: [time('even and odd shift', s384(comb)), time('allowed shift', s384(COMB_TOLERANCE_384))],
    message: ok
      ? `Long-pulse and short-pulse lines now line up: their content is shifted only ${fmt(comb)} samples against each other, within the ${fmt(COMB_TOLERANCE_384)} the stagger varies from frame to frame.`
      : `Lines that open with the long pulse and lines that open with the short one are shifted ${fmt(comb)} samples against each other, so vertical edges come out as a comb.`,
  };
}

/** pictures.polarity: read this way, are the slide mounts at the frame edges dark? */
export function checkPolarity(get: SignalProvider, answer: Answer): CheckResult {
  const pol = polarity(obj(answer));
  const cues = POLARITY_FRAMES.map((f) => mountCue(decodeWith(need(get, f), { ...REFERENCE_SETTINGS, polarity: pol })));
  const dark = cues.filter((c) => c.margin > 0).length;
  const border = cues.reduce((s, c) => s + c.border, 0) / cues.length;
  const centre = cues.reduce((s, c) => s + c.centre, 0) / cues.length;
  const ok = dark * 2 > cues.length;
  return {
    ok,
    result: [
      { key: 'frames with dark mounts', value: `${dark} of ${cues.length}` },
      { key: 'mount grey', value: Math.round(border) },
      { key: 'centre grey', value: Math.round(centre) },
    ],
    message: ok
      ? `Read this way the slide mounts at the frame edges are dark (grey ${Math.round(border)} against ${Math.round(centre)} in the middle) in ${dark} of ${cues.length} frames: no light comes through a mount. More signal is darker.`
      : `Read this way the mounts at the frame edges glow (grey ${Math.round(border)} against ${Math.round(centre)} in the middle) in ${cues.length - dark} of ${cues.length} frames, but no light comes through a mount: this is a negative.`,
  };
}

/** pictures.aspect: with this many rows, does the calibration circle come out round? */
export function checkAspect(get: SignalProvider, answer: Answer): CheckResult {
  const n = rows(obj(answer));
  const fit = circleFit(decodeWith(need(get, CIRCLE_FRAME), { ...REFERENCE_SETTINGS, rows: n }));
  const ok = Math.abs(fit.axisRatio - 1) <= ROUND_TOLERANCE;
  const shape = fit.axisRatio > 1 ? 'wider than tall' : 'taller than wide';
  return {
    ok,
    result: [
      { key: 'rows', value: n },
      { key: 'axis ratio', value: Number(fit.axisRatio.toFixed(4)) },
      { key: 'ring fit', value: `${fmt(fit.rmsResidual)} px rms` },
    ],
    message: ok
      ? `With ${n} rows the calibration circle is round: ${fit.axisRatio.toFixed(3)} times as wide as tall, within ${ROUND_TOLERANCE}.`
      : `With ${n} rows the circle comes out an ellipse, ${fit.axisRatio.toFixed(3)} times as wide as tall: ${shape}. The picture is squashed.`,
  };
}

/** The settings of a whole decode, from an answer. */
export function parseSettings(answer: Answer): PictureSettings {
  const a = obj(answer);
  return { lineTimeMs: num(a, 'lineTimeMs', ...LINE_MS), syncLock: bool(a, 'syncLock'), interlace: bool(a, 'interlace'), polarity: polarity(a), rows: rows(a) };
}

/** pictures.circle: all five settings right, measured together on the circle. */
export function checkCircle(get: SignalProvider, answer: Answer): CheckResult {
  const s = parseSettings(answer);
  const parts: [string, CheckResult][] = [
    ['line time', checkLineTime(get, s as unknown as Answer)],
    ['sync', checkSync(get, s as unknown as Answer)],
    ['interlace', checkInterlace(get, s as unknown as Answer)],
    ['polarity', checkPolarity(get, s as unknown as Answer)],
    ['aspect', checkAspect(get, s as unknown as Answer)],
  ];
  const bad = parts.filter(([, r]) => !r.ok);
  const fit = circleFit(decodeWith(need(get, CIRCLE_FRAME), s));
  const ok = bad.length === 0 && Math.abs(fit.axisRatio - 1) <= ROUND_TOLERANCE;
  return {
    ok,
    result: [
      { key: 'axis ratio', value: Number(fit.axisRatio.toFixed(4)) },
      { key: 'settings right', value: `${parts.length - bad.length} of ${parts.length}` },
      ...(ok ? [{ key: 'meaning', value: 'They see.' }] : []),
    ],
    message: ok
      ? `The calibration circle comes out round, ${fit.axisRatio.toFixed(4)} to 1, with every setting right. They see.`
      : `Not yet: ${bad.map(([k, r]) => `${k} (${r.message})`).join(' ')}`,
  };
}

/** pictures.firstFrames: did the same settings develop at least three of the pictures after the circle? */
export function checkFirstFrames(get: SignalProvider, answer: Answer): CheckResult {
  const a = obj(answer);
  const w = a.watched;
  if (!Array.isArray(w) || !w.every((x) => typeof x === 'string')) throw new Error('watched must be a list of frame ids.');
  const s = parseSettings(a.settings ?? null);
  const seen = [...new Set(w as string[])].filter((f) => FIRST_FRAMES.includes(f));
  const read = seen.filter((f) => {
    const sig = get(f);
    if (!sig) return false;
    // read with the same settings: the line starts follow every sync edge (wobble below the edge jitter)
    return lineTiming(sig, s).wobble384 <= SYNC_JITTER_RMS_384;
  });
  const ok = read.length >= FRAMES_TO_WATCH;
  return {
    ok,
    result: [
      { key: 'pictures developed', value: read.length },
      { key: 'seen', value: read.map((f) => `${f} ${sliceInfo(f).title}`).join('; ') || 'none' },
    ],
    message: ok
      ? `The settings that made the circle round develop the pictures after it: ${read.length} watched line by line (${read.join(', ')}).`
      : `Watch at least ${FRAMES_TO_WATCH} of the following pictures develop with these settings (${read.length} so far).`,
  };
}

/** The checkers over a signal provider. */
export function makePictureCheckers(get: SignalProvider): Record<PictureNodeId, Checker> {
  return {
    'pictures.lineTime': (a) => checkLineTime(get, a),
    'pictures.sync': (a) => checkSync(get, a),
    'pictures.interlace': (a) => checkInterlace(get, a),
    'pictures.polarity': (a) => checkPolarity(get, a),
    'pictures.aspect': (a) => checkAspect(get, a),
    'pictures.circle': (a) => checkCircle(get, a),
    'pictures.firstFrames': (a) => checkFirstFrames(get, a),
  };
}

export function registerPictureCheckers(get: SignalProvider): void {
  const c = makePictureCheckers(get);
  for (const id of PICTURE_NODE_IDS) registerChecker(id, c[id]);
}
