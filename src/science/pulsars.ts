// The pulsar map: map periods, spin-down forward and back, dating the map today, and identifying
// each map line among the whole catalogue. Physics and numbers: docs/research/clocks.md sections 2
// and 3, docs/research/cover.md sections 1d and 2.
// Pure and deterministic: no DOM, no randomness, no file reads.

import { mjdToDecimalYear } from './astro';
import { mean, sd } from './stats';
import type { CoverMapLine, GlitchRecord, PulsarRecord } from './types';
import { JULIAN_YEAR_S } from './units';

// ---------------------------------------------------------------------------------------------
// Map periods

/** A map line's period, s: N hydrogen periods, N / hz. SAGAN_HYDROGEN_HZ reproduces the research; the alien uses HYDROGEN_HZ. */
export function mapPeriod(line: Pick<CoverMapLine, 'valueTH'>, hz: number): number {
  return line.valueTH / hz;
}

// ---------------------------------------------------------------------------------------------
// Spin-down with a constant braking index n (clocks.md 3b "Formulas")
//
// nu-dot = -K nu^n is equivalent to dP/dt = k P^(2-n). With m = n - 1:
//   forward  P^m = P0^m + m P0^(m-1) Pdot0 t, so P = P0 (1 + m u)^(1/m), u = Pdot0 t / P0
//            (m = 0: P = P0 exp(u)); Pdot = Pdot0 (P / P0)^(2-n).
//   inverse  t = (P^m - Pm^m) / (m P^(m-1) Pdot) = (P / Pdot) (1 - x^m) / m, x = Pm / P
//            (m = 0: (P / Pdot) ln(P / Pm)).
// Both are written with log1p / expm1 so that the tiny changes of old pulsars (1e-7 of P over
// decades) keep full double precision.

/** Period and period derivative after t seconds of spin-down with braking index n. Infinity when the pulsar has spun down completely (n < 1 only). */
export function spinForward(p0: number, pdot0: number, n: number, tSeconds: number): { p: number; pdot: number } {
  const m = n - 1;
  const u = (pdot0 * tSeconds) / p0;
  let p: number;
  if (Math.abs(m) < 1e-12) p = p0 * Math.exp(u);
  else {
    const base = m * u;
    if (base <= -1) return { p: Infinity, pdot: Infinity };
    p = p0 * Math.exp(Math.log1p(base) / m);
  }
  return { p, pdot: pdot0 * Math.pow(p / p0, 1 - m) };
}

/** Elapsed time, s, since the period was pMap, from the period and derivative now and a braking index n. */
export function elapsedFromSpin(p: number, pdot: number, pMap: number, n: number): number {
  const m = n - 1;
  const lx = Math.log1p((pMap - p) / p); // ln(Pm / P), precise when Pm is close to P
  const g = Math.abs(m) < 1e-12 ? -lx : -Math.expm1(m * lx) / m;
  return (p / pdot) * g;
}

/** Characteristic age P / (2 Pdot), years. */
export function characteristicAgeYears(p: number, pdot: number): number {
  return p / (2 * pdot) / JULIAN_YEAR_S;
}

// ---------------------------------------------------------------------------------------------
// Dating the map today (clocks.md 3a)

/**
 * The research's rule for which ephemeris terms to trust (clocks.md 3a and the Table 2A note): F0 and
 * F1 always; F2 (and F3) only when the braking index F2 implies, n = F0 F2 / F1^2, is a physical
 * spin-down value. The window is the identification range [0.9, 4] (measured young-pulsar braking
 * indices run from 0.9 to 3.15, the magnetic dipole gives 3). Of the 14 map pulsars only the Crab
 * qualifies (n = 2.34); the others' F2 imply -10,509 to +38,485, which is timing noise [HLK10].
 */
export const PHYSICAL_N_RANGE: readonly [number, number] = [0.9, 4];

export function f2BrakingIndex(p: Pick<PulsarRecord, 'f0' | 'f1' | 'f2'>): number | null {
  if (p.f0 === null || p.f1 === null || p.f2 === null || p.f1 === 0) return null;
  return (p.f0 * p.f2) / (p.f1 * p.f1);
}

