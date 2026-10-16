// The fold (voices.octave's measure) against independent truth, and against its Python twin.
//  - Poisson summation: the harmonic form equals the explicit pairwise sum over whole repeats.
//  - Chance: notes with no repeat at all score about 1 at every ratio.
//  - Known repeats: a melody that repeats at a doubling is found at 1200 cents; one built to repeat at 3:1 (1902
//    cents, with no octave in it) is found at 1902, so the measure is not tuned to the octave.
//  - The reference: on the violin's notes (data/voices.json) the TypeScript gives the Python's best fold and every
//    stored peak's score, and its own seeded bootstrap gives the same interval and the same wins.
// Check ids: voices.dsp.fold, voices.ts.fold.
import { describe, expect, it } from 'vitest';
import voicesJson from '../../data/voices.json';
import { recordCheck } from '../../tests/support/record';
import { createRng } from '../science/random';
import { FOLD_SIGMA, FoldNotes, bestFold, localFoldPeak, resampleWeights } from './fold';
import { percentiles } from './numeric';

const phi = (x: number): number => Math.exp(-0.5 * (x / FOLD_SIGMA) ** 2) / (FOLD_SIGMA * Math.sqrt(2 * Math.PI));

/** S(P) by brute force: every pair, every whole repeat k != 0, over the share of pairs at least P / 2 apart. */
function bruteScore(c: number[], p: number): number {
  let r = 0;
  let far = 0;
  let n = 0;
  for (let i = 0; i < c.length; i++) {
    for (let j = i + 1; j < c.length; j++) {
      const d = Math.abs(c[i]! - c[j]!);
      let s = 0;
      for (let k = -40; k <= 40; k++) if (k !== 0) s += phi(d - k * p);
      r += p * s;
      if (d > p / 2) far++;
      n++;
    }
  }
  return r / n / (far / n);
}

