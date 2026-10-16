// What the identification at the story epoch (pulsarIdentify.ts, D-A16 amended in M5 step 0a) allows for the
// map's age and for each candidate's own spin-down: the Arrival clock's error model for the age, and the
// pulsar's timing noise on its measured Pdot (the same model the dating uses, pulsarAge.ts datePulsar). The
// pre-selection keeps a candidate unless both are outside their two-sided 1e-6 tails; the period factor
// draws from both. Pure and deterministic: seeded streams only.

import { alienCandidateView, amplitudePosterior } from './pulsarAge';
import type { AlienPulsar } from './pulsarEpoch';
import { identifyLines, lsbHalfWidth, type IdentifyOptions } from './pulsars';
import type { Rng } from './random';
import { rtgAgeAtDeviate, type RtgMeasurement } from './rtg';
import { bisectRoot, normalCdf, normalQuantile } from './stats';
import type { CoverMapLine } from './types';
import { HYDROGEN_HZ } from './units';

/**
 * Two-sided probability left outside each pre-selection bound (the clock's age window; a candidate's
 * timing-noise bound): 1e-6, so over the game's 2,000 candidate seeds about 0.03 right pulsars would be cut
 * (14 lines, two bounds each). The bounds' edges come from the error models themselves, not a choice.
 */
export const AGE_WINDOW_TAIL = 1e-6;

/**
 * The map's age as the identification uses it: the Arrival clock's confidence distribution for the fuel
 * age, with no allowance for the map being older than the fuel. Basis: the map's periods date to about
 * 1971 (Crab 1971.76, glitch-corrected Vela 1971.77; the slow pulsars 1966.6 to 1970, clocks.md section 2)
 * and the fuel's purification precedes the 1977.7 launch (clocks.md 4b), so the map is older than the fuel
 * by about 6 to 11 years, 1 to 2 per cent of the clock's 1 sigma (about 500 years at 44,000 years and 1%
 * precision); the simulation carries that gap (the fuel is dated from launch, the map lines are the
 * 1970/71 periods) and identify.epoch tests over 500 seeds that it does not matter. The former window
 * U[t_lo, 2 t_hi] cut the clock's lower tail at its 95% bound, and its upper allowance (up to twice the
 * fuel's age) stood in, one-sidedly, for the candidates' timing noise, now modelled (timingNoiseBound).
 */
export interface RtgAgeModel {
  /** Age at z = 0, years. */
  centralYears: number;
  /** Pre-selection window [age(+z_w), age(-z_w)], z_w the two-sided AGE_WINDOW_TAIL deviate, years. */
  windowYears: [number, number];
  /** One age from the clock's confidence distribution: z ~ N(0, 1), A = rtgAgeAtDeviate(m, z). */
  draw(rng: Rng): number;
}

const AGE_TABLE_NODES = 401;

export function rtgAgeModel(m: RtgMeasurement): RtgAgeModel {
  const zw = -normalQuantile(AGE_WINDOW_TAIL / 2);
  // Ages on a z grid over the window, linearly interpolated: the curvature of A(z) over one 0.024 step adds
  // about 1e-3 yr (measured in identify.ageModel); draws beyond the window are computed exactly.
  const step = (2 * zw) / (AGE_TABLE_NODES - 1);
  const table = Array.from({ length: AGE_TABLE_NODES }, (_, i) => rtgAgeAtDeviate(m, -zw + i * step));
  return {
    centralYears: rtgAgeAtDeviate(m, 0),
    windowYears: [rtgAgeAtDeviate(m, zw), rtgAgeAtDeviate(m, -zw)],
    draw(rng: Rng): number {
      const z = rng.normal();
      if (!(Math.abs(z) < zw)) return rtgAgeAtDeviate(m, z);
      const u = (z + zw) / step;
      const i = Math.min(AGE_TABLE_NODES - 2, Math.floor(u));
      const f = u - i;
      return (table[i] as number) * (1 - f) + (table[i + 1] as number) * f;
    },
  };
}

/**
 * Timing noise on a candidate's measured spin-down (pulsarEpoch.ts: Pdot_meas = Pdot (1 + s z)), with the
 * amplitude s drawn from the alien's posterior given its own measured amplitude (pulsarAge.ts
 * amplitudePosterior over Lyne et al. 2010's 17 values), exactly as datePulsar draws it.
 */