/** A glitch this many days after PEPOCH is taken as at PEPOCH (post-glitch ephemeris; see impliedEpoch). */
export const POST_GLITCH_EPOCH_DAYS = 1;

export interface ImpliedEpoch {
  mjd: number;
  decimalYear: number;
  /** True when F2 (and F3 when present) were used (the physical-n rule above). */
  usedHigherDerivatives: boolean;
  glitchesAdded: number;
  sumDfOverF: number;
}

/**
 * The date when the ATNF ephemeris nu(t) = F0 + F1 dt + F2 dt^2 / 2 + F3 dt^3 / 6 equals 1 / pMap.
 * Optional glitch correction (clocks.md 3a, Vela and B1727-47): every glitch after the solved epoch,
 * up to and including PEPOCH, raised nu by dfOverF x nu, so before it the pulsar spun slower than the
 * back-extrapolation; adding those jumps to the target and re-solving, until the set of glitches in
 * the window stops changing, gives the corrected epoch. A glitch up to POST_GLITCH_EPOCH_DAYS after
 * PEPOCH counts as at PEPOCH: an ephemeris referenced to a glitch epoch is the post-glitch fit (an
 * assumption, true for Vela: ATNF's F0 at MJD 51559.319 is Dodson, McCulloch and Lewis 2002's
 * pre-glitch nu plus the permanent jump of the January 2000 glitch).
 */
export function impliedEpoch(p: PulsarRecord, pMap: number, opts: { glitches?: readonly GlitchRecord[] } = {}): ImpliedEpoch {
  if (p.f0 === null || p.f1 === null || p.pepoch === null) throw new Error(`impliedEpoch: ${p.jname} lacks F0, F1 or PEPOCH`);
  const f0 = p.f0;
  const f1 = p.f1;
  const nF2 = f2BrakingIndex(p);
  const higher = nF2 !== null && nF2 >= PHYSICAL_N_RANGE[0] && nF2 <= PHYSICAL_N_RANGE[1];
  const f2 = higher ? (p.f2 as number) : 0;
  const f3 = higher ? (p.f3 ?? 0) : 0;
  const nu = (dt: number): number => f0 + dt * (f1 + dt * (f2 / 2 + (dt * f3) / 6));
  const nuDot = (dt: number): number => f1 + dt * (f2 + (dt * f3) / 2);
  const solve = (target: number): number => {
    let dt = (target - f0) / f1;
    if (higher) {
      for (let i = 0; i < 100; i++) {
        const step = (nu(dt) - target) / nuDot(dt);
        dt -= step;
        if (Math.abs(step) < 1e-3) break; // 1 ms of time: far below any precision quoted here
      }
    }
    return dt;
  };
  const pepoch = p.pepoch;
  const base = 1 / pMap;
  let dt = solve(base);
  let used: GlitchRecord[] = [];
  const glitches = opts.glitches ?? [];
  for (let iter = 0; iter < 50; iter++) {
    const mjd = pepoch + dt / 86_400;
    const inWindow = glitches.filter((g) => g.mjd > mjd && g.mjd <= pepoch + POST_GLITCH_EPOCH_DAYS);
    const same = inWindow.length === used.length && inWindow.every((g, i) => g === used[i]);
    if (same && iter > 0) break;
    used = inWindow;
    const jump = used.reduce((acc, g) => acc + g.dfOverF * nu((g.mjd - pepoch) * 86_400), 0);
    dt = solve(base + jump);
  }
  const mjd = pepoch + dt / 86_400;
  return {
    mjd,
    decimalYear: mjdToDecimalYear(mjd),
    usedHigherDerivatives: higher,
    glitchesAdded: used.length,
    sumDfOverF: used.reduce((acc, g) => acc + g.dfOverF, 0),
  };
}

export interface MapDatingRow {
  line: CoverMapLine;
  pulsar: PulsarRecord;
  pMap: number;
  raw: ImpliedEpoch;
  corrected: ImpliedEpoch;
  /** False when the implied epoch is more than OUTLIER_SD standard deviations of the others from their mean. */
  usable: boolean;
  /** |epoch - mean of the others| / sd of the others (raw epochs). */
  outlierScore: number;
}

