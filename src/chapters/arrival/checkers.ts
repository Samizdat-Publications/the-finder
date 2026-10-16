// The four Arrival checkers. Each computes its verdict from the science (rule 1) on the playthrough's model
// (model.ts, built from the seed in the save), and every wrong answer reports the computed result that
// rules it out (PLAN.md "Principles from the kickoff"). Pure apart from the registry call in install.

import { registerChecker, type CheckResult, type Checker, type Reading } from '../../game/deductions';
import { JULIAN_YEAR_S } from '../../science/units';
import { NATURAL_U238_OVER_U234, chainRatios, judgeChain, type ChainId } from './chains';
import { CHOICES } from './choices';
import { DISH_DIAMETER_M } from './constants';
import type { ArrivalModel } from './model';
import { SECONDS_PER_DAY, cylinderGeometry, secondsToYears } from './physics';

/** n significant figures, grouped, never in e-notation below 1e6. */
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(n - 1).replace('e+', 'e');
  return Number(x.toPrecision(n)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

const yearsS = (y: number): number => y * JULIAN_YEAR_S;

function unknown(id: string, answer: unknown): CheckResult {
  const offered = (CHOICES[id] ?? []).map((c) => c.id).join(', ');
  return {
    ok: false,
    result: [{ key: 'reading', value: typeof answer === 'string' ? answer : JSON.stringify(answer) }],
    message: `The instrument has no reading called "${String(answer)}". It offers: ${offered}.`,
  };
}

export function checkPurpose(answer: unknown, m: ArrivalModel): CheckResult {
  const e = m.estimates;
  const base: Reading[] = [
    { key: 'dish diameter', value: DISH_DIAMETER_M, dim: 'length' },
    { key: 'dish to path back, degrees', value: Number(m.dishVsPathBackDeg.toPrecision(2)) },
    { key: 'speed past your star', value: m.passSpeedKmS * 1000, dim: 'speed' },
  ];
  switch (answer) {
    case 'radio':
      return {
        ok: true,
        result: [...base, { key: 'kind', value: 'judgement from the shapes' }],
        message:
          `Radio fits every reading. A metal paraboloid with something at its focus gathers or sends waves from one direction; ` +
          `true to millimetres but rough to light, it works for waves of centimetres and longer; and it faces back along the path the machine came ` +
          `(within ${sig(m.dishVsPathBackDeg, 2)} degrees), toward whoever it talks to. A judgement from the shapes, not a number.`,
      };
    case 'eye':
      return {
        ok: false,
        result: base,
        message:
          'An eye or a telescope mirror must be smooth to a small part of a wavelength of light (well under a thousandth of a millimetre). ' +
          'The scan shows this surface true only to millimetres: it scatters your lamps diffusely instead of imaging them. It is far too rough for light.',
      };
    case 'sail': {
      const dvPerMyr = e.sailAccelMs2 * 1e6 * JULIAN_YEAR_S;
      return {
        ok: false,
        result: base,
        message:
          `Starlight here pushes this ${DISH_DIAMETER_M} m dish on a craft of about 720 kg with ${sig(e.sailAccelMs2)} m/s²: ` +
          `${sig(dvPerMyr * 1000)} mm/s of speed per million years, against the ${sig(m.passSpeedKmS)} km/s it passes your star at. ` +
          'A sail must be huge and thin; this is small, heavy and rigid.',
      };
    }
    case 'radiator':
      return {
        ok: false,
        result: [...base, { key: 'dish temperature', value: e.dishK, dim: 'temperature' }],
        message:
          `A radiator is warmer than the sky around it. The dish reads ${sig(e.dishK)} K, exactly what an unheated plate reaches out here ` +
          '(starlight and the cosmic background alone). The warm parts hang on a separate boom, with nothing to carry their heat to the dish.',
      };
    default:
      return unknown('arrival.purpose', answer);
  }
}

export function checkHeat(answer: unknown, m: ArrivalModel): CheckResult {
  const e = m.estimates;
  const g = cylinderGeometry();
  const darkS = yearsS(m.darkYears);
  const base: Reading[] = [
    { key: 'heat output low', value: m.heatW.low, dim: 'power' },
    { key: 'heat output high', value: m.heatW.high, dim: 'power' },
    { key: 'surface temperature', value: e.leftover.surfaceK, dim: 'temperature' },
    { key: 'time away from every star', value: darkS, dim: 'time' },
  ];
  const dark = `The machine has been away from every star in your catalogue for at least ${sig(m.darkYears, 2)} years`;
  switch (answer) {
    case 'decay':
      return {
        ok: true,
        result: base,
        message:
          `Decay fits. A heavy decaying atom stores ${sig(e.decay.jPerKg)} J/kg, ${sig(e.decay.overChemistry, 2)} times the best chemistry, ` +
          `so the cylinders' mass could keep ${sig(m.heatW.high, 2)} W going for up to ${sig(secondsToYears(e.decay.fullLoadSeconds), 2)} years. ` +
          `${dark}, and it is still warm.`,
      };
    case 'sunlight':
      return {
        ok: false,
        result: [...base, { key: 'light absorbed', value: e.sunlight.totalW, dim: 'power' }],
        message:
          `All the starlight here, the bright star the dish faces included, delivers ${sig(e.sunlight.totalW)} W to the three cylinders even if they absorbed every bit ` +
          `(the bright star ${sig(e.sunlight.sunPowerW)} W, the rest of the sky ${sig(e.sunlight.skyPowerW)} W). ` +
          `They give out at least ${sig(m.heatW.low, 2)} W: light falls short ${sig(e.sunlight.shortBy, 2)} times, about ${Math.round(Math.log10(e.sunlight.shortBy))} orders of magnitude.`,
      };
    case 'leftover':
      return {
        ok: false,
        result: [...base, { key: 'longest leftover warmth', value: e.leftover.maxSecondsAtThisWarmth, dim: 'time' }],
        message:
          `Radiating ${sig(m.heatW.low, 2)} W from ${sig(g.surfaceM2, 2)} m² means a surface near ${sig(e.leftover.surfaceK, 2)} K. ` +
          `With ${sig(g.massKg)} kg counted as beryllium, their heat-holding case (${sig(e.leftover.heatCapacityJK, 2)} J/K), they cool ${sig(e.leftover.coolingKPerDay, 2)} K a day, ` +
          `and however hot they began, they would have fallen below this warmth within ${sig(e.leftover.maxSecondsAtThisWarmth / SECONDS_PER_DAY, 2)} days. ${dark}.`,
      };
    case 'chemical': {
      const fuelKg = e.chemical.fuelKgFor(darkS);
      return {
        ok: false,
        result: [...base, { key: 'fuel needed', value: fuelKg, dim: 'mass' }],
        message:
          `The best chemistry gives ${sig(e.chemical.bestJPerKg)} J/kg. Even if all ${sig(g.massKg)} kg of the cylinders were such fuel, ` +
          `${sig(m.heatW.low, 2)} W would use it up in ${sig(secondsToYears(e.chemical.fullLoadSeconds), 2)} years. ${dark}: ` +
          `that needs ${sig(fuelKg / 1000, 2)} tonnes of fuel, ${sig(fuelKg / g.massKg, 2)} times their whole mass.`,
      };
    }
    default:
      return unknown('arrival.heat', answer);
  }
}

export function checkMadeNotMined(answer: unknown, m: ArrivalModel): CheckResult {
  const meas = m.measurement.u238OverU234;
  const orders = Math.log10(NATURAL_U238_OVER_U234 / meas);
  const base: Reading[] = [
    { key: 'uranium-238 per uranium-234, measured', value: meas },
    { key: 'uranium-238 per uranium-234, natural', value: Math.round(NATURAL_U238_OVER_U234) },
    { key: 'orders of magnitude apart', value: Number(orders.toFixed(1)) },
  ];
  if (answer === 'made') {
    return {
      ok: true,
      result: base,
      message:
        `Made. Natural uranium always carries ${sig(NATURAL_U238_OVER_U234)} uranium-238 atoms for each uranium-234 (their half-lives fix it); ` +
        `here there are ${sig(meas, 2)}, ${orders.toFixed(1)} orders of magnitude fewer. This uranium-234 was born from a heavier element, and only someone who makes elements makes that.`,
    };
  }
  if (answer === 'mined') {
    const v = judgeChain('naturalUranium', m.measurement);
    return {
      ok: false,
      result: [...base, { key: 'chi-square, natural uranium', value: Number((v.chi2 ?? NaN).toPrecision(3)) }],
      message:
        `Mined uranium would hold ${sig(NATURAL_U238_OVER_U234)} uranium-238 atoms per uranium-234; the scan finds ${sig(meas, 2)}, ` +
        `${orders.toFixed(1)} orders of magnitude short. No age of natural uranium fits: the best gives chi-square ${sig(v.chi2 ?? NaN)} for ${2} degrees of freedom.`,
    };
  }
  return unknown('arrival.madeNotMined', answer);
}

export function checkFuelAge(answer: unknown, m: ArrivalModel): CheckResult {
  const ids = (CHOICES['arrival.fuelAge'] ?? []).map((c) => c.id);
  if (typeof answer !== 'string' || !ids.includes(answer)) return unknown('arrival.fuelAge', answer);
  const v = judgeChain(answer as ChainId, m.measurement);
  const right = judgeChain('pu238', m.measurement).dating;
  if (answer === 'pu238' && v.dating) {
    const d = v.dating;
    return {
      ok: true,
      result: [
        { key: 'age', value: yearsS(d.ageYears), dim: 'time' },
        { key: 'age low, 95%', value: yearsS(d.lo), dim: 'time' },
        { key: 'age high, 95%', value: yearsS(d.hi), dim: 'time' },
        { key: 'half-life systematic', value: yearsS(d.halfLifeSystematicYears), dim: 'time' },
      ],
      message:
        `The plutonium-238 chain meets the measured thorium-230 to uranium-234 ratio at ${sig(d.ageYears)} years ` +
        `(95%: ${sig(d.lo)} to ${sig(d.hi)} years from the measurement; half-lives add ${sig(d.halfLifeSystematicYears, 2)} years, 1 sigma). ` +
        `The radium ratio agrees (chi-square p ${sig(v.pValue ?? NaN, 2)}). The heat source was made that long ago.`,
    };
  }
  const result: Reading[] = v.ageYears === null ? [{ key: 'curve meets measurement', value: 'never' }] : [{ key: 'curve meets measurement at', value: yearsS(v.ageYears), dim: 'time' }];
  if (answer === 'oldOre') {
    return {
      ok: false,
      result,
      message:
        `Ore in balance has a fixed ratio, ${sig(chainRatios('oldOre', 1).th230OverU234)} thorium-230 per uranium-234 (the ratio of their half-lives), whatever its age; ` +
        `you measure ${sig(m.measurement.th230OverU234)}. The curve never meets the measurement, and it would also need ${sig(NATURAL_U238_OVER_U234)} uranium-238 per uranium-234 (you measure ${sig(m.measurement.u238OverU234, 2)}).`,
    };
  }
  if (answer === 'naturalUranium') {
    return {
      ok: false,
      result: [...result, { key: 'uranium-238 orders of magnitude off', value: Number((v.u238OrdersOff ?? NaN).toFixed(1)) }],
      message:
        `This curve meets the thorium ratio at ${sig(v.ageYears ?? NaN)} years, but the same chain demands ${sig(v.u238Predicted ?? NaN)} uranium-238 atoms per uranium-234 ` +
        `and you measure ${sig(m.measurement.u238OverU234, 2)}: ${(v.u238OrdersOff ?? NaN).toFixed(1)} orders of magnitude apart. The second ratio rules it out (chi-square ${sig(v.chi2 ?? NaN)}).`,
    };
  }
  // u234Start: the thorium cannot tell it from the plutonium chain; its parentage can.
  const gap = right && v.ageYears !== null ? right.ageYears - v.ageYears : NaN;
  return {
    ok: false,
    result: [...result, { key: 'gap to the plutonium chain', value: yearsS(gap), dim: 'time' }],
    message:
      `This curve meets the measurement too, at ${sig(v.ageYears ?? NaN)} years, only ${sig(gap, 2)} years from the plutonium chain's age and inside its uncertainty: ` +
      `the thorium and radium ratios cannot tell the two apart. What rules it out is where the uranium-234 came from. You found it was born from a heavier element, ` +
      'and that element\'s family (plutonium-239 and -242, with their daughters uranium-235 and -236) is still in the spectrum. Uranium-234 was not there from the start.',
  };
}

export type ModelFor = (seed: string) => ArrivalModel;

export function arrivalCheckers(modelFor: ModelFor): Record<string, Checker> {
  return {
    'arrival.purpose': (a, ctx) => checkPurpose(a, modelFor(ctx.seed)),
    'arrival.heat': (a, ctx) => checkHeat(a, modelFor(ctx.seed)),
    'arrival.madeNotMined': (a, ctx) => checkMadeNotMined(a, modelFor(ctx.seed)),
    'arrival.fuelAge': (a, ctx) => checkFuelAge(a, modelFor(ctx.seed)),
  };
}

export function installArrivalCheckers(modelFor: ModelFor): void {
  for (const [id, c] of Object.entries(arrivalCheckers(modelFor))) registerChecker(id, c);
}
