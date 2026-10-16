// The Map's own small computations on the shared epoch model (src/chapters/shared/epochModel.ts): what the
// instrument reads out for a line and a pulsar, the spin-down clock's curves, the ages across the sky and
// their straight-line fit against an axis, the bearings from a proposed map origin, and the stars inside the
// origin region. Everything comes from the science core on the data files (rule 1); nothing here is typed in.
// Pure: no DOM, no randomness.

import { dot, galacticToIcrsCartesian, toGalacticCartesian, toSpherical, type Vec3 } from '../../science/astro';
import { OLD_TAU_C_YEARS, type AlienPulsar } from '../../science/pulsarEpoch';
import { identifyLines, characteristicAgeYears, elapsedFromSpin, lsbHalfWidth, mapPeriod, spinForward, wrapDeg } from '../../science/pulsars';
import { alienCandidateView } from '../../science/pulsarAge';
import { tickLatitudeDeg, type LineMatch } from '../../science/pulsarIdentify';
import { insideRegion, mapPointsAtEpoch, type MapPoint } from '../../science/triangulation';
import type { CoverMapLine } from '../../science/types';
import { C_KM_S, HYDROGEN_HZ, JULIAN_YEAR_S } from '../../science/units';
import type { EpochModel } from '../shared/epochModel';

/**
 * The identification's pre-selection, as identifyAtEpoch (src/science/pulsarIdentify.ts) runs it: direction
 * within 5 deg of the map angle, a Doppler allowance of 1e-3 (relative speeds up to 300 km/s), braking
 * indices 0.9 to 4, the map period to one LSB, and an age window from the RTG clock [t_lo, 2 t_hi].
 */
export const PRESELECT_DIRECTION_DEG = 5;
const PRESELECT_DOPPLER = 1e-3;
const PRESELECT_N: readonly [number, number] = [0.9, 4];

/** Old or young by the characteristic age the alien measures now (the dating's own boundary, 300,000 yr). */
export function isYoung(e: Pick<AlienPulsar, 'pObs' | 'pdotMeas'>): boolean {
  return e.pdotMeas !== null && e.pdotMeas > 0 && characteristicAgeYears(e.pObs, e.pdotMeas) < OLD_TAU_C_YEARS;
}

export function lineOf(model: EpochModel, order: number): CoverMapLine {
  const l = model.lines.find((x) => x.order === order);
  if (!l) throw new Error(`The map has no line ${order}.`);
  return l;
}

export function matchOf(model: EpochModel, order: number): LineMatch {
  const m = model.identification().lines.find((x) => x.line.order === order);
  if (!m) throw new Error(`The map has no line ${order}.`);
  return m;
}

/** A line is old when its most likely pulsar is old (the young lines need the map's age first). */
export function lineIsOld(model: EpochModel, order: number): boolean {
  const b = matchOf(model, order).best;
  return b !== null && !isYoung(b.entry);
}

/** log10 of the odds of one candidate against all the others on its line (D-A16); Infinity when alone, null when not considered. */
export function log10OddsOf(lm: LineMatch, jname: string): number | null {
  const me = lm.ranked.find((c) => c.entry.jname === jname);
  if (!me) return null;
  const others = lm.ranked.filter((c) => c !== me && c.logLikelihood > -Infinity).map((c) => c.logLikelihood);
  if (!others.length) return Infinity;
  const mx = Math.max(...others);
  const lse = mx + Math.log(others.reduce((s, v) => s + Math.exp(v - mx), 0));
  return (me.logLikelihood - lse) / Math.LN10;
}

/** log10 of how much more likely the best candidate is than this one (0 for the best itself), or null when not considered. */
export function log10BestOver(lm: LineMatch, jname: string): number | null {
  const me = lm.ranked.find((c) => c.entry.jname === jname);
  if (!me || !lm.best) return null;
  return (lm.best.logLikelihood - me.logLikelihood) / Math.LN10;
}

export type NotConsidered = 'direction' | 'age';

