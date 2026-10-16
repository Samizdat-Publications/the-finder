// The alien's likelihood identification of the map lines at the story epoch (decision D-A16; PLAN.md
// chapter 2 shows it as "match quality"). Pre-selection by direction and age (pulsars.ts identifyLines),
// then each surviving candidate is scored by three computed factors: how sharply it predicts the map's
// own period (an Occam factor), its direction, and its latitude where the map's tick resolves it. In
// pass 1 map distances are not used (scale unknown, off by up to 6 times, cover.md section 2). Pass 2
// (D-A16 amended) re-scores from the anchors' fitted age and map origin and adds the map's lengths as a
// weak, heavy-tailed factor. Pure and deterministic: seeded streams only.

import { KMS_PER_MASYR_PC, KM_S_TO_PC_PER_YEAR, add, norm, scale, toGalacticCartesian, toSpherical, type Vec3 } from './astro';
import { alienCandidateView, fitAgeAndVelocity } from './pulsarAge';
import { fitMapOrigin, type MapPoint, type OriginFit } from './triangulation';
import { N_PRIOR_OLD, N_PRIOR_YOUNG, OLD_TAU_C_YEARS, eastNorth, type AlienPulsar } from './pulsarEpoch';
import { characteristicAgeYears, identifyLines, lsbHalfWidth, mapPeriod, spinForward, wrapDeg } from './pulsars';
import { createRng } from './random';
import type { CoverMapLine } from './types';
import { HYDROGEN_HZ, JULIAN_YEAR_S } from './units';

const DEG = Math.PI / 180;
const MAS_TO_RAD = DEG / 3.6e6;

export interface IdentifyEpochOptions {
  seed: string;
  /** The RTG clock's 95% interval [t_lo, t_hi], years; ages are drawn from U[t_lo, 2 t_hi]. */
  rtgInterval: readonly [number, number];
  /** Monte Carlo draws per candidate for the period factor (at least 2,000). */
  draws: number;
  /** Years to back-project directions by proper motion; default the window's mid-age (t_lo + 2 t_hi) / 2. */
  backProjectYears?: number;
}

export interface ScoredCandidate {
  entry: AlienPulsar;
  /** ln of the density of predicted map periods at the actual map period, per unit ln P (-Infinity if no draw is valid). */
  periodLogLikelihood: number;
  /** Back-projected longitude minus map angle, deg. */
  dLonDeg: number;
  /** |b| minus the tick latitude, deg; null when the tick does not resolve. */
  dLatDeg: number | null;
  /** ln of the distance factor (pass 2; 0 in pass 1). */
  logDistance: number;
  logLikelihood: number;
}

export interface LineMatch {
  line: CoverMapLine;
  preselected: number;
  ranked: ScoredCandidate[];
  best: ScoredCandidate | null;
  runnerUp: ScoredCandidate | null;
  /** log10 of the likelihood ratio of best to runner-up; Infinity when there is no competitor. */
  log10Margin: number;
  /** log10 of the odds of the best candidate against all the others combined (sum of their likelihoods); Infinity when alone. */
  log10Odds: number;
}

export interface EpochIdentification {
  lines: LineMatch[];
  sigmaThetaDeg: number;
  sigmaBDeg: number;
  iterations: number;
}

/** The final (pass-2) identification, with pass 1 kept for comparison. */
export interface EpochIdentificationResult extends EpochIdentification {
  pass1: EpochIdentification;
  pass2Info: SecondPassInfo;
}

/** The map's tick latitude atan(|z| / r), deg; null when the tick is too close to resolve. */
export function tickLatitudeDeg(line: CoverMapLine): number | null {
  return line.absZOverR0 === null ? null : Math.atan2(line.absZOverR0, line.rOverR0) / DEG;
}

/** Galactic longitude and latitude of a candidate moved back by its own measured proper motion over `years`. */
function backProjected(e: AlienPulsar, years: number): { l: number; b: number } {
  if (e.pmraObs === null || e.pmdecObs === null) return { l: e.lDeg, b: e.bDeg };
  const [p, q] = eastNorth(e.raDeg, e.decDeg);
  const mu = add(scale(p, e.pmraObs * MAS_TO_RAD), scale(q, e.pmdecObs * MAS_TO_RAD));
  const v = add(e.nHat, scale(mu, -years));
  const g = toSpherical(toGalacticCartesian(scale(v, 1 / norm(v)) as Vec3));
  return { l: g.lonDeg, b: g.latDeg };
}

