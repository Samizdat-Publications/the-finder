// The Spot's checkers on the default seed and two others: each right answer confirms, each meaningful wrong
// one is rejected with what the checker computed. Truth comes from the data and the science core (data/spot.json,
// clocks.ts), not from the checkers' own earlier output.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED } from '../../game/deductions';
import { renderMessage } from '../../ui/message';
import { START_P_95, ageFromU234, testStartHypothesis } from '../../science/clocks';
import { naturalStartRatio, sweepRate } from '../../science/spot';
import { REJECT_P, checkAge, checkFind, checkPurity } from './checkers';
import { SPOT, spotModel, spotStream } from './data';
import { SAMPLE_S } from './SweepPanel';
import spotJson from '../../../data/spot.json';

const SEEDS = [DEFAULT_SEED, 'spot-a', 'spot-b'];
const DAY = 86_400;
const [cx, cy] = spotJson.centreMm as [number, number];

/** The shortest whole-second count (up to 10 minutes) for which a predicate on the counts holds. */
function firstTime(seed: string, ok: (t: number) => boolean): number | null {
  for (let t = 1; t <= 600; t++) if (ok(t)) return t;
  return null;
}

describe('The Spot checkers', () => {
  const log: string[] = [];
  let pass = true;
  const check = (cond: boolean, what: string): void => {
    if (!cond) pass = false;
    expect(cond, what).toBe(true);
  };

  it('spot.find: inside the spot right, outside wrong with the computed rate', () => {
    for (const seed of SEEDS) {
      const m = spotModel(seed);
      check(checkFind({ xMm: cx, yMm: cy }, m).ok, `${seed}: the centre`);
      check(checkFind({ xMm: cx + SPOT.radiusMm - 0.1, yMm: cy }, m).ok, `${seed}: just inside the edge`);
      const far = checkFind({ xMm: 150, yMm: 270 }, m);
      check(!far.ok && /^(Nothing|Barely) above background/.test(far.message), `${seed}: far away is background (${far.message})`);
      const near = checkFind({ xMm: cx + 18, yMm: cy }, m);
      check(!near.ok && /rising/.test(near.message), `${seed}: near but outside (${near.message})`);
    }
    const m = spotModel(DEFAULT_SEED);
    // Rendered with the human gloss on for the record (messages carry tokens: src/ui/message.ts).
    log.push(`find: far ${renderMessage(checkFind({ xMm: 150, yMm: 270 }, m).message, true)}`);
    log.push(`find: near ${renderMessage(checkFind({ xMm: cx + 18, yMm: cy }, m).message, true)}`);
  });

  it('spot.age: the age inside the 95% interval confirms; outside, or a count too short, does not', () => {
    for (const seed of SEEDS) {
      const m = spotModel(seed);
      const a = ageFromU234(m.session.countsAt(DAY));
      // The truth, independent of the checker: the craft's age from the epoch model lies inside a one-day interval.
      check(a.lo < m.yearsAfterLaunch && m.yearsAfterLaunch < a.hi, `${seed}: the one-day interval holds the true age ${m.yearsAfterLaunch.toFixed(0)}`);
      check(checkAge({ countingTimeS: DAY, ageYears: m.yearsAfterLaunch }, m).ok, `${seed}: the true age confirms`);
      const outside = checkAge({ countingTimeS: DAY, ageYears: a.hi * 1.2 }, m);
      check(!outside.ok && /lies outside/.test(outside.message), `${seed}: an age above the interval is rejected`);
      const tShort = firstTime(seed, (t) => m.session.countsAt(t).u234 === 0);
      check(tShort !== null, `${seed}: some short count has no U-234 yet`);
      const short = checkAge({ countingTimeS: tShort!, ageYears: m.yearsAfterLaunch }, m);
      check(!short.ok && short.message.startsWith('Count longer'), `${seed}: a ${tShort} s count is too short (${short.message})`);
      if (seed === DEFAULT_SEED) {
        const h = ageFromU234(m.session.countsAt(3600));
        log.push(`age: 1 h ${h.ageYears.toFixed(0)} (${h.lo.toFixed(0)} to ${h.hi.toFixed(0)}); 1 day ${a.ageYears.toFixed(0)} (${a.lo.toFixed(0)} to ${a.hi.toFixed(0)}); too short at ${tShort} s`);
      }
    }
  });

  it('spot.purity: a pure start confirms, natural uranium does not, a count too short cannot tell', () => {
    const nat = naturalStartRatio();
    for (const seed of SEEDS) {
      const m = spotModel(seed);
      const ok = checkPurity({ countingTimeS: DAY, startA234overA238: 0 }, m);
      check(ok.ok, `${seed}: a pure start confirms (${ok.message})`);
      // The message says the level the start reaches (D-A28): inside the 95% range, or at the edge inside 99.9%.
      const pureP = testStartHypothesis(m.session.countsAt(DAY), 0).pValue;
      check(pureP >= START_P_95 ? /inside the 95% range/.test(ok.message) : /at the edge/.test(ok.message), `${seed}: the level is said (p ${pureP.toFixed(3)})`);
      const natural = checkPurity({ countingTimeS: DAY, startA234overA238: nat }, m);
      check(!natural.ok && /reject a start/.test(natural.message), `${seed}: natural uranium is rejected`);
      // A refused start points to the counts' own fitted start and the range they accept (M4 science audit finding 6).
      check(/own best start/.test(natural.message) && /accept starts from/.test(natural.message), `${seed}: the refusal points to the fitted start`);
      const shown = ok.result.find((r) => r.key === 'starts these counts accept, 95%')?.value;
      // 0 is inside the drawn 95% range exactly when its own p-value is at least 0.05; else the range is open at 0.
      const startsAt = pureP >= START_P_95 ? /^0 to / : /^just above 0 to /;
      check(typeof shown === 'string' && startsAt.test(shown), `${seed}: the 95% range of starts is shown (${String(shown)})`);
      const tShort = firstTime(seed, (t) => {
        const c = m.session.countsAt(t);
        return testStartHypothesis(c, nat).pValue >= REJECT_P && testStartHypothesis(c, 0).pValue >= REJECT_P;
      });
      check(tShort !== null, `${seed}: some short count cannot tell the starts apart`);
      const short = checkPurity({ countingTimeS: tShort!, startA234overA238: 0 }, m);
      check(!short.ok && short.message.startsWith('Count longer'), `${seed}: a ${tShort} s count cannot tell (${short.message})`);
      if (seed === DEFAULT_SEED) {
        const c = m.session.countsAt(DAY);
        log.push(`purity at 1 day: pure p ${testStartHypothesis(c, 0).pValue.toFixed(3)}, natural p ${testStartHypothesis(c, nat).pValue.toExponential(1)}; starts accepted ${String(shown)}; too short at ${tShort} s`);
      }
    }
    const malformed = checkPurity('pure', spotModel(DEFAULT_SEED));
    check(!malformed.ok, 'a text answer is not a reading');
    recordCheck({
      id: 'spot.checkers',
      claim: 'The Spot\'s three deductions are judged by the science: a mark inside the spot, an age inside the counts\' 95% interval, and a starting purity the counts accept while rejecting natural uranium; every wrong answer says what was computed.',
      measured: `seeds ${SEEDS.join(', ')}: all right answers confirm, all wrong ones rejected. ${log.join(' | ')}`,
      expected: 'the spot disc from data/spot.json (D-A23); the craft\'s age from the epoch model inside the one-day interval; a pure start accepted when consistent at the 99.9% level, natural uranium (activity ratio 1, secular equilibrium) refused at p < 0.001; the drawn range of starts at 95%',
      tolerance: 'exact (verdicts); accept at p >= 0.001 (D-A28, amended 2026-10-22), with the Chernoff boundary p-value at a pure start (clocks.ts startPValue)',
      pass,
    });
  });
});

