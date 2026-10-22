// Portrait's one deduction, portrait.together ("One story"): the four clocks that dated the machine, each from
// the player's own confirmed result, combined into one time (src/science/consilience.ts), and a proposed time
// judged against it. Pure: the confirmed results come in through a lookup (the game's saved attempts in the
// browser, the chapters' own checkers' results in Node tests and seedCheck.ts), never from the DOM.
//
// The four clocks, and where each one's numbers are read:
//  - the fuel (arrival.fuelAge): readings 'age', 'age low, 95%', 'age high, 95%' (time, SI seconds);
//  - the uranium spot (spot.age): the same three readings;
//  - the pulsar map read in the warm-white star's rest frame (trail.when): the confirmed message's quantity
//    tokens 0 to 2 (estimate, 95% low, 95% high; trail/checkers.ts checkWhen);
//  - the journey, distance over speed (trail.age): the confirmed message's tokens 1 to 3 (the measured value
//    and its 95% interval; token 0 is the player's own run-back time; trail/checkers.ts checkAge).
//
// Independence (spec: "do not assume independence silently"). The fuel and the spot draw their counts from
// their own seeded streams (arrival/data.ts, spot/data.ts); the map's identification uses the fuel clock only
// to pre-select which pulsar fits which line, never in the age itself (the reframed ages date the documented
// pulsars, epochModel.ts ages('sun')). The map's reframed age and the journey both rest on the Finder's
// measured motion relative to the warm-white star: the reframe uses the Finder's own measured state
// (epochModel.ts `measured`, frames.ts observerRelativeTo) and the journey the warm-white star's measured state
// seen from the Finder (kinematics.ts trail, its own measurement draw). In the simulation these are two
// independent draws; physically they would be one measurement. Portrait therefore measures the covariance they
// WOULD share if they were one measurement (portrait.test.ts, finite differences of the map's reframed age and of
// distance over speed against the shared relative state, with the Finder's measured covariance): the map's age
// moves by about 1.4 years per 1-sigma of that state against its own sigma of about 70 years, so the correlation
// coefficient is about 0.005 (default seed). That is far below anything that changes the combination (a rho of
// 0.005 shifts the combined sigma by under 0.1%), so the four are combined as independent, and the measured rho
// is recorded with portrait.together.
//
// Not included: the half-life systematics the fuel and the spot report beside their 95% intervals (about 137
// and 110 years, 1 sigma, partly shared through uranium-234). The spec takes each clock's 95% interval as it
// stands; the map, about seven times narrower than either, carries most of the weight, so including them moves
// the combined sigma by well under 1% (portrait.test.ts reports by how much).
//
// Acceptance (D-A28): a proposal within the 99.9% two-sided band of the combined sigma (3.29 sigma); the plate
// draws the 95% band. Each clock's sigma is half its 95% interval over 1.96, from the side facing the combined
// value when the interval is asymmetric (consilience.ts combineClocks: settled once, so the right answer does
// not move with the proposal).

import { registerChecker, type Answer, type Attempt, type CheckResult, type Reading } from '../../game/deductions';
import { bandHalfWidth, combineClocks, outsideCount, type ClockEstimate, type Consilience } from '../../science/consilience';
import { JULIAN_YEAR_S } from '../../science/units';
import { messageTokens, q, rangeDigits } from '../../ui/message';

export const PORTRAIT_NODE = 'portrait.together';
/** The level a proposal is accepted at (D-A28: noise must never block the truth). */
export const ACCEPT_LEVEL = 0.999;
/** The level the plate draws: each clock's own bar and the combined band. */
export const DRAWN_LEVEL = 0.95;

export type ClockId = 'fuel' | 'spot' | 'map' | 'journey';

export interface PortraitClock extends ClockEstimate {
  id: ClockId;
  /** The deduction the clock's result comes from (its How it's checked row is that node's). */
  node: string;
  /** What the clock is, in the Finder's words. */
  label: string;
  /** Its short name on the band, and what it reads (the band's second line). */
  short: string;
  reads: string;
  /** What event it dates. */
  starts: string;
}

/** The four clocks, in the order the band draws them. */
export const CLOCKS: readonly { id: ClockId; node: string; label: string; short: string; reads: string; starts: string }[] = [
  { id: 'fuel', node: 'arrival.fuelAge', label: 'the fuel', short: 'the fuel', reads: 'plutonium to thorium', starts: 'when its heat source was made' },
  { id: 'spot', node: 'spot.age', label: 'the uranium spot', short: 'the spot', reads: 'uranium-234 grown in', starts: 'when the spot was laid on the cover' },
  { id: 'map', node: 'trail.when', label: 'the map, read from the warm-white star', short: 'the map', reads: 'from the warm-white star', starts: "when the map's periods were measured" },
  { id: 'journey', node: 'trail.age', label: 'the journey, distance over speed', short: 'the journey', reads: 'distance over speed', starts: 'when the machine left' },
];

export type LastOk = (id: string) => Attempt | undefined;

const years = (si: number): number => si / JULIAN_YEAR_S;
const readNum = (a: Attempt, key: string): number | null => {
  const r = a.result.find((x) => x.key === key);
  return r && typeof r.value === 'number' && r.dim === 'time' ? r.value : null;
};