/** Why a pulsar was not among the line's candidates: its direction, or no allowed age makes its period reach the map's number. */
export function whyNotConsidered(model: EpochModel, line: CoverMapLine, e: AlienPulsar): NotConsidered | null {
  if (Math.abs(wrapDeg(e.lDeg - line.mapAngleDeg)) > PRESELECT_DIRECTION_DEG) return 'direction';
  const [tLo, tHi] = model.rtgInterval;
  const r = identifyLines([line], [alienCandidateView(e)], {
    directionTolDeg: PRESELECT_DIRECTION_DEG,
    dopplerAllowance: PRESELECT_DOPPLER,
    windowYears: [tLo, 2 * tHi],
    nRange: PRESELECT_N,
    mapHalfWidth: () => lsbHalfWidth(HYDROGEN_HZ),
    hz: HYDROGEN_HZ,
  })[0];
  return r && r.candidates.length > 0 ? null : 'age';
}

export interface CandidateReadout {
  order: number;
  jname: string;
  bname: string | null;
  /** The map's period and the pulsar's period now, s. */
  mapPeriodS: number;
  periodNowS: number;
  /** Map angle (plus the fitted rotation in pass 2) against the candidate's direction, deg. */
  dLonDeg: number;
  /** |b| minus the tick's latitude, deg; null when the tick does not resolve. */
  dLatDeg: number | null;
  tickDeg: number | null;
  young: boolean;
  /** Odds against all the others on the line, log10; null when the pulsar was not considered. */
  log10Odds: number | null;
  notConsidered: NotConsidered | null;
  best: boolean;
}

/** What the instrument shows for a line and the pulsar the player put on it. */
export function candidateReadout(model: EpochModel, order: number, jname: string): CandidateReadout {
  const line = lineOf(model, order);
  const e = model.byJ.get(jname);
  if (!e) throw new Error(`${jname} is not in your catalogue.`);
  const lm = matchOf(model, order);
  const scored = lm.ranked.find((c) => c.entry.jname === jname);
  const tick = tickLatitudeDeg(line);
  return {
    order, jname, bname: e.bname,
    mapPeriodS: mapPeriod(line, HYDROGEN_HZ),
    periodNowS: e.pObs,
    dLonDeg: scored ? scored.dLonDeg : wrapDeg(line.mapAngleDeg - e.lDeg),
    dLatDeg: scored ? scored.dLatDeg : tick === null ? null : Math.abs(e.bDeg) - tick,
    tickDeg: tick,
    young: isYoung(e),
    log10Odds: log10OddsOf(lm, jname),
    notConsidered: scored ? null : whyNotConsidered(model, line, e),
    best: lm.best?.entry.jname === jname,
  };
}

// ---- the spin-down clock -------------------------------------------------------------------------------

/** Braking index the clock runs with (pulsarEpoch.ts N_NOMINAL, the magnetic-dipole value). */
export { N_NOMINAL as CLOCK_N } from '../../science/pulsarEpoch';

/**
 * Where a pulsar's period stands at a time t (years from now, negative in the past) as a share of today's
 * difference from the map's number: 1 now, 0 where it equals the map's number. spinForward with n = 3.
 */
export function clockShare(e: AlienPulsar, line: CoverMapLine, tYears: number, n: number): number {
  if (e.pdotMeas === null || !(e.pdotMeas > 0)) return 1;
  const pMap = mapPeriod(line, HYDROGEN_HZ);
  const p = spinForward(e.pObs, e.pdotMeas, n, tYears * JULIAN_YEAR_S).p;
  return (p - pMap) / (e.pObs - pMap);
}

/** Where the clock's curve crosses the map's number, years ago (n as given), or null when it never does. */
export function clockCrossingYearsAgo(e: AlienPulsar, line: CoverMapLine, n: number): number | null {
  if (e.pdotMeas === null || !(e.pdotMeas > 0)) return null;
  const pMap = mapPeriod(line, HYDROGEN_HZ);
  if (!(e.pObs > pMap)) return null;
  return elapsedFromSpin(e.pObs, e.pdotMeas, pMap, n) / JULIAN_YEAR_S;
}

// ---- ages across the sky -----------------------------------------------------------------------------

