// The Trail's five checkers, pure, on the shared epoch model for the playthrough's seed. Each judges what the
// player selected on the instrument with the science (kinematics.trail, the run-back, the ruler, the map's
// origin region, the reframed ages) and reports what it computed, right or wrong. epochModel() throws until
// the star catalogues are loaded, so the bus refuses a proposal then instead of recording it.

import { registerChecker, type Answer, type CheckContext, type CheckResult, type Checker, type Reading } from '../../game/deductions';
import { brightestStars, nearestStars } from '../../science/epoch';
import { velocityMahalanobis2 } from '../../science/pulsarAge';
import { chiSquareSf } from '../../science/stats';
import { insideRegion, regionLevel } from '../../science/triangulation';
import { JULIAN_YEAR_S } from '../../science/units';
import { TRAIL_MAX_DIST_PC, epochModel, type EpochModel } from '../shared/epochModel';
import { distText, figuresFor, fmtDeg, fmtPc, fmtYears, yearsText } from './format';
import { agesInFrame, judgedLines, observerRelativeTo, oldSpread, type FrameId } from './frames';
import { consistent, cutRatio, homeId, noRvBounds, originRow, regionStars, rowFor, rulerReading, starById, starName } from './physics';

export const TRAIL_NODE_IDS = ['trail.origin', 'trail.age', 'trail.neighbour', 'trail.where', 'trail.when'] as const;
export type TrailNodeId = (typeof TRAIL_NODE_IDS)[number];

/** How many ruler sigmas a proposed distance may be off the alien's measured one (spec: two). */
export const RULER_SIGMAS = 2;
/**
 * The old lines agree within their errors in a frame when the chi-square per degree of freedom of their
 * medians is below this: 2, just above the 95% point for the 9 to 11 degrees of freedom the map's old lines
 * give (1.88 for 9; chi-square tables).
 */
export const AGREE_CHI2_PER_DOF = 2;
/** Ranks looked up for the neighbour twist (D-A15 lists the first ten; twenty leaves room). */
const RANK_DEPTH = 20;

export type ModelProvider = (seed: string) => EpochModel;

// ---- readings: times carry SI seconds with their dimension (the codex writes them in beats, with years as
// the gloss); distances are written here in the alien's reaches, because the shared SI gloss would give
// kilometres with fourteen digits (the message gives the parsecs) ----
const time = (key: string, years: number): Reading => ({ key, value: years * JULIAN_YEAR_S, dim: 'time' });
const length = (key: string, pc: number): Reading => ({ key, value: distText(pc, false) });
/** An estimate and its 95% interval as readings, each with the figures that tell the three apart (format.ts figuresFor). */
function interval(keys: [string, string, string], est: number, lo: number, hi: number): Reading[] {
  const d = figuresFor(Math.max(Math.abs(est), Math.abs(lo), Math.abs(hi)), hi - lo);
  return [
    { key: keys[0], value: yearsText(est, false, d) },
    { key: keys[1], value: yearsText(lo, false, d) },
    { key: keys[2], value: yearsText(hi, false, d) },
  ];
}

