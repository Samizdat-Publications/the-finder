// Colour registration and composition. Truth: a picture shifted by a known sub-pixel amount must be
// registered back (synthetic), and on the real triples the shifts must agree with the reference
// decoder's (build/ref/metrics.json "colour", when the tape run is present).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import framesData from '../../data/frames.json';
import { loadSlice, slicesUnavailable } from '../../tests/support/wav';
import { compose, register, shiftImage, type Gray } from './colour';
import { decodeFrame, syncFrame, toTapeUnits } from './decode';
import { periodPrior, referenceParams, type Channel } from './params';

function scene(W: number, H: number): Float64Array {
  const a = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - W * 0.4, y - H * 0.55);
      a[y * W + x] = (d < 30 ? 200 : 60) + (x > W * 0.7 && y < H * 0.3 ? 120 : 0) + 20 * Math.sin(x / 5) * Math.cos(y / 9);
    }
  return a;
}

describe('colour registration', () => {
  it('registers a separation shifted by a known sub-pixel amount', () => {
    const W = 160;
    const H = 120;
    const ref: Gray = { width: W, height: H, data: scene(W, H) };
    const truth: [number, number] = [-1.4, 2.3];
    const moved: Gray = { width: W, height: H, data: shiftImage(ref, [-truth[0], -truth[1]]) };
    const reg = register(ref, moved);
    // a parabola through the correlation peak, on bilinear-shifted data: within 0.15 px is what this
    // estimator delivers on a sharp synthetic scene (the reference reports shifts to 0.1 px, README section 9)
    expect(Math.abs((reg.shift[0] as number) - truth[0])).toBeLessThan(0.15);
    expect(Math.abs((reg.shift[1] as number) - truth[1])).toBeLessThan(0.15);
    const c = compose(ref, moved, ref);
    expect(c.rgba.length).toBe(W * H * 4);
  });
});

const METRICS = 'build/ref/metrics.json';
const SKIP = slicesUnavailable() ?? (existsSync(METRICS) ? null : 'build/ref/metrics.json not present');
describe.skipIf(SKIP !== null)('colour triples against the reference', () => {
  it('registers the real separations like the reference decoder', () => {
    const m = JSON.parse(readFileSync(METRICS, 'utf8').replace(/\bNaN\b/g, 'null')) as {
      colour: { image: number; frames: string[]; shift_rows_cols_peakcorr_to_R: Record<'G' | 'B', [number, number, number]> }[];
    };
    const gray = (id: string): Gray => {
      const f = framesData.frames.find((fr) => fr.frame === id) as (typeof framesData.frames)[number];
      const x = toTapeUnits(loadSlice(id).samples, f.gain);
      const d = decodeFrame(x, syncFrame(x, 96_000, f.firstLineOffset, periodPrior(id)), referenceParams(f.channel as Channel));
      return { width: d.width, height: d.height, data: d.gray };
    };
    const lines: string[] = [];
    let worst = 0;
    for (const c of m.colour) {
      const [r, g, b] = c.frames.map(gray) as [Gray, Gray, Gray];
      for (const [nm, mov] of [['G', g], ['B', b]] as const) {
        const ref = c.shift_rows_cols_peakcorr_to_R[nm];
        if (ref[2] < 0.3) continue; // weak edge correlation: registration not meaningful (README section 9, solar spectrum 0.14)
        const got = register(r, mov);
        const d = Math.max(Math.abs((got.shift[0] as number) - ref[0]), Math.abs((got.shift[1] as number) - ref[1]));
        worst = Math.max(worst, d);
        lines.push(`${c.image}${nm} ${d.toFixed(2)}`);
      }
    }
    console.log(`colour registration vs reference: worst ${worst.toFixed(2)} px over ${lines.length} separations`);
    // 0.5 px: the 96 kHz pictures differ slightly from the 384 kHz ones the reference registered
    // (SSIM 0.970 to 0.99, README "Browser slices"); half a pixel keeps every separation's alignment
    expect(worst).toBeLessThan(0.5);
  });
});
