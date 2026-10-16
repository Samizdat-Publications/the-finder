import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { KM_S_TO_PC_PER_YEAR, dot, scale, sub, toGalacticCartesian } from './astro';
import { ageFromTh230U234, rtgState, simulateRtgMeasurement } from './clocks';
import { discoveryState, homeObserver } from './epoch';
import { projectCatalogue, projectPulsar, timingNoiseSigma } from './pulsarEpoch';
import { identifyAtEpoch } from './pulsarIdentify';
import { wrapDeg } from './pulsars';
import { createRng } from './random';
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
    recordCheck({
      id: 'epoch.pulsars.geometry',
      claim: 'Seen from Gliese 445 44,000 years from now, the map pulsars have moved by under 2 degrees, their signals arrive up to a few years early or late, and the change in viewpoint alters their slow-down rates by under 1%.',
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
      claim: "The tiny glitches of the old pulsars change the dating less than their timing noise does, so the projection leaves them out.",
      measured: `B1642-03: at most ${glitchYears.toFixed(0)} yr from glitches over ${years.toFixed(0)} yr, against ${timingNoiseYears.toFixed(0)} yr (1 sigma) from timing noise`,
      expected: 'glitch rate and sizes from clocks.md Table 2A (Shabanova 2009); timing noise rms 1.265% for B1642-03 (half the 2.53% peak-to-peak, Lyne et al. 2010 Table 1)',
      tolerance: 'glitch effect below the timing-noise term',
      pass: glitchYears < timingNoiseYears,
      notes: 'Glitches always spin a pulsar up, so this is a one-sided bias (the pulsar looks younger) that does not average down across realizations, bounded here by the largest observed size. Through the small weight of B1642-03 in the combined date it moves the combined age by only tens of years at most; dating.epoch.misspecified measures that shift, and the coverage, with old-pulsar glitches left in the truth.',
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
  it('the most likely candidate is the right pulsar on every line, by a strong margin', () => {
    // One RTG measurement per realization (Th-230/U-234 at 1%), as the alien would make it.
    const run = (seed: string, nominal: boolean) => {
      const alien = projectCatalogue(cat, observer, { seed, nominal });
      const rtg = ageFromTh230U234(simulateRtgMeasurement(rtgState(disc.yearsAfterLaunch), { relativePrecision: 0.01 }, createRng(seed).fork('rtg')));
      return identifyAtEpoch(lines, alien, { seed, rtgInterval: [rtg.lo, rtg.hi], draws: 2000 });
    };
    const nominal = run('identify.epoch.nominal', true);
    const seeds = Array.from({ length: 20 }, (_, i) => run(`identify.epoch/${i}`, false));
    const wrong: string[] = [];
    const minMargin = new Map<string, number>();
    for (const [k, idr] of [nominal, ...seeds].entries()) {
      for (const m of idr.lines) {
        if (m.best?.entry.jname !== m.line.jname) wrong.push(`${k === 0 ? 'nominal' : `seed ${k - 1}`} ${m.line.bname} -> ${m.best?.entry.jname ?? 'none'}`);
        if (k > 0) minMargin.set(m.line.bname, Math.min(minMargin.get(m.line.bname) ?? Infinity, m.log10Margin));
      }
    }
    // 20: "strong evidence" on the Kass and Raftery (1995, JASA 90, 773) scale of Bayes factors.
    const weak = nominal.lines.filter((m) => m.log10Margin < Math.log10(20));
    const fmt = (x: number): string => (!Number.isFinite(x) ? 'no competitor' : x > 6 ? '> 10^6' : `10^${x.toFixed(1)}`);
    const p1 = new Map(nominal.pass1.lines.map((m) => [m.line.bname, m]));
    const rows = nominal.lines.map((m) =>
      `${m.line.bname}: ${m.preselected} pre-selected, runner-up ${m.runnerUp?.entry.jname ?? 'none'}, margin ${fmt(m.log10Margin)}, odds against all others ${fmt(m.log10Odds)} (min over 20 seeds ${fmt(minMargin.get(m.line.bname) ?? Infinity)}; pass 1 ${fmt(p1.get(m.line.bname)?.log10Margin ?? Infinity)})`);
    const info = nominal.pass2Info;
    // The Sun in the alien's frame at the map epoch: minus the observer's position then (truth, for the report only).
    const xMap = toGalacticCartesian(sub(observer.posPc, scale(observer.velKmS, KM_S_TO_PC_PER_YEAR * info.fittedAgeYears)));
    const offset = Math.hypot(info.originPc[0] + xMap[0], info.originPc[1] + xMap[1]);
    const pass = wrong.length === 0 && weak.length === 0;
    recordCheck({
      id: 'identify.epoch',
      claim: "In the alien's catalogue, 44,000 years from now, the most likely pulsar for every map line is the right one, by a strong margin over the next best.",
      measured: `pass 2 (final): sigma_theta ${nominal.sigmaThetaDeg.toFixed(2)} deg, sigma_b ${nominal.sigmaBDeg.toFixed(2)} deg; anchors ${info.anchors.length} (${info.anchors.join(', ')}); fitted age ${info.fittedAgeYears.toFixed(0)} yr (dropped ${info.ageFitDropped.join(', ') || 'none'}); origin ${offset.toFixed(1)} pc from the Sun; length scale ${info.scalePcPerR0.toFixed(0)} pc per R0, sigma_ln ${info.sigmaLn.toFixed(2)}. Pass 1: sigma_theta ${nominal.pass1.sigmaThetaDeg.toFixed(2)} deg. ${rows.join('; ')}${wrong.length ? `; WRONG: ${wrong.join(', ')}` : ''}`,
      expected: 'the 14 identities (Sagan et al. 1972)',
      tolerance: 'right pulsar on all 14 lines in the nominal and 20 seeded realizations; nominal margin at least 20 (Kass and Raftery 1995, strong evidence)',
      pass,
      notes: 'Pass 1: period (how sharply the candidate predicts the map number; Monte Carlo over age in the RTG range, braking index and Doppler) x direction from the observer x latitude where the tick resolves. Pass 2: from the anchors (pass-1 margin at least 20), the shared age (pulsars only) and the map origin (leave-one-out for anchor lines); direction from that origin, plus a heavy-tailed distance factor from the map lengths (Student-t, 2 dof); candidates without a distance get the anchors\' mean distance density. Pre-selection: direction within 5 deg and age range overlapping the RTG age range.',
    });
    expect(wrong, wrong.join('; ')).toEqual([]);
    expect(weak.map((m) => m.line.bname), rows.join('; ')).toEqual([]);
  });
});