/** One clock's estimate and 95% interval, years, from its confirmed attempt; null when it is not confirmed or does not hold them. */
export function clockFrom(id: ClockId, a: Attempt | undefined): { estimate: number; lo: number; hi: number } | null {
  if (!a || !a.ok) return null;
  if (id === 'fuel' || id === 'spot') {
    const e = readNum(a, 'age');
    const lo = readNum(a, 'age low, 95%');
    const hi = readNum(a, 'age high, 95%');
    return e !== null && lo !== null && hi !== null ? { estimate: years(e), lo: years(lo), hi: years(hi) } : null;
  }
  const t = messageTokens(a.message).filter((x) => x.dim === 'time');
  const pick = id === 'map' ? t.slice(0, 3) : t.slice(1, 4);
  if (pick.length !== 3) return null;
  const [e, lo, hi] = pick.map((x) => years(x.si)) as [number, number, number];
  return { estimate: e, lo, hi };
}

/** The clocks the player has confirmed, in band order (some may be missing on an old save). */
export function clocksFrom(lastOk: LastOk): PortraitClock[] {
  return CLOCKS.flatMap((c) => {
    const v = clockFrom(c.id, lastOk(c.node));
    return v ? [{ ...c, ...v }] : [];
  });
}

/** The four clocks combined. Throws unless all four are in. */
export function combine(clocks: readonly PortraitClock[]): Consilience {
  if (clocks.length !== CLOCKS.length) throw new Error('Not every clock is read yet: confirm the four clocks first.');
  // Independent (see the header): no correlations passed.
  return combineClocks(clocks);
}

function obj(answer: Answer): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('Propose a time: { yearsAgo }.');
  return answer;
}

/** A p value as the message writes it (three figures; under 0.001 written as such). */
export function pText(p: number): string {
  return p < 0.001 ? 'under 0.001' : String(Number(p.toPrecision(2)));
}

/** portrait.together: is this time when every clock says the machine left? `clocks` are the player's own four. */
export function checkTogether(answer: Answer, clocks: readonly PortraitClock[]): CheckResult {
  const v = obj(answer).yearsAgo;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e7) throw new Error('yearsAgo must be a number of years from 0 upward.');
  const c = combine(clocks);
  const half95 = bandHalfWidth(c.sigma, DRAWN_LEVEL);
  const half999 = bandHalfWidth(c.sigma, ACCEPT_LEVEL);
  const lo = c.mean - half95;
  const hi = c.mean + half95;
  const ok = Math.abs(v - c.mean) <= half999;
  const Y = JULIAN_YEAR_S;
  const d = rangeDigits('time', Math.max(Math.abs(v), hi) * Y, (hi - lo) * Y);
  const qy = (y: number, digits = d): string => q('time', y * Y, digits);
  const heaviest = clocks.reduce((best, k, i) => ((c.weights[i] as number) > (c.weights[clocks.indexOf(best)] as number) ? k : best), clocks[0] as PortraitClock);
  const agreeing = `chi-square ${c.chi2.toFixed(1)} for ${c.dof} degrees of freedom, p ${pText(c.p)}`;
  const out = outsideCount(clocks, v);
  const together = `The four clocks meet at ${qy(c.mean)} ago (95%: ${qy(lo)} to ${qy(hi)}); ${heaviest.label}, the narrowest, carries most of the weight. Their scatter about it is ${c.p >= 0.001 ? 'what their own errors allow' : 'wider than their own errors allow'} (${agreeing}).`;
  if (ok) {
    const result: Reading[] = [
      { key: 'when it left', value: c.mean * Y, dim: 'time' },
      { key: '95% low', value: lo * Y, dim: 'time' },
      { key: '95% high', value: hi * Y, dim: 'time' },
      { key: 'clocks agreeing, p', value: Number(c.p.toPrecision(3)) },
      { key: 'clocks', value: clocks.length },
    ];
    return {
      ok: true,
      result,
      message:
        `${together} Your marker at ${qy(v)} lies with them${out > 0 ? `, though outside ${out} of the four clocks' own 95% bars` : ', inside every clock\'s own 95% bar'}. ` +
        'Nuclear decay twice, the spin of the pulsars and the motion of the stars tell one story: the machine left the warm-white star that long ago. ' +
        'Strictly, each clock starts at its own event (' +
        CLOCKS.map((k) => `${k.label.replace(/, .*$/, '')} ${k.starts}`).join('; ') +
        '); those events lie a few years apart, far inside these bars.',
    };
  }
  const away = Math.abs(v - c.mean);
  return {
    ok: false,
    result: [
      { key: 'proposed', value: v * Y, dim: 'time' },
      { key: 'outside the 95% bars of', value: `${out} of ${clocks.length} clocks` },
      { key: 'where the clocks agree', value: c.mean * Y, dim: 'time' },
      { key: '95% low', value: lo * Y, dim: 'time' },
      { key: '95% high', value: hi * Y, dim: 'time' },
    ],
    message:
      `${qy(v)} ago lies outside ${out} of the four clocks' own 95% bars, and ${qy(away, 2)} ${v < c.mean ? 'too recent' : 'too long ago'} for the clocks together: ` +
      `they agree at ${qy(c.mean)} ago (95%: ${qy(lo)} to ${qy(hi)}). Move the marker into the bright band: the narrowest bar counts most, so the answer lies in it or right beside it.`,
  };
}

/** Register the checker over a lookup of confirmed results (the browser passes the game's saved attempts). */
export function registerPortraitCheckers(lastOk: LastOk): void {
  registerChecker(PORTRAIT_NODE, (a) => checkTogether(a, clocksFrom(lastOk)));
}