export interface SkyAge {
  order: number;
  jname: string;
  bname: string | null;
  lDeg: number;
  bDeg: number;
  nHat: Vec3;
  /** P / Pdot now, years: how strongly a Doppler shift of the period moves this pulsar's age. */
  slowYears: number;
  /** The age in the alien's own frame (median and 1-sigma of the Monte Carlo), years. */
  age: number;
  sigma: number;
  /** False for a line the motion fit leaves out (its period is too rough: B1240-64). */
  used: boolean;
}

/** The old lines' ages in the alien's own frame, with each pulsar's direction, for the sky plot. */
export function skyAges(model: EpochModel): SkyAge[] {
  const dropped = new Set(model.motionFit().dropped);
  const out: SkyAge[] = [];
  for (const lm of model.identification().lines) {
    const b = lm.best;
    if (!b || isYoung(b.entry)) continue;
    const e = b.entry;
    const a = model.ageOf(lm.line.order, e.jname, 'own');
    out.push({
      order: lm.line.order, jname: e.jname, bname: e.bname, lDeg: e.lDeg, bDeg: e.bDeg, nHat: e.nHat,
      slowYears: e.pObs / (e.pdotMeas as number) / JULIAN_YEAR_S,
      age: a.median, sigma: a.sigma, used: !dropped.has(e.jname),
    });
  }
  return out;
}

/** A direction on the sky (galactic longitude and latitude, deg) as an ICRS unit vector, the frame of the pulsars' nHat and the motion fit. */
export function axisFromGalactic(lDeg: number, bDeg: number): Vec3 {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  return galacticToIcrsCartesian([Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]);
}

/** Galactic longitude [0, 360) and latitude of an ICRS vector, deg. */
export function galacticOf(v: Vec3): { lDeg: number; bDeg: number } {
  const s = toSpherical(toGalacticCartesian(v));
  return { lDeg: ((s.lonDeg % 360) + 360) % 360, bDeg: s.latDeg };
}

export interface AxisFit {
  /** x per point: P / Pdot times the cosine of the angle between the pulsar and the axis, years. */
  xs: number[];
  slope: number;
  /** The age where x = 0, years. */
  intercept: number;
  /** Plain rms of the used points about the line, years. */
  rmsYears: number;
  /** Weighted misfit (sum of squared residuals over sigma squared) and its degrees of freedom (used points minus 2). */
  chi2: number;
  dof: number;
  /** Speed along the axis implied by the slope, km/s (positive: moving toward the axis direction). */
  speedKmS: number;
}

/**
 * The straight line through the ages against x = (P / Pdot) cos(angle to the axis). A motion v along the
 * axis shifts every period by the Doppler factor 1 + v cos / c, and so every age by (P / Pdot) v cos / c
 * (src/science/pulsarAge.ts modelAge; the dating test's own prediction, -2 tau_c V.n / c): own-frame ages
 * fall on a line of slope -v / c when the axis is the motion's. Weighted least squares, weights 1 / sigma^2.
 */
export function axisLineFit(points: readonly SkyAge[], lDeg: number, bDeg: number): AxisFit {
  const ax = axisFromGalactic(lDeg, bDeg);
  const xs = points.map((p) => p.slowYears * dot(ax, p.nHat));
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  points.forEach((p, i) => {
    if (!p.used) return;
    const w = 1 / (p.sigma * p.sigma);
    const x = xs[i] as number;
    sw += w; sx += w * x; sy += w * p.age; sxx += w * x * x; sxy += w * x * p.age; n++;
  });
  const det = sw * sxx - sx * sx;
  const slope = det > 0 ? (sw * sxy - sx * sy) / det : 0;
  const intercept = (sy - slope * sx) / sw;
  let chi2 = 0, ss = 0;
  points.forEach((p, i) => {
    if (!p.used) return;
    const r = p.age - intercept - slope * (xs[i] as number);
    chi2 += (r * r) / (p.sigma * p.sigma);
    ss += r * r;
  });
  return { xs, slope, intercept, rmsYears: Math.sqrt(ss / n), chi2, dof: n - 2, speedKmS: -slope * C_KM_S };
}

