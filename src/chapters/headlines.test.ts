// Every confirmed result leads with a headline (M4 step 7e): for each deduction a Node test can confirm, the
// chapter's headline table finds its quantity in the checker's real confirmed result (the same answers the
// seed check and the whole-game bot propose, default seed), the number is the checker's own (a reading's value
// or a message token), and the sentence carries no digits. The Pictures and player.firstSound need the decoded
// tape and the turntable, so the whole-game bot checks theirs in the browser (tests/browser/game.browser.mjs).
// Check id: ui.headlines.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { DEFAULT_SEED, type CheckResult } from '../game/deductions';
import { NODES } from '../game/graph';
import { R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM } from '../record/groove';
import { ageFromU234 } from '../science/clocks';
import { headlineOf } from '../ui/headline';
import { messageTokens } from '../ui/message';
import { checkFuelAge, checkHeat, checkMadeNotMined, checkPurpose } from './arrival/checkers';
import { arrivalModel } from './arrival/data';
import { HEADLINES } from './headlines';
import { checkBinary } from './key/binary';
import { checkTimesNotLengths, checkUnit, pulsarRange } from './key/readings';
import { checkIdentify, checkMotion, checkOld, checkPeriods, checkRegion } from './map/checkers';
import { CLOCK_N, bestAxisOnGrid, clockCrossingYearsAgo, isPass1Anchor, isYoung, skyAges } from './map/mapMath';
import { checkDirection, checkSpeed, checkStart } from './player/checkers';
import { TRUE_PERIOD_S } from './player/physics';
import { parseCoverSvg } from './shared/coverSvg';
import { buildEpochModel } from './shared/epochModel';
import { checkAge as checkSpotAge, checkFind, checkPurity } from './spot/checkers';
import { SPOT, spotModel } from './spot/data';
import { checkAge, checkNeighbour, checkOrigin, checkWhen, checkWhere } from './trail/checkers';
import { meeting, originRow, rulerReading } from './trail/physics';
import { checkTogether, clocksFrom, combine } from './portrait/checkers';

const DAY_S = 86_400;

function confirmedResults(): Record<string, CheckResult> {
  const out: Record<string, CheckResult> = {};
  const a = arrivalModel(DEFAULT_SEED);
  out['arrival.purpose'] = checkPurpose('radio', a);
  out['arrival.heat'] = checkHeat('decay', a);
  out['arrival.madeNotMined'] = checkMadeNotMined('made', a);
  out['arrival.fuelAge'] = checkFuelAge('pu238', a);

  const svg = parseCoverSvg(readFileSync(resolve(process.cwd(), 'public/media/cover/cover.svg'), 'utf8'));
  const voyager = JSON.parse(readFileSync(resolve(process.cwd(), 'public/media/models/voyager.json'), 'utf8')) as { recordDisc: { radius: number }; extents: { min: number[]; max: number[] } };
  const span = Math.max(...voyager.extents.max.map((v, i) => v - (voyager.extents.min[i] as number)));
  const keyIn = { cover: loadCover(), recordRadiusM: voyager.recordDisc.radius, craftSpanM: span, pulsars: pulsarRange(loadPulsars()) };
  out['key.binary'] = checkBinary(svg.groups, { reading: 'positional', one: 'across' });
  out['key.unit'] = checkUnit(keyIn, 'hyperfine');
  out['key.timesNotLengths'] = checkTimesNotLengths(keyIn, 'times');

  out['player.speed'] = checkSpeed({ secondsPerTurn: TRUE_PERIOD_S });
  out['player.start'] = checkStart({ radiusMm: (R_OUTER_MUSIC_MM + R_LEAD_IN_OUTER_MM) / 2 });
  out['player.direction'] = checkDirection({ direction: 'cw' });

  const m = buildEpochModel({ scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() }, DEFAULT_SEED);
  const anchors = m.lines.filter((l) => !isYoung(m.byJ.get(l.jname)!) && isPass1Anchor(m, l.order));
  const first = anchors[0]!;
  out['map.periods'] = checkPeriods(m, { line: first.order, jname: first.jname });
  out['map.old'] = checkOld(m, { yearsAgo: clockCrossingYearsAgo(m.byJ.get(first.jname)!, first, CLOCK_N)!, matched: Object.fromEntries(anchors.slice(0, 3).map((l) => [String(l.order), l.jname])) });
  out['map.identify'] = checkIdentify(m, Object.fromEntries(m.lines.map((l) => [String(l.order), l.jname])));
  const coarse = bestAxisOnGrid(skyAges(m), 1);
  const fine = bestAxisOnGrid(skyAges(m), 0.05, { lDeg: coarse.lDeg, bDeg: coarse.bDeg, spanDeg: 1.5 });
  out['map.motion'] = checkMotion(m, { lDeg: fine.lDeg, bDeg: fine.bDeg });
  const c = m.region().centerPc;
  out['map.region'] = checkRegion(m, { x: c[0], y: c[1] });

  const s = spotModel(DEFAULT_SEED);
  out['spot.find'] = checkFind({ xMm: SPOT.centreMm[0], yMm: SPOT.centreMm[1] }, s);
  out['spot.age'] = checkSpotAge({ countingTimeS: DAY_S, ageYears: ageFromU234(s.session.countsAt(DAY_S)).ageYears }, s);
  out['spot.purity'] = checkPurity({ countingTimeS: DAY_S, startA234overA238: 0 }, s);

  const row = originRow(m);
  out['trail.origin'] = checkOrigin(m, { starId: 0 });
  out['trail.age'] = checkAge(m, { years: Math.round(meeting(m, row.star).yearsAgo) });
  out['trail.neighbour'] = checkNeighbour(m, { distancePc: rulerReading(m, row.star).distPc });
  out['trail.where'] = checkWhere(m, { starId: 0 });
  out['trail.when'] = checkWhen(m, { yearsAgo: Math.round(m.ages('sun').combined.estimate), frame: 0 });

  // Portrait: the four clocks from the results above, proposed at their combined time.
  const clocks = clocksFrom((id) => (out[id] ? { answer: null, ok: out[id]!.ok, result: out[id]!.result, message: out[id]!.message, at: 0 } : undefined));
  out['portrait.together'] = checkTogether({ yearsAgo: combine(clocks).mean }, clocks);
  return out;
}

