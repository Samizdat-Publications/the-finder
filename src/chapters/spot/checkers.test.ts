// The Spot's checkers on the default seed and two others: each right answer confirms, each meaningful wrong
// one is rejected with what the checker computed. Truth comes from the data and the science core (data/spot.json,
// clocks.ts), not from the checkers' own earlier output.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED } from '../../game/deductions';
import { ageFromU234, testStartHypothesis } from '../../science/clocks';
import { naturalStartRatio } from '../../science/spot';
import { checkAge, checkFind, checkPurity } from './checkers';
import { SPOT, spotModel } from './data';
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
    log.push(`find: far ${checkFind({ xMm: 150, yMm: 270 }, m).message}`);
    log.push(`find: near ${checkFind({ xMm: cx + 18, yMm: cy }, m).message}`);
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
      const natural = checkPurity({ countingTimeS: DAY, startA234overA238: nat }, m);
      check(!natural.ok && /reject a start/.test(natural.message), `${seed}: natural uranium is rejected`);
      const tShort = firstTime(seed, (t) => {
        const c = m.session.countsAt(t);
        return testStartHypothesis(c, nat).pValue >= 0.05 && testStartHypothesis(c, 0).pValue >= 0.05;
      });
      check(tShort !== null, `${seed}: some short count cannot tell the starts apart`);
      const short = checkPurity({ countingTimeS: tShort!, startA234overA238: 0 }, m);
      check(!short.ok && short.message.startsWith('Count longer'), `${seed}: a ${tShort} s count cannot tell (${short.message})`);
      if (seed === DEFAULT_SEED) {
        const c = m.session.countsAt(DAY);
        log.push(`purity at 1 day: pure p ${testStartHypothesis(c, 0).pValue.toFixed(3)}, natural p ${testStartHypothesis(c, nat).pValue.toExponential(1)}; too short at ${tShort} s`);
      }
    }
    const malformed = checkPurity('pure', spotModel(DEFAULT_SEED));
    check(!malformed.ok, 'a text answer is not a reading');
    recordCheck({
      id: 'spot.checkers',
      claim: 'The Spot\'s three deductions are judged by the science: a mark inside the spot, an age inside the counts\' 95% interval, and a starting purity the counts accept while rejecting natural uranium; every wrong answer says what was computed.',
      measured: `seeds ${SEEDS.join(', ')}: all right answers confirm, all wrong ones rejected. ${log.join(' | ')}`,
      expected: 'the spot disc from data/spot.json (D-A23); the craft\'s age from the epoch model inside the one-day interval; natural uranium (activity ratio 1, secular equilibrium) rejected at p < 0.05',
      tolerance: 'exact (verdicts); the p < 0.05 threshold is the convention the spec names',
      pass,
    });
  });
});
