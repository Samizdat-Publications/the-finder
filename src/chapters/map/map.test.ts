// The Map's checkers on the shared epoch model, for the default seed and two others. Truth comes from outside
// the code under test: the cover's documented identities (cover.json, Johnston's matches; research cover.md
// section 2), the story's true elapsed time (scenario.json), the alien's own measured velocity relative to
// the Sun (Gaia DR3 for Gliese 445, epoch.ts), the Sun's own position at the map epoch, the research region
// (HOW_ITS_CHECKED row 6: about 31 by 14 pc, about a thousand stars), and constructed geometry for the
// bearing helper. Never the code's own earlier output.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCover, loadPulsars, loadScenario, loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED, type Answer, type CheckResult } from '../../game/deductions';
import { cross, norm, scale, type Vec3 } from '../../science/astro';
import { axisDeltaChi2 } from '../../science/pulsarAge';
import { ANCHOR_LOG10_MARGIN } from '../../science/pulsarIdentify';
import { CHI2_2DOF_95, regionLevel, type MapPoint } from '../../science/triangulation';
import { buildEpochModel, type EpochModel } from '../shared/epochModel';
import { checkIdentify, checkMotion, checkOld, checkPeriods, checkRegion, makeMapCheckers } from './checkers';
import {
  CLOCK_N, bearingResiduals, bestAxisOnGrid, clockCrossingYearsAgo, galacticOf, isYoung, mapPoints, matchOf, skyAges, starsInRegion,
} from './mapMath';
import { drawnAngleDeg, parseCoverMap } from './coverGeom';
import { oddsText, timesText } from './odds';

const inputs = { scenario: loadScenario(), stars: loadStars(), catalogue: loadPulsars(), cover: loadCover() };
const SEEDS = [DEFAULT_SEED, 'map-seed-a', 'map-seed-b'];
const models = new Map<string, EpochModel>(SEEDS.map((s) => [s, buildEpochModel(inputs, s)]));
const m0 = models.get(DEFAULT_SEED)!;
const val = (r: CheckResult, k: string) => r.result.find((x) => x.key === k)?.value;
const oldLines = (m: EpochModel) => m.lines.filter((l) => !isYoung(m.byJ.get(l.jname)!));
const youngLines = (m: EpochModel) => m.lines.filter((l) => isYoung(m.byJ.get(l.jname)!));
/** The documented identities (cover.json, Johnston 2002 matches) as an answer. */
const truthAnswer = (m: EpochModel): Answer => Object.fromEntries(m.lines.map((l) => [String(l.order), l.jname]));
/** The instrument's way to the axis: the smallest misfit on a 1 deg sky grid, refined to 0.05 deg. */
function instrumentAxis(m: EpochModel): { lDeg: number; bDeg: number } {
  const pts = skyAges(m);
  const coarse = bestAxisOnGrid(pts, 1);
  return bestAxisOnGrid(pts, 0.05, { lDeg: coarse.lDeg, bDeg: coarse.bDeg, spanDeg: 1.5 });
}

