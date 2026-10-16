import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { dot, mjdToDecimalYear, toGalacticCartesian, type Vec3 } from './astro';
import { discoveryState, homeObserver } from './epoch';
import { combineAges, datePulsar, fitAgeAndVelocity, velocityMahalanobis2, type PulsarAge } from './pulsarAge';
import { LYNE2010_PEAK_TO_PEAK, drawObserver, projectPulsar, type AlienPulsar } from './pulsarEpoch';
import { dateMapToday, mapPeriod } from './pulsars';
import { createRng } from './random';
import { C_KM_S, HYDROGEN_HZ, JULIAN_YEAR_S, SAGAN_HYDROGEN_HZ } from './units';

const cover = loadCover();
const cat = loadPulsars();
const byJ = new Map(cat.pulsars.map((p) => [p.jname, p]));
const scenario = loadScenario();
const stars = loadStars();
const disc = discoveryState(scenario, stars);
const observer = homeObserver(scenario, stars, disc.decimalYear);
const lines = cover.pulsarMap.lines;
const T = disc.decimalYear;
const today = dateMapToday(lines, byJ, loadGlitches().pulsars, SAGAN_HYDROGEN_HZ);

/**
 * Truth for each pulsar (spec): the time from its own implied epoch today (clocks.md 3a; raw, but
 * glitch-corrected for Vela and B1727-47) to now, the observer's time T. (The estimate removes the
 * light-time offset, so both refer to T; the spec's "emission epoch" differs by at most 3.3 yr.)
 * B1240-64: T minus 1970.0, since its map period is wrong.
 */
function truthYears(bname: string): number {
  const row = today.rows.find((r) => r.line.bname === bname);
  if (!row) throw new Error(bname);
  if (bname === 'B1240-64') return T - 1970.0;
  if (bname === 'B0833-45' || bname === 'B1727-47') return T - row.corrected.decimalYear;
  return T - row.raw.decimalYear;
}

function realization(seed: string, opts: Parameters<typeof projectPulsar>[2] extends infer O ? Partial<O> : never = {}): AlienPulsar[] {
  return lines.map((l) => {
    const a = projectPulsar(byJ.get(l.jname)!, observer, { seed, ...opts });
    if (!a) throw new Error(l.jname);
    return a;
  });
}

const percentile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};

describe('dating at the story epoch without the reframe', () => {
  it('old pulsars are off by the observer Doppler shift, -2 tau_c (V . n) / c', () => {
    // Controlled realization: no timing noise, light time, parallax or Shklovskii; n_true = n_assumed = 3.
    const alien = realization('noReframe.controlled', { nominal: true, lightTime: false, parallax: false, shklovskii: false, timingNoise: false });
    const rows: string[] = [];
    let worst = 0;
    lines.forEach((l, i) => {
      const a = alien[i] as AlienPulsar;
      if (a.truth.young) return;
      const est = datePulsar(a, l, { seed: 'c', draws: 2, fixedN: 3, timingNoise: false, mapPrecision: false });
      // B1240-64's own implied epoch is the consistent truth here (its wrong period cancels).
      const truth = T - (today.rows[i]?.raw.decimalYear as number);
      const err = est.median - truth;
      const tauC = est.tauCYears;
      const pred = (-2 * tauC * dot(observer.velKmS, a.nHat)) / C_KM_S;
      const rel = Math.abs(err / pred - 1);
      worst = Math.max(worst, rel);
      rows.push(`${l.bname} ${err.toFixed(0)} vs ${pred.toFixed(0)} yr`);
      // 2% (spec). The first-order formula neglects terms of relative size dP/P since the map (at most
      // 2.3%, B1933+16, clocks.md 3b) times 1/2 and (V/c) / (V . n / c), both checked by the size of rel.
      expect(rel, l.bname).toBeLessThanOrEqual(0.02);
    });
    // Everything on: one full realization, Monte Carlo over n and timing noise, still no reframe.
    const full = realization('noReframe.full');
    const errs: number[] = [];
    const rowsFull: string[] = [];
    lines.forEach((l, i) => {
      const a = full[i] as AlienPulsar;
      if (a.truth.young || l.bname === 'B1240-64') return;
      const est = datePulsar(a, l, { seed: 'noReframe.full', draws: 2000 });
      const e = est.median - truthYears(l.bname);
      errs.push(e);
      rowsFull.push(`${l.bname} ${e >= 0 ? '+' : ''}${e.toFixed(0)}`);
    });
    const m = errs.reduce((s, x) => s + x, 0) / errs.length;
    const sdv = Math.sqrt(errs.reduce((s, x) => s + (x - m) ** 2, 0) / (errs.length - 1));
    recordCheck({
      id: 'dating.epoch.noReframe',
      claim: "Without moving into the Sun's rest frame, the old pulsars disagree about the map's age by thousands of years, exactly as the home star's own motion predicts.",
      measured: `controlled run, error vs prediction: ${rows.join('; ')} (worst ${(worst * 100).toFixed(2)}%). Full realization errors: ${rowsFull.join(', ')} yr; s.d. ${sdv.toFixed(0)} yr`,
      expected: 'clocks.md 3b point 4: error = -2 tau_c (V . n) / c (400 yr per km/s for B2016+28)',
      tolerance: '2% per pulsar in the controlled run (no timing noise, light time, parallax or Shklovskii; n known)',
      pass: worst <= 0.02,
      notes: `Gliese 445 moves at ${Math.hypot(...observer.velKmS).toFixed(1)} km/s relative to the Sun. B1240-64 excluded from the scatter (wrong map period).`,
    });
  });
});

