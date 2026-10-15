// Seeded random streams. The only source of randomness in src/science: never Math.random.
//
// Generator: sfc32 (Chris Doty-Humphrey's Small Fast Chaotic generator, 128-bit state, from
// PractRand; passes BigCrush), seeded through cyrb128 (bryc, public domain string hash).
// Normals: Marsaglia polar method, spare value cached deterministically.
// Poisson: inversion for lambda < 10; PTRS transformed rejection (Hormann 1993, "The transformed
// rejection method for generating Poisson random variables", Insurance: Mathematics and Economics
// 12, 39) for 10 <= lambda <= 1e7; a rounded normal above 1e7 (see poisson()).

import { lnGamma } from './stats';

export interface Rng {
  /** Uniform on [0, 1), 32 bits of resolution. */
  uniform(): number;
  /** Standard normal (mean 0, variance 1). */
  normal(): number;
  /** Poisson count with mean lambda (lambda >= 0). */
  poisson(lambda: number): number;
  /** An independent, reproducible sub-stream; depends only on this stream's seed and the label. */
  fork(label: string): Rng;
}

/** cyrb128: hashes a string to four 32-bit words (bryc, github.com/bryc/code, public domain). */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(seed: string | number): Rng {
  const seedStr = String(seed);
  let [a, b, c, d] = cyrb128(seedStr);
  const next32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Discard the first outputs so weak seeds mix fully (customary for sfc32).
  for (let i = 0; i < 15; i++) next32();

  const uniform = (): number => next32() / 4294967296;
  let spare: number | null = null;

  const normal = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    for (;;) {
      const u = 2 * uniform() - 1;
      const v = 2 * uniform() - 1;
      const s = u * u + v * v;
      if (s > 0 && s < 1) {
        const f = Math.sqrt((-2 * Math.log(s)) / s);
        spare = v * f;
        return u * f;
      }
    }
  };

  const poisson = (lambda: number): number => {
    if (!(lambda >= 0) || !Number.isFinite(lambda)) throw new Error(`bad Poisson mean ${lambda}`);
    if (lambda === 0) return 0;
    if (lambda < 10) {
      // Inversion by sequential search of the CDF (exact up to rounding of the pmf recursion).
      const u = uniform();
      let k = 0;
      let p = Math.exp(-lambda);
      let cdf = p;
      while (u >= cdf && k < 1000) {
        k++;
        p *= lambda / k;
        cdf += p;
      }
      return k;
    }
    if (lambda > 1e7) {
      // Normal approximation with continuity rounding. The Poisson skewness is 1/sqrt(lambda) < 3.2e-4,
      // so quantiles differ from the exact distribution by well under 1 count in 3e3 standard
      // deviations' worth of shape; for counts this large only the mean and variance matter.
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal()));
    }
    // PTRS (Hormann 1993), constants as published.
    const slam = Math.sqrt(lambda);
    const loglam = Math.log(lambda);
    const b = 0.931 + 2.53 * slam;
    const aa = -0.059 + 0.02483 * b;
    const invalpha = 1.1239 + 1.1328 / (b - 3.4);
    const vr = 0.9277 - 3.6224 / (b - 2);
    for (;;) {
      const U = uniform() - 0.5;
      const V = uniform();
      const us = 0.5 - Math.abs(U);
      const k = Math.floor(((2 * aa) / us + b) * U + lambda + 0.43);
      if (us >= 0.07 && V <= vr) return k;
      if (k < 0 || (us < 0.013 && V > us)) continue;
      const lhs = Math.log(V) + Math.log(invalpha) - Math.log(aa / (us * us) + b);
      if (lhs <= -lambda + k * loglam - lnGamma(k + 1)) return k;
    }
  };

  const fork = (label: string): Rng => createRng(`${seedStr}/${label}`);
  return { uniform, normal, poisson, fork };
}