/** The axis with the smallest misfit on a grid (tests: the instrument's own minimum must pass the checker). */
export function bestAxisOnGrid(points: readonly SkyAge[], stepDeg: number, around?: { lDeg: number; bDeg: number; spanDeg: number }): { lDeg: number; bDeg: number; chi2: number } {
  let best = { lDeg: 0, bDeg: 0, chi2: Infinity };
  const l0 = around ? around.lDeg - around.spanDeg : 0;
  const l1 = around ? around.lDeg + around.spanDeg : 360 - stepDeg;
  const b0 = around ? Math.max(-90, around.bDeg - around.spanDeg) : -90;
  const b1 = around ? Math.min(90, around.bDeg + around.spanDeg) : 90;
  for (let l = l0; l <= l1 + 1e-9; l += stepDeg) {
    for (let b = b0; b <= b1 + 1e-9; b += stepDeg) {
      const c = axisLineFit(points, l, b).chi2;
      if (c < best.chi2) best = { lDeg: ((l % 360) + 360) % 360, bDeg: b, chi2: c };
    }
  }
  return best;
}

// ---- the map's origin --------------------------------------------------------------------------------

/** The map lines as triangulation points at the map epoch, exactly as the model's region() builds them. */
export function mapPoints(model: EpochModel): MapPoint[] {
  return mapPointsAtEpoch(model.lines, model.lines.map((l) => model.byJ.get(l.jname) as AlienPulsar), model.motionFit().ageYears);
}

export interface BearingFit {
  /** The rotation that best lines the map's angles up with the bearings from the origin, deg. */
  alphaDeg: number;
  residualsDeg: number[];
  rmsDeg: number;
}

/**
 * With the map's origin fixed at a proposed point (pc, in the plane), the bearings to the pulsars against the
 * map's angles: the best common rotation is the circular mean of (bearing - angle), and the residuals are
 * angle + rotation - bearing (triangulation.ts's convention), wrapped.
 */
export function bearingResiduals(points: readonly MapPoint[], origin: readonly [number, number]): BearingFit {
  const diffs = points.map((p) => (Math.atan2(p.posPc[1] - origin[1], p.posPc[0] - origin[0]) * 180) / Math.PI - p.angleDeg);
  const sx = diffs.reduce((s, d) => s + Math.cos((d * Math.PI) / 180), 0);
  const sy = diffs.reduce((s, d) => s + Math.sin((d * Math.PI) / 180), 0);
  const alphaDeg = (Math.atan2(sy, sx) * 180) / Math.PI;
  const residualsDeg = diffs.map((d) => wrapDeg(alphaDeg - d));
  return { alphaDeg, residualsDeg, rmsDeg: Math.sqrt(residualsDeg.reduce((s, r) => s + r * r, 0) / residualsDeg.length) };
}

/** How far the map's line lengths are from the pulsars' in-plane distances at a scale (pc per R0): the rms factor and the worst. */
export function lengthMisfit(points: readonly MapPoint[], origin: readonly [number, number], pcPerR0: number): { rmsFactor: number; worstFactor: number } {
  const x = points.map((p) => Math.log(Math.hypot(p.posPc[0] - origin[0], p.posPc[1] - origin[1]) / (p.rOverR0 * pcPerR0)));
  return { rmsFactor: Math.exp(Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)), worstFactor: Math.exp(Math.max(...x.map(Math.abs))) };
}

export interface RegionStars {
  inside: number;
  /** Near stars with a distance that were tested. */
  tested: number;
  homeInside: boolean;
}

/** The catalogued stars inside the origin region at the map epoch (starInMapPlane over stars.near), and whether the alien's own star is one. */
export function starsInRegion(model: EpochModel): RegionStars {
  const region = model.region();
  const age = model.motionFit().ageYears;
  let inside = 0;
  let tested = 0;
  let homeInside = false;
  for (const s of model.inputs.stars.near) {
    if (s.distPc === null) continue;
    tested++;
    if (insideRegion(region, model.starInMapPlane(s, age))) {
      inside++;
      if (s.id === model.truth.starId) homeInside = true;
    }
  }
  return { inside, tested, homeInside };
}