/**
 * Period factor: draws age A ~ U[t_lo, 2 t_hi], a braking index from the candidate's class by its
 * characteristic age now (old above 300 kyr: U[2, 4]; young: U[0.9, 3.2]) and a Doppler factor
 * U[-1e-3, 1e-3] (relative speeds up to 300 km/s), spins the measured state back by A, and returns the
 * kernel density of ln(predicted map period) at ln(P_map): Gaussian kernel, Silverman's bandwidth
 * 0.9 min(sd, IQR / 1.34) N^(-1/5), floored at one LSB in ln P. Draws that spin back to an impossible
 * state (period reaching zero) count as predicting nothing.
 */
export function periodLogLikelihood(e: AlienPulsar, line: CoverMapLine, opts: IdentifyEpochOptions): number {
  const rng = createRng(opts.seed).fork(`period/${line.jname}/${e.jname}`);
  const target = Math.log(mapPeriod(line, HYDROGEN_HZ));
  const lsb = (2 * lsbHalfWidth(HYDROGEN_HZ)) / mapPeriod(line, HYDROGEN_HZ);
  const [tLo, tHi] = opts.rtgInterval;
  const hasSpin = e.pdotMeas !== null && e.pdotMeas > 0;
  const young = hasSpin ? characteristicAgeYears(e.pObs, e.pdotMeas as number) < OLD_TAU_C_YEARS : false;
  const prior = young ? N_PRIOR_YOUNG : N_PRIOR_OLD;
  const xs: number[] = [];
  for (let k = 0; k < opts.draws; k++) {
    const A = tLo + (2 * tHi - tLo) * rng.uniform();
    const n = prior[0] + (prior[1] - prior[0]) * rng.uniform();
    const d = (2 * rng.uniform() - 1) * 1e-3;
    const p = e.pObs * (1 + d);
    const back = hasSpin ? spinForward(p, e.pdotMeas as number, n, -A * JULIAN_YEAR_S).p : p;
    if (Number.isFinite(back) && back > 0) xs.push(Math.log(back));
  }
  if (xs.length < 2) return -Infinity;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  const iqr = (sorted[Math.floor(0.75 * (sorted.length - 1))] as number) - (sorted[Math.floor(0.25 * (sorted.length - 1))] as number);
  const spread = iqr > 0 ? Math.min(sd, iqr / 1.34) : sd;
  const h = Math.max(0.9 * spread * Math.pow(xs.length, -0.2), lsb);
  // log-sum-exp, so that a candidate far from the map period keeps a finite (very negative) score.
  const ex = xs.map((x) => -0.5 * ((target - x) / h) ** 2);
  const mx = Math.max(...ex);
  const lse = mx + Math.log(ex.reduce((acc, v) => acc + Math.exp(v - mx), 0));
  return lse - Math.log(opts.draws * h * Math.sqrt(2 * Math.PI));
}

const logGauss = (x: number, s: number): number => -0.5 * (x / s) ** 2 - Math.log(s * Math.sqrt(2 * Math.PI));

/**
 * Identify every line: pre-select (direction within 5 deg, age range overlapping [t_lo, 2 t_hi] for
 * some n in [0.9, 4], Doppler 1e-3, map period to 1 LSB), score, and rank. sigma_theta and sigma_b are
 * the alien's own estimates: the rms of the best candidates' residuals, iterated from 1 deg until
 * they stop changing (the best candidates can change between passes).
 */
export function identifyAtEpoch(lines: readonly CoverMapLine[], alien: readonly AlienPulsar[], opts: IdentifyEpochOptions): EpochIdentificationResult {
  const [tLo, tHi] = opts.rtgInterval;
  const midAge = opts.backProjectYears ?? (tLo + 2 * tHi) / 2;
  const byJ = new Map(alien.map((a) => [a.jname, a]));
  const pre = identifyLines(lines, alien.map(alienCandidateView), {
    directionTolDeg: 5,
    dopplerAllowance: 1e-3,
    windowYears: [tLo, 2 * tHi],
    nRange: [0.9, 4],
    mapHalfWidth: () => lsbHalfWidth(HYDROGEN_HZ),
    hz: HYDROGEN_HZ,
  });
  const base = pre.map((r) => {
    const tick = tickLatitudeDeg(r.line);
    return {
      line: r.line,
      preselected: r.candidates.length,
      cands: r.candidates.map((c) => {
        const e = byJ.get(c.view.jname) as AlienPulsar;
        const bp = backProjected(e, midAge);
        return {
          entry: e,
          periodLogLikelihood: periodLogLikelihood(e, r.line, opts),
          dLonDeg: wrapDeg(bp.l - r.line.mapAngleDeg),
          dLatDeg: tick === null ? null : Math.abs(bp.b) - tick,
        };
      }),
    };
  });
  const pass1 = rankAll(base);
  const pass2 = secondPass(base, pass1);
  return { ...pass2.ident, pass1, pass2Info: pass2.info };
}

