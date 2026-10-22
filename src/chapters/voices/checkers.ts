// The Voices' four checkers (voices.many, voices.hearing, voices.octave, voices.others). Each judges the
// player's reading against the reference analysis of the real record (data/voices.json through data.ts), and a
// wrong answer reports what the analysis computes for it (PLAN.md "Principles"). The accepted ranges are derived
// in tools/voices/ (analyse.py, vfold.py, others.py) and stated in docs/HOW_ITS_CHECKED.md row 16. Pure: no DOM.

import { registerChecker, type Answer, type CheckResult, type Reading } from '../../game/deductions';
import { q } from '../../ui/message';
import { FOLD_LOCAL_CENTS } from '../../dsp/fold';
import { FOLD, MACHINE, OCTAVE_CENTS, OCTAVE_TOL_CENTS, ONE_VOICE_SEMITONES, REASONABLE, SPEC, STEP_TOL_CENTS, V, combScore, greetingsAt, isReasonable, measureStretch, snrAt, trackById, violinNotes } from './data';

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
const cents = (ratio: number): number => 1200 * Math.log2(ratio);
const ratioText = (c: number, d = 3): string => (2 ** (c / 1200)).toFixed(d);
const pct = (share: number): string => `${Math.round(share * 1000) / 10}%`;

const ACC = V.greetings.accepted;
const NEAR = V.greetings.nearPublished;
const [T_LO, T_HI] = REASONABLE.thresholdDb;
const [G_LO, G_HI] = REASONABLE.gapS;

/** voices.many: { threshold (dBFS), gap (s), groups }. */
export function checkMany(answer: Answer): CheckResult {
  const what = 'voices.many';
  const o = obj(answer, what);
  const th = num(o, 'threshold', what);
  const gap = num(o, 'gap', what);
  const groups = num(o, 'groups', what);
  if (!(gap > 0)) throw new Error(`${what}: gap must be positive`);
  const g = greetingsAt(th, gap);
  const settingOk = isReasonable(th, gap);
  const groupsOk = Number.isInteger(groups) && groups >= 2 && groups <= g.voices;
  const result: Reading[] = [
    { key: 'stretches of voice between pauses', value: g.count },
    { key: 'fewest over reasonable settings', value: ACC.minVoices },
    { key: 'most over reasonable settings', value: ACC.maxVoices },
    { key: "voices' worth of pitch", value: g.voices },
    { key: 'pause at least', value: gap, dim: 'time' },
  ];
  const range =
    `Over every reasonable setting (quiet below from ${T_LO} to ${T_HI}, where a moment that quiet is the hiss between voices with a probability from 0.95 down to 0.05, and a pause of ${q('time', G_LO)} to ${q('time', G_HI)}) ` +
    `the stretches number from ${ACC.minVoices} to ${ACC.maxVoices}`;
  const fiftyFive =
    `The count depends on where a pause is taken to end a voice: some greetings run into the next with hardly a pause, and some pause inside themselves. ` +
    `Some settings give about 55, the number of greetings their makers list: quiet below ${NEAR.thresholdDb} with a pause of at least ${q('time', NEAR.gapS)} gives ${NEAR.count}, though there a moment that quiet is still the hiss with probability ${NEAR.noisePosterior.toFixed(3)}.`;
  if (settingOk && groupsOk) {
    return {
      ok: true,
      result,
      message:
        `${g.count} stretches of voice between pauses at this setting. ${range}: many voices, a few dozen at least. ${fiftyFive} ` +
        `Their pitches spread over about ${g.voices} single voices' worth (one speaker's own pitch moves within a ratio of about ${ratioOf(ONE_VOICE_SEMITONES)} to 1): high voices and low, not one speaker.`,
    };
  }
  let message: string;
  if (th < T_LO) message = `${g.count}: the threshold sits down in the hiss between the voices, where a moment that quiet is still more likely hiss than voice, so many pauses never fall below it and voices run together or break at random. Set it between the hiss and the voices. ${range}.`;
  else if (th > T_HI) message = `${g.count}: the threshold sits up among the voices themselves, so every soft syllable counts as a pause and single voices fall apart. Set it between the hiss and the voices. ${range}.`;
  else if (gap < G_LO) message = `${g.count}: a pause of only ${q('time', gap)} counts, so the short silences inside words split single voices apart. ${range}.`;
  else if (gap > G_HI) message = `${g.count}: a pause must last ${q('time', gap)} before it counts, longer than most gaps between voices, so voices run together. ${range}.`;
  else if (groups < 2) message = `The setting is reasonable (${g.count} stretches), but not one voice: one speaker's pitch moves within a ratio of about ${ratioOf(ONE_VOICE_SEMITONES)} to 1, and these pitches spread over about ${g.voices} times that range. High voices and low.`;
  else message = `The setting is reasonable (${g.count} stretches), but the pitches spread over only about ${g.voices} voices' worth at this setting (one speaker's own range is a ratio of about ${ratioOf(ONE_VOICE_SEMITONES)} to 1). More voices may share the same pitches; pitch alone cannot tell them apart.`;
  return { ok: false, result, message };
}