describe('result headlines', () => {
  it('every chapter table covers its deductions, and each finds its number in the real confirmed result', () => {
    const built = NODES.filter((n) => ['arrival', 'key', 'map', 'spot', 'trail', 'player', 'pictures', 'portrait'].includes(n.chapter));
    const missing = built.filter((n) => !HEADLINES[n.id]).map((n) => n.id);
    expect(missing).toEqual([]);
    const results = confirmedResults();
    const rows: string[] = [];
    for (const [id, r] of Object.entries(results)) {
      expect(r.ok, `${id} confirms on the default seed`).toBe(true);
      const h = headlineOf(HEADLINES[id], r);
      expect(h, `${id} has a headline`).not.toBeNull();
      // The sentence never carries a number (isotope names aside): the number is the checker's.
      expect(h!.sentence.replace(/(uranium|plutonium|thorium|radium)-\d+/g, ''), id).not.toMatch(/\d/);
      if (h!.quantity) {
        // A quantity is one the checker wrote: a reading's SI value or one of the message's tokens.
        const fromReading = r.result.some((x) => x.dim === h!.quantity!.dim && x.value === h!.quantity!.si);
        const fromToken = messageTokens(r.message).some((t) => t.dim === h!.quantity!.dim && t.si === h!.quantity!.si);
        expect(fromReading || fromToken, id).toBe(true);
      } else expect(h!.value === undefined || h!.value === '' ? null : h!.value, id).not.toBeNull();
      rows.push(`${id}: ${h!.label} = ${h!.quantity ? `${h!.quantity.si} SI ${h!.quantity.dim}` : String(h!.value)}`);
    }
    // A refused result has no headline: it keeps its message.
    expect(headlineOf(HEADLINES['trail.origin'], { ...results['trail.origin']!, message: 'x' })).not.toBeNull();
    recordCheck({
      id: 'ui.headlines',
      claim: 'Every confirmed result leads with a headline: each chapter names one reading (or message quantity) per deduction, the headline finds it in the checker\'s real confirmed result, the number is the checker\'s own, and the sentence under it carries no number',
      measured: `${Object.keys(results).length} deductions confirmed in Node on the default seed, each with its headline (${rows.join('; ')}); every built deduction has a table entry`,
      expected: 'a headline for every confirmed deduction (spec M4 step 7e section 1); The Pictures and player.firstSound are checked by bot.game in the browser',
      tolerance: 'exact',
      pass: true,
    });
  });
});
