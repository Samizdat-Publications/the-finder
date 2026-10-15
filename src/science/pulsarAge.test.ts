import { describe, expect, it } from 'vitest';
import { loadCover, loadGlitches, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { dot, toGalacticCartesian, type Vec3 } from './astro';
import { discoveryState, homeObserver } from './epoch';
import { combineAges, datePulsar, fitAgeAndVelocity, velocityMahalanobis2, type PulsarAge } from './pulsarAge';
import { drawObserver, projectPulsar, type AlienPulsar } from './pulsarEpoch';
import { dateMapToday } from './pulsars';
import { createRng } from './random';
import { C_KM_S, JULIAN_YEAR_S, SAGAN_HYDROGEN_HZ } from './units';

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
  ages: PulsarAge[];
  combined: ReturnType<typeof combineAges>;
  combinedTruth: number;
}

let trialsCache: Trial[] | null = null;
const N_TRIALS = 300; // spec: 300 realizations (binomial s.e. of a 95% coverage 1.26%)
const DRAWS = 2000; // spec: at least 2,000 Monte Carlo draws per pulsar

function trials(): Trial[] {
  if (trialsCache) return trialsCache;
  const out: Trial[] = [];
  for (let r = 0; r < N_TRIALS; r++) {
    const seed = `reframe/${r}`;
    const alien = realization(seed);
    const measured = drawObserver(observer, createRng(seed).fork('measure/observer'));
    const ages = lines.map((l, i) => datePulsar(alien[i] as AlienPulsar, l, { seed: `date/${r}`, draws: DRAWS, reframe: measured }));
    const old = ages.filter((a) => !a.young);
    const combined = combineAges(old);
    let ct = 0;
    for (const a of combined.kept) ct += (combined.weights.get(a.jname) as number) * truthYears(lines.find((l) => l.jname === a.jname)!.bname);
    out.push({ ages, combined, combinedTruth: ct });
  }
  trialsCache = out;
  return out;
}

describe('dating at the story epoch in the Sun\'s rest frame', () => {
  it('the combined 95% interval contains the truth in 92% to 98% of 300 realizations', () => {
    const ts = trials();
    const hits = ts.filter((t) => t.combined.lo <= t.combinedTruth && t.combinedTruth <= t.combined.hi).length;
    const cov = hits / ts.length;
    const halfWidths = ts.map((t) => (t.combined.hi - t.combined.lo) / 2);
    const errs = ts.map((t) => t.combined.estimate - t.combinedTruth);
    const first = ts[0] as Trial;
    recordCheck({
      id: 'dating.epoch.reframe',
      claim: "Moved into the Sun's rest frame, the old pulsars agree: combined, they date the map to within a few hundred years.",
      measured: `realization 0: ${first.combined.estimate.toFixed(0)} yr [${first.combined.lo.toFixed(0)}, ${first.combined.hi.toFixed(0)}], truth ${first.combinedTruth.toFixed(0)} yr, ${first.combined.kept.length} pulsars kept; median 95% half-width over ${ts.length} realizations ${percentile(halfWidths, 0.5).toFixed(0)} yr; median error ${percentile(errs, 0.5).toFixed(0)} yr`,
      expected: 'the time since each pulsar\'s implied epoch today (clocks.md 3a), combined with the same weights',
      tolerance: 'computed: Monte Carlo over braking index, timing noise, map precision, observer state and distances',
      pass: cov >= 0.92 && cov <= 0.98,
    });
    recordCheck({
      id: 'dating.epoch.coverage',
      claim: 'The combined pulsar age range is honest: its 95% range contains the true age about 95% of the time.',
      measured: `coverage ${(cov * 100).toFixed(1)}% over ${ts.length} seeded realizations`,
      expected: '95%',
      tolerance: '92% to 98% (about 2.4 binomial standard errors of 1.26% for 300 trials)',
      pass: cov >= 0.92 && cov <= 0.98,
    });
    expect(cov).toBeGreaterThanOrEqual(0.92);
    expect(cov).toBeLessThanOrEqual(0.98);
  });

  it('drops B1240-64 (the wrong map period) as an outlier', () => {
    const ts = trials();
    const b1240 = lines.find((l) => l.bname === 'B1240-64')!;
    const droppedFrac = ts.filter((t) => t.combined.dropped.some((d) => d.age.jname === b1240.jname)).length / ts.length;
    const others = ts.filter((t) => t.combined.dropped.some((d) => d.age.jname !== b1240.jname)).length;
    const offsets = ts.map((t) => (t.ages.find((a) => a.jname === b1240.jname) as PulsarAge).median - truthYears('B1240-64'));
    const m = offsets.reduce((s, x) => s + x, 0) / offsets.length;
    const sdv = Math.sqrt(offsets.reduce((s, x) => s + (x - m) ** 2, 0) / (offsets.length - 1));
    recordCheck({
      id: 'dating.epoch.outlier',
      claim: 'The one map period that was written with false precision (B1240-64) stands out and is rejected automatically.',
      measured: `dropped in ${(droppedFrac * 100).toFixed(1)}% of ${ts.length} realizations; offset ${m.toFixed(0)} +/- ${sdv.toFixed(0)} yr; another pulsar dropped in ${others} realizations`,
      expected: 'offset about +3,400 yr (clocks.md 3b point 6)',
      tolerance: 'dropped in at least 99%; mean offset within 300 yr of 3,400 (spec)',
      pass: droppedFrac >= 0.99 && Math.abs(m - 3400) <= 300,
    });
    expect(droppedFrac).toBeGreaterThanOrEqual(0.99);
    expect(Math.abs(m - 3400)).toBeLessThanOrEqual(300);
  });

  it('the young pulsars are consistent, with wide intervals', () => {
    const ts = trials();
    const out: string[] = [];
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
      out.push(`${name}: coverage ${(c * 100).toFixed(1)}%, median 95% width ${(percentile(widths, 0.5) * 100).toFixed(0)}% of the age (realization 0: [${a0.lo.toFixed(0)}, ${a0.hi.toFixed(0)}] yr, truth ${truth.toFixed(0)})`);
    }
    recordCheck({
      id: 'dating.epoch.young',
      claim: "The young pulsars (Crab, Vela, B1727-47) agree with the old ones, but their ages are uncertain by tens of percent because their braking is not known.",
      measured: out.join('; '),
      expected: 'each interval contains its truth',
      tolerance: 'at least 90% of 300 realizations (spec)',
      pass: ok,
      notes: 'Braking-index prior U[0.9, 3.2]; the true long-term values are Crab 2.342 and Vela 1.7.',
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