describe('the fold', () => {
  it('equals its definition, reads chance as 1 and finds known repeats (voices.dsp.fold)', () => {
    const rng = createRng('fold');
    // Poisson summation against the brute-force sum, on 60 random notes at five ratios.
    const few = Array.from({ length: 60 }, () => -1500 + 3000 * rng.uniform());
    const fn = new FoldNotes(few);
    let maxDiff = 0;
    for (const p of [150, 498, 702, 1200, 2117]) maxDiff = Math.max(maxDiff, Math.abs(fn.score(p) - bruteScore(few, p)));
    // Chance: 400 notes uniform over three repeats of nothing (no structure): the mean score over 300 to 2400 cents.
    const flat = new FoldNotes(Array.from({ length: 400 }, () => -1800 + 3600 * rng.uniform()));
    let mean = 0;
    let m = 0;
    for (let p = 300; p <= 2400; p += 7) {
      mean += flat.score(p);
      m++;
    }
    mean /= m;
    // A doubling: a major scale over three octaves, intonation sd 12 cents.
    const major = [0, 200, 400, 500, 700, 900, 1100];
    const oct = bestFold(new FoldNotes(Array.from({ length: 400 }, () => -1500 + major[Math.floor(rng.uniform() * 7)]! + 1200 * Math.floor(rng.uniform() * 3) + 12 * rng.normal())));
    // A repeat at 3:1 with no octave: five pitches inside each 1902-cent repeat (none 1200 apart), over two repeats.
    const tri = [0, 300, 650, 1050, 1450];
    const P3 = 1200 * Math.log2(3);
    const tw = bestFold(new FoldNotes(Array.from({ length: 400 }, () => -1500 + tri[Math.floor(rng.uniform() * 5)]! + P3 * Math.floor(rng.uniform() * 2) + 12 * rng.normal())));
    const pass = maxDiff < 1e-9 && Math.abs(mean - 1) < 0.05 && Math.abs(oct.cents - 1200) < 5 && Math.abs(tw.cents - P3) < 5;
    recordCheck({
      id: 'voices.dsp.fold',
      claim: 'The fold measures what it says: its harmonic sum equals the pairwise sum over whole repeats, notes with no repeat score chance, and a melody built to repeat at a doubling, or at 3:1 with no doubling in it, is found where it repeats.',
      measured: `harmonic against brute-force sum within ${maxDiff.toExponential(1)}; uniform notes score ${mean.toFixed(3)} on average from 300 to 2400 cents; doubling melody best at ${oct.cents.toFixed(2)} cents (${oct.score.toFixed(2)}); 3:1 melody best at ${tw.cents.toFixed(2)} cents (${tw.score.toFixed(2)})`,
      expected: `Poisson summation (exact); chance = 1; 1200 cents; ${P3.toFixed(2)} cents`,
      tolerance: 'sums within 1e-9 (rounding); chance within 0.05 (400 notes: the pair mean of a kernel over about 80,000 pairs, sd near 0.01); repeats within 5 cents (12-cent intonation over 400 notes; the reference measures 1.5 cents sd on 411 notes with 16)',
      pass,
    });
    expect(maxDiff).toBeLessThan(1e-9);
    expect(Math.abs(mean - 1)).toBeLessThan(0.05);
    expect(Math.abs(oct.cents - 1200)).toBeLessThan(5);
    expect(Math.abs(tw.cents - P3)).toBeLessThan(5);
  });

  it('gives the Python reference\'s numbers on the violin\'s notes (voices.ts.fold)', () => {
    const vi = voicesJson.music.violin;
    const fo = vi.fold;
    const notes = new FoldNotes(vi.notes.map((n) => n[2]! / 100));
    const best = bestFold(notes);
    let peakDiff = 0;
    for (const p of fo.peaks) peakDiff = Math.max(peakDiff, Math.abs(notes.score(Math.round(p.cents)) - p.score));
    // Its own bootstrap (a seeded stream; the reference uses numpy's): the interval and the wins over the named ratios.
    const rng = createRng('fold-bootstrap');
    const B = 200;
    const pos: number[] = [];
    const named = Object.values(fo.named).filter((c): c is number => c !== null);
    const wins = new Array<number>(named.length).fill(0);
    for (let b = 0; b < B; b++) {
      const w = resampleWeights(notes.c.length, rng);
      pos.push(localFoldPeak(notes, best.cents, w).cents);
      const sb = notes.score(best.cents, w);
      named.forEach((c, i) => void (sb > notes.score(c, w) && wins[i]!++));
    }
    const [lo, hi] = percentiles(pos, [2.5, 97.5]) as [number, number];
    const hw = Math.max(best.cents - lo, hi - best.cents);
    const pass =
      Math.abs(best.cents - fo.bestCents) < 0.01 && Math.abs(best.score - fo.bestScore) < 1e-4 && peakDiff < 1e-4 && Math.abs(hw - fo.bootstrap.halfWidthCents) < 0.5 && wins.every((k) => k === B);
    recordCheck({
      id: 'voices.ts.fold',
      claim: "The browser's fold reads the violin's notes exactly as the reference does: the same best ratio, the same score at every peak, and a bootstrap that agrees.",
      measured: `best ${best.cents.toFixed(3)} cents, score ${best.score.toFixed(4)}; ${fo.peaks.length} peaks' scores within ${peakDiff.toExponential(1)}; bootstrap (${B} draws, seeded) 95% ${lo.toFixed(2)} to ${hi.toFixed(2)}, half-width ${hw.toFixed(2)}; the doubling beats ${named.length} named ratios in ${wins.join(', ')} of ${B}`,
      expected: `the reference's ${fo.bestCents} cents, ${fo.bestScore}, its peaks, half-width ${fo.bootstrap.halfWidthCents} (${fo.draws} draws) and wins of 100%`,
      tolerance: 'best within 0.01 cents and 1e-4 (stored to 3 and 4 places); every peak score at its own whole-cent grid point within 1e-4; half-width within 0.5 cents (a 2.5th percentile of 200 draws has a sampling sd near 0.2 cents here); every win',
      pass,
    });
    expect(Math.abs(best.cents - fo.bestCents)).toBeLessThan(0.01);
    expect(peakDiff).toBeLessThan(1e-4);
    expect(Math.abs(hw - fo.bootstrap.halfWidthCents)).toBeLessThan(0.5);
    expect(wins.every((k) => k === B)).toBe(true);
  });
});
