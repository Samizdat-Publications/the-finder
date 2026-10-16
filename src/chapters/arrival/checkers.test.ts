// The four Arrival checkers on the default playthrough: the right answer confirms, and every wrong answer is
// rejected with its own computed result. Expected values come from the research (docs/research/clocks.md
// 4b, D-A13, D-A14, voyager.md section 2) or from independent arithmetic, never from earlier output.

import { describe, expect, it } from 'vitest';
import scenarioJson from '../../../data/scenario.json';
import { loadStars } from '../../../tests/support/data';
import { recordCheck } from '../../../tests/support/record';
import { DEFAULT_SEED } from '../../game/deductions';
import { renderMessage } from '../../ui/message';
import { discoveryState } from '../../science/epoch';
import type { ScenarioData } from '../../science/types';
import { checkFuelAge, checkHeat, checkMadeNotMined, checkPurpose } from './checkers';
import { CHOICES } from './choices';
import { buildArrival } from './model';

const scenario = scenarioJson as unknown as ScenarioData;
const stars = { ...loadStars(), sky: [] };
const model = buildArrival(scenario, stars, DEFAULT_SEED);
const truthYears = discoveryState(scenario, stars).yearsAfterLaunch;

const run = (check: (a: unknown) => { ok: boolean; message: string }, id: string) =>
  (CHOICES[id] ?? []).map((c) => ({ id: c.id, ...check(c.id) }));