export interface TimingNoiseModel {
  /** x with P(|s z| > x) = AGE_WINDOW_TAIL under the posterior mixture: the long-term Pdot lies in Pdot_meas / (1 +- x). */
  bound: number;
  /** One factor 1 + s z (the long-term Pdot is Pdot_meas divided by it). */
  draw(rng: Rng): number;
}

const noiseCache = new Map<number, TimingNoiseModel>();

export function timingNoiseModel(measRms: number): TimingNoiseModel {
  const hit = noiseCache.get(measRms);
  if (hit) return hit;
  const post = amplitudePosterior(measRms);
  const w = post.cdf.map((c, j) => c - (j > 0 ? (post.cdf[j - 1] as number) : 0));
  const tail = (x: number): number => post.rms.reduce((acc, a, j) => acc + (w[j] as number) * 2 * normalCdf(-x / a), 0);
  const amax = Math.max(...post.rms);
  // tail(0) = 1 and tail(10 amax) < 1e-22: the root is bracketed.
  const bound = bisectRoot((x) => tail(x) - AGE_WINDOW_TAIL, 0, 10 * amax, 200, 1e-12);
  const model: TimingNoiseModel = {
    bound,
    draw(rng: Rng): number {
      const z = rng.normal();
      const u = rng.uniform();
      const j = post.cdf.findIndex((c) => u <= c);
      return 1 + (post.rms[j < 0 ? post.rms.length - 1 : j] as number) * z;
    },
  };
  if (noiseCache.size > 4096) noiseCache.clear();
  noiseCache.set(measRms, model);
  return model;
}

/**
 * The identification's pre-selection tolerances (D-A16): a candidate's direction within 5 deg of the map
 * angle (a generous box around the map's drawing accuracy, about 1 deg, plus 44,000 years of proper
 * motion), a Doppler allowance of 1e-3 (relative speeds up to 300 km/s) and braking indices 0.9 to 4. The
 * instrument (src/chapters/map/mapMath.ts) reuses them through preselect to say why a pulsar was not considered.
 */
export const PRESELECT = { directionTolDeg: 5, dopplerAllowance: 1e-3, nRange: [0.9, 4] as const } as const;

/**
 * Pre-select every line's candidates: direction within 5 deg; then, for a pulsar with a spin-down, the
 * elapsed-time range from its measured Pdot (pulsars.ts elapsedRangeYears over n, Doppler and one LSB)
 * stretched by its timing-noise bound (the elapsed time is exactly proportional to 1 / Pdot, so the long-term
 * Pdot's range Pdot_meas / (1 +- x) gives [t_lo (1 - x), t_hi (1 + x)]) must overlap the clock's age window.
 * A pulsar without a spin-down is kept when its period, within the Doppler allowance, meets the map's.
 */
export function preselect(lines: readonly CoverMapLine[], alien: readonly AlienPulsar[], windowYears: readonly [number, number]): { line: CoverMapLine; candidates: AlienPulsar[] }[] {
  const byJ = new Map(alien.map((a) => [a.jname, a]));
  const opts: IdentifyOptions = {
    directionTolDeg: PRESELECT.directionTolDeg,
    dopplerAllowance: PRESELECT.dopplerAllowance,
    windowYears: [-Infinity, Infinity],
    nRange: PRESELECT.nRange,
    mapHalfWidth: () => lsbHalfWidth(HYDROGEN_HZ),
    hz: HYDROGEN_HZ,
  };
  return identifyLines(lines, alien.map(alienCandidateView), opts).map((r) => ({
    line: r.line,
    candidates: r.candidates
      .filter((c) => {
        if (c.tRangeYears === null) return true;
        const e = byJ.get(c.view.jname) as AlienPulsar;
        const x = timingNoiseModel(e.timingNoiseRmsMeas).bound;
        const [t0, t1] = c.tRangeYears;
        return Math.max(t1 * (1 + x), t1 * (1 - x)) >= windowYears[0] && Math.min(t0 * (1 - x), t0 * (1 + x)) <= windowYears[1];
      })
      .map((c) => byJ.get(c.view.jname) as AlienPulsar),
  }));
}