/**
 * Outlier rule for dating today: a pulsar whose raw implied epoch lies more than 10 standard deviations
 * of the other pulsars' epochs from their mean cannot be dating the same map. The others scatter by
 * about 1.4 yr (clocks.md 3a), so the rule only rejects implied epochs centuries away; a pulsar whose
 * map period is simply imprecise (B1240-64, known to 3 figures, SSD72) lands thousands of years off.
 */
export const OUTLIER_SD = 10;

export interface MapDating {
  rows: MapDatingRow[];
  usable: MapDatingRow[];
  rawMean: number;
  rawSd: number;
  correctedMean: number;
  correctedSd: number;
}

export function dateMapToday(
  lines: readonly CoverMapLine[],
  byJname: ReadonlyMap<string, PulsarRecord>,
  glitches: Readonly<Record<string, readonly GlitchRecord[]>>,
  hz: number,
): MapDating {
  const rows: MapDatingRow[] = lines.map((line) => {
    const pulsar = byJname.get(line.jname);
    if (!pulsar) throw new Error(`dateMapToday: ${line.jname} not in the catalogue`);
    const pMap = mapPeriod(line, hz);
    const raw = impliedEpoch(pulsar, pMap);
    const corrected = impliedEpoch(pulsar, pMap, { glitches: glitches[line.jname] ?? [] });
    return { line, pulsar, pMap, raw, corrected, usable: true, outlierScore: 0 };
  });
  for (const r of rows) {
    const others = rows.filter((o) => o !== r).map((o) => o.raw.decimalYear);
    r.outlierScore = Math.abs(r.raw.decimalYear - mean(others)) / sd(others);
    r.usable = r.outlierScore <= OUTLIER_SD;
  }
  const usable = rows.filter((r) => r.usable);
  const raw = usable.map((r) => r.raw.decimalYear);
  const cor = usable.map((r) => r.corrected.decimalYear);
  return { rows, usable, rawMean: mean(raw), rawSd: sd(raw), correctedMean: mean(cor), correctedSd: sd(cor) };
}

// ---------------------------------------------------------------------------------------------
// Identification (PLAN.md chapter 2)

/** A pulsar as the identifier sees it: period and derivative now, galactic longitude, deg. */
export interface CandidateView {
  jname: string;
  bname: string | null;
  p: number;
  /** null when the catalogue has no spin-down (no P1). */
  pdot: number | null;
  lDeg: number;
}

export interface IdentifyOptions {
  /** Direction tolerance, deg. */
  directionTolDeg: number;
  /** Relative allowance on the measured period for an unknown Doppler shift (0 today; 1e-3 at the epoch). */
  dopplerAllowance: number;
  /** Elapsed-time window the map age must overlap, years. */
  windowYears: readonly [number, number];
  /** Braking-index range searched. */
  nRange: readonly [number, number];
  /** Half-width of the map period's precision, s, per line. */
  mapHalfWidth: (line: CoverMapLine) => number;
  hz: number;
}

export interface LineIdentification {
  line: CoverMapLine;
  directionCandidates: CandidateView[];
  candidates: { view: CandidateView; tRangeYears: [number, number] | null }[];
}