describe('The Map checkers: right answers', () => {
  it('map.periods: every old line with its documented pulsar is accepted, for three seeds; no young line is', () => {
    const rows: string[] = [];
    let pass = true;
    for (const [seed, m] of models) {
      for (const l of oldLines(m)) {
        const r = checkPeriods(m, { line: l.order, jname: l.jname });
        pass &&= r.ok;
        if (seed === DEFAULT_SEED) rows.push(`${l.order} ${l.bname} ${String(val(r, 'match quality'))}`);
      }
      for (const l of youngLines(m)) pass &&= !checkPeriods(m, { line: l.order, jname: l.jname }).ok;
    }
    console.log(`map.periods (default seed): ${rows.join('; ')}`);
    recordCheck({
      id: 'map.periods',
      claim: 'Every old map line, read through the key, is the period of its documented pulsar, and the game accepts it only with odds of at least 20 to 1 against every other candidate along the line.',
      measured: `default seed: ${rows.join('; ')}; the same for seeds map-seed-a and map-seed-b; the three young lines (Crab, Vela, B1727-47) refused by period alone`,
      expected: 'The documented identities (cover.json; Johnston 2002, research cover.md section 2); D-A16\'s strong-evidence margin',
      tolerance: `log10 odds at least ${ANCHOR_LOG10_MARGIN.toFixed(2)} (20 to 1, Kass and Raftery 1995, the identification's own anchor rule)`,
      pass,
    });
    expect(pass).toBe(true);
  });

  it('map.old: the clock\'s crossings and the true elapsed time are accepted; the future and a far past are not', () => {
    const rows: string[] = [];
    let pass = true;
    for (const [seed, m] of models) {
      const truth = m.disc.yearsAfterLaunch;
      const all = checkOld(m, { yearsAgo: truth });
      // With every old line counted, their own-frame ages cannot share one time (dating.epoch.noReframe).
      pass &&= all.ok && /do not agree on one age/.test(all.message);
      for (const l of oldLines(m)) {
        const cross = clockCrossingYearsAgo(m.byJ.get(l.jname)!, l, CLOCK_N) as number;
        const r = checkOld(m, { yearsAgo: cross, matched: { [String(l.order)]: l.jname } });
        pass &&= r.ok;
        if (seed === DEFAULT_SEED) rows.push(`${l.bname} ${cross.toFixed(0)}`);
      }
      pass &&= !checkOld(m, { yearsAgo: -5000 }).ok && !checkOld(m, { yearsAgo: 0 }).ok;
    }
    const own = m0.ages('own').perLine.filter((a) => !a.young).map((a) => a.median);
    console.log(`map.old: crossings at n = ${CLOCK_N}: ${rows.join(', ')}; own-frame medians ${Math.min(...own).toFixed(0)} to ${Math.max(...own).toFixed(0)}`);
    recordCheck({
      id: 'map.old',
      claim: 'Running the matched pulsars back on the spin-down clock, the map\'s numbers are met in the past (tens of thousands of years ago), never in the future; the true elapsed time is accepted.',
      measured: `default seed, years ago where each old line meets the map at n = ${CLOCK_N}: ${rows.join(', ')}; own-frame medians ${Math.min(...own).toFixed(0)} to ${Math.max(...own).toFixed(0)} years`,
      expected: `The story's true elapsed time, ${m0.disc.yearsAfterLaunch.toFixed(0)} years (scenario.json, epoch.ts), accepted for three seeds; the scatter of the own-frame ages is dating.epoch.noReframe (HOW_ITS_CHECKED row 7)`,
      tolerance: 'Accepted inside the union of the matched old lines\' 95% intervals (Monte Carlo, pulsarAge.ts datePulsar, 2,000 draws)',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('map.identify: the documented identities are accepted for three seeds, and the codex carries the map\'s limits', () => {
    let pass = true;
    let limits = '';
    for (const [seed, m] of models) {
      const r = checkIdentify(m, truthAnswer(m));
      pass &&= r.ok;
      if (seed === DEFAULT_SEED) limits = `${String(val(r, 'B1240-64 period'))}; distances ${String(val(r, 'map distances'))}; ticks ${String(val(r, 'height ticks'))}`;
    }
    const odds = m0.identification().lines.map((lm) => `${lm.line.order} ${oddsText(lm.log10Odds)}`);
    console.log(`map.identify: ${odds.join('; ')}; limits: ${limits}`);
    // The research: B1240-64 known to three figures; Vela's map distance 1.63 kpc against 0.28 now, 5.8 times (cover.md section 2).
    const factor = Number(/up to ([\d.]+)/.exec(limits)?.[1]);
    // 4 to 9 times: the research's 5.8 for Vela alone, with the map's scale fitted rather than taken as 1972's R0.
    const factorOk = factor >= 4 && factor <= 9;
    pass &&= factorOk && /3 figures/.test(limits);
    recordCheck({
      id: 'map.identify',
      claim: 'Assigning every line its most likely pulsar (the old ones first, then the young ones by direction once the age is known) gives the documented identities, and the map\'s limits are stated.',
      measured: `default seed odds: ${odds.join('; ')}; limits: ${limits}`,
      expected: 'The documented identities (cover.json; Johnston 2002) for three seeds; B1240-64 known to three figures (SSD72) and map distances off by up to about six times (Vela 1.63 kpc on the map against 0.28 kpc, research cover.md section 2)',
      tolerance: 'Every line\'s best candidate equal to the documented pulsar; the distance factor between 4 and 9 (the map\'s scale is fitted here, not taken from 1972)',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('map.motion: the instrument\'s own best axis and the alien\'s measured velocity are accepted for three seeds', () => {
    const rows: string[] = [];
    let pass = true;
    for (const [seed, m] of models) {
      const ax = instrumentAxis(m);
      const r = checkMotion(m, ax);
      const meas = galacticOf(m.measured.velKmS as Vec3);
      const rm = checkMotion(m, meas);
      const d2 = Number(val(r, 'chi-square from the best velocity'));
      const d2m = Number(val(rm, 'chi-square from the best velocity'));
      pass &&= r.ok && rm.ok;
      if (seed === DEFAULT_SEED) {
        const f = m.motionFit();
        rows.push(`instrument axis l ${ax.lDeg.toFixed(2)}, b ${ax.bDeg.toFixed(2)}: chi-square ${d2.toFixed(2)}; measured velocity's axis ${d2m.toFixed(2)}; fit ${f.ageYears.toFixed(0)} +/- ${f.ageSigma.toFixed(0)} yr, ${norm(f.velKmS).toFixed(1)} km/s`);
      } else rows.push(`${seed}: ${d2.toFixed(2)} and ${d2m.toFixed(2)}`);
    }
    console.log(`map.motion: ${rows.join('; ')}`);
    recordCheck({
      id: 'map.motion',
      claim: 'The old lines\' own-frame ages fall on one straight line against (P / Pdot) times the cosine of the angle to the right axis on the sky; that axis, found on the instrument, is the alien\'s own motion relative to the map\'s makers.',
      measured: rows.join('; '),
      expected: 'The alien\'s own measured velocity relative to the Sun (Gaia DR3 for Gliese 445, epoch.ts), independent of the pulsars, accepted as an axis for three seeds; the velocity fit of pulsarAge.ts (dating.epoch.velocityFit)',
      tolerance: `chi-square of the axis against the fitted velocity at most ${CHI2_2DOF_95.toFixed(3)} (2 degrees of freedom, 95%)`,
      pass,
      notes: 'The side plot uses x = (P / Pdot) cos(angle), not the bare cosine: a Doppler shift moves each age by (P / Pdot) v cos / c, so only this x puts the ages on one line (with the bare cosine the scatter stays thousands of years at every axis).',
    });
    expect(pass).toBe(true);
  });

  it('map.region: the Sun\'s and the alien star\'s positions at the map epoch are inside; the region matches the research', () => {
    let pass = true;
    let text = '';
    for (const [seed, m] of models) {
      const age = m.motionFit().ageYears;
      const sun = inputs.stars.near.find((s) => s.id === 0)!;
      const at = m.starInMapPlane(sun, age);
      const r = checkRegion(m, { x: at[0], y: at[1] });
      pass &&= r.ok && r.result.some((x) => x.key === 'your own star inside' && x.value === 'yes');
      if (seed === DEFAULT_SEED) {
        const reg = m.region();
        const stars = starsInRegion(m);
        text = `${(2 * reg.semiAxesPc[0]).toFixed(1)} by ${(2 * reg.semiAxesPc[1]).toFixed(1)} pc, ${stars.inside} of ${stars.tested} catalogued stars inside at the map epoch, the alien's own star ${stars.homeInside ? 'inside' : 'outside'}; the Sun then at (${at[0].toFixed(1)}, ${at[1].toFixed(1)}) pc`;
        // Research (HOW_ITS_CHECKED row 6): about 31 by 14 pc and about a thousand stars. 15%: two thousand
        // Monte Carlo draws fix a covariance to about 2%, and the research figures are rounded to two digits.
        pass &&= Math.abs(2 * reg.semiAxesPc[0] / 31 - 1) <= 0.15 && Math.abs(2 * reg.semiAxesPc[1] / 14 - 1) <= 0.15 && stars.inside >= 700 && stars.inside <= 1400;
      }
    }
    console.log(`map.region: ${text}`);
    recordCheck({
      id: 'map.region',
      claim: 'Sliding the map\'s origin into the fitted region is accepted; the region holds about a thousand catalogued stars when the map was made, the alien\'s own star among them.',
      measured: text,
      expected: 'The Sun\'s own position at the map epoch accepted for three seeds; the research region, about 31 by 14 pc with about a thousand stars (HOW_ITS_CHECKED row 6, triangulation.epoch)',
      tolerance: 'Inside the 95% ellipse (chi-square 2 degrees of freedom); the size within 15% of the research figures and 700 to 1,400 stars',
      pass,
    });
    expect(pass).toBe(true);
  }, 120_000);
});

describe('The Map checkers: meaningful wrong answers say what they computed', () => {
  it('refuses a weak line, a wrong pulsar, a young line first, a future time, a wrong axis and an origin outside', () => {
    const m = m0;
    const l1 = m.lines.find((l) => l.order === 1)!;
    const lm1 = matchOf(m, 1);
    // A weak line: the same model with line 1's odds below the anchor rule (no real seed of 40 tried has one).
    const id = m.identification();
    const weakModel: EpochModel = { ...m, identification: () => ({ ...id, lines: id.lines.map((x) => (x.line.order === 1 ? { ...x, log10Odds: ANCHOR_LOG10_MARGIN - 0.1 } : x)) }) };
    const weak = checkPeriods(weakModel, { line: 1, jname: l1.jname });
    const runner = lm1.runnerUp!.entry.jname;
    const wrongP = checkPeriods(m, { line: 1, jname: runner });
    const far = checkPeriods(m, { line: 1, jname: m.lines.find((l) => l.order === 11)!.jname });
    const crab = m.lines.find((l) => l.bname === 'B0531+21')!;
    const young = checkPeriods(m, { line: crab.order, jname: crab.jname });
    const future = checkOld(m, { yearsAgo: -2000 });
    const ancient = checkOld(m, { yearsAgo: 150_000 });
    const swapped = { ...(truthAnswer(m) as Record<string, Answer>), '1': runner };
    const swap = checkIdentify(m, swapped);
    const missing = checkIdentify(m, { '1': l1.jname });
    const f = m.motionFit();
    const v = f.velKmS as Vec3;
    const perp = scale(cross(v, [0, 0, 1]), 1 / norm(cross(v, [0, 0, 1])));
    const axis90 = checkMotion(m, galacticOf(perp));
    // Five degrees off the fit's direction, in the plane where the chi-square rises fastest.
    const near5: Vec3 = [0, 1, 2].map((i) => (v[i] as number) / norm(v) * Math.cos(5 * Math.PI / 180) + (perp[i] as number) * Math.sin(5 * Math.PI / 180)) as unknown as Vec3;
    const off5 = axisDeltaChi2(f, near5);
    const reg = m.region();
    const phi = (reg.majorAxisDeg * Math.PI) / 180;
    const outside: [number, number] = [reg.centerPc[0] + 2 * reg.semiAxesPc[0] * Math.cos(phi), reg.centerPc[1] + 2 * reg.semiAxesPc[0] * Math.sin(phi)];
    const out = checkRegion(m, { x: outside[0], y: outside[1] });
    const lines = [weak, wrongP, far, young, future, ancient, swap, missing, axis90, out].map((r) => r.message);
    console.log(lines.join('\n'));
    expect(weak.ok).toBe(false);
    expect(weak.message).toMatch(/strong evidence/);
    expect(wrongP.ok).toBe(false);
    expect(wrongP.message).toMatch(/less well than another pulsar/);
    expect(far.ok).toBe(false);
    expect(far.message).toMatch(/cannot be line 1's star/);
    expect(young.ok).toBe(false);
    expect(young.message).toMatch(/too fast to match by period alone/);
    expect(future.ok).toBe(false);
    expect(future.message).toMatch(/cannot be from the future/);
    expect(ancient.ok).toBe(false);
    expect(ancient.message).toMatch(/nearest is line/);
    expect(swap.ok).toBe(false);
    expect(swap.message).toMatch(/^1 of 14 lines/);
    expect(missing.ok).toBe(false);
    expect(axis90.ok).toBe(false);
    expect(off5).toBeGreaterThan(CHI2_2DOF_95);
    expect(out.ok).toBe(false);
    expect(regionLevel(reg, outside)).toBeGreaterThan(0.95);
    expect(out.message).toMatch(/outside the 95% region/);
    // A malformed answer throws (the bus refuses it); so does any checker before the catalogues load.
    expect(() => checkPeriods(m, { line: 99, jname: l1.jname })).toThrow(/line must be/);
    expect(() => makeMapCheckers()['map.periods']({ line: 1, jname: l1.jname }, { attempts: 0, confirmed: new Set(), seed: 'not-loaded' })).toThrow(/loading/);
  });
});

describe('the bearing helper and the odds text', () => {
  it('recovers a constructed origin and rotation exactly, and matches the region fit on the real map', () => {
    // Constructed geometry: pulsars at known bearings from a known origin, the map turned by a known angle.
    const o: [number, number] = [12, -7];
    const alpha = 3.7;
    const pts: MapPoint[] = [10, 70, 140, 200, 260, 320].map((b, i) => {
      const r = 150 + 40 * i;
      const t = (b * Math.PI) / 180;
      return { name: `p${i}`, angleDeg: b - alpha, rOverR0: 0.05, posPc: [o[0] + r * Math.cos(t), o[1] + r * Math.sin(t), 0], distKpc: 0.2, distance: { kind: 'model' } };
    });
    const exact = bearingResiduals(pts, o);
    const away = bearingResiduals(pts, [o[0] + 30, o[1]]);
    // The real map: at the region's own centre the best rotation's rms can only be at or below the fit's own
    // (the fit's rotation is also a rotation; the fit is robust and uses lengths, so it is not the plain minimum).
    const m = m0;
    const reg = m.region();
    const real = bearingResiduals(mapPoints(m), reg.centerPc);
    const shifted = bearingResiduals(mapPoints(m), [reg.centerPc[0] + 100, reg.centerPc[1]]);
    console.log(`bearings: constructed rms ${exact.rmsDeg.toExponential(1)}, rotation ${exact.alphaDeg.toFixed(6)} (true ${alpha}); 30 pc away ${away.rmsDeg.toFixed(2)} deg; real ${real.rmsDeg.toFixed(3)} deg (fit ${reg.fit.rmsDeg.toFixed(3)}), rotation ${real.alphaDeg.toFixed(2)} (fit ${reg.fit.alphaDeg.toFixed(2)}); 100 pc off ${shifted.rmsDeg.toFixed(2)} deg`);
    // 1e-9 deg: double-precision atan2 on constructed points; 0.5 deg: the fit's sigma_theta is about 1 deg.
    const pass = exact.rmsDeg < 1e-9 && Math.abs(exact.alphaDeg - alpha) < 1e-9 && away.rmsDeg > 1 && real.rmsDeg <= reg.fit.rmsDeg + 1e-9 && Math.abs(real.alphaDeg - reg.fit.alphaDeg) < 0.5 && shifted.rmsDeg > 2 * real.rmsDeg;
    recordCheck({
      id: 'map.originResiduals',
      claim: 'When the player slides the map\'s origin, the bearings to the pulsars are compared with the map\'s angles after the best common rotation; that comparison is exact on constructed geometry and agrees with the region fit on the real map.',
      measured: `constructed: rms ${exact.rmsDeg.toExponential(1)} deg, rotation ${exact.alphaDeg.toFixed(6)} deg; real map at the fitted centre ${real.rmsDeg.toFixed(3)} deg rms (fit ${reg.fit.rmsDeg.toFixed(3)}), 100 pc off ${shifted.rmsDeg.toFixed(2)} deg`,
      expected: `Constructed origin and rotation (${alpha} deg) recovered; on the real map no worse than the triangulation fit's own rms (triangulation.ts fitMapOrigin) and rising away from it`,
      tolerance: 'Constructed: 1e-9 deg (double precision); real: rotation within 0.5 deg of the fit\'s, rms at most the fit\'s; 100 pc off at least twice the rms',
      pass,
    });
    expect(pass).toBe(true);
    expect(oddsText(5.2)).toBe('about 10⁵ to 1');
    expect(oddsText(1.3)).toBe('about 20 to 1');
    expect(oddsText(-2)).toBe('about 1 to 100');
    expect(oddsText(Infinity)).toMatch(/no other pulsar/);
    expect(timesText(0.5)).toBe('about 3.2');
  }, 60_000);
});

describe('the cover map drawn beside the chart', () => {
  it('reads 15 lines from the rebuilt cover, each pointing where cover.json says', () => {
    const g = parseCoverMap(readFileSync(resolve(process.cwd(), 'public/media/cover/cover.svg'), 'utf8'));
    expect(g.lines.map((l) => l.order)).toEqual([0, ...inputs.cover.pulsarMap.lines.map((l) => l.order).sort((a, b) => a - b)]);
    const worst = Math.max(
      ...inputs.cover.pulsarMap.lines.map((l) => {
        const d = drawnAngleDeg(g, g.lines.find((x) => x.order === l.order)!) - l.mapAngleDeg;
        return Math.abs(((d % 360) + 540) % 360 - 180);
      }),
    );
    // 2 deg: a line's farthest drawn point is the end of its digits, which run along the line but are offset
    // sideways by about half a bar (0.35 mm) from it; at 20 mm or more from the origin that is under 1 deg.
    expect(worst).toBeLessThan(2);
  });
});