function obj(answer: Answer): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('Propose an object.');
  return answer;
}
function num(a: Record<string, Answer>, k: string, min: number, max: number): number {
  const v = a[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${k} must be a number from ${min} to ${max}.`);
  return v;
}
function starId(a: Record<string, Answer>): number {
  const v = num(a, 'starId', 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(v)) throw new Error('starId must be a catalogue id.');
  return v;
}

/** trail.origin: is this the star the craft flies straight away from? */
export function checkOrigin(m: EpochModel, answer: Answer): CheckResult {
  const id = starId(obj(answer));
  const star = starById(m, id);
  if (!star) throw new Error(`There is no star ${id} in your catalogue.`);
  const name = starName(star);
  if (id === homeId(m)) {
    const row = rowFor(m, id);
    return {
      ok: false,
      result: row ? [{ key: 'angle from straight away', value: `${fmtDeg(row.angleDeg)} deg` }, length('distance', row.distPc)] : [],
      message: `That is your own star. The machine is passing it now: it moves at ${row ? fmtDeg(row.angleDeg) : '90'} deg to the line from your star, at its closest approach. It came from somewhere else.`,
    };
  }
  const row = rowFor(m, id);
  if (!row) {
    if (star.rvKmS === null) {
      const b = noRvBounds(m, star);
      const parts = b.map((x) => (x.angleDeg === null ? `no radial velocity up to ${x.vmaxKmS} km/s brings it within ${TRAIL_MAX_DIST_PC} pc` : `at best ${fmtDeg(x.angleDeg)} deg for any radial velocity up to ${x.vmaxKmS} km/s`));
      return {
        ok: false,
        result: [
          { key: 'radial velocity', value: 'not measured' },
          ...b.map((x): Reading => ({ key: `smallest angle, radial velocity up to ${x.vmaxKmS} km/s`, value: x.angleDeg === null ? 'never near' : `${fmtDeg(x.angleDeg)} deg` })),
        ],
        message: `${name} has no measured radial velocity, so its motion along your line of sight is unknown and its trail cannot be drawn exactly. Even so, trying every radial velocity: ${parts.join('; ')}. The machine is not flying straight away from it.`,
      };
    }
    throw new Error(`${name} is more than ${TRAIL_MAX_DIST_PC} pc from the machine: it is not on your chart.`);
  }
  const result: Reading[] = [
    { key: 'star', value: name },
    { key: 'measured angle from straight away', value: `${fmtDeg(row.measuredAngleDeg)} deg` },
    { key: '95% cut for a star it flew from', value: `${fmtDeg(row.nullAngle95Deg)} deg` },
    { key: 'rms of the angle per axis', value: `${fmtDeg(row.angleRmsDeg)} deg` },
    length('distance', row.distPc),
  ];
  const cut = `a star it truly flew from would show at most ${fmtDeg(row.nullAngle95Deg)} deg 95% of the time (rms ${fmtDeg(row.angleRmsDeg)} deg per axis)`;
  if (consistent(row)) {
    return {
      ok: true,
      result,
      message: `The machine flies straight away from ${name}: you measure ${fmtDeg(row.measuredAngleDeg)} deg between its motion relative to ${name} and the line out of it, and ${cut}. It came from there, ${fmtPc(row.distPc)} pc behind it.`,
    };
  }
  return {
    ok: false,
    result,
    message: `You measure ${fmtDeg(row.measuredAngleDeg)} deg between the machine's motion relative to ${name} and straight away from it; ${cut}: this is ${cutRatio(row) < 10 ? cutRatio(row).toFixed(1) : cutRatio(row).toFixed(0)} times that. Something thrown from there would fly straight out of it.`,
  };
}

/** trail.age: is this time inside the interval distance over speed allows, built around the alien's measurement? */
export function checkAge(m: EpochModel, answer: Answer): CheckResult {
  const years = num(obj(answer), 'years', -1e9, 1e9);
  const row = originRow(m);
  const [lo, hi] = row.measuredDistOverSpeedInterval95;
  const ok = years >= lo && years <= hi;
  const result: Reading[] = interval(['distance over speed', '95% low', '95% high'], row.measuredDistOverSpeedYears, lo, hi);
  return {
    ok,
    result,
    message: ok
      ? `Run back together, the machine and ${starName(row.star)} meet ${fmtYears(years)} years ago. You measure distance over speed as ${fmtYears(row.measuredDistOverSpeedYears)} years (95%: ${fmtYears(lo)} to ${fmtYears(hi)}, set almost entirely by the error on the speed): a third clock.`
      : `${fmtYears(years)} years is outside what the measurement allows: you measure distance over speed as ${fmtYears(row.measuredDistOverSpeedYears)} years, 95% between ${fmtYears(lo)} and ${fmtYears(hi)}. ${years < lo ? 'At that time they are still apart: run back further.' : 'By then they have passed each other: run back less far.'}`,
  };
}

