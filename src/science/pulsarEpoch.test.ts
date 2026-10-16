import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { KM_S_TO_PC_PER_YEAR, dot, scale, sub, toGalacticCartesian } from './astro';
import { ageFromTh230U234, rtgAgeAtDeviate, rtgState, simulateRtgMeasurement } from './clocks';
import { discoveryState, homeObserver } from './epoch';
import { LYNE2010_PEAK_TO_PEAK, TIMING_NOISE_RMS_DEFAULT, projectCatalogue, projectPulsar, timingNoiseSigma } from './pulsarEpoch';
import { AGE_WINDOW_TAIL, identifyAtEpoch, rtgAgeModel, timingNoiseModel } from './pulsarIdentify';
import { wrapDeg } from './pulsars';
import { createRng, type Rng } from './random';
import { normalCdf, normalQuantile } from './stats';
import { C_KM_S, JULIAN_YEAR_S } from './units';

const cover = loadCover();
const cat = loadPulsars();
const byJ = new Map(cat.pulsars.map((p) => [p.jname, p]));
const scenario = loadScenario();
const stars = loadStars();
const disc = discoveryState(scenario, stars);
const observer = homeObserver(scenario, stars, disc.decimalYear);
const lines = cover.pulsarMap.lines;

describe('the pulsar sky at the story epoch (a projection)', () => {
  const nominal = projectCatalogue(cat, observer, { seed: 'pulsarEpoch.nominal', nominal: true });
  const nomJ = new Map(nominal.map((a) => [a.jname, a]));

  it('applies the Doppler shift with the right sign and size, and leaves Pdot alone', () => {
    // Observer approaching a pulsar (beta . n > 0) sees a shorter period: f_obs = gamma f (1 + beta . n)
    // with n the direction in the pulsar's (SSB) frame (moving-receiver Doppler, e.g. Rybicki and
    // Lightman 1979 section 4.5), so P_obs / P_ssb = sqrt(1 - beta^2) / (1 + beta . n).
    const beta = observer.velKmS.map((v) => v / C_KM_S) as unknown as [number, number, number];
    let worst = 0;
    for (const line of lines) {
      const a = nomJ.get(line.jname);
      expect(a).toBeDefined();
      if (!a) continue;
      const bn = dot(beta, a.nHat);
      const expected = Math.sqrt(1 - dot(beta, beta)) / (1 + bn);
      worst = Math.max(worst, Math.abs(a.truth.dopplerFactor / expected - 1));
      expect(Math.sign(a.truth.dopplerFactor - 1)).toBe(-Math.sign(bn));
      // Pdot changes only by the Shklovskii term (no Doppler factor; see projectPulsar).
      if (a.truth.pdotObs !== null && a.truth.pdotSsbAtEmission !== null) {
        // Relative 1e-12: double rounding on a difference of numbers near Pdot (1e-16 relative each).
        expect(Math.abs(a.truth.pdotObs - a.truth.pdotSsbAtEmission - a.truth.shklovskiiChange)).toBeLessThan(1e-12 * a.truth.pdotSsbAtEmission);
      }
    }
    expect(worst).toBeLessThan(1e-14); // double rounding only
  });

  it('reports light time, direction shifts and the Shklovskii change', () => {
    let maxLt = 0;
    for (const a of nominal) maxLt = Math.max(maxLt, Math.abs(a.truth.lightTimeYears));
    const xPc = Math.hypot(...observer.posPc);
    const ltBound = (xPc * 3.0856775814913673e13) / C_KM_S / JULIAN_YEAR_S; // |X| / c, years
    // Light time cannot exceed |X| / c (up to about 3.5 yr at 1.06 pc, spec).
    expect(maxLt).toBeLessThanOrEqual(ltBound + 1e-9);
    const noPlx = new Map(projectCatalogue({ ...cat, pulsars: lines.map((l) => byJ.get(l.jname)!) }, observer, { seed: 'x', nominal: true, parallax: false }).map((a) => [a.jname, a]));
    const shifts = lines.map((l) => {
      const a = nomJ.get(l.jname)!;
      const p = byJ.get(l.jname)!;
      const b = noPlx.get(l.jname)!;
      return { name: l.bname, total: wrapDeg(a.lDeg - p.gl), parallax: wrapDeg(a.lDeg - b.lDeg), map: wrapDeg(a.lDeg - l.mapAngleDeg) };
    });
    const worst = shifts.reduce((m, s) => (Math.abs(s.total) > Math.abs(m.total) ? s : m));
    const worstPlx = shifts.reduce((m, s) => (Math.abs(s.parallax) > Math.abs(m.parallax) ? s : m));
    const worstMap = shifts.reduce((m, s) => (Math.abs(s.map) > Math.abs(m.map) ? s : m));
    // The identification allows 2 deg for motion since the map was made (spec): check that it is enough.
    expect(Math.abs(worst.total)).toBeLessThan(2);
    const shk = ['B0950+08', 'B2016+28', 'B1451-68', 'B1929+10'].map((b) => {
      const l = lines.find((x) => x.bname === b)!;
      const a = nomJ.get(l.jname)!;
      return `${b} ${((a.truth.shklovskiiChange / (a.truth.pdotSsbAtEmission as number)) * 100).toFixed(2)}%`;
    });
    const maxShk = Math.max(...lines.map((l) => {
      const a = nomJ.get(l.jname)!;
      return a.truth.pdotSsbAtEmission ? Math.abs(a.truth.shklovskiiChange / a.truth.pdotSsbAtEmission) * 100 : 0;
    }));
    recordCheck({
      id: 'epoch.pulsars.geometry',
      claim: `Seen from Gliese 445 ${Math.round(disc.yearsAfterLaunch).toLocaleString('en-US')} years after launch, the map pulsars have moved by at most ${Math.abs(worst.total).toFixed(1)} degrees, their signals arrive up to ${maxLt.toFixed(1)} years early or late, and the change in viewpoint alters their slow-down rates by at most ${maxShk.toFixed(1)}%.`,
      measured: `largest longitude shift ${worst.total.toFixed(2)} deg (${worst.name}), of which parallax at most ${worstPlx.parallax.toFixed(2)} deg (${worstPlx.name}); largest map-to-sky difference ${worstMap.map.toFixed(2)} deg (${worstMap.name}); largest light-time offset ${maxLt.toFixed(2)} yr (bound |X|/c = ${ltBound.toFixed(2)} yr); Shklovskii change of Pdot: ${shk.join(', ')}`,
      expected: 'clocks.md 3b point 5 (light time) and point 7 (proper motion, 1.6 deg in 40 kyr); spec: Shklovskii about 1% for B0950+08 and B2016+28',
      tolerance: 'longitude shift under the 2 deg allowed for motion in the identification',
      pass: Math.abs(worst.total) < 2,
      notes: 'Nominal projection (n = 3 for unmeasured pulsars, catalogue distances and proper motions as truth). A projection, not an observation.',
    });
  });

  it('old-pulsar glitches are below the timing noise over 44,000 years (B1642-03)', () => {
    // B1642-03: 7 glitches of 0.9e-9 to 2.6e-9 in about 40 years (Shabanova 2009; clocks.md Table 2A).
    // Over the elapsed time they add at most rate x time x 2.6e-9 to nu, i.e. -that to P/P; the age
    // error is that fraction of P / Pdot = 2 tau_c.
    const p = byJ.get('J1645-0317')!;
    const years = disc.yearsAfterLaunch;
    const fracUpper = (7 / 40) * years * 2.6e-9;
    const tauC = (p.p0 as number) / (2 * (p.p1 as number)) / JULIAN_YEAR_S;
    const glitchYears = fracUpper * 2 * tauC;
    const timingNoiseYears = timingNoiseSigma('J1645-0317') * years;
    expect(glitchYears).toBeLessThan(timingNoiseYears);
    recordCheck({
      id: 'epoch.pulsars.glitches',
      claim: `The tiny glitches of the old pulsars change the dating less than their timing noise does (for B1642-03 at most ${glitchYears.toFixed(0)} years against ${timingNoiseYears.toFixed(0)}), so the projection leaves them out; their effect on the combined date is measured in dating.epoch.misspecified.`,
      measured: `B1642-03: at most ${glitchYears.toFixed(0)} yr from glitches over ${years.toFixed(0)} yr, against ${timingNoiseYears.toFixed(0)} yr (1 sigma) from timing noise`,
      expected: 'glitch rate and sizes from clocks.md Table 2A (Shabanova 2009); timing noise rms 1.265% for B1642-03 (half the 2.53% peak-to-peak, Lyne et al. 2010 Table 1)',
      tolerance: 'glitch effect below the timing-noise term',
      pass: glitchYears < timingNoiseYears,
      notes: 'Glitches always spin a pulsar up, so this is a one-sided bias (the pulsar looks younger) that does not average down across realizations, bounded here by the largest observed size. The shift of the combined date is measured in dating.epoch.misspecified (one nominal realization dated with and without the glitches).',
    });
  });

  it('is deterministic and independent of catalogue order', () => {
    const a = projectCatalogue(cat, observer, { seed: 'det' });
    const reversed = projectCatalogue({ ...cat, pulsars: [...cat.pulsars].reverse() }, observer, { seed: 'det' });
    const rj = new Map(reversed.map((x) => [x.jname, x]));
    for (const x of a) {
      const y = rj.get(x.jname)!;
      expect(y.pObs).toBe(x.pObs);
      expect(y.pdotMeas).toBe(x.pdotMeas);
      expect(y.truth.n).toBe(x.truth.n);
    }
  });
});