/** voices.hearing: { topHz }, where the greetings' long-term spectrum falls into the record's own noise. */
export function checkHearing(answer: Answer): CheckResult {
  const what = 'voices.hearing';
  const top = num(obj(answer, what), 'topHz', what);
  if (!(top > 0)) throw new Error(`${what}: topHz must be positive`);
  const [lo, hi] = SPEC.crossingBandHz as [number, number];
  const [dLo, dHi] = SPEC.definitions.spreadHz as [number, number];
  const ok = top >= lo && top <= hi;
  const snr = snrAt(top);
  const result: Reading[] = [
    { key: 'marked top', value: top, dim: 'frequency' },
    { key: 'falls into the hiss', value: SPEC.crossingHz, dim: 'frequency' },
    { key: 'lowest it could be', value: lo, dim: 'frequency' },
    { key: 'highest it could be', value: hi, dim: 'frequency' },
    { key: 'lowest by the rule chosen', value: dLo, dim: 'frequency' },
    { key: 'highest by the rule chosen', value: dHi, dim: 'frequency' },
    { key: 'most of the power below', value: SPEC.greetingsEnergy95Hz, dim: 'frequency' },
  ];
  if (snr !== null) result.push({ key: 'voice over hiss at the mark', value: Math.round(snr * 10) / 10 });
  const rule = `where what the voices add equals the hiss itself; between ${q('frequency', lo, 3)} and ${q('frequency', hi, 3)} as sampled`;
  const spread = `The rule is a choice: where the voices add from a third of the hiss to three times it, the edge moves from ${q('frequency', dLo, 3)} to ${q('frequency', dHi, 3)}.`;
  if (ok) {
    return {
      ok,
      result,
      message:
        `They make sounds above their recording's hiss up to about ${q('frequency', SPEC.crossingHz, 3)} (${rule}), though most of their power lies below ${q('frequency', SPEC.greetingsEnergy95Hz, 2)}. ${spread} ` +
        'It is a lower bound on the sounds they make: the disc itself limits the band (cut at half speed, its fine groove, its own hiss), so their voices may reach higher.',
    };
  }
  const message =
    top < lo
      ? `At this mark their voices still stand well clear of the hiss (${snr === null ? 'clear of it' : `${(10 ** (snr / 10)).toFixed(1)} times its power`}): the sound goes higher. Follow the curve up to where it meets the hiss. ${spread}`
      : `Here the voices add no more than the disc's own hiss: the mark is in the hiss. The sound falls into it lower down, near ${q('frequency', SPEC.crossingHz, 3)} (${rule}). ${spread}`;
  return { ok: false, result, message };
}