/** Signed difference a - b wrapped to (-180, 180], deg. */
export function wrapDeg(x: number): number {
  let d = ((x % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Range of the elapsed time t over the box n in nRange, P within the Doppler allowance, Pm within its
 * precision. t = (P / Pdot) (1 - x^m) / m with x = Pm / P is increasing in P, decreasing in Pm and
 * monotone in m (for fixed x, (1 - x^m) / m decreases with m), so its extremes sit at the corners.
 */
export function elapsedRangeYears(
  p: number, pdot: number, pMapLo: number, pMapHi: number, dopplerAllowance: number, nRange: readonly [number, number],
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const pp of [p * (1 - dopplerAllowance), p * (1 + dopplerAllowance)]) {
    for (const pm of [pMapLo, pMapHi]) {
      for (const n of nRange) {
        const t = elapsedFromSpin(pp, pdot, pm, n) / JULIAN_YEAR_S;
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
  }
  return [lo, hi];
}

/**
 * Every line's consistent candidates: direction first (galactic longitude within directionTolDeg of
 * the map angle), then age (the elapsed-time range overlaps the window). A candidate without a
 * spin-down rate cannot be aged; it is kept only if its period, within the Doppler allowance, overlaps
 * the map period's precision interval (that is, if it is consistent with no change at all).
 */
export function identifyLines(lines: readonly CoverMapLine[], pulsars: readonly CandidateView[], opts: IdentifyOptions): LineIdentification[] {
  return lines.map((line) => {
    const pm = mapPeriod(line, opts.hz);
    const hw = opts.mapHalfWidth(line);
    const dir = pulsars.filter((c) => Number.isFinite(c.p) && Math.abs(wrapDeg(c.lDeg - line.mapAngleDeg)) <= opts.directionTolDeg);
    const candidates: LineIdentification['candidates'] = [];
    for (const c of dir) {
      if (c.pdot === null || c.pdot === 0) {
        const pLo = c.p * (1 - opts.dopplerAllowance);
        const pHi = c.p * (1 + opts.dopplerAllowance);
        if (pHi >= pm - hw && pLo <= pm + hw) candidates.push({ view: c, tRangeYears: null });
        continue;
      }
      const r = elapsedRangeYears(c.p, c.pdot, pm - hw, pm + hw, opts.dopplerAllowance, opts.nRange);
      if (r[1] >= opts.windowYears[0] && r[0] <= opts.windowYears[1]) candidates.push({ view: c, tRangeYears: r });
    }
    return { line, directionCandidates: dir, candidates };
  });
}

/**
 * The catalogue as an identifier would use it today: period at decimalYear from P0 and P1 at PEPOCH
 * (linear over decades; the curvature term is Pdot t^2 / (4 tau_c), under 1e-5 of the change for
 * tau_c > 1,000 yr), catalogue longitude. Pulsars with no period are skipped.
 */
export function catalogueViewToday(pulsars: readonly PulsarRecord[], decimalYear: number): CandidateView[] {
  const out: CandidateView[] = [];
  for (const r of pulsars) {
    if (r.p0 === null) continue;
    const dtS = r.pepoch === null || r.p1 === null ? 0 : (decimalYear - mjdToDecimalYear(r.pepoch)) * JULIAN_YEAR_S;
    out.push({ jname: r.jname, bname: r.bname, p: r.p0 + (r.p1 ?? 0) * dtS, pdot: r.p1, lDeg: r.gl });
  }
  return out;
}

/**
 * Significant figures of the 1972 periods as Sagan, Salzman Sagan and Drake (1972, Science 175, 881)
 * state them: "almost all ... accurate to nine significant figures"; B1240-64 known to three
 * (0.388 s); B1727-47 to about six (its trailing zeros). clocks.md section 2 identification notes and
 * cover.md 1d. Human knowledge, used only for the identification today.
 */
export const SSD72_SIG_FIGS: Readonly<Record<string, number>> = { '1240': 3, '1727': 6 };
export const SSD72_DEFAULT_SIG_FIGS = 9;

/** Half of the last stated digit of the 1972 period, s. */
export function ssd72HalfWidth(line: CoverMapLine, hz: number): number {
  const pm = mapPeriod(line, hz);
  const sig = SSD72_SIG_FIGS[line.label1972] ?? SSD72_DEFAULT_SIG_FIGS;
  const e = Math.floor(Math.log10(pm));
  return 0.5 * Math.pow(10, e - sig + 1);
}

/**
 * Real precision of the 1970/71 periods: Johnston found them within 0.4 ppm of Taylor and Manchester's
 * 1975 catalogue for every pulsar except the three young ones (cover.md section 2, "Errors and
 * disputes"), an empirical measure of the 1970 measurements' accuracy (decision D-A16).
 */
export const PERIOD_1970_PPM = 0.4e-6;

/** Half-width of a 1972 period as the identifier should trust it today: max(stated digits, 0.4 ppm of P_map), s. */
export function honestHalfWidth1970(line: CoverMapLine, hz: number): number {
  return Math.max(ssd72HalfWidth(line, hz), PERIOD_1970_PPM * mapPeriod(line, hz));
}

/** Half of one least significant bit of the binary period, s (rounding to the nearest integer). */
export function lsbHalfWidth(hz: number): number {
  return 0.5 / hz;
}