interface Trial {
  /** True timing-noise rms of each pulsar in this realization, by J name. */
  truthAmp: Map<string, number>;
  ages: PulsarAge[];
  combined: ReturnType<typeof combineAges>;
  combinedTruth: number;
}

let trialsCache: Trial[] | null = null;
const N_TRIALS = 300; // spec: 300 realizations (binomial s.e. of a 95% coverage 1.26%)
const DRAWS = 2000; // spec: at least 2,000 Monte Carlo draws per pulsar

type TruthOpts = Partial<Parameters<typeof projectPulsar>[2]>;

function runTrials(n: number, tag: string, truthOpts: TruthOpts = {}): Trial[] {
  const out: Trial[] = [];
  for (let r = 0; r < n; r++) {
    const seed = `${tag}/${r}`;
    const alien = realization(seed, truthOpts);
    const measured = drawObserver(observer, createRng(seed).fork('measure/observer'));
    const ages = lines.map((l, i) => datePulsar(alien[i] as AlienPulsar, l, { seed: `date/${tag}/${r}`, draws: DRAWS, reframe: measured }));
    const old = ages.filter((a) => !a.young);
    const combined = combineAges(old);
    let ct = 0;
    for (const a of combined.kept) ct += (combined.weights.get(a.jname) as number) * truthYears(lines.find((l) => l.jname === a.jname)!.bname);
    out.push({ truthAmp: new Map(alien.map((a) => [a.jname, a.truth.timingNoiseRms])), ages, combined, combinedTruth: ct });
  }
  return out;
}

function trials(): Trial[] {
  if (!trialsCache) trialsCache = runTrials(N_TRIALS, 'reframe');
  return trialsCache;
}

const coverageOf = (ts: readonly Trial[]): number => ts.filter((t) => t.combined.lo <= t.combinedTruth && t.combinedTruth <= t.combined.hi).length / ts.length;