type FoldPeakRow = (typeof FOLD.peaks)[number];
const named = FOLD.named as Record<string, number | null>;
const peakNamed = (p: FoldPeakRow): string | null => Object.entries(named).find(([, c]) => c !== null && Math.abs(c - p.cents) < 0.01)?.[0] ?? null;

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
  const ratioOk = Math.abs(c - OCTAVE_CENTS) <= OCTAVE_TOL_CENTS;
  const stepOk = Math.abs(s - OCTAVE_CENTS / 12) <= STEP_TOL_CENTS;
  const score = violinNotes().score(c);
  const result: Reading[] = [
    { key: 'repeating ratio', value: Number(ratio.toFixed(4)) },
    { key: 'notes gather, times chance', value: Number(score.toFixed(3)) },
    { key: 'best ratio', value: Number((2 ** (OCTAVE_CENTS / 1200)).toFixed(5)) },
    { key: 'gather there, times chance', value: FOLD.bestScore },
    { key: 'steps in it', value: k },
    { key: 'one step, as a ratio', value: Number(step.toFixed(5)) },
    { key: 'comb fit', value: Number(combScore(c, k).toFixed(3)) },
  ];
  const best = ratioText(OCTAVE_CENTS, 4);
  const pieces = 'the repeat on the tenth piece of music (one bowed instrument, alone), the steps on the seventeenth (one keyboard)';
  if (ratioOk && stepOk) {
    const close = [...FOLD.peaks].sort((a, b) => b.score - a.score)[0]!;
    return {
      ok: true,
      result,
      message:
        `Their notes come back at a doubled frequency (${ratio.toFixed(4)} to 1): folded there, notes a repeat apart lie ${FOLD.bestScore.toFixed(2)} times as close as chance would put them, closer than at any other ratio up to 4 to 1 ` +
        `(the next, ${ratioText(close.cents)} to 1, ${close.score.toFixed(2)} times, and the doubling wins in ${pct(close.bestWins)} of resamplings of the notes). ` +
        `The doubling is cut into ${k} equal steps, each a ratio of ${step.toFixed(5)}: ${pieces}. This holds for these pieces; other music on the disc (the second, the 24th and the 25th pieces among them) is tuned in other ways.`,
    };
  }
  if (ratioOk) {
    return {
      ok: false,
      result,
      message: `The repeat is right, but ${k} equal steps do not fit the keyboard's notes as well: a comb of ${k} fits ${combScore(c, k).toFixed(2)}, and the best comb fits ${combScore(c, 12).toFixed(2)}. Try other numbers of teeth.`,
    };
  }
  // The ratio: judged by the same comparison as the doubling (tools/voices/vfold.py analysis).
  const near = FOLD.peaks.filter((p) => Math.abs(p.cents - c) <= FOLD_LOCAL_CENTS).sort((a, b) => Math.abs(a.cents - c) - Math.abs(b.cents - c))[0];
  const vs = near
    ? `Folded at ${ratio.toFixed(3)} to 1 the notes a repeat apart lie ${near.score.toFixed(2)} times as close as chance would put them, at ${best} to 1 ${FOLD.bestScore.toFixed(2)} times; the doubling wins in ${pct(near.bestWins)} of resamplings of the notes, by ${near.marginLow.toFixed(2)} to ${near.marginHigh.toFixed(2)} (95%).`
    : `Folded at ${ratio.toFixed(3)} to 1 the notes a repeat apart lie ${score.toFixed(2)} times as close as chance would put them, at ${best} to 1 ${FOLD.bestScore.toFixed(2)} times.`;
  const name = near ? peakNamed(near) : null;
  let why: string;
  if (Math.abs(c - 2 * OCTAVE_CENTS) <= FOLD_LOCAL_CENTS) why = 'This ratio is two doublings: a pattern that comes back at one doubling comes back at two as well, but folded at two the notes one doubling apart fall half a repeat out of line, so the fold is weaker. The pattern comes back first at the doubling.';
  else if (name === '3:2') why = 'About 3 to 2: notes this far apart are common in their melodies, so many line up, but notes of the same kind a doubling apart do not. The whole pattern comes back only at the doubling.';
  else if (name === 'two 3:2') why = 'About two 3 to 2 steps stacked (a ratio near 2.25): notes this far apart are common too, because their melodies move by 3 to 2 so often, but only those notes line up; at the doubling every kind of note lines up with its copy.';
  else if (name === '3:1') why = 'About 3 to 1, a doubling and a 3 to 2 stacked: some notes line up there, fewer than at the doubling.';
  else if (name === '4:3') why = 'About 4 to 3: common in their melodies too, but not where the whole pattern comes back.';
  else why = 'The pattern of notes does not come back whole at this ratio. Find the ratio where the notes gather most tightly.';
  return { ok: false, result, message: `${vs} ${why}` };
}

/** voices.others: { track, start, end } (s): a stretch marked on a track. Right where held calls sound, at least one
 * of them not machine-steady (the lead's decision, docs/plans/M6_specs/voices-others-machines.md), and nobody speaks. */
