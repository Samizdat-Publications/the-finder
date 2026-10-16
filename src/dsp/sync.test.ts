// Sync and the numeric helpers. Truth: values numpy and scipy give for the same calls (worked by hand
// below), and data/frames.json's first-line offsets (line 1 found on the 384 kHz tape by the reference).
import { describe, expect, it } from 'vitest';
import framesData from '../../data/frames.json';
import { loadSlice, slicesUnavailable } from '../../tests/support/wav';
import { toTapeUnits } from './decode';
import { findPeaks, medianFilter1d, percentiles, roundHalfEven, uniformFilter1d, unwrap } from './numeric';
import { periodPrior } from './params';
import { findLine1, robustLineFit } from './sync';

describe('numeric helpers match numpy and scipy', () => {
  it('rounds half to even like Python', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, -3.5, 62.5, 2.4, 2.6].map(roundHalfEven)).toEqual([0, 2, 2, 0, -2, -4, 62, 2, 3]);
  });
  it('percentile (linear) like np.percentile', () => {
    // np.percentile([1, 2, 3, 4, 10], [0.5, 50, 99.5]) = [1.02, 3.0, 9.88]
    const [a, b, c] = percentiles([10, 2, 4, 1, 3], [0.5, 50, 99.5]);
    expect(a).toBeCloseTo(1.02, 12);
    expect(b).toBe(3);
    expect(c).toBeCloseTo(9.88, 12);
  });
  it('filters like scipy.ndimage with mode nearest', () => {
    // uniform_filter1d([1, 2, 3, 10], 3) = [4/3, 2, 5, 23/3]; median_filter([5, 1, 9, 2, 7], 3) = [5, 5, 2, 7, 7]
    expect(Array.from(uniformFilter1d([1, 2, 3, 10], 3)).map((v) => +v.toFixed(12))).toEqual([1.333333333333, 2, 5, 7.666666666667]);
    expect(Array.from(medianFilter1d([5, 1, 9, 2, 7], 3))).toEqual([5, 5, 2, 7, 7]);
  });
  it('finds peaks like scipy.signal.find_peaks', () => {
    // find_peaks([0, 2, 0, 3, 3, 0, 1, 0, 5, 0], height=1, distance=3) = [3, 8]: the flat top resolves
    // to its left-middle sample 3, the peak at 1 loses to it, the peak at 6 to the one at 8
    expect(findPeaks([0, 2, 0, 3, 3, 0, 1, 0, 5, 0], 1, 3)).toEqual([3, 8]);
  });
  it('unwraps like np.unwrap with a period', () => {
    // np.unwrap([0, 790, 10, -785], period=800) = [0, -10, 10, 15]
    expect(Array.from(unwrap([0, 790, 10, -785], 800))).toEqual([0, -10, 10, 15]);
  });
  it('robust line fit recovers offset, period and stagger and rejects an outlier', () => {
    const k = Array.from({ length: 50 }, (_, i) => i);
    const e = k.map((i) => 100 + 799.4 * i + (i % 2 === 0 ? 1.5 : -1.5));
    e[17] = (e[17] as number) + 40;
    const fit = robustLineFit(k, e, true);
    expect(fit.P).toBeCloseTo(799.4, 9);
    expect(fit.a).toBeCloseTo(100, 7);
    expect(fit.b).toBeCloseTo(1.5, 9);
    expect(fit.inliers[17]).toBe(0);
  });
});

const SKIP = slicesUnavailable();
describe.skipIf(SKIP !== null)('line 1 from the start-of-picture comb', () => {
  it('finds line 1 in each slice from the signal alone, as the reference did on the tape', () => {
    const off: string[] = [];
    let worst = 0;
    for (const f of framesData.frames) {
      const x = toTapeUnits(loadSlice(f.frame).samples, f.gain);
      const l1 = findLine1(x, 0.25, periodPrior(f.frame));
      const d = (l1.edges[0] as number) - f.firstLineOffset;
      // 0.5 sample at 96 kHz: the 96 vs 384 kHz edge times agree to 0.6 samples at 384 kHz rms (README "Browser slices")
      if (Math.abs(d) > 0.5) off.push(`${f.frame} ${d.toFixed(1)}`);
      else worst = Math.max(worst, Math.abs(d));
    }
    console.log(`line 1 from the comb: ${156 - off.length} of 156 within ${worst.toFixed(2)} samples; differing: ${off.join(', ') || 'none'}`);
    // R037 is the frame whose first sync after the comb is swallowed by the last comb pulse (README
    // section 1): on the 384 kHz tape the reference takes the next sync; in the 96 kHz slice the swallowed
    // one is seen, one line (about 800 samples) earlier. The Python reference does the same on this slice.
    expect(off.length).toBe(1);
    expect(off[0]?.startsWith('R037 -800')).toBe(true);
  });
});