type BaseCand = Omit<ScoredCandidate, 'logLikelihood' | 'logDistance'> & { logDistance?: number };
type BaseLine = { line: CoverMapLine; preselected: number; cands: BaseCand[] };

/** Rank every line's candidates, re-estimating sigma_theta and sigma_b from the best candidates until stable. */
function rankAll(base: readonly BaseLine[]): EpochIdentification {
  let sT = 1;
  let sB = 1;
  let result: LineMatch[] = [];
  let iterations = 0;
  for (let it = 0; it < 100; it++) {
    iterations = it + 1;
    result = base.map((b) => {
      const ranked: ScoredCandidate[] = b.cands
        .map((c) => ({
          ...c,
          logDistance: c.logDistance ?? 0,
          logLikelihood: c.periodLogLikelihood + logGauss(c.dLonDeg, sT) + (c.dLatDeg === null ? 0 : logGauss(c.dLatDeg, sB)) + (c.logDistance ?? 0),
        }))
        .sort((x, y) => (y.logLikelihood - x.logLikelihood) || (x.entry.jname < y.entry.jname ? -1 : 1));
      const best = ranked[0] ?? null;
      const runnerUp = ranked[1] ?? null;
      const others = ranked.slice(1).map((c) => c.logLikelihood).filter((v) => v > -Infinity);
      const mx = others.length ? Math.max(...others) : -Infinity;
      const lseOthers = others.length ? mx + Math.log(others.reduce((acc, v) => acc + Math.exp(v - mx), 0)) : -Infinity;
      return {
        line: b.line, preselected: b.preselected, ranked, best, runnerUp,
        log10Margin: best && runnerUp ? (best.logLikelihood - runnerUp.logLikelihood) / Math.LN10 : Infinity,
        log10Odds: best ? (best.logLikelihood - lseOthers) / Math.LN10 : -Infinity,
      };
    });
    const lon = result.filter((r) => r.best).map((r) => (r.best as ScoredCandidate).dLonDeg);
    const lat = result.filter((r) => r.best && r.best.dLatDeg !== null).map((r) => (r.best as ScoredCandidate).dLatDeg as number);
    const nT = Math.sqrt(lon.reduce((acc, x) => acc + x * x, 0) / lon.length);
    const nB = Math.sqrt(lat.reduce((acc, x) => acc + x * x, 0) / lat.length);
    const done = Math.abs(nT - sT) < 1e-9 && Math.abs(nB - sB) < 1e-9;
    sT = nT;
    sB = nB;
    if (done) break;
  }
  return { lines: result, sigmaThetaDeg: sT, sigmaBDeg: sB, iterations };
}

/** Anchor rule: pass-1 odds against all other candidates combined of at least 20 ("strong evidence", Kass and Raftery 1995), or no competitor. */
export const ANCHOR_LOG10_MARGIN = Math.log10(20);

export interface SecondPassInfo {
  anchors: string[];
  /** Shared age from fitAgeAndVelocity on the old anchors, years, and the pulsars it dropped. */
  fittedAgeYears: number;
  ageFitDropped: string[];
  /** Map origin from all anchors, observer frame at the map epoch, galactic in-plane pc; common rotation, deg. */
  originPc: [number, number];
  alphaDeg: number;
  /** Map distance scale, pc per R0 (median over anchors), and the rms of the anchors' log length ratios. */
  scalePcPerR0: number;
  sigmaLn: number;
  /** ln of the neutral distance factor given to candidates without a distance (the anchors' mean density). */
  neutralLogDistance: number;
}

/** Student-t density with 2 degrees of freedom, ln: ln(1 / (2 sqrt 2)) - 1.5 ln(1 + t^2 / 2). */
const logT2 = (t: number): number => -Math.log(2 * Math.SQRT2) - 1.5 * Math.log1p((t * t) / 2);

/** Position relative to the observer, moved back by the measured relative proper motion over `years`; galactic pc; null without a distance. */
export function backProjectedPositionPc(e: AlienPulsar, years: number): Vec3 | null {
  if (e.distKpc === null) return null;
  const dPc = e.distKpc * 1000;
  let pos = scale(e.nHat, dPc);
  if (e.pmraObs !== null && e.pmdecObs !== null) {
    const [p, q] = eastNorth(e.raDeg, e.decDeg);
    const vRel = scale(add(scale(p, e.pmraObs), scale(q, e.pmdecObs)), KMS_PER_MASYR_PC * dPc);
    pos = add(pos, scale(vRel, -KM_S_TO_PC_PER_YEAR * years));
  }
  return toGalacticCartesian(pos);
}

