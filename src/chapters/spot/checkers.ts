// The three Spot checkers. Each recomputes its verdict from the science on the playthrough's model (data.ts,
// from the seed in the save), never trusting numbers sent by the interface, and every wrong answer reports
// what it computed (PLAN.md "Principles from the kickoff"). Pure apart from the registry call in install.

import { registerChecker, type CheckResult, type Checker, type Reading } from '../../game/deductions';
import { acceptedStartRange, ageFromU234, fitAgeAndPurity, testStartHypothesis, type AlphaCounts } from '../../science/clocks';
import { MAX_COUNT_S, clockAges, naturalStartRatio, sweepRate } from '../../science/spot';
import { JULIAN_YEAR_S } from '../../science/units';
import { q, rangeDigits } from '../../ui/message';
import { formatPower, toAlien } from '../../ui/units';
import { SPOT, offsetMm, type SpotModel } from './data';

/** n significant figures, grouped; very large or small as a power of ten (units.ts formatPower), never e-notation. */
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return formatPower(x, n);
  return Number(x.toPrecision(n)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** A time as the alien's number of beats, three significant figures (a power of ten from a million up). */
export function beatsNumber(s: number): string {
  return sig(toAlien('time', s));
}

/** A count rate in a message: a token the interface writes per beat (D-A22; src/ui/message.ts). */
const perBeat = (perS: number): string => q('frequency', perS);
/** A counting time in a message, as a token. */
const beats = (s: number): string => q('time', s);
/** A time in years, as a token; `d` significant figures. */
const yearsQ = (y: number, d?: number): string => q('time', yearsS(y), d);
const yearsS = (y: number): number => y * JULIAN_YEAR_S;
/** A p-value in words: below 10^-12 it is written as a bound (the chi-square tail underflows toward 0). */
const pText = (p: number): string => (p < 1e-12 ? `p below ${formatPower(1e-12, 1)}` : `p = ${sig(p, 2)}`);

/**
 * p-value threshold for "the counts reject this start" (the conventional 5%, as in the spec). For a truly pure
 * start, on the boundary r0 = 0, the test is conservative: it refuses the truth 2.7% of the time over 1,000
 * one-day counts (clocks.calibration.test.ts, clocks.uranium.purity05), not 5%.
 */
export const REJECT_P = 0.05;

function malformed(answer: unknown, wants: string): CheckResult {
  return {
    ok: false,
    result: [{ key: 'reading', value: JSON.stringify(answer) }],
    message: `The instrument cannot read this answer; it needs ${wants}.`,
  };
}

const num = (o: unknown, k: string): number | null => {
  if (typeof o !== 'object' || o === null) return null;
  const v = (o as Record<string, unknown>)[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** spot.find: a point on the cover, { xMm, yMm }. Right when it lies inside the spot's disc (data/spot.json). */
export function checkFind(answer: unknown, m: SpotModel): CheckResult {
  const x = num(answer, 'xMm');
  const y = num(answer, 'yMm');
  if (x === null || y === null) return malformed(answer, 'a point on the cover');
  const r = offsetMm(x, y);
  const rate = sweepRate(m.sweep, r);
  const bg = m.sweep.backgroundPerS;
  const edge = sweepRate(m.sweep, SPOT.radiusMm);
  const base: Reading[] = [
    { key: 'count rate at the mark', value: rate, dim: 'frequency' },
    { key: 'background', value: bg, dim: 'frequency' },
  ];
  if (r <= SPOT.radiusMm) {
    return {
      ok: true,
      result: [...base, { key: 'spot diameter', value: (2 * SPOT.radiusMm) / 1000, dim: 'length' }, { key: 'times the background', value: Number((rate / bg).toPrecision(3)) }],
      message:
        `Over the mark the detector counts ${perBeat(rate + bg)}, ${sig(rate / bg)} times its own background of ${perBeat(bg)}. ` +
        'Something on the plate is giving off alpha particles here, a small patch no drawing shows.',
    };
  }
  // Far out the plate's rate drops toward the detector's own background (within ten times it: "barely above"); nearer, it is still climbing.
  const message =
    rate < bg
      ? `Nothing above background here: the detector would count ${perBeat(rate)} from the plate at this point, against its own background of ${perBeat(bg)}.`
      : rate < 10 * bg
        ? `Barely above background here: the detector would count ${perBeat(rate)} from the plate at this point, against its own background of ${perBeat(bg)}. Whatever gives off alphas is far from this point.`
        : `Something is giving off alpha particles nearby, but not here: the detector would count ${perBeat(rate)} at this point (background ${perBeat(bg)}), ` +
          `and anywhere over the source itself it counts at least ${perBeat(edge)}. The rate is still rising toward it.`;
  return { ok: false, result: base, message };
}

function countsReadings(c: AlphaCounts): Reading[] {
  return [
    { key: 'counting time', value: c.countingTimeS, dim: 'time' },
    { key: 'uranium-238 counts', value: c.u238 },
    { key: 'uranium-234 counts', value: c.u234 },
    { key: 'thorium-230 counts', value: c.th230 },
  ];
}

const countsText = (c: AlphaCounts): string =>
  `${sig(c.u238)} uranium-238, ${sig(c.u234)} uranium-234 and ${sig(c.th230)} thorium-230 alphas in ${beats(c.countingTimeS)}`;

/** The counts the instrument holds after a counting time the answer names (recomputed from the seed). */
function countsFor(answer: unknown, m: SpotModel): AlphaCounts | null {
  const t = num(answer, 'countingTimeS');
  if (t === null || t <= 0 || t > MAX_COUNT_S) return null;
  return m.session.countsAt(t);
}

/** spot.age: { countingTimeS, ageYears }. Right when the age lies in the U-234 clock's 95% interval and that interval is above zero. */
export function checkAge(answer: unknown, m: SpotModel): CheckResult {
  const c = countsFor(answer, m);
  const age = num(answer, 'ageYears');
  if (!c || age === null) return malformed(answer, 'a counting time and an age');
  const a = ageFromU234(c);
  const interval: Reading[] = [
    { key: 'age', value: yearsS(a.ageYears), dim: 'time' },
    { key: 'age low, 95%', value: yearsS(a.lo), dim: 'time' },
    { key: 'age high, 95%', value: yearsS(a.hi), dim: 'time' },
  ];
  const d = Number.isFinite(a.hi) ? rangeDigits('time', yearsS(Math.max(Math.abs(a.hi), Math.abs(age))), yearsS(a.hi - a.lo)) : 3;
  const range = Number.isFinite(a.hi) ? `${yearsQ(a.lo, d)} to ${yearsQ(a.hi, d)}` : `${yearsQ(a.lo)} upward, with no upper end`;
  if (!(a.lo > 0)) {
    return {
      ok: false,
      result: [...interval, ...countsReadings(c)],
      message:
        `Count longer: ${countsText(c)}. This few uranium-234 counts cannot tell an old spot from a new one; ` +
        `the 95% interval runs from ${range}.`,
    };
  }
  if (age < a.lo || age > a.hi) {
    return {
      ok: false,
      result: [...interval, ...countsReadings(c)],
      message:
        `The counts (${countsText(c)}) give a uranium-234 to uranium-238 ratio of ${sig(a.ratio)}, which a pure start reaches at ${yearsQ(a.ageYears, d)}; ` +
        `95%: ${range}. ${yearsQ(age, d)} lies outside.`,
    };
  }
  return {
    ok: true,
    result: [...interval, { key: 'half-life systematic', value: yearsS(a.halfLifeSystematic.totalYears), dim: 'time' }, ...countsReadings(c)],
    message:
      `${countsText(c)}: the ratio ${sig(a.ratio)} grew from a pure start in ${yearsQ(a.ageYears, d)} ` +
      `(95% from the counts: ${range}; the half-lives add ${yearsQ(a.halfLifeSystematic.totalYears, 2)}, 1 sigma). Count longer and the interval narrows.`,
  };
}

const clockText = (y: number | null): string => (y === null ? 'never reaches the measured ratio' : yearsQ(y));

/**
 * spot.purity: { countingTimeS, startA234overA238 }. Right when the counts accept that start and reject natural
 * uranium's. The result carries the range of starts the counts accept (clocks.ts acceptedStartRange): "pure"
 * means almost none of natural uranium's uranium-234 at the start, not exactly none (M4 science audit finding 6).
 */
export function checkPurity(answer: unknown, m: SpotModel): CheckResult {
  const c = countsFor(answer, m);
  const r0 = num(answer, 'startA234overA238');
  if (!c || r0 === null || r0 < 0) return malformed(answer, 'a counting time and a starting uranium-234 to uranium-238 activity ratio');
  const nat = naturalStartRatio();
  const test = testStartHypothesis(c, r0);
  const natural = testStartHypothesis(c, nat);
  const clocks = clockAges(c, r0);
  const range = acceptedStartRange(c, REJECT_P);
  const rangeText = `${sig(range.lo, 2)} to ${sig(range.hi, 2)}`;
  const base: Reading[] = [
    { key: 'starting uranium-234 per uranium-238', value: r0 },
    { key: 'p-value, this start', value: Number(test.pValue.toPrecision(3)) },
    { key: 'p-value, ore in balance', value: Number(natural.pValue.toPrecision(3)) },
    { key: 'starts these counts accept', value: rangeText },
    ...countsReadings(c),
  ];
  if (test.pValue < REJECT_P) {
    return {
      ok: false,
      result: base,
      message:
        `The counts (${countsText(c)}) reject a start of ${sig(r0)}: the chance of counts this far off is ${pText(test.pValue)}. ` +
        `From that start the uranium-234 clock ${clockText(clocks.u234Years)} and the thorium-230 clock ${clockText(clocks.th230Years)}: they disagree. ` +
        `Fitted freely, the counts' own best start is ${sig(range.fitted, 2)} uranium-234 per uranium-238, and they accept starts from ${rangeText}.`,
    };
  }
  if (natural.pValue >= REJECT_P) {
    return {
      ok: false,
      result: base,
      message:
        `Count longer: with ${sig(c.th230)} thorium-230 and ${sig(c.u234)} uranium-234 counts both starts fit ` +
        `(this start ${pText(test.pValue)}, ore in balance ${pText(natural.pValue)}), so the counts cannot yet tell them apart.`,
    };
  }
  const fit = fitAgeAndPurity(c);
  return {
    ok: true,
    result: [
      ...base.slice(0, 4),
      { key: 'fitted age', value: yearsS(fit.ageYears), dim: 'time' },
      ...(fit.determinable ? [{ key: 'fitted age low, 95%', value: yearsS(fit.lo), dim: 'time' as const }, { key: 'fitted age high, 95%', value: yearsS(fit.hi), dim: 'time' as const }] : []),
      ...countsReadings(c),
    ],
    message:
      `A start of ${sig(r0)} fits both clocks (${pText(test.pValue)}): uranium-234 says ${clockText(clocks.u234Years)}, thorium-230 ${clockText(clocks.th230Years)}. ` +
      `Ore in balance (${sig(nat)}) is rejected by the same counts (${pText(natural.pValue)}). The counts accept starts from ${rangeText} uranium-234 per uranium-238: ` +
      `almost none of the uranium-234 natural uranium carries. Fitting age and start together gives ${yearsQ(fit.ageYears)}.`,
  };
}

export type ModelFor = (seed: string) => SpotModel;

export function spotCheckers(modelFor: ModelFor): Record<string, Checker> {
  return {
    'spot.find': (a, ctx) => checkFind(a, modelFor(ctx.seed)),
    'spot.age': (a, ctx) => checkAge(a, modelFor(ctx.seed)),
    'spot.purity': (a, ctx) => checkPurity(a, modelFor(ctx.seed)),
  };
}

export function installSpotCheckers(modelFor: ModelFor): void {
  for (const [id, c] of Object.entries(spotCheckers(modelFor))) registerChecker(id, c);
}
