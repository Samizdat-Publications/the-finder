// The ellipse fit and the calibration circle. Truth: exact synthetic ellipses (the fit must return
// them), a brute-force median (for the quantized 2-D median filter), and the README's target for the
// circle on frame L000: axis ratio 1.00 +/- 0.01 (tools/ref-decoder/README.md section 7; the
// reference measured 1.0002 at 384 kHz).
import { describe, expect, it } from 'vitest';
import framesData from '../../data/frames.json';
import { recordCheck } from '../../tests/support/record';
import { loadSlice, slicesUnavailable } from '../../tests/support/wav';
import { decodeFrame, syncFrame, toTapeUnits } from './decode';
import { fitEllipse, medianFilter2d, MEDIAN_BINS, ringPoints } from './ellipse';
import { medianOf } from './numeric';
import { DECODER_DATA, periodPrior, referenceParams } from './params';

/** Points on an ellipse: centre, semi-axes, tilt (radians); a deterministic sub-pixel wobble if asked. */
function ellipsePoints(xc: number, yc: number, a: number, b: number, th: number, n: number, wobble = 0) {
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const rr = 1 + wobble * Math.sin(7 * t);
    const u = a * rr * Math.cos(t);
    const v = b * rr * Math.sin(t);
    xs[i] = xc + u * Math.cos(th) - v * Math.sin(th);
    ys[i] = yc + u * Math.sin(th) + v * Math.cos(th);
  }
  return { xs, ys };
}

describe('ellipse fit', () => {
  it('recovers exact ellipses', () => {
    for (const [a, b, th] of [[150, 100, 0.5], [151.5, 151.5, 0], [80, 120, 2.0]] as const) {
      const { xs, ys } = ellipsePoints(267.4, 178.6, a, b, th, 400);
      const f = fitEllipse(xs, ys);
      // exact data: only float round-off remains (1e-6 px on a 300 px ellipse is generous)
      expect(Math.abs(f.xc - 267.4)).toBeLessThan(1e-6);
      expect(Math.abs(f.yc - 178.6)).toBeLessThan(1e-6);
      expect(Math.abs(f.a - Math.max(a, b))).toBeLessThan(1e-6);
      expect(Math.abs(f.b - Math.min(a, b))).toBeLessThan(1e-6);
      expect(f.rmsResidual).toBeLessThan(1e-6);
      const hx = Math.hypot(a * Math.cos(th), b * Math.sin(th));
      const hy = Math.hypot(a * Math.sin(th), b * Math.cos(th));
      expect(Math.abs(f.axisRatio - hx / hy)).toBeLessThan(1e-9);
    }
  });

  it('measures the distance of off-ellipse points', () => {
    const { xs, ys } = ellipsePoints(0, 0, 100, 60, 0.3, 720, 0.01);
    const f = fitEllipse(xs, ys);
    // a 1% radial wobble on a 60 to 100 px ellipse moves points by at most 1 px: rms between 0.3 and 1
    expect(f.rmsResidual).toBeGreaterThan(0.3);
    expect(f.rmsResidual).toBeLessThan(1);
  });

  it('2-D median filter matches a brute-force median to within its quantization', () => {
    const W = 40;
    const H = 30;
    const img = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img[y * W + x] = Math.sin(x * 0.7) * Math.cos(y * 0.45) + ((x * 13 + y * 7) % 11) * 0.05;
    const size = 9;
    const got = medianFilter2d(img, W, H, size);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of img) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const tol = (hi - lo) / (MEDIAN_BINS - 1) / 2 + 1e-12; // half a quantization step (ellipse.ts MEDIAN_BINS)
    const cl = (v: number, n: number): number => Math.min(n - 1, Math.max(0, v));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const win: number[] = [];
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) win.push(img[cl(y + dy, H) * W + cl(x + dx, W)] as number);
        expect(Math.abs((got[y * W + x] as number) - medianOf(win))).toBeLessThanOrEqual(tol);
      }
  });
});

const SKIP = slicesUnavailable();
describe.skipIf(SKIP !== null)('the calibration circle (L000)', () => {
  it('is round at the reference geometry (decoder.circle)', () => {
    const f = framesData.frames.find((fr) => fr.frame === 'L000') as (typeof framesData.frames)[number];
    const w = loadSlice('L000');
    const x = toTapeUnits(w.samples, f.gain);
    const sync = syncFrame(x, w.sampleRate, f.firstLineOffset, periodPrior('L000'));
    const p = referenceParams('L');
    const d = decodeFrame(x, sync, p);
    // as decode_all.py: ring points of -V (the float picture with the polarity applied, larger = lighter)
    const pts = ringPoints(d.values.map((v) => -v), d.width, d.height);
    const fit = fitEllipse(pts.xs, pts.ys);
    const ref = DECODER_DATA.reference.circle;
    console.log(`decoder.circle: axis ratio ${fit.axisRatio.toFixed(5)} (reference ${ref.axisRatio.toFixed(5)}), centre (${fit.xc.toFixed(1)}, ${fit.yc.toFixed(1)}), rms ${fit.rmsResidual.toFixed(2)} px, ${fit.n} points`);
    // 0.01: the README's target for a round circle (section 7)
    const pass = Math.abs(fit.axisRatio - 1) <= 0.01;
    recordCheck({
      id: 'decoder.circle',
      claim: 'Procedure self-test: the browser decoder reproduces the reference geometry, so the calibration circle comes out round at 536 x 355, the whole raster (the geometry was chosen to make it round; the independent check is decoder.ref.aspectIndependent).',
      measured: `axis ratio ${fit.axisRatio.toFixed(4)} (horizontal over vertical), ring fit rms ${fit.rmsResidual.toFixed(2)} px`,
      expected: `A circle: ratio 1.00 (the reference decoder measured ${ref.axisRatio.toFixed(4)} at 384 kHz)`,
      tolerance: '+/- 0.01 (the target set in tools/ref-decoder/README.md section 7)',
      pass,
      notes: 'Ellipse fitted to the ring centre line by algebraic least squares (Halir and Flusser, as scikit-image EllipseModel).',
    });
    expect(pass).toBe(true);
  });
});