describe('arrival checkers', () => {
  it('is deterministic: the same seed gives the same measurements, another seed different ones', () => {
    const again = buildArrival(scenario, stars, DEFAULT_SEED);
    expect(again.measurement).toEqual(model.measurement);
    expect(again.spectrum).toEqual(model.spectrum);
    expect(buildArrival(scenario, stars, 'another').measurement.th230OverU234).not.toBe(model.measurement.th230OverU234);
  });

  it('arrival.purpose: only radio fits; each wrong reading names its evidence', () => {
    const r = run((a) => checkPurpose(a, model), 'arrival.purpose');
    const ok = r.filter((x) => x.ok).map((x) => x.id);
    // The dish faces back along the path: the Sun's direction and the reversed velocity agree to well under
    // a degree, because 44,000 years of 16.6 km/s carry the craft 0.75 pc while the 2026 offset of
    // 165 au is 0.0008 pc (voyager.md section 5): 0.0008 / 0.75 rad = 0.06 deg at most.
    const pathOk = model.dishVsPathBackDeg < 0.06;
    // Messages carry their quantities as tokens (src/ui/message.ts); with the human gloss on they read in SI too.
    const sail = renderMessage(r.find((x) => x.id === 'sail')?.message ?? '', true);
    const radiator = renderMessage(r.find((x) => x.id === 'radiator')?.message ?? '', true);
    const pass = ok.length === 1 && ok[0] === 'radio' && pathOk && /m\/s²/.test(sail) && /3\.48 K/.test(radiator) && /rough|smooth/.test(r[0]!.message);
    recordCheck({
      id: 'arrival.purpose',
      claim: 'The dish was built to send and receive radio: of four readings (an eye, radio, a light sail, a radiator) only radio fits the scan.',
      measured: `accepted: ${ok.join(', ')}; dish faces back along the path within ${model.dishVsPathBackDeg.toFixed(4)} deg; light push on the dish ${model.estimates.sailAccelMs2.toExponential(2)} m/s^2; dish at ${model.estimates.dishK.toFixed(2)} K (unheated plate in starlight and the cosmic background)`,
      expected: 'radio only; an eye needs a surface smooth to light; a sail is pushed by under 1e-17 m/s^2 (hand calculation); a radiator would be warmer than the 3.48 K sky (hand calculation)',
      tolerance: 'exact for the verdicts; the numbers as in arrival physics hand calculations (0.1%)',
      pass,
      notes: 'A judgement deduction, not a numbers one. The dish facing the Sun is the scene\'s composition (the attitude is not computable); the angle between the Sun and the path back is computed. The surface roughness is a scan observation, not a measured number.',
    });
    expect(pass).toBe(true);
  });

  it('arrival.heat: only decay fits; sunlight, leftover heat and chemistry each fall short by a computed factor', () => {
    const r = run((a) => checkHeat(a, model), 'arrival.heat');
    const ok = r.filter((x) => x.ok).map((x) => x.id);
    const e = model.estimates;
    const dayLimit = e.leftover.maxSecondsAtThisWarmth / 86_400;
    const chemYears = e.chemical.fullLoadSeconds / 3.15576e7;
    // PLAN.md chapter 0 and D-A13: about 9 W in all (8.7 W, radon retained); the low end without radon progeny.
    const heatOk = Math.abs(model.heatW.high - 8.7) < 0.1 && model.heatW.low < model.heatW.high;
    const pass = ok.length === 1 && ok[0] === 'decay' && heatOk && e.sunlight.shortBy > 1e5 && dayLimit < 30 && chemYears < model.darkYears / 10;
    recordCheck({
      id: 'arrival.heat',
      claim: 'The three cylinders are warmed by radioactive decay: starlight, heat left from their making and chemistry each fall short by a computed margin.',
      measured: `heat ${model.heatW.low.toFixed(2)} to ${model.heatW.high.toFixed(2)} W; starlight delivers ${e.sunlight.totalW.toExponential(2)} W (${e.sunlight.shortBy.toExponential(1)} times short); leftover heat stays this warm at most ${dayLimit.toFixed(1)} days; the best chemistry in 117 kg lasts ${chemYears.toFixed(0)} years; away from every star at least ${model.darkYears.toFixed(0)} years; decay could last ${(e.decay.fullLoadSeconds / 3.15576e7).toExponential(2)} years`,
      expected: 'heat 8.7 W with radon retained (D-A13); starlight about 1.4e-5 W, leftover 12.7 days, chemistry 18.6 years (hand calculations in physics.test.ts)',
      tolerance: '0.1 W on the heat (the research rounding); verdicts exact',
      pass,
      notes: 'Generous to every wrong answer: the lowest heat (radon escaping), perfectly black cylinders, beryllium\'s specific heat for the whole mass, beryllium burning as the fuel. "Away from every star" is the shortest straight-line time back to any catalogued star within 30 pc, with stars lacking a radial velocity allowed any speed up to the Galactic escape speed.',
    });
    expect(pass).toBe(true);
  });

  it('arrival.madeNotMined: the missing uranium-238 says made, about 8 orders of magnitude from natural', () => {
    const made = checkMadeNotMined('made', model);
    const mined = checkMadeNotMined('mined', model);
    // D-A14 and clocks.md 4b: U-238/U-234 about 1.7e-4 by atoms (D-A13), natural about 18,200: 10^8.0 apart.
    const orders = Math.log10(18_200 / model.measurement.u238OverU234);
    const pass = made.ok && !mined.ok && Math.abs(orders - 8.03) < 0.05 && /chi-square/.test(mined.message);
    recordCheck({
      id: 'arrival.madeNotMined',
      claim: 'The fuel was made, not mined: its uranium-234 comes with almost no uranium-238, where natural uranium carries about 18,000 for each.',
      measured: `measured U-238/U-234 ${model.measurement.u238OverU234.toExponential(2)} (1% precision); ${orders.toFixed(2)} orders of magnitude below natural; "mined" rejected (${mined.message.match(/chi-square [^ ]+/)?.[0] ?? ''})`,
      expected: 'U-238/U-234 1.7e-4 (D-A13) against 18,200 natural (T238 / T234): 8.03 orders of magnitude; natural uranium rejected at chi-square about 1e4 (D-A14, clocks.rtg.wrongChain)',
      tolerance: '0.05 in orders of magnitude (three 1% sigmas of the measurement)',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('arrival.fuelAge: the plutonium chain dates the source and its 95% interval contains the true age; the other chains fail as computed', () => {
    const right = checkFuelAge('pu238', model);
    const age = right.result.map((x) => Number(x.value) / 3.15576e7);
    const [mid, lo, hi] = [age[0]!, age[1]!, age[2]!];
    const wrong = (['naturalUranium', 'u234Start', 'oldOre'] as const).map((c) => ({ c, ...checkFuelAge(c, model) }));
    const contains = lo <= truthYears && truthYears <= hi;
    const pass =
      right.ok && contains && wrong.every((w) => !w.ok) &&
      /orders of magnitude apart/.test(wrong[0]!.message) && /cannot tell the two apart/.test(wrong[1]!.message) && /never meets/.test(wrong[2]!.message);
    recordCheck({
      id: 'arrival.fuelAge',
      claim: 'The decay clock dates the heat source: the plutonium-238 chain fits the thorium-230 to uranium-234 ratio at about 44,000 years, and the 95% interval contains the true age.',
      measured: `default seed: ${mid.toFixed(0)} years (95%: ${lo.toFixed(0)} to ${hi.toFixed(0)}); natural series meets at ${renderMessage(wrong[0]!.message, true).match(/\(([\d,]+) years\)/)?.[1]} years but is 8 orders off in U-238; U-234-from-the-start meets inside the interval and is refused by its parentage; old ore never meets`,
      expected: `true elapsed time ${truthYears.toFixed(0)} years (epoch.ts discovery state); activity ratio 0.352 at 44,000 years (clocks.md 4b)`,
      tolerance: 'the computed 95% interval (1% measurement precision; calibration in clocks.rtg.coverage)',
      pass,
      notes: 'The thorium and radium ratios cannot separate "U-234 from the start" from the plutonium chain (they differ by the plutonium mean life, about 127 years); that wrong answer is refused by the made-not-mined finding and the plutonium family in the spectrum, not by the clock.',
    });
    expect(pass).toBe(true);
  });

  it('refuses answers the instrument does not offer, with what it offers', () => {
    for (const c of [checkPurpose, checkHeat, checkMadeNotMined, checkFuelAge]) {
      const r = c('a telescope', model);
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/offers/);
    }
  });
});