describe('dating at the story epoch in the Sun\'s rest frame', () => {
  it('the combined 95% interval contains the truth in 92% to 98% of 300 realizations (under the stated model)', () => {
    const ts = trials();
    const cov = coverageOf(ts);
    recordCheck({
      id: 'dating.epoch.coverage',
      claim: 'Under the stated model, the combined pulsar age range is honest: its 95% range contains the true age about 95% of the time.',
      measured: `coverage ${(cov * 100).toFixed(1)}% over ${ts.length} seeded realizations`,
      expected: '95%',
      tolerance: '92% to 98% (about 2.4 binomial standard errors of 1.26% for 300 trials)',
      pass: cov >= 0.92 && cov <= 0.98,
      notes: 'This proves the interval code under the stated model (truth drawn from the same braking-index, timing-noise and distance models the estimator assumes); dating.epoch.misspecified tests it when they differ.',
    });
    expect(cov).toBeGreaterThanOrEqual(0.92);
    expect(cov).toBeLessThanOrEqual(0.98);
  });

  it('dates the nominal realization within its own interval, without bias', () => {
    // Nominal realization: n = 3 for unmeasured pulsars, catalogue distances and motions as the truth.
    const seed = 'reframe.nominal';
    const alien = realization(seed, { nominal: true });
    const measured = drawObserver(observer, createRng(seed).fork('measure/observer'));
    const ages = lines.map((l, i) => datePulsar(alien[i] as AlienPulsar, l, { seed, draws: DRAWS, reframe: measured }));
    const c = combineAges(ages.filter((a) => !a.young));
    let truth = 0;
    for (const a of c.kept) truth += (c.weights.get(a.jname) as number) * truthYears(lines.find((l) => l.jname === a.jname)!.bname);
    const inside = c.lo <= truth && truth <= c.hi;
    const ts = trials();
    const halfWidths = ts.map((t) => (t.combined.hi - t.combined.lo) / 2);
    const errs = ts.map((t) => t.combined.estimate - t.combinedTruth);
    const medHalf = percentile(halfWidths, 0.5);
    const medErr = percentile(errs, 0.5);
    // Bias criterion: the median error under a tenth of the median half-width (D-A16 audit).
    const unbiased = Math.abs(medErr) < 0.1 * medHalf;
    recordCheck({
      id: 'dating.epoch.reframe',
      claim: "Moved into the Sun's rest frame, the old pulsars agree: combined, they date the map to within a few hundred years.",
      measured: `nominal realization: ${c.estimate.toFixed(0)} yr [${c.lo.toFixed(0)}, ${c.hi.toFixed(0)}], truth ${truth.toFixed(0)} yr, ${c.kept.length} pulsars kept; over ${ts.length} realizations median 95% half-width ${medHalf.toFixed(0)} yr, median error ${medErr.toFixed(0)} yr`,
      expected: "the time since each pulsar's implied epoch today (clocks.md 3a), combined with the same weights",
      tolerance: 'nominal estimate within its own 95% interval of the truth; median error under a tenth of the median half-width',
      pass: inside && unbiased,
      notes: 'Under the stated model (see dating.epoch.misspecified for model errors).',
    });
    expect(inside).toBe(true);
    expect(unbiased).toBe(true);
  });

  it('stays honest when the truth breaks the model (misspecification)', () => {
    // 100 realizations each: binomial s.e. about 2.2% at 95%. The 80% floor is a chosen floor, not a
    // derived one: on a 95% claim it allows four times the stated miss rate. The coverages themselves
    // are the result and are recorded whatever they are.
    const N = 100;
    // Old-pulsar glitches left in the truth: cumulative spin-up per year. B1642-03: 7 glitches of at
    // most 2.6e-9 in about 40 yr (clocks.md Table 2A, Shabanova 2009), upper size used. Others: the
    // Jodrell Bank sizes summed over its record, taken as 1970 to 2026.8 (an approximation).
    const spin: Record<string, number> = { 'J1645-0317': (7 * 2.6e-9) / 40 };
    const gl = loadGlitches().pulsars;
    for (const l of lines) {
      const tau = byJ.get(l.jname)!;
      if ((tau.p0 as number) / (2 * (tau.p1 as number)) / JULIAN_YEAR_S < 300_000) continue;
      const sum = (gl[l.jname] ?? []).reduce((acc, g) => acc + g.dfOverF, 0);
      if (sum > 0) spin[l.jname] = sum / (2026.8 - 1970);
    }
    const nominal = trials();
    const cases: { name: string; opts: TruthOpts }[] = [
      { name: 'old braking index truly U[1, 5] (estimator assumes U[2, 4])', opts: { nOldRange: [1, 5] } },
      { name: 'two-state switching timing noise (estimator assumes Gaussian)', opts: { timingNoiseModel: 'twoState' } },
      { name: 'old-pulsar glitches left in the truth (estimator ignores them)', opts: { glitchSpinUpPerYear: spin } },
      { name: 'amplitude measured twice as badly as assumed (truth sigma_ln 0.6, estimator 0.3)', opts: { amplitudeMeasLnSigma: 0.6 } },
    ];
    const rows: string[] = [];
    let ok = true;
    const medErrNominal = percentile(nominal.map((t) => t.combined.estimate - t.combinedTruth), 0.5);
    for (const [i, c] of cases.entries()) {
      const ts = runTrials(N, `misspecified/${i}`, c.opts);
      const cov = coverageOf(ts);
      const errs = ts.map((t) => t.combined.estimate - t.combinedTruth);
      const medErr = percentile(errs, 0.5);
      if (cov < 0.8) ok = false;
      rows.push(`${c.name}: coverage ${(cov * 100).toFixed(0)}% of ${N}, median error ${medErr.toFixed(0)} yr (model: ${medErrNominal.toFixed(0)} yr), median half-width ${percentile(ts.map((t) => (t.combined.hi - t.combined.lo) / 2), 0.5).toFixed(0)} yr`);
    }
    // The lesson run: same truth model, but the estimator uses one default amplitude for every pulsar.
    let lessonHits = 0;
    for (let r = 0; r < N; r++) {
      const seed = `misspecified/lesson/${r}`;
      const alien = realization(seed);
      const m = drawObserver(observer, createRng(seed).fork('measure/observer'));
      const ages = lines.map((l, i) => datePulsar(alien[i] as AlienPulsar, l, { seed: `date/${seed}`, draws: DRAWS, reframe: m, noiseAmplitude: 'default' }));
      const c = combineAges(ages.filter((a) => !a.young));
      let ct = 0;
      for (const a of c.kept) ct += (c.weights.get(a.jname) as number) * truthYears(lines.find((l) => l.jname === a.jname)!.bname);
      if (c.lo <= ct && ct <= c.hi) lessonHits++;
    }
    const lessonCov = lessonHits / N;
    // The glitch bias itself, deterministic: one nominal realization dated with and without the glitches.
    const datedWith = (opts: TruthOpts): ReturnType<typeof combineAges> => {
      const alien = realization('glitchShift', { nominal: true, ...opts });
      const m = drawObserver(observer, createRng('glitchShift').fork('measure/observer'));
      return combineAges(lines.map((l, i) => datePulsar(alien[i] as AlienPulsar, l, { seed: 'glitchShift', draws: DRAWS, reframe: m })).filter((x) => !x.young));
    };
    const cNo = datedWith({});
    const cGl = datedWith({ glitchSpinUpPerYear: spin });
    rows.push(`glitch bias on the combined date ${(cGl.estimate - cNo.estimate).toFixed(1)} yr (one-sided, does not average down) against a combined sigma of ${cNo.sigma.toFixed(0)} yr`);
    recordCheck({
      id: 'dating.epoch.misspecified',
      claim: "The pulsar age range stays roughly honest even when the real pulsars break the model's assumptions.",
      measured: rows.join('; '),
      expected: '95% if the model were right',
      tolerance: 'a chosen floor of 80% in each case (four times the stated 5% miss rate); 100 realizations each; the coverages are the result',
      pass: ok,
      notes: `Lesson (computed, not gated): ignoring each pulsar's measured noise and giving every pulsar one default amplitude (rms 0.425%) while the truth varies as Lyne's does would make the error bars too narrow: coverage ${(lessonCov * 100).toFixed(0)}% of ${N}. Glitch spin-up rates used: ${Object.entries(spin).map(([k, v]) => `${k} ${v.toExponential(2)}/yr`).join(', ')}. Glitch bias is one-sided and does not average down.`,
    });
    expect(ok).toBe(true);
  });

  it('drops B1240-64 (the wrong map period) as an outlier', () => {
    const ts = trials();
    const b1240 = lines.find((l) => l.bname === 'B1240-64')!;
    const droppedFrac = ts.filter((t) => t.combined.dropped.some((d) => d.age.jname === b1240.jname)).length / ts.length;
    const others = ts.filter((t) => t.combined.dropped.some((d) => d.age.jname !== b1240.jname)).length;
    const offsets = ts.map((t) => (t.ages.find((a) => a.jname === b1240.jname) as PulsarAge).median - truthYears('B1240-64'));
    const m = offsets.reduce((s, x) => s + x, 0) / offsets.length;
    const sdv = Math.sqrt(offsets.reduce((s, x) => s + (x - m) ** 2, 0) / (offsets.length - 1));
    // Independent prediction: the period B1240-64 really had in 1970.0 (catalogue P0, P1 back from
    // PEPOCH) minus the map's period, divided by Pdot, is the extra age its wrong number implies.
    const rec = byJ.get(b1240.jname)!;
    const pTrue1970 = (rec.p0 as number) + (rec.p1 as number) * (1970.0 - mjdToDecimalYear(rec.pepoch as number)) * JULIAN_YEAR_S;
    const pMapB = mapPeriod(b1240, HYDROGEN_HZ);
    const predicted = (pTrue1970 - pMapB) / (rec.p1 as number) / JULIAN_YEAR_S;
    const ppm = ((pTrue1970 - pMapB) / pTrue1970) * 1e6;
    // Information, not gated: the flag rate when its drawn amplitude is at or below Lyne's median.
    const medianRms = [...LYNE2010_PEAK_TO_PEAK].sort((x, y) => x - y)[(LYNE2010_PEAK_TO_PEAK.length - 1) / 2]! / 2;
    const quiet = ts.filter((t) => (t.truthAmp.get(b1240.jname) as number) <= medianRms);
    const quietFrac = quiet.filter((t) => t.combined.dropped.some((d) => d.age.jname === b1240.jname)).length / quiet.length;
    const cov = coverageOf(ts);
    const ok = Math.abs(m - predicted) <= 300 && cov >= 0.92 && cov <= 0.98;
    recordCheck({
      id: 'dating.epoch.outlier',
      claim: `The map's one wrong period (B1240-64, known in 1970 to three figures) dates the map about ${(Math.round(m / 100) * 100).toLocaleString('en-US')} years too early; it is caught as an outlier unless that pulsar's own timing noise is large, and it never spoils the combined date.`,
      measured: `mean offset ${m.toFixed(0)} +/- ${sdv.toFixed(0)} yr over ${ts.length} realizations, predicted ${predicted.toFixed(0)} yr (period error ${ppm.toFixed(0)} ppm); combined coverage with B1240-64 in the data ${(cov * 100).toFixed(1)}% (dating.epoch.coverage). Information: flagged in ${(droppedFrac * 100).toFixed(0)}% overall and in ${(quietFrac * 100).toFixed(0)}% of the ${quiet.length} realizations where its noise rms is at or below Lyne's median (${(medianRms * 100).toFixed(3)}%); another pulsar dropped in ${others} realizations`,
      expected: 'offset predicted from the 1970 period error, (P_true,1970 - P_map) / Pdot (clocks.md 3b point 6: about +3,400 yr)',
      tolerance: 'mean offset within 300 yr of the prediction; combined coverage 92% to 98% (D-A20 restated claim)',
      pass: ok,
    });
    expect(Math.abs(m - predicted)).toBeLessThanOrEqual(300);
    expect(cov).toBeGreaterThanOrEqual(0.92);
    expect(cov).toBeLessThanOrEqual(0.98);
  });

  it('the young pulsars are consistent, with wide intervals', () => {
    const ts = trials();
    const out: string[] = [];
    const widthPct: Record<string, string> = {};
    let ok = true;
    for (const name of ['B0531+21', 'B0833-45', 'B1727-47']) {
      const l = lines.find((x) => x.bname === name)!;
      const truth = truthYears(name);
      let hits = 0;
      const widths: number[] = [];
      for (const t of ts) {
        const a = t.ages.find((x) => x.jname === l.jname) as PulsarAge;
        if (a.lo <= truth && truth <= a.hi) hits++;
        widths.push((a.hi - a.lo) / truth);
      }
      const c = hits / ts.length;
      if (c < 0.9) ok = false;
      const a0 = ts[0]?.ages.find((x) => x.jname === l.jname) as PulsarAge;
      widthPct[name] = (percentile(widths, 0.5) * 100).toFixed(0);
      out.push(`${name}: coverage ${(c * 100).toFixed(1)}%, median 95% width ${(percentile(widths, 0.5) * 100).toFixed(0)}% of the age (realization 0: [${a0.lo.toFixed(0)}, ${a0.hi.toFixed(0)}] yr, truth ${truth.toFixed(0)})`);
    }
    recordCheck({
      id: 'dating.epoch.young',
      claim: `The young pulsars agree with the old ones, but their braking is not known, so their 95% age ranges are wide: about ${widthPct['B0531+21']}% of the age for the Crab, ${widthPct['B0833-45']}% for Vela and ${widthPct['B1727-47']}% for B1727-47 (median widths).`,
      measured: out.join('; '),
      expected: 'each interval contains its truth',
      tolerance: 'at least 90% of 300 realizations (spec)',
      pass: ok,
      notes: 'Under the stated model. Braking-index prior U[0.9, 3.2] (a judgment call, see pulsarEpoch.ts); the true long-term values are Crab 2.342 and Vela 1.7.',
    });
    expect(ok).toBe(true);
  });

  it('is deterministic', () => {
    const a = realization('det');
    const m = drawObserver(observer, createRng('det').fork('measure/observer'));
    const l = lines[0]!;
    const x = datePulsar(a[0] as AlienPulsar, l, { seed: 'det', draws: 500, reframe: m });
    const y = datePulsar(realization('det')[0] as AlienPulsar, l, { seed: 'det', draws: 500, reframe: m });
    expect(Array.from(y.samples)).toEqual(Array.from(x.samples));
  });
});

