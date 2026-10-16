// The reframe: the map's line ages measured in a chosen star's rest frame. The alien's own frame is the
// model's ages('own'); the Sun's (the origin star of the trail) is ages('sun'), which the model reframes
// with the alien's measured state relative to the Sun. Any other star's frame uses datePulsar with
// `reframe` set to the alien's measured state relative to that star (its position and velocity minus the
// star's at the epoch, the same covariance), with the same seed and draws as the model, cached per seed and
// star. Pure: no DOM; deterministic for a seed.

import { sub } from '../../science/astro';
import { starStateAt, type Observer } from '../../science/epoch';
import { combineAges, datePulsar, type CombinedAge, type PulsarAge } from '../../science/pulsarAge';
import { weightedMean } from '../../science/stats';
import type { StarRecord } from '../../science/types';
import { EPOCH_DRAWS, type EpochModel } from '../shared/epochModel';

export type FrameId = 'own' | number;

export interface FrameAges {
  frame: FrameId;
  perLine: PulsarAge[];
  combined: CombinedAge;
}

/** The alien's measured state relative to a star at the epoch: position and velocity minus the star's, same covariances. */
export function observerRelativeTo(m: EpochModel, star: StarRecord): Observer {
  const st = starStateAt(star, m.disc.decimalYear);
  return { ...m.measured, posPc: sub(m.measured.posPc, st.posPc), velKmS: sub(m.measured.velKmS, st.velKmS) };
}

const cache = new WeakMap<EpochModel, Map<string, FrameAges>>();

/** The map's line ages in a frame: 'own' (no reframe), the Sun's (id 0, the model's ages('sun')), or any other star's. */
export function agesInFrame(m: EpochModel, frame: FrameId, star?: StarRecord): FrameAges {
  if (frame === 'own') return { frame, ...m.ages('own') };
  if (frame === 0) return { frame, ...m.ages('sun') };
  let c = cache.get(m);
  if (!c) {
    c = new Map();
    cache.set(m, c);
  }
  const key = String(frame);
  const hit = c.get(key);
  if (hit) return hit;
  const s = star ?? m.inputs.stars.near.find((x) => x.id === frame) ?? m.inputs.stars.sky.find((x) => x.id === frame);
  if (!s) throw new Error(`no catalogue star ${frame}`);
  if (s.rvKmS === null) throw new Error('That star has no measured radial velocity, so its rest frame is unknown.');
  const reframe = observerRelativeTo(m, s);
  const perLine = m.lines.map((l) => {
    const entry = m.byJ.get(l.jname);
    if (!entry) throw new Error(`${l.jname} is not in the alien's catalogue`);
    return datePulsar(entry, l, { seed: m.seed, draws: EPOCH_DRAWS, reframe });
  });
  const out: FrameAges = { frame, perLine, combined: combineAges(perLine.filter((a) => !a.young)) };
  c.set(key, out);
  return out;
}

/**
 * How well a set of old lines agrees in a frame: their medians' lowest and highest, years ago, the spread
 * between them, and the chi-square per degree of freedom of the medians about their inverse-variance
 * weighted mean (about 1 when they agree within their own errors, far more when they scatter). The set is
 * given by J name so that every frame is judged on the same lines: the lines the robust combination keeps
 * in the origin star's frame (combineAges sets aside a line more than 4 sigma from the rest, which is a
 * fault of the line, such as B1240-64's period known only to three figures, not of the frame). Without a
 * set, the lines this frame's own combination keeps.
 */
export function oldSpread(f: FrameAges, jnames?: ReadonlySet<string>): { lo: number; hi: number; spread: number; count: number; chi2PerDof: number } {
  const old = jnames ? f.perLine.filter((a) => !a.young && jnames.has(a.jname)) : f.combined.kept;
  const meds = old.map((a) => a.median);
  const lo = Math.min(...meds);
  const hi = Math.max(...meds);
  const wm = weightedMean(meds, old.map((a) => a.sigma)).mean;
  const chi2 = old.reduce((s, a) => s + ((a.median - wm) / a.sigma) ** 2, 0);
  return { lo, hi, spread: hi - lo, count: meds.length, chi2PerDof: chi2 / Math.max(1, old.length - 1) };
}

/** The J names of the lines the origin frame's robust combination keeps: the set every frame is judged on. */
export function judgedLines(origin: FrameAges): Set<string> {
  return new Set(origin.combined.kept.map((a) => a.jname));
}
