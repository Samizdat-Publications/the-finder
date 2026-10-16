// The Map's five checkers, on the shared epoch model for the playthrough's seed (epochModel(seed) throws
// until the star catalogues are loaded, so the bus refuses a proposal instead of recording it). Every
// judgement is the science's: the likelihood identification (D-A16), the own-frame ages, the motion fit and
// the origin region (rule 1). Every wrong answer says what it computed. Pure: no DOM.

import { registerChecker, type Answer, type Checker, type CheckResult, type Reading } from '../../game/deductions';
import { angleBetweenDeg, scale, norm, type Vec3 } from '../../science/astro';
import { axisDeltaChi2 } from '../../science/pulsarAge';
import { ANCHOR_LOG10_MARGIN } from '../../science/pulsarIdentify';
import { SSD72_SIG_FIGS, mapPeriod } from '../../science/pulsars';
import { CHI2_2DOF_95, insideRegion, regionLevel } from '../../science/triangulation';
import { HYDROGEN_HZ, JULIAN_YEAR_S, PARSEC_KM } from '../../science/units';
import { q, rangeDigits } from '../../ui/message';
import { onContour } from '../shared/contour';
import { epochModel, type EpochModel } from '../shared/epochModel';
import {
  axisFromGalactic, axisLineFit, bearingResiduals, candidateReadout, galacticOf, isYoung, lengthMisfit, lineIsOld, lineOf, log10BestOver, mapPoints, matchOf,
  PRESELECT_DIRECTION_DEG, skyAges, starsInRegion, type CandidateReadout,
} from './mapMath';
import { oddsText, timesText } from './odds';

export const MAP_NODE_IDS = ['map.periods', 'map.old', 'map.identify', 'map.motion', 'map.region'] as const;
export type MapNodeId = (typeof MAP_NODE_IDS)[number];

const years = (key: string, y: number): Reading => ({ key, value: y * JULIAN_YEAR_S, dim: 'time' });
const secs = (key: string, s: number): Reading => ({ key, value: s, dim: 'time' });
const pcLen = (key: string, pc: number): Reading => ({ key, value: pc * PARSEC_KM * 1000, dim: 'length' });
const sig = (x: number, d = 3): string => Number(x.toPrecision(d)).toLocaleString('en-US', { maximumFractionDigits: 20 });
const deg = (x: number, d = 1): string => `${x.toFixed(d)} deg`;
const name = (r: { bname: string | null; jname: string }): string => `PSR ${r.bname ?? r.jname}`;
/** Quantities in messages, as tokens the interface writes in the alien's units (src/ui/message.ts). */
const qs = (s: number, d?: number): string => q('time', s, d);
const qy = (y: number, d?: number): string => q('time', y * JULIAN_YEAR_S, d);
const qpc = (pc: number, d?: number): string => q('length', pc * PARSEC_KM * 1000, d);