describe('the alternative: fit one age and the home star\'s velocity from the pulsars alone', () => {
  it('the 95% velocity region contains the true velocity in at least 90% of 200 realizations', () => {
    const N = 200;
    const truthV = observer.velKmS as Vec3;
    const truthG = toGalacticCartesian(truthV);
    let hits = 0;
    const errs: Vec3[] = [];
    const sig: number[][] = [];
    const ages: number[] = [];
    const ageSig: number[] = [];
    const dropped = new Map<string, number>();
    for (let r = 0; r < N; r++) {
      const alien = realization(`vfit/${r}`);
      const old = lines.map((l, i) => ({ entry: alien[i] as AlienPulsar, line: l })).filter((x) => !x.entry.truth.young);
      const fit = fitAgeAndVelocity(old);
      for (const d of fit.dropped) dropped.set(d, (dropped.get(d) ?? 0) + 1);
      // chi-square with 3 degrees of freedom, 95%: 7.815.
      if (velocityMahalanobis2(fit, truthV) <= 7.815) hits++;
      errs.push(toGalacticCartesian(fit.velKmS).map((v, i) => v - (truthG[i] as number)) as unknown as Vec3);
      sig.push([0, 1, 2].map((i) => Math.sqrt(fit.velCov[i]![i] as number)));
      ages.push(fit.ageYears);
      ageSig.push(fit.ageSigma);
    }
    const cov = hits / N;
    const rms = [0, 1, 2].map((k) => Math.sqrt(errs.reduce((s, e) => s + (e[k] as number) ** 2, 0) / N));
    const medSig = [0, 1, 2].map((k) => percentile(sig.map((s) => s[k] as number), 0.5));
    recordCheck({
      id: 'dating.epoch.velocityFit',
      claim: 'Even without a star catalogue, the pulsars alone give both the map\'s age and the home star\'s velocity relative to the senders\' frame.',
      measured: `coverage ${(cov * 100).toFixed(1)}%; velocity error rms (galactic x, y, z) ${rms.map((x) => x.toFixed(1)).join(', ')} km/s; median 1-sigma (ICRS x, y, z) ${medSig.map((x) => x.toFixed(1)).join(', ')} km/s; median age ${percentile(ages, 0.5).toFixed(0)} +/- ${percentile(ageSig, 0.5).toFixed(0)} yr; dropped: ${[...dropped].map(([k, v]) => `${k} ${v}x`).join(', ')}`,
      expected: `true Gliese 445 velocity relative to the Sun (${truthV.map((x) => x.toFixed(1)).join(', ')}) km/s ICRS`,
      tolerance: 'the 95% region (chi-square, 3 degrees of freedom) contains it in at least 90% of 200 realizations (spec)',
      pass: cov >= 0.9,
      notes: 'Old pulsars only, n = 3 in the model; light time and the parallax term are left out (they need the observer position).',
    });
    expect(cov).toBeGreaterThanOrEqual(0.9);
    void JULIAN_YEAR_S;
  });
});