/** trail.neighbour: the distance from the alien's own star to the origin star, as the ruler measures it. */
export function checkNeighbour(m: EpochModel, answer: Answer): CheckResult {
  const proposed = num(obj(answer), 'distancePc', 0, 1e6);
  const origin = originRow(m).star;
  const ruler = rulerReading(m, origin);
  const off = Math.abs(proposed - ruler.distPc);
  const ok = off <= RULER_SIGMAS * ruler.sigmaPc;
  const name = starName(origin);
  if (!ok) {
    return {
      ok: false,
      result: [length('proposed', proposed), length(`measured, your star to ${name}`, ruler.distPc), length('ruler error', ruler.sigmaPc)],
      message: `Your ruler puts ${name} ${fmtPc(ruler.distPc)} ± ${fmtPc(ruler.sigmaPc)} pc from your star; ${fmtPc(proposed)} pc is ${(off / ruler.sigmaPc).toFixed(0)} of its errors away. Measure from your own star to the star the machine came from.`,
    };
  }
  const t = m.disc.decimalYear;
  const home = homeId(m);
  const near = nearestStars(m.inputs.stars, m.measured.posPc, t, RANK_DEPTH, [home]);
  const bright = brightestStars(m.inputs.stars, m.measured.posPc, t, RANK_DEPTH, [home]);
  const distRank = near.findIndex((x) => x.star.id === origin.id) + 1;
  const bi = bright.findIndex((x) => x.star.id === origin.id);
  const mag = bi >= 0 ? (bright[bi] as { appMag: number }).appMag : NaN;
  const ord = (n: number): string => (n === 1 ? 'nearest' : `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} nearest`);
  const bord = (n: number): string => (n === 1 ? 'brightest' : `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}-brightest`);
  const second = near.find((x) => x.star.id !== origin.id);
  return {
    ok: true,
    result: [
      length('distance from your star', ruler.distPc),
      length('ruler error', ruler.sigmaPc),
      { key: 'rank by distance', value: distRank > 0 ? distRank : `beyond ${RANK_DEPTH}` },
      { key: 'magnitude in your sky', value: Number(mag.toFixed(2)) },
      { key: 'rank by brightness', value: bi >= 0 ? bi + 1 : `beyond ${RANK_DEPTH}` },
    ],
    message:
      `${name} is ${fmtPc(ruler.distPc)} ± ${fmtPc(ruler.sigmaPc)} pc from your star. ` +
      (distRank > 0 ? `Of every star in your catalogue it is the ${ord(distRank)} to you${distRank === 1 && second ? ` (the next is ${starName(second.star)}, ${fmtPc(second.distPc)} pc)` : ''}` : 'It is not among your nearest twenty stars') +
      (bi >= 0 ? `, and at magnitude ${mag.toFixed(2)} the ${bord(bi + 1)} star in your sky.` : '.') +
      ' The machine came from your neighbour.',
  };
}

/** trail.where: is this the star the map was drawn from, inside the map's origin region at the map epoch? */
export function checkWhere(m: EpochModel, answer: Answer): CheckResult {
  const id = starId(obj(answer));
  const star = starById(m, id);
  if (!star) throw new Error(`There is no star ${id} in your catalogue.`);
  const age = m.motionFit().ageYears;
  const region = m.region();
  const xy = m.starInMapPlane(star, age);
  const inside = insideRegion(region, xy);
  const level = regionLevel(region, xy);
  const origin = originRow(m).star;
  const name = starName(star);
  const n = regionStars(m).filter((s) => s.inside).length;
  const result: Reading[] = [
    { key: 'star', value: name },
    { key: 'in the region', value: inside ? 'yes' : 'no' },
    { key: 'region contour through it', value: `${(level * 100).toFixed(1)}%` },
    { key: 'stars in the region', value: n },
  ];
  if (id === origin.id && inside) {
    return {
      ok: true,
      result,
      message: `Moved back ${fmtYears(age)} years to when the map was made, ${name} lies inside the map's origin region (on its ${(level * 100).toFixed(0)}% contour), one of ${n} stars there. The machine came from the star the map was drawn from: the map points home.`,
    };
  }
  if (inside) {
    return {
      ok: false,
      result,
      message: `${name} is inside the region too, one of ${n} stars there; the machine did not come from it. The map alone cannot single out its star: the trail can.`,
    };
  }
  return {
    ok: false,
    result,
    message: `${name} lies outside the map's region at the map epoch: on the ${(level * 100).toFixed(1)}% contour, beyond the 95% one. The map was not drawn from there.`,
  };
}

function frameOf(a: Record<string, Answer>): FrameId | null {
  const f = a.frame;
  if (f === undefined || f === null) return null;
  if (f === 'own') return 'own';
  if (typeof f === 'number' && Number.isInteger(f) && f >= 0) return f;
  throw new Error('frame must be "own" or a star id.');
}