export function checkOthers(answer: Answer): CheckResult {
  const what = 'voices.others';
  const o = obj(answer, what);
  const track = o.track;
  if (typeof track !== 'string' || !trackById(track)) throw new Error(`${what}: unknown track ${String(track)}`);
  const start = num(o, 'start', what);
  const end = num(o, 'end', what);
  if (!(end > start)) throw new Error(`${what}: end must be after start`);
  const m = measureStretch(track, start, end);
  if (!m) throw new Error(`${what}: no measurement for ${track}`);
  const ceiling = V.greetings.speechCeilingHz;
  const result: Reading[] = [
    { key: 'marked from', value: start, dim: 'time' },
    { key: 'marked to', value: end, dim: 'time' },
  ];
  if (m.kind === 'music') {
    result.push({ key: 'held tones inside', value: m.heldTones });
    return {
      ok: false,
      result,
      message:
        `This is one of their pieces of music. Measured in the marked stretch: ${m.heldTones} held tone${m.heldTones === 1 ? '' : 's'} (a steady pitch above ${q('frequency', ceiling, 3)} for at least ${q('time', V.others.rule.callMinS)}). ` +
        "Measurement alone cannot tell an instrument's or a singer's held note from another animal's call, so a stretch of their music cannot show another animal. Look among the voices and the sounds instead.",
    };
  }
  result.push({ key: 'held calls inside', value: m.calls.length }, { key: 'stretches of speech touching it', value: m.speech.length });
  if (m.calls.length) {
    result.push({ key: 'longest call', value: Math.max(...m.calls.map((c) => c.endS - c.startS)), dim: 'time' });
    result.push({ key: 'highest call', value: Math.max(...m.calls.map((c) => c.hz)), dim: 'frequency' });
  }
  result.push({ key: "speakers' highest held pitch", value: ceiling, dim: 'frequency' });
  const calls = `${m.calls.length} held call${m.calls.length === 1 ? '' : 's'} (a steady or sliding pitch above ${q('frequency', ceiling, 3)}, the highest any speaker in the greetings holds, for at least ${q('time', V.others.rule.callMinS)})`;
  const machines = m.calls.filter((c) => c.machine);
  const creatures = m.calls.filter((c) => !c.machine);
  if (machines.length) result.push({ key: 'calls held machine-steady', value: machines.length });
  if (creatures.length && !m.speech.length) {
    const longest = Math.max(...creatures.map((c) => c.endS - c.startS));
    const glide = Math.max(...creatures.map((c) => c.glide));
    // How steady the machine-steady calls held: the widest of their 10 to 90% pitch ranges, as a ratio (cents in
    // the data; the alien reads ratios).
    const plus = machines.length
      ? ` (${machines.length} more held one pitch to within a ratio of ${ratioText(Math.max(...machines.map((c) => c.spread)), 4)} to 1, like a machine, and do not count: ${creatures.length} call${creatures.length === 1 ? '' : 's'} remain${creatures.length === 1 ? 's' : ''})`
      : '';
    return {
      ok: true,
      result,
      message:
        `Here nobody speaks: ${calls}${plus}, and no speech (no voiced, broadband sound at a speaking pitch). The calls hold one sliding pitch for up to ${q('time', longest, 2)}, gliding by a ratio of as much as ${(2 ** (glide / 1200)).toFixed(2)} to 1. ` +
        'Another animal of their world, calling: they sent its voice beside their own.',
    };
  }
  if (m.calls.length && !creatures.length && !m.speech.length) {
    // Every call here is machine-steady (tools/voices/others.py): the senders' own making, not another voice.
    const most = Math.max(...machines.map((c) => c.spread));
    const r4 = (c: number): string => ratioText(c, 4);
    return {
      ok: false,
      result,
      message:
        `Nobody speaks here and ${calls}, but every one of them held one pitch to within a ratio of ${r4(most)} to 1, like a machine: that is the widest the middle eight tenths of any of these calls' pitch tracks wander, ` +
        `where the steadiest call of any animal measured on the record wanders by ${r4(MACHINE.gapCents[1])} to 1 or more (the line is drawn at ${r4(MACHINE.thresholdCents)} to 1). ` +
        "A tone that steady is something of their own making, not another creature's voice. Listen on.",
    };
  }
  let message: string;
  const a = m.speech.length ? Math.max(start, Math.min(...m.speech.map((r) => r[0]))) : 0;
  const b = m.speech.length ? Math.min(end, Math.max(...m.speech.map((r) => r[1]))) : 0;
  const sp = m.speech.length ? `${m.speech.length} stretch${m.speech.length === 1 ? '' : 'es'} of speech (voiced, broadband sound at a speaking pitch) between ${q('time', a, 4)} and ${q('time', b, 4)}` : '';
  if (m.calls.length) message = `Part of this stretch holds ${calls}, but it also holds ${sp}: mark only where the calls sound and nobody speaks.`;
  else if (m.speech.length) message = `Speakers in this stretch: ${sp}, and no held call. Listen on.`;
  else message = `Neither speech nor a held call in this stretch: nothing holds a pitch above ${q('frequency', ceiling, 3)} for ${q('time', V.others.rule.callMinS)}. Listen on.`;
  return { ok: false, result, message };
}

export function registerVoicesCheckers(): void {
  registerChecker('voices.many', (a) => checkMany(a));
  registerChecker('voices.hearing', (a) => checkHearing(a));
  registerChecker('voices.octave', (a) => checkOctave(a));
  registerChecker('voices.others', (a) => checkOthers(a));
}