describe('the sweep readout, replayed', () => {
  it("chapter.spot's 5.3 counts per second over the spot is the seeded noise of the default seed, not a bug", () => {
    // The instrument samples the seed's sweep stream every 0.2 s (SweepPanel.tsx SAMPLE_S) and shows the counts of
    // the last 15 samples over 3 s. Under a mean of 10 per sample a Poisson draw uses exactly one uniform
    // (random.ts), so the stream's i-th sample over the spot's centre is fixed whatever came before it. Replay:
    // every 15-sample window of the default seed's stream at the centre's rate (spot.ts sweepRate).
    const m = spotModel(DEFAULT_SEED);
    const perS = sweepRate(m.sweep, 0) + m.sweep.backgroundPerS;
    const rng = spotStream(DEFAULT_SEED, 'sweep');
    const n = Array.from({ length: 80 }, () => rng.poisson(perS * SAMPLE_S));
    const windows = n.map((_, k) => (k >= 15 ? n.slice(k - 15, k).reduce((a, b) => a + b, 0) : null));
    const shown = 5.333; // chapter.spot's reading over the spot (16 counts in 3 s), from the browser run's record
    const hits = windows.map((w, k) => (w !== null && Math.abs(w / (15 * SAMPLE_S) - shown) < 0.001 ? k : null)).filter((k): k is number => k !== null);
    // The bot dwells about 3.4 s far away, sweeps up for about 2 s, then 3.4 s over the spot: its window ends
    // near sample 40 to 50 (17 + 10 + 17 samples at 0.2 s), where the replay must give the shown reading.
    const plausible = hits.filter((k) => k >= 35 && k <= 55);
    const mu = 15 * perS * SAMPLE_S;
    let cdf = 0;
    let term = Math.exp(-mu);
    for (let k = 0; k < 16; k++) {
      cdf += term;
      term *= mu / (k + 1);
    }
    console.log(`sweep replay: model ${perS.toFixed(3)} /s over the centre (${mu.toFixed(2)} counts per window); 16-count windows end at samples ${hits.join(', ')}; P(16 or more) ${(1 - cdf).toFixed(4)}`);
    recordCheck({
      id: 'spot.sweepReplay',
      claim: "The Spot's sweep readout is the seeded counting noise: the 5.3 counts per second a browser run showed over the spot, against the model's 2.9, is what the default seed's stream gives there.",
      measured: `model ${perS.toFixed(3)} counts/s over the centre; the default seed's 15-sample windows give 16 counts (5.333/s) when they end at samples ${hits.join(', ')}; the chance of 16 or more in one window is ${((1 - cdf) * 100).toFixed(1)}%`,
      expected: 'the browser reading (chapter.spot: 5.333 /s) reproduced by the stream at the bot\'s dwell (window ending near sample 40 to 50)',
      tolerance: 'exact counts (one uniform per sample)',
      pass: plausible.length > 0,
      notes: 'The M4 science audit asked whether 5.3 against 2.9 was noise or a bug (finding 11): a high run of the seed\'s stream, not a bug.',
    });
    expect(plausible.length).toBeGreaterThan(0);
  });
});