function obj(answer: Answer, what: string): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error(`Propose ${what} as an object.`);
  return answer;
}
function num(a: Record<string, Answer>, k: string, min: number, max: number): number {
  const v = a[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${k} must be a number from ${min} to ${max}.`);
  return v;
}
function order(v: Answer | undefined, model: EpochModel): number {
  if (typeof v !== 'number' || !model.lines.some((l) => l.order === v)) throw new Error(`line must be one of the map's lines, 1 to ${model.lines.length}.`);
  return v;
}
function pulsar(v: Answer | undefined): string {
  if (typeof v !== 'string' || !v) throw new Error('jname must be a pulsar\'s name in your catalogue.');
  return v;
}

/** The readings every line-and-pulsar answer shows. */
function lineReadings(r: CandidateReadout): Reading[] {
  const out: Reading[] = [
    { key: 'line', value: r.order },
    { key: 'pulsar', value: name(r) },
    secs('map period', r.mapPeriodS),
    secs('period now', r.periodNowS),
    { key: 'direction offset', value: deg(r.dLonDeg) },
    { key: 'latitude offset', value: r.dLatDeg === null ? 'the tick does not resolve' : deg(r.dLatDeg) },
  ];
  out.push({ key: 'match quality', value: r.notConsidered ? 'not considered' : oddsText(r.log10Odds as number) });
  return out;
}

const NOT_CONSIDERED: Record<'direction' | 'age', string> = {
  direction: `its direction is more than ${PRESELECT_DIRECTION_DEG} deg from the line, beyond the pre-selection's tolerance`,
  age: "no age the Arrival clock allows makes its period reach the map's number, for any braking index",
};

function ppm(r: CandidateReadout): string {
  return `${sig(((r.periodNowS - r.mapPeriodS) / r.mapPeriodS) * 1e6)} parts per million`;
}

/** What a line that is not a pass-1 anchor needs, said as the young lines say theirs. */
const NEEDS_AGE = "By period, direction and latitude alone, all you can use before the map is dated, this line does not stand out; it will once the map's age and origin are known. Start with a line that stands out on its own.";

/**
 * map.periods: one old line read as the period of the pulsar the player put on it. Judged on pass 1 of the
 * identification (period, direction and latitude; the map's age and origin are not known yet): accepted only
 * for a pass-1 anchor, the line's best candidate with odds of at least 20 to 1 (ANCHOR_LOG10_MARGIN), and not
 * young (M4 science audit finding 1).
 */
export function checkPeriods(model: EpochModel, answer: Answer): CheckResult {
  const a = obj(answer, 'a line and a pulsar');
  const o = order(a.line, model);
  const jname = pulsar(a.jname);
  if (!model.byJ.has(jname)) return { ok: false, result: [{ key: 'pulsar', value: jname }], message: `${jname} is not in your catalogue.` };
  const r = candidateReadout(model, o, jname, 1);
  const lm = matchOf(model, o, 1);
  const result = lineReadings(r);
  const young = r.young || !lineIsOld(model, o);
  if (r.notConsidered) {
    return { ok: false, result, message: `${name(r)} cannot be line ${o}'s star: ${NOT_CONSIDERED[r.notConsidered]}. It ticks at ${qs(r.periodNowS, 6)} against the map's ${qs(r.mapPeriodS, 6)} and lies ${deg(Math.abs(r.dLonDeg))} from the line.` };
  }
  if (young) {
    return { ok: false, result, message: `${name(r)} slows quickly (it is young): its period changes too fast to match by period alone. It ticks at ${qs(r.periodNowS, 4)} now against the map's ${qs(r.mapPeriodS, 4)}; come back to this line once the map's age is known.` };
  }
  if (!r.best) {
    return { ok: false, result, message: `${name(r)} fits line ${o} less well than another pulsar along it: it ticks at ${qs(r.periodNowS, 6)} now (${ppm(r)} from the map's number), lies ${deg(Math.abs(r.dLonDeg))} from the line, and its odds against the other candidates are ${oddsText(r.log10Odds as number)}. ${NEEDS_AGE}` };
  }
  if (lm.log10Odds < ANCHOR_LOG10_MARGIN) {
    return { ok: false, result, message: `${name(r)} is the best fit to line ${o}, but not by enough: its odds against the other candidates are ${oddsText(lm.log10Odds)}, under the ${sig(10 ** ANCHOR_LOG10_MARGIN, 2)} to 1 that counts as strong evidence. ${NEEDS_AGE}` };
  }
  return {
    ok: true,
    result,
    message: `Line ${o}'s number is a period: ${name(r)}, ${deg(Math.abs(r.dLonDeg))} from the line, ticks at ${qs(r.periodNowS, 6)}, ${ppm(r)} slower than the map's ${qs(r.mapPeriodS, 6)}, and by period, direction and latitude alone no other pulsar along the line comes close (odds ${oddsText(lm.log10Odds)}).`,
  };
}

/** The old lines whose 95% age intervals count for map.old: the instrument's matched lines when given, otherwise every old line. */
function oldIntervals(model: EpochModel, matched: Record<string, Answer> | null): { order: number; bname: string | null; jname: string; lo: number; hi: number; median: number }[] {
  const out: { order: number; bname: string | null; jname: string; lo: number; hi: number; median: number }[] = [];
  for (const lm of model.identification().lines) {
    const b = lm.best;
    if (!b || isYoung(b.entry)) continue;
    if (matched && matched[String(lm.line.order)] !== b.entry.jname) continue;
    const a = model.ageOf(lm.line.order, b.entry.jname, 'own');
    out.push({ order: lm.line.order, bname: b.entry.bname, jname: b.entry.jname, lo: a.lo, hi: a.hi, median: a.median });
  }
  return out;
}

/** map.old: a time on the spin-down clock where the matched pulsars tick at the map's numbers. */
export function checkOld(model: EpochModel, answer: Answer): CheckResult {
  const a = obj(answer, 'a time on the clock');
  const yearsAgo = num(a, 'yearsAgo', -1e6, 1e6);
  const matched = a.matched === undefined ? null : obj(a.matched, 'the matched lines');
  const iv = oldIntervals(model, matched);
  if (!iv.length) return { ok: false, result: [years('years ago', yearsAgo)], message: 'None of the lines you matched is an old one yet: match a line whose pulsar slows slowly first.' };
  const slower = iv.filter((x) => model.byJ.get(x.jname)!.pObs > mapPeriod(lineOf(model, x.order), HYDROGEN_HZ)).length;
  const result: Reading[] = [years('years ago', yearsAgo), { key: 'matched old lines', value: iv.length }, { key: 'tick slower now than on the map', value: `${slower} of ${iv.length}` }];
  if (yearsAgo <= 0) {
    return {
      ok: false,
      result,
      message: slower === iv.length
        ? `Every matched pulsar ticks slower now than the map says (${slower} of ${iv.length}), and pulsars only slow down: the map cannot be from the future, nor from now.`
        : `${slower} of ${iv.length} matched pulsars tick slower now than the map says; the map's numbers are not today's.`,
    };
  }
  const hit = iv.filter((x) => yearsAgo >= x.lo && yearsAgo <= x.hi);
  const lo = Math.min(...iv.map((x) => x.median));
  const hi = Math.max(...iv.map((x) => x.median));
  result.push(years('youngest line age', lo), years('oldest line age', hi));
  if (!hit.length) {
    const near = [...iv].sort((p, q) => Math.min(Math.abs(yearsAgo - p.lo), Math.abs(yearsAgo - p.hi)) - Math.min(Math.abs(yearsAgo - q.lo), Math.abs(yearsAgo - q.hi)))[0]!;
    const dn = rangeDigits('time', near.hi * JULIAN_YEAR_S, (near.hi - near.lo) * JULIAN_YEAR_S);
    return { ok: false, result, message: `At ${qy(yearsAgo)} ago no matched pulsar ticks at the map's number within its error. The nearest is line ${near.order} (${name(near)}), whose period met the map's ${qy(near.lo, dn)} to ${qy(near.hi, dn)} ago (95%).` };
  }
  const h = hit[0]!;
  // Do the matched lines share one age? Only if their 95% intervals have a common point.
  const agree = Math.max(...iv.map((x) => x.lo)) <= Math.min(...iv.map((x) => x.hi));
  const tail = iv.length < 2
    ? ' Match more old lines to see whether they all agree.'
    : agree
      ? ` The ${iv.length} matched old lines agree so far: their ages run from ${qy(lo)} to ${qy(hi)}, within their errors.`
      : ` But the ${iv.length} matched old lines do not agree on one age: their ages run from ${qy(lo)} to ${qy(hi)}, and no single time lies inside every one of their 95% ranges. Something is shifting them.`;
  return {
    ok: true,
    result,
    message: `The map is old: ${qy(yearsAgo)} ago line ${h.order}'s pulsar (${name(h)}) ticked at the map's number (95%: ${qy(h.lo, rangeDigits('time', h.hi * JULIAN_YEAR_S, (h.hi - h.lo) * JULIAN_YEAR_S))} to ${qy(h.hi, rangeDigits('time', h.hi * JULIAN_YEAR_S, (h.hi - h.lo) * JULIAN_YEAR_S))}).${tail}`,
  };
}

/** map.identify: a pulsar for every line. */
export function checkIdentify(model: EpochModel, answer: Answer): CheckResult {
  const a = obj(answer, 'a pulsar for every line');
  const missing = model.lines.filter((l) => typeof a[String(l.order)] !== 'string').map((l) => l.order);
  if (missing.length) return { ok: false, result: [{ key: 'lines without a pulsar', value: missing.join(', ') }], message: `Put a pulsar on every line: ${missing.length} of ${model.lines.length} have none yet (${missing.join(', ')}).` };
  const wrong: string[] = [];
  const result: Reading[] = [];
  for (const l of model.lines) {
    const jname = a[String(l.order)] as string;
    const lm = matchOf(model, l.order);
    const e = model.byJ.get(jname);
    if (!e) {
      wrong.push(`line ${l.order}: ${jname} is not in your catalogue`);
      continue;
    }
    if (lm.best?.entry.jname === jname) {
      result.push({ key: `line ${l.order}`, value: `${name(e)}, odds ${oddsText(lm.log10Odds)}` });
      continue;
    }
    const over = log10BestOver(lm, jname);
    if (over === null) {
      const r = candidateReadout(model, l.order, jname);
      wrong.push(`line ${l.order}: ${name(e)} was not considered (${NOT_CONSIDERED[r.notConsidered ?? 'direction']})`);
    } else {
      wrong.push(`line ${l.order}: another pulsar along it is ${timesText(over)} more likely than ${name(e)}`);
    }
  }
  if (wrong.length) {
    return { ok: false, result: [{ key: 'lines not most likely', value: wrong.length }], message: `${wrong.length} of ${model.lines.length} lines ${wrong.length === 1 ? 'does' : 'do'} not have ${wrong.length === 1 ? 'its' : 'their'} most likely pulsar: ${wrong.join('; ')}.` };
  }
  const id = model.identification();
  const misfit = lengthMisfit(mapPoints(model), id.pass2Info.originPc, id.pass2Info.scalePcPerR0);
  // The line whose 1972 period was known to the fewest figures (SSD72: B1240-64, three).
  const rough = [...model.lines].sort((p, q) => (SSD72_SIG_FIGS[p.label1972] ?? 99) - (SSD72_SIG_FIGS[q.label1972] ?? 99))[0]!;
  const figs = SSD72_SIG_FIGS[rough.label1972] as number;
  const ticked = model.lines.filter((l) => l.absZOverR0 !== null).length;
  result.push(
    { key: `${rough.bname} period`, value: `known to ${figs} figures only` },
    { key: 'map distances', value: `off by up to ${sig(misfit.worstFactor, 2)} times` },
    { key: 'height ticks', value: `${ticked} of ${model.lines.length}, without a sign` },
  );
  return {
    ok: true,
    result,
    message: `Every line has its most likely pulsar, the young ones found by direction once the old ones gave the map's age. The map has limits: line ${rough.order}'s number (${rough.bname}) is good to only ${figs} figures; its lengths are off from the pulsars' distances by up to ${sig(misfit.worstFactor, 2)} times; and its height ticks say how far each pulsar is from the plane, not on which side.`,
  };
}

/** map.motion: an axis on the sky along which the old lines' ages line up. */
export function checkMotion(model: EpochModel, answer: Answer): CheckResult {
  const a = obj(answer, 'an axis on the sky');
  const lDeg = num(a, 'lDeg', -360, 720);
  const bDeg = num(a, 'bDeg', -90, 90);
  const fit = model.motionFit();
  const axis = axisFromGalactic(lDeg, bDeg);
  const d2 = axisDeltaChi2(fit, axis);
  const off = Math.min(angleBetweenDeg(axis, fit.velKmS), angleBetweenDeg(scale(axis, -1), fit.velKmS));
  const line = axisLineFit(skyAges(model), lDeg, bDeg);
  const speed = norm(fit.velKmS);
  const dir = galacticOf(fit.velKmS as Vec3);
  const result: Reading[] = [
    { key: 'axis', value: `l ${lDeg.toFixed(1)}, b ${bDeg.toFixed(1)} deg` },
    { key: 'misfit of the ages', value: `${line.chi2.toFixed(1)} for ${line.dof} degrees of freedom` },
    { key: 'scatter about the line', value: line.rmsYears * JULIAN_YEAR_S, dim: 'time' },
    { key: 'chi-square from the best velocity', value: d2.toFixed(1) },
  ];
  if (d2 > CHI2_2DOF_95) {
    return { ok: false, result, message: `Along this axis the ages still scatter by ${qy(line.rmsYears)} about a straight line. The velocity that fits all the old lines at once lies ${deg(off)} from it: a chi-square of ${d2.toFixed(1)}, more than the ${CHI2_2DOF_95.toFixed(2)} two angles allow at 95%.` };
  }
  result.push(years('fitted age', fit.ageYears), years('age sigma', fit.ageSigma), { key: 'your speed', value: speed * 1000, dim: 'speed' }, { key: 'moving toward', value: `l ${dir.lDeg.toFixed(1)}, b ${dir.bDeg.toFixed(1)} deg` });
  return {
    ok: true,
    result,
    message: `The ages line up along this axis: your own motion shifts every period. Fitted together, the old lines give one age, ${qy(fit.ageYears)} +/- ${qy(fit.ageSigma, 2)}, and your velocity relative to the map's makers, ${q('speed', speed * 1000)} toward l ${dir.lDeg.toFixed(0)}, b ${dir.bDeg.toFixed(0)} deg (${fit.dropped.length === 1 ? '1 line' : `${fit.dropped.length} lines`} left out as too rough: ${fit.dropped.map((j) => name({ jname: j, bname: model.byJ.get(j)?.bname ?? null })).join(', ') || 'none'}).`,
  };
}

/** map.region: where the player put the map's origin, pc in the galactic plane from the alien's star at the map epoch. */
export function checkRegion(model: EpochModel, answer: Answer): CheckResult {
  const a = obj(answer, 'a point for the map\'s origin');
  const x = num(a, 'x', -10_000, 10_000);
  const y = num(a, 'y', -10_000, 10_000);
  const region = model.region();
  const pts = mapPoints(model);
  const here = bearingResiduals(pts, [x, y]);
  const best = bearingResiduals(pts, region.centerPc);
  const result: Reading[] = [
    { key: 'origin', value: `${x.toFixed(1)}, ${y.toFixed(1)} pc` },
    { key: 'bearing scatter here', value: deg(here.rmsDeg, 2) },
    { key: 'bearing scatter at the best point', value: deg(best.rmsDeg, 2) },
  ];
  if (!insideRegion(region, [x, y])) {
    const level = regionLevel(region, [x, y]);
    return { ok: false, result, message: `From here the lines point at their pulsars with an rms error of ${deg(here.rmsDeg, 2)} (the best point manages ${deg(best.rmsDeg, 2)}): the point lies ${onContour(level)} of the origin's uncertainty, outside the 95% region.` };
  }
  const stars = starsInRegion(model);
  result.push(
    pcLen('region length', 2 * region.semiAxesPc[0]),
    pcLen('region width', 2 * region.semiAxesPc[1]),
    { key: 'stars inside then', value: stars.inside },
    { key: 'your own star inside', value: stars.homeInside ? 'yes' : 'no' },
  );
  return {
    ok: true,
    result,
    message: `The map was drawn from a region, not a point: ${qpc(2 * region.semiAxesPc[0], 2)} by ${qpc(2 * region.semiAxesPc[1], 2)} (95%), and when the map was made ${stars.inside} catalogued stars lay inside it.${stars.homeInside ? ' Your own star was one of them.' : ' Your own star was not one of them.'}`,
  };
}

export type ModelFor = (seed: string) => EpochModel;

export function makeMapCheckers(get: ModelFor = epochModel): Record<MapNodeId, Checker> {
  return {
    'map.periods': (a, ctx) => checkPeriods(get(ctx.seed), a),
    'map.old': (a, ctx) => checkOld(get(ctx.seed), a),
    'map.identify': (a, ctx) => checkIdentify(get(ctx.seed), a),
    'map.motion': (a, ctx) => checkMotion(get(ctx.seed), a),
    'map.region': (a, ctx) => checkRegion(get(ctx.seed), a),
  };
}

export function registerMapCheckers(get: ModelFor = epochModel): void {
  const c = makeMapCheckers(get);
  for (const id of MAP_NODE_IDS) registerChecker(id, c[id]);
}