/**
 * Pass 2 (D-A16 amended), the alien's real order of work. The anchors (pass-1 odds at least 20, or
 * alone) give the shared age (fitAgeAndVelocity on the old anchors, which drops a wrong map period as
 * an outlier) and the map's origin (triangulation.ts from the anchors' positions back-projected by that
 * age; when scoring an anchor's own line, the fit leaves that line out). Every line is then re-scored:
 * direction is the bearing from the fitted origin to the candidate's back-projected position against
 * the map angle plus the fitted rotation (a candidate without a distance is taken as far away: its own
 * back-projected longitude); a new distance factor compares the in-plane distance from the origin with
 * the map length times the anchors' scale, x = ln(r / (rOverR0 scale)), Student-t with 2 degrees of
 * freedom on x / sigma_ln, sigma_ln the rms of the anchors' x (a candidate without a distance gets the
 * anchors' mean density, a neutral factor). The period factor keeps the RTG window, so a wrong map
 * number cannot lose its line to a young impostor; latitude is unchanged.
 */
function secondPass(base: readonly BaseLine[], pass1: EpochIdentification): { ident: EpochIdentification; info: SecondPassInfo } {
  const anchors = pass1.lines.filter((m) => m.best !== null && m.log10Odds >= ANCHOR_LOG10_MARGIN);
  const bestOf = (m: LineMatch): AlienPulsar => (m.best as ScoredCandidate).entry;
  const old = anchors.filter((m) => {
    const e = bestOf(m);
    return e.pdotMeas !== null && e.pdotMeas > 0 && characteristicAgeYears(e.pObs, e.pdotMeas) >= OLD_TAU_C_YEARS;
  });
  const ageFit = fitAgeAndVelocity(old.map((m) => ({ entry: bestOf(m), line: m.line })));
  const age = ageFit.ageYears;
  const anchorPts: { jname: string; pt: MapPoint }[] = [];
  for (const m of anchors) {
    const e = bestOf(m);
    const pos = backProjectedPositionPc(e, age);
    if (!pos || e.distKpc === null) continue;
    anchorPts.push({ jname: m.line.jname, pt: { name: m.line.bname, angleDeg: m.line.mapAngleDeg, rOverR0: m.line.rOverR0, posPc: pos, distKpc: e.distKpc, distance: e.distance } });
  }
  const full = fitMapOrigin(anchorPts.map((x) => x.pt));
  const inPlane = (pos: Vec3, o: readonly [number, number]): number => Math.hypot(pos[0] - o[0], pos[1] - o[1]);
  const ratios = anchorPts.map((x) => inPlane(x.pt.posPc, full.originPc) / x.pt.rOverR0).sort((a, b) => a - b);
  const mid = ratios.length >> 1;
  const scalePc = ratios.length % 2 ? (ratios[mid] as number) : ((ratios[mid - 1] as number) + (ratios[mid] as number)) / 2;
  const xs = anchorPts.map((x) => Math.log(inPlane(x.pt.posPc, full.originPc) / (x.pt.rOverR0 * scalePc)));
  const sigmaLn = Math.sqrt(xs.reduce((acc, x) => acc + x * x, 0) / xs.length);
  const logDist = (x: number): number => logT2(x / sigmaLn) - Math.log(sigmaLn);
  const neutral = Math.log(xs.reduce((acc, x) => acc + Math.exp(logDist(x)), 0) / xs.length);
  const loo = new Map<string, OriginFit>();
  const originFor = (line: CoverMapLine): OriginFit => {
    if (!anchorPts.some((x) => x.jname === line.jname)) return full;
    const hit = loo.get(line.jname);
    if (hit) return hit;
    const f = fitMapOrigin(anchorPts.filter((x) => x.jname !== line.jname).map((x) => x.pt));
    loo.set(line.jname, f);
    return f;
  };
  const base2: BaseLine[] = base.map((b) => {
    const o = originFor(b.line);
    return {
      ...b,
      cands: b.cands.map((c) => {
        const pos = backProjectedPositionPc(c.entry, age);
        if (!pos) {
          const bp = backProjected(c.entry, age);
          return { ...c, dLonDeg: wrapDeg(b.line.mapAngleDeg + o.alphaDeg - bp.l), logDistance: neutral };
        }
        const bearing = Math.atan2(pos[1] - o.originPc[1], pos[0] - o.originPc[0]) / DEG;
        const x = Math.log(inPlane(pos, o.originPc) / (b.line.rOverR0 * scalePc));
        return { ...c, dLonDeg: wrapDeg(b.line.mapAngleDeg + o.alphaDeg - bearing), logDistance: logDist(x) };
      }),
    };
  });
  return {
    ident: rankAll(base2),
    info: {
      anchors: anchors.map((m) => m.line.bname),
      fittedAgeYears: age,
      ageFitDropped: ageFit.dropped,
      originPc: full.originPc,
      alphaDeg: full.alphaDeg,
      scalePcPerR0: scalePc,
      sigmaLn,
      neutralLogDistance: neutral,
    },
  };
}
