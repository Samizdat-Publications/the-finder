// Every message of The Map, The Spot and The Trail, right and wrong, as their Node tests play them for the
// default seed (map.test.ts, spot checkers.test.ts, trail.test.ts), rendered with the human gloss off: no SI or
// human unit word (tests/support/units.ts); with it on, every quantity in the alien's units with its human
// reading in parentheses, once. Check id: messages.alienUnits.m4.
import { describe, expect, it } from 'vitest';
import spotJson from '../../data/spot.json';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { UNIT_AFTER_NUMBER, UNIT_WORDS, messageUnitProblems } from '../../tests/support/units';
import { checkIdentify, checkMotion, checkOld, checkPeriods, checkRegion } from '../chapters/map/checkers';
import { CLOCK_N, bestAxisOnGrid, clockCrossingYearsAgo, galacticOf, isPass1Anchor, isYoung, matchOf, skyAges } from '../chapters/map/mapMath';
import { buildEpochModel } from '../chapters/shared/epochModel';
import { checkAge as checkSpotAge, checkFind, checkPurity } from '../chapters/spot/checkers';
import { spotModel } from '../chapters/spot/data';
import { checkAge, checkNeighbour, checkOrigin, checkWhen, checkWhere } from '../chapters/trail/checkers';
import { homeId, meeting, nextBest, originRow, regionStars, rulerReading } from '../chapters/trail/physics';
import { DEFAULT_SEED, type Answer } from '../game/deductions';
import { renderMessage } from './message';
import { cross, norm, scale, sub, type Vec3 } from '../science/astro';
import { ageFromU234 } from '../science/clocks';
import { naturalStartRatio } from '../science/spot';
import { starStateAt } from '../science/epoch';

const inputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };
const m = buildEpochModel(inputs, DEFAULT_SEED);
const messages: { id: string; text: string }[] = [];
const add = (id: string, r: { message: string }): void => void messages.push({ id, text: r.message });
const DAY = 86_400;