describe('identification at the story epoch (likelihood)', () => {
  it("the clock's age model: the pre-selection range's tails and the interpolated draws (identify.ageModel)", () => {
    // Under the clock's own error model (m = R (1 + s z), simulateRtgMeasurement), the true fuel age falls
    // outside [age(+z_w), age(-z_w)] with probability AGE_WINDOW_TAIL exactly, and outside the 95% interval
    // with probability 0.05. Checked over seeded measurements at the epoch's true fuel age.
    const truthAge = disc.yearsAfterLaunch;
    const state = rtgState(truthAge);
    const zw = -normalQuantile(AGE_WINDOW_TAIL / 2);
    const z95 = -normalQuantile(0.025);
    const N = 20_000;
    let out95 = 0;
    let outWindow = 0;
    let belowLo95 = 0;
    for (let i = 0; i < N; i++) {
      const m = simulateRtgMeasurement(state, { relativePrecision: 0.01 }, createRng(`identify.ageModel/${i}`));
      const lo95 = rtgAgeAtDeviate(m, z95);
      const hi95 = rtgAgeAtDeviate(m, -z95);
      if (truthAge < lo95 || truthAge > hi95) out95++;
      if (truthAge < lo95) belowLo95++;
      if (truthAge < rtgAgeAtDeviate(m, zw) || truthAge > rtgAgeAtDeviate(m, -zw)) outWindow++;
    }
    // ageFromTh230U234's interval is the same construction: its lo and hi equal age(+-z95).
    const m0 = simulateRtgMeasurement(state, { relativePrecision: 0.01 }, createRng('identify.ageModel/ref'));
    const ref = ageFromTh230U234(m0);
    expect(Math.abs(rtgAgeAtDeviate(m0, z95) - ref.lo)).toBeLessThan(1e-6 * ref.lo); // the same bisection: rounding only
    expect(Math.abs(rtgAgeAtDeviate(m0, -z95) - ref.hi)).toBeLessThan(1e-6 * ref.hi);
    // The interpolated draw against the exact age at the same deviate, on a fine z grid across and beyond the range.
    const model = rtgAgeModel(m0);
    let worstInterp = 0;
    for (let k = 0; k <= 1000; k++) {
      const z = -zw * 1.2 + (2.4 * zw * k) / 1000;
      const fixed = { normal: () => z, uniform: () => 0, poisson: () => 0, fork: () => fixed } as unknown as Rng;
      worstInterp = Math.max(worstInterp, Math.abs(model.draw(fixed) - rtgAgeAtDeviate(m0, z)));
    }
    const sigma1 = (rtgAgeAtDeviate(m0, -1) - rtgAgeAtDeviate(m0, 1)) / 2;
    // The half-life systematic the clock reports beside its interval (LNHB 1-sigma half-lives of U-234, Th-230
    // and Pu-238, rtg.ts ageFromTh230U234) is not in the age model: a 1-sigma half-life error shifts every age
    // by sys, so the range's two-sided tail becomes Phi(-z_w + d) + Phi(-z_w - d), d = sys / sigma.
    const sysYears = ref.halfLifeSystematicYears;
    const dSys = sysYears / sigma1;
    const tailSys = normalCdf(-zw + dSys) + normalCdf(-zw - dSys);
    // The candidates' timing-noise bound at the same tail, for the default amplitude (0.425%, Lyne et al. 2010 median) and the largest (6.64%).
    const xDefault = timingNoiseModel(TIMING_NOISE_RMS_DEFAULT).bound;
    const xMax = timingNoiseModel(LYNE2010_PEAK_TO_PEAK[0]! / 2).bound;
    // 5% within 3 binomial standard errors over N; the range's expected misses are N x 1e-6 = 0.02.
    const tol95 = 3 * Math.sqrt((0.05 * 0.95) / N);
    // Interpolation: 0.01 yr is under 1e-4 of the clock's 1 sigma (about 500 yr), so it cannot move a likelihood.
    const pass = Math.abs(out95 / N - 0.05) <= tol95 && outWindow === 0 && worstInterp < 0.01;
    recordCheck({
      id: 'identify.ageModel',
      claim: `The identification takes the map's age from the Arrival clock's own error model, not from a hard 95% range: its pre-selection keeps every age the clock allows except a two-sided ${AGE_WINDOW_TAIL.toExponential(0)} tail, so the true age is not cut off.`,
      measured: `over ${N.toLocaleString('en-US')} seeded 1% measurements at ${Math.round(truthAge).toLocaleString('en-US')} yr: true age outside the 95% interval ${out95} times (${((100 * out95) / N).toFixed(2)}%; below its lower bound ${belowLo95}, the case that used to lose a pulsar), outside the range ${outWindow} times. One measurement: central ${model.centralYears.toFixed(0)} yr, 1 sigma ${sigma1.toFixed(0)} yr, 95% [${ref.lo.toFixed(0)}, ${ref.hi.toFixed(0)}], range [${model.windowYears[0].toFixed(0)}, ${model.windowYears[1].toFixed(0)}] yr (z_w ${zw.toFixed(2)}); interpolated draws within ${worstInterp.toExponential(1)} yr of the exact age. The half-life systematic (${sysYears.toFixed(0)} yr at 1 sigma, ${dSys.toFixed(2)} of the clock's sigma, not in the model) would raise the range's two-sided tail from ${AGE_WINDOW_TAIL.toExponential(0)} to ${tailSys.toExponential(1)}: harmless. Each candidate's long-term Pdot is allowed Pdot_meas / (1 +- x) at the same tail: x ${(100 * xDefault).toFixed(1)}% for a measured noise amplitude of 0.425%, ${(100 * xMax).toFixed(1)}% for 6.64% (the alien's amplitude posterior over Lyne et al. 2010)`,
      expected: "5% outside the 95% interval and 1e-6 outside the range (the clock's pivot (m / R - 1) / s ~ N(0, 1)); the map is older than the fuel by about 6 to 11 years (clocks.md section 2: map epochs 1966.6 to 1972.2, launch 1977.7), 1 to 2 per cent of 1 sigma",
      tolerance: `5% within ${(100 * tol95).toFixed(2)} points (3 binomial standard errors); no misses of the range (0.02 expected); interpolation under 0.01 yr (under 1e-4 sigma)`,
      pass,
      notes: "Replaces U[t_lo, 2 t_hi] (D-A16 amended, M5 step 0a). The upper allowance 2 t_hi (up to twice the fuel's age) stood in, one-sidedly and without a stated basis, for the candidates' timing noise (with the clock alone and no noise term, 15 of 7,000 seeded lines went wrong); it is removed and the timing noise is modelled instead; the map's true excess age over the fuel (6 to 11 years) is carried by the simulation (fuel dated from launch, map lines the 1970/71 periods) and covered by the tails, as identify.epoch shows over 500 seeds.",
    });
    expect(Math.abs(out95 / N - 0.05)).toBeLessThanOrEqual(tol95);
    expect(outWindow).toBe(0);
    expect(worstInterp).toBeLessThan(0.01);
  }, 300_000);

  it('the most likely candidate is the right pulsar on every line, by a strong margin, over 500 seeds', () => {
    // One RTG measurement per realization (Th-230/U-234 at 1%), as the alien would make it.
    const run = (seed: string, nominal: boolean) => {
      const alien = projectCatalogue(cat, observer, { seed, nominal });
      const rtg = simulateRtgMeasurement(rtgState(disc.yearsAfterLaunch), { relativePrecision: 0.01 }, createRng(seed).fork('rtg'));
      return { rtg, idr: identifyAtEpoch(lines, alien, { seed, rtg, draws: 2000 }) };
    };
    const SEEDS = 500;
    const t0 = performance.now();
    const nominal = run('identify.epoch.nominal', true).idr;
    const wrong: string[] = [];
    const minMargin = new Map<string, number>();
    let tailSeeds = 0;
    let anchorsMin = Infinity;
    for (let k = 0; k < SEEDS; k++) {
      const { rtg, idr } = run(`identify.epoch/${k}`, false);
      if (ageFromTh230U234(rtg).lo > disc.yearsAfterLaunch) tailSeeds++;
      anchorsMin = Math.min(anchorsMin, idr.pass2Info.anchors.length);
      for (const m of idr.lines) {
        if (m.best?.entry.jname !== m.line.jname) wrong.push(`seed ${k} ${m.line.bname} -> ${m.best?.entry.jname ?? 'none'}`);
        minMargin.set(m.line.bname, Math.min(minMargin.get(m.line.bname) ?? Infinity, m.log10Odds));
      }
    }
    for (const m of nominal.lines) if (m.best?.entry.jname !== m.line.jname) wrong.push(`nominal ${m.line.bname} -> ${m.best?.entry.jname ?? 'none'}`);
    const seconds = (performance.now() - t0) / 1000;
    // 20: "strong evidence" on the Kass and Raftery (1995, JASA 90, 773) scale of Bayes factors.
    const weak = nominal.lines.filter((m) => m.log10Odds < Math.log10(20));
    const fmt = (x: number): string => (!Number.isFinite(x) ? 'no competitor' : x > 6 ? '> 10^6' : `10^${x.toFixed(1)}`);
    const p1 = new Map(nominal.pass1.lines.map((m) => [m.line.bname, m]));
    const rows = nominal.lines.map((m) =>
      `${m.line.bname}: ${m.preselected} pre-selected, runner-up ${m.runnerUp?.entry.jname ?? 'none'}, margin ${fmt(m.log10Margin)}, odds against all others ${fmt(m.log10Odds)} (min odds over ${SEEDS} seeds ${fmt(minMargin.get(m.line.bname) ?? Infinity)}; pass 1 ${fmt(p1.get(m.line.bname)?.log10Margin ?? Infinity)})`);
    const info = nominal.pass2Info;
    // The Sun in the alien's frame at the map epoch: minus the observer's position then (truth, for the report only).
    const xMap = toGalacticCartesian(sub(observer.posPc, scale(observer.velKmS, KM_S_TO_PC_PER_YEAR * info.fittedAgeYears)));
    const offset = Math.hypot(info.originPc[0] + xMap[0], info.originPc[1] + xMap[1]);
    const pass = wrong.length === 0 && weak.length === 0;
    recordCheck({
      id: 'identify.epoch',
      claim: `In the alien's catalogue, ${Math.round(disc.yearsAfterLaunch).toLocaleString('en-US')} years after launch, the most likely pulsar for every map line is the right one, by strong odds over all the alternatives.`,
      measured: `${SEEDS} seeded realizations and the nominal: ${wrong.length} wrong lines of ${(SEEDS + 1) * lines.length}; ${tailSeeds} seeds had the Arrival clock's 95% lower bound above the true fuel age (the case the old range lost) and identify every line; fewest anchors in any seed ${anchorsMin}. Nominal pass 2 (final): sigma_theta ${nominal.sigmaThetaDeg.toFixed(2)} deg, sigma_b ${nominal.sigmaBDeg.toFixed(2)} deg; anchors ${info.anchors.length} (${info.anchors.join(', ')}); fitted age ${info.fittedAgeYears.toFixed(0)} yr (dropped ${info.ageFitDropped.join(', ') || 'none'}); origin ${offset.toFixed(1)} pc from the Sun; length scale ${info.scalePcPerR0.toFixed(0)} pc per R0, sigma_ln ${info.sigmaLn.toFixed(2)}. Pass 1: sigma_theta ${nominal.pass1.sigmaThetaDeg.toFixed(2)} deg. ${rows.join('; ')}${wrong.length ? `; WRONG: ${wrong.join(', ')}` : ''}`,
      expected: 'the 14 identities (Sagan et al. 1972)',
      tolerance: `right pulsar on all 14 lines in the nominal and ${SEEDS} seeded realizations; nominal odds against all other candidates combined at least 20 (Kass and Raftery 1995, strong evidence)`,
      pass,
      notes: `Pass 1: period (how sharply the candidate predicts the map number; Monte Carlo over the map's age drawn from the Arrival clock's own error model (identify.ageModel), braking index, Doppler and the candidate's timing noise on Pdot, the dating's own model) x direction from the observer x latitude where the tick resolves. Pass 2: from the anchors (pass-1 odds against all others at least 20), the shared age (pulsars only) and the map origin (leave-one-out for anchor lines); direction from that origin, plus a heavy-tailed distance factor from the map lengths (Student-t, 2 dof); candidates without a distance get the anchors' mean distance density. Pre-selection: direction within 5 deg and age range, widened by the candidate's timing-noise bound, overlapping the clock's range (each with two-sided tails of 1e-6). ${SEEDS} seeds took ${seconds.toFixed(0)} s.`,
    });
    expect(wrong, wrong.join('; ')).toEqual([]);
    expect(weak.map((m) => m.line.bname), rows.join('; ')).toEqual([]);
  }, 3_600_000);

  it('the right pulsar still wins every line when the truth breaks the identification\'s model (identify.misspecified)', () => {
    // As dating.epoch.misspecified does for the dating: the truth drawn from a model the identification does not
    // assume, the identification run unchanged. Three cases, each over SEEDS seeded realizations.
    const SEEDS = 150;
    const cases: { name: string; opts: Parameters<typeof projectCatalogue>[2] }[] = [
      // timing noise as two switching states (red noise), the measured Pdot at Pdot (1 +- rms); the model assumes Gaussian
      { name: 'two-state switching timing noise (the model assumes Gaussian)', opts: { seed: '', timingNoiseModel: 'twoState' } },
      // the alien's own amplitude measurement twice as bad as the model allows (sigma_ln 0.6 against 0.3)
      { name: 'noise amplitude measured twice as badly as assumed (truth sigma_ln 0.6, model 0.3)', opts: { seed: '', amplitudeMeasLnSigma: 0.6 } },
      // old pulsars' braking index U[1, 5], partly beyond the pre-selection's hard range 0.9 to 4
      { name: 'old braking index truly U[1, 5] (model U[2, 4]; pre-selection cut at 4)', opts: { seed: '', nOldRange: [1, 5] } },
    ];
    const t0 = performance.now();
    const rows: string[] = [];
    const wrongAll: string[] = [];
    let total = 0;
    for (const [ci, c] of cases.entries()) {
      let wrong = 0;
      let minOdds = Infinity;
      for (let k = 0; k < SEEDS; k++) {
        const seed = `identify.misspecified/${ci}/${k}`;
        const alien = projectCatalogue(cat, observer, { ...c.opts, seed });
        const rtg = simulateRtgMeasurement(rtgState(disc.yearsAfterLaunch), { relativePrecision: 0.01 }, createRng(seed).fork('rtg'));
        const idr = identifyAtEpoch(lines, alien, { seed, rtg, draws: 2000 });
        for (const m of idr.lines) {
          if (m.best?.entry.jname !== m.line.jname) {
            wrong++;
            wrongAll.push(`${c.name}: seed ${k} ${m.line.bname} -> ${m.best?.entry.jname ?? 'none'}`);
          } else minOdds = Math.min(minOdds, m.log10Odds);
        }
      }
      const n = SEEDS * lines.length;
      total += n;
      // 95% upper bound on the per-line error rate: exact binomial, (1 - 0.05^(1/n)) when none are wrong (rule of three)
      const upper = wrong === 0 ? 1 - 0.05 ** (1 / n) : NaN;
      rows.push(`${c.name}: ${wrong} wrong of ${n} lines${wrong === 0 ? ` (rate under ${upper.toExponential(1)} at 95%)` : ''}; weakest right line odds 10^${minOdds.toFixed(1)}`);
    }
    const seconds = (performance.now() - t0) / 1000;
    const pass = wrongAll.length === 0;
    recordCheck({
      id: 'identify.misspecified',
      claim: 'The pulsar identification still gives the right pulsar on every map line when the real pulsars break its model: timing noise that switches between two states, a noise amplitude measured twice as badly as assumed, and old pulsars whose braking index runs outside the assumed range.',
      measured: `${rows.join('; ')}; ${total} lines in all`,
      expected: 'the 14 identities (Sagan et al. 1972), as identify.epoch',
      tolerance: 'right pulsar on all 14 lines in every realization; the rate bound is the exact binomial 95% upper limit given no errors',
      pass,
      notes: `Misspecification options of the projection (pulsarEpoch.ts ProjectOptions, as dating.epoch.misspecified uses); the identification itself unchanged. ${SEEDS} seeds per case took ${seconds.toFixed(0)} s in all.${wrongAll.length ? ` WRONG: ${wrongAll.join(', ')}` : ''}`,
    });
    expect(wrongAll, wrongAll.join('; ')).toEqual([]);
  }, 3_600_000);
});