/** trail.when: the map's age, proposed in the origin star's rest frame. */
export function checkWhen(m: EpochModel, answer: Answer): CheckResult {
  const a = obj(answer);
  const years = num(a, 'yearsAgo', -1e9, 1e9);
  const frame = frameOf(a);
  const origin = originRow(m).star;
  const sun = agesInFrame(m, origin.id === 0 ? 0 : origin.id, origin).combined;
  const fit = m.motionFit();
  const row = originRow(m);
  const [tlo, thi] = row.measuredDistOverSpeedInterval95;
  const inFrame = frame === null || frame === origin.id;
  const inside = years >= sun.lo && years <= sun.hi;
  const ok = inFrame && inside;
  const name = starName(origin);
  if (!ok) {
    const d = figuresFor(Math.max(Math.abs(years), Math.abs(sun.lo), Math.abs(sun.hi)), sun.hi - sun.lo);
    const result: Reading[] = [
      { key: 'proposed', value: yearsText(years, false, d) },
      { key: `map's age in ${name}'s frame, 95% low`, value: yearsText(sun.lo, false, d) },
      { key: '95% high', value: yearsText(sun.hi, false, d) },
    ];
    let msg = `In ${name}'s rest frame the old lines agree on ${fmtYears(sun.estimate)} years ago (95%: ${fmtYears(sun.lo)} to ${fmtYears(sun.hi)}); ${fmtYears(years)} is ${inside ? 'inside that' : 'outside that'}.`;
    if (!inFrame && frame !== null) {
      const fstar = frame === 'own' ? undefined : starById(m, frame);
      if (frame !== 'own' && !fstar) throw new Error(`There is no star ${frame} in your catalogue.`);
      const s = oldSpread(agesInFrame(m, frame, fstar), judgedLines(agesInFrame(m, origin.id === 0 ? 0 : origin.id, origin)));
      const label = fstar ? `${starName(fstar)}'s frame` : 'your own frame';
      const agree = s.chi2PerDof < AGREE_CHI2_PER_DOF;
      msg +=
        ` But you are reading the ages in ${label}, where the ${s.count} old lines spread from ${fmtYears(s.lo)} to ${fmtYears(s.hi)} years ago (${fmtYears(s.spread)} years across, ` +
        (agree
          ? `about as tight as their errors: that star moves almost with ${name}). Propose the age in the frame of the star the machine came from.`
          : `${s.chi2PerDof.toFixed(0)} times the scatter their errors allow): they do not agree there, so no single age holds in it.`);
      result.push(time(`spread of the old lines in ${label}`, s.spread));
    }
    return { ok: false, result, message: msg };
  }
  // The cross-check in the origin star's frame: your star's measured motion relative to it (frames.ts
  // observerRelativeTo) against the motion The Map fitted from the pulsars alone. For 3 components the chance of
  // a mismatch at least this large is the chi-square survival function at the squared Mahalanobis distance.
  const d2 = velocityMahalanobis2(fit, observerRelativeTo(m, origin).velKmS);
  const p = chiSquareSf(d2, 3);
  const pct = p >= 0.1 ? `${Math.round(p * 100)}%` : p >= 0.001 ? `${(p * 100).toPrecision(2)}%` : 'under 0.1%';
  return {
    ok: true,
    result: [
      ...interval(["map's age", '95% low', '95% high'], sun.estimate, sun.lo, sun.hi),
      { key: 'chance of a velocity mismatch this large', value: pct },
      ...interval(['travel time', 'travel time 95% low', 'travel time 95% high'], row.measuredDistOverSpeedYears, tlo, thi),
    ],
    message:
      `In ${name}'s rest frame the old pulsars agree: the map was made ${fmtYears(sun.estimate)} years ago (95%: ${fmtYears(sun.lo)} to ${fmtYears(sun.hi)}). ` +
      `Cross-check: the motion The Map fitted from the pulsars alone matches your star's measured motion relative to ${name}; a mismatch at least this large would happen by chance ${pct} of the time (3 components). ` +
      `And the machine has travelled ${fmtYears(row.measuredDistOverSpeedYears)} years (95%: ${fmtYears(tlo)} to ${fmtYears(thi)}). The map was made, and the machine sent, at about the same time.`,
  };
}

export function makeTrailCheckers(get: ModelProvider = epochModel): Record<TrailNodeId, Checker> {
  const w = (f: (m: EpochModel, a: Answer) => CheckResult): Checker => (a: Answer, ctx: CheckContext) => f(get(ctx.seed), a);
  return {
    'trail.origin': w(checkOrigin),
    'trail.age': w(checkAge),
    'trail.neighbour': w(checkNeighbour),
    'trail.where': w(checkWhere),
    'trail.when': w(checkWhen),
  };
}

export function registerTrailCheckers(get: ModelProvider = epochModel): void {
  const c = makeTrailCheckers(get);
  for (const id of TRAIL_NODE_IDS) registerChecker(id, c[id]);
}