describe('M4 messages in the alien units', () => {
  it('The Map: right and wrong answers', () => {
    const truth: Answer = Object.fromEntries(m.lines.map((l) => [String(l.order), l.jname]));
    const old = m.lines.filter((l) => !isYoung(m.byJ.get(l.jname)!));
    for (const l of old) add('map.periods', checkPeriods(m, { line: l.order, jname: l.jname }));
    const lm1 = matchOf(m, 1, 1);
    add('map.periods', checkPeriods(m, { line: 1, jname: lm1.runnerUp!.entry.jname }));
    add('map.periods', checkPeriods(m, { line: 1, jname: m.lines.find((l) => l.order === 11)!.jname }));
    const crab = m.lines.find((l) => l.bname === 'B0531+21')!;
    add('map.periods', checkPeriods(m, { line: crab.order, jname: crab.jname }));
    const anchor = old.find((l) => isPass1Anchor(m, l.order))!;
    const at = clockCrossingYearsAgo(m.byJ.get(anchor.jname)!, anchor, CLOCK_N)!;
    const olds: Answer[] = [{ yearsAgo: at, matched: { [String(anchor.order)]: anchor.jname } }, { yearsAgo: m.disc.yearsAfterLaunch }, { yearsAgo: -2000 }, { yearsAgo: 150_000 }];
    for (const a of olds) add('map.old', checkOld(m, a));
    add('map.identify', checkIdentify(m, truth));
    add('map.identify', checkIdentify(m, { ...(truth as Record<string, Answer>), '1': lm1.runnerUp!.entry.jname }));
    add('map.identify', checkIdentify(m, { '1': m.lines[0]!.jname }));
    const pts = skyAges(m);
    const c = bestAxisOnGrid(pts, 1);
    add('map.motion', checkMotion(m, bestAxisOnGrid(pts, 0.05, { lDeg: c.lDeg, bDeg: c.bDeg, spanDeg: 1.5 })));
    const v = m.motionFit().velKmS as Vec3;
    add('map.motion', checkMotion(m, galacticOf(scale(cross(v, [0, 0, 1]), 1 / norm(cross(v, [0, 0, 1]))))));
    const reg = m.region();
    add('map.region', checkRegion(m, { x: reg.centerPc[0], y: reg.centerPc[1] }));
    add('map.region', checkRegion(m, { x: 20, y: -20 }));
  }, 120_000);

  it('The Spot: right and wrong answers', () => {
    const s = spotModel(DEFAULT_SEED);
    const [cx, cy] = spotJson.centreMm as [number, number];
    for (const p of [{ xMm: cx, yMm: cy }, { xMm: 150, yMm: 270 }, { xMm: cx + 18, yMm: cy }]) add('spot.find', checkFind(p, s));
    const a = ageFromU234(s.session.countsAt(DAY));
    for (const ans of [{ countingTimeS: DAY, ageYears: a.ageYears }, { countingTimeS: DAY, ageYears: a.hi * 1.2 }, { countingTimeS: 5, ageYears: 44_000 }, { countingTimeS: 100, ageYears: 44_000 }]) add('spot.age', checkSpotAge(ans, s));
    for (const r0 of [0, naturalStartRatio(), 1]) add('spot.purity', checkPurity({ countingTimeS: DAY, startA234overA238: r0 }, s));
    add('spot.purity', checkPurity({ countingTimeS: 30, startA234overA238: 0 }, s));
  });

  it('The Trail: right and wrong answers', () => {
    const row = originRow(m);
    add('trail.origin', checkOrigin(m, { starId: 0 }));
    add('trail.origin', checkOrigin(m, { starId: nextBest(m).row.star.id }));
    add('trail.origin', checkOrigin(m, { starId: homeId(m) }));
    const noRv = [...m.inputs.stars.near, ...m.inputs.stars.sky]
      .filter((x) => x.rvKmS === null && x.distPc !== null && x.id !== 0)
      .find((x) => norm(sub(starStateAt(x, m.disc.decimalYear).posPc, m.disc.craft.posPc)) <= 10)!;
    add('trail.origin', checkOrigin(m, { starId: noRv.id }));
    const [lo, hi] = row.measuredDistOverSpeedInterval95;
    for (const y of [Math.round(meeting(m, row.star).yearsAgo), lo - 2000, hi + 2000]) add('trail.age', checkAge(m, { years: y }));
    add('trail.neighbour', checkNeighbour(m, { distancePc: rulerReading(m, row.star).distPc }));
    add('trail.neighbour', checkNeighbour(m, { distancePc: rulerReading(m, nextBest(m).row.star).distPc }));
    const stars = regionStars(m);
    add('trail.where', checkWhere(m, { starId: 0 }));
    add('trail.where', checkWhere(m, { starId: stars.find((x) => x.inside && x.star.id !== 0 && x.star.id !== homeId(m))!.star.id }));
    add('trail.where', checkWhere(m, { starId: stars.find((x) => !x.inside)!.star.id }));
    const sun = m.ages('sun').combined;
    for (const a of [{ yearsAgo: Math.round(sun.estimate), frame: 0 }, { yearsAgo: Math.round(sun.estimate), frame: nextBest(m).row.star.id }, { yearsAgo: Math.round(sun.estimate), frame: 'own' }, { yearsAgo: Math.round(sun.hi + 3000), frame: 0 }]) {
      add('trail.when', checkWhen(m, a));
    }
  }, 120_000);

  it('prints a few rendered messages for the record', () => {
    for (const x of messages.filter((_, i) => i % 6 === 0)) console.log(`[messages] ${x.id}: ${renderMessage(x.text, false)}`);
  });

  it('none shows a human unit with the gloss off; each quantity shows its human reading once with it on', () => {
    const problems = messages.flatMap((x) => messageUnitProblems(x.text).map((p) => `${x.id}: ${p}`));
    const ids = [...new Set(messages.map((x) => x.id))];
    recordCheck({
      id: 'messages.alienUnits.m4',
      claim: 'Every result message of The Map, The Spot and The Trail writes its quantities in the alien\'s units when the human gloss is off, and adds the human reading in parentheses when it is on.',
      measured: `${messages.length} messages from ${ids.length} deductions, right and wrong answers, default seed: ${problems.length} problems${problems.length ? `: ${problems.slice(0, 3).join(' | ')}` : ''}`,
      expected: `no unit word with the gloss off (${UNIT_WORDS.length} words anywhere, ${UNIT_AFTER_NUMBER.length} symbols after a number); one human reading per quantity with it on`,
      tolerance: 'exact',
      pass: problems.length === 0,
    });
    expect(problems).toEqual([]);
  });
});
