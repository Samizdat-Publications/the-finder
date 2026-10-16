// The browser picture decoder against the Python reference decoder (tools/ref-decoder/), on the real
// 96 kHz slices of the 1977 image tape. Truth: build/ref96/frames/*.png, the reference's own decodes
// of the same slices (make_slices.py, or decode96.py from the committed FLACs), and the measured
// results in data/decoder.json "reference" (copied from build/ref/metrics.json by export_params.py).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import framesData from '../../data/frames.json';
import { writePng, readPng } from '../../tests/support/png';
import { recordCheck } from '../../tests/support/record';
import { ssim } from '../../tests/support/ssim';
import { loadSlice, slicesUnavailable } from '../../tests/support/wav';
import { decodeFrame, decodeLines, frameLevels, makeJob, measureInterlace, measureSlant, planLines, syncFrame, toGray, toTapeUnits, type FrameSync } from './decode';
import { DECODER_DATA, periodPrior, referenceParams, type Channel } from './params';

interface FrameEntry {
  frame: string;
  channel: string;
  gain: number;
  firstLineOffset: number;
  samples: number;
}
const FRAMES = framesData.frames as FrameEntry[];
const REF96 = 'build/ref96/frames';
const TS96 = 'build/ts96';
/** The pictures the lead looks at by eye (spec): the circle, a photograph, a right-channel frame. */
const LOOK_AT = ['L000', 'L019', 'R072'];

/** Why the slice tests cannot run, or null. Regenerates build/ref96 from the committed FLACs if missing. */
function unavailable(): string | null {
  const s = slicesUnavailable();
  if (s) return s;
  if (!FRAMES.every((f) => existsSync(`${REF96}/${f.frame}.png`))) {
    try {
      execFileSync('python', ['-P', 'tools/ref-decoder/decode96.py'], { stdio: 'ignore' });
    } catch {
      return 'build/ref96 missing and python -P tools/ref-decoder/decode96.py failed (needs numpy, scipy, soundfile, Pillow)';
    }
    if (!FRAMES.every((f) => existsSync(`${REF96}/${f.frame}.png`))) return 'build/ref96 could not be regenerated';
  }
  return null;
}
const SKIP = unavailable();
if (SKIP) console.log(`SKIP decoder slice tests: ${SKIP}`);

function load(f: FrameEntry): { x: Float64Array; sync: FrameSync } {
  const w = loadSlice(f.frame);
  if (w.sampleRate !== 96_000 || w.samples.length !== f.samples) throw new Error(`${f.frame}: slice is ${w.sampleRate} Hz x ${w.samples.length}`);
  const x = toTapeUnits(w.samples, f.gain);
  return { x, sync: syncFrame(x, w.sampleRate, f.firstLineOffset, periodPrior(f.frame)) };
}

const frame = (id: string): FrameEntry => FRAMES.find((f) => f.frame === id) as FrameEntry;

describe.skipIf(SKIP !== null)('browser decoder vs the Python reference (96 kHz slices)', () => {
  it('decodes all 156 frames like the reference (decoder.frames)', () => {
    const t0 = performance.now();
    const rows: { id: string; s: number; same: number; maxDiff: number }[] = [];
    mkdirSync(TS96, { recursive: true });
    for (const f of FRAMES) {
      const { x, sync } = load(f);
      const d = decodeFrame(x, sync, referenceParams(f.channel as Channel));
      const ref = readPng(`${REF96}/${f.frame}.png`);
      expect([ref.width, ref.height]).toEqual([d.width, d.height]);
      let same = 0;
      let maxDiff = 0;
      for (let i = 0; i < d.gray.length; i++) {
        const dd = Math.abs((d.gray[i] as number) - (ref.data[i] as number));
        if (dd === 0) same++;
        if (dd > maxDiff) maxDiff = dd;
      }
      rows.push({ id: f.frame, s: ssim(d.gray, ref.data, d.width, d.height), same: same / d.gray.length, maxDiff });
      if (LOOK_AT.includes(f.frame)) writePng(`${TS96}/${f.frame}.png`, { width: d.width, height: d.height, channels: 1, data: d.gray });
    }
    const ms = performance.now() - t0;
    const mean = rows.reduce((s, r) => s + r.s, 0) / rows.length;
    const worst = rows.reduce((a, b) => (b.s < a.s ? b : a));
    const identical = rows.filter((r) => r.same === 1).length;
    const maxDiff = Math.max(...rows.map((r) => r.maxDiff));
    console.log(
      `decoder.frames: ${rows.length} frames in ${(ms / 1000).toFixed(1)} s; SSIM mean ${mean.toFixed(6)}, worst ${worst.s.toFixed(6)} (${worst.id}); ` +
        `${identical} frames pixel-identical; largest pixel difference ${maxDiff} grey levels`,
    );
    // 0.98: the spec's per-frame floor; the reference's own 96 vs 384 kHz decodes reach 0.970 at worst
    // (README "Browser slices"), so a port must stay well above the rate's own effect
    const pass = rows.length === 156 && worst.s >= 0.98;
    recordCheck({
      id: 'decoder.frames',
      claim: 'The browser decoder turns each of the 156 picture slices into the same picture as the reference decoder.',
      measured: `SSIM mean ${mean.toFixed(4)}, worst ${worst.s.toFixed(4)} (${worst.id}); ${identical} of 156 pixel-identical, largest difference ${maxDiff} grey levels`,
      expected: 'The Python reference decoder\'s 96 kHz decodes of the same slices (build/ref96, tools/ref-decoder)',
      tolerance: 'SSIM at least 0.98 per frame (scikit-image defaults); for scale, the reference\'s own 96 vs 384 kHz decodes differ by SSIM 0.970 at worst',
      pass,
      notes: `Node decode time ${(ms / rows.length).toFixed(0)} ms per frame including WAV and PNG reading.`,
    });
    expect(rows.length).toBe(156);
    expect(worst.s).toBeGreaterThanOrEqual(0.98);
  });

  it('is deterministic: same input and parameters, identical bytes', () => {
    const f = frame('L000');
    const a = load(f);
    const b = load(f);
    const p = referenceParams('L');
    const da = decodeFrame(a.x, a.sync, p);
    const db = decodeFrame(b.x, b.sync, p);
    expect(Buffer.from(da.gray).equals(Buffer.from(db.gray))).toBe(true);
    expect(Buffer.from(da.values.buffer).equals(Buffer.from(db.values.buffer))).toBe(true);
  });

  it('decodes progressively: any split into line ranges gives the same picture', () => {
    const f = frame('R072');
    const { x, sync } = load(f);
    const p = referenceParams('R');
    const whole = decodeFrame(x, sync, p);
    const job = makeJob(x, sync, p);
    const V = new Float64Array(p.nRows * job.nLines);
    for (const [k0, k1] of [[300, 512], [0, 1], [1, 37], [37, 300]] as const) decodeLines(job, k0, k1, V);
    const g = new Uint8Array(V.length);
    toGray(V, job.nLines, p, frameLevels(V, p), g);
    expect(Buffer.from(g).equals(Buffer.from(whole.gray))).toBe(true);
  });

  it('decodes WRONG on purpose: free-running line times slant the picture as measured (decoder.slant)', () => {
    const f = frame('L000');
    const { x, sync } = load(f);
    const r = sync.r;
    const p = referenceParams('L');
    const P384 = sync.fit.P / r; // the decoder's own fitted period, at 384 kHz
    const lastEdge = sync.raw[511] as number; // decode_all.py measures up to the last real edge of line 512
    const out: { e: number; slant: number; ref: number; ok: boolean }[] = [];
    mkdirSync(TS96, { recursive: true });
    for (const ref of DECODER_DATA.reference.freeRun) {
      const pw = { ...p, syncLock: false, linePeriod: P384 * (1 + ref.e) };
      const plan = planLines(sync, pw);
      const sl = measureSlant(x, sync.box, plan.starts, sync.fit.P, lastEdge, r);
      const slant = sl.slope / r; // samples per line at 384 kHz, the reference's unit
      // 10%: the spec's tolerance on the slant; at e = 0 the reference measured zero (to rounding), so
      // there the bound is 10% of the smallest wrong slant (e = +1%, 32 samples per line)
      const smallest = Math.abs(DECODER_DATA.reference.freeRun.find((w) => w.e > 0)?.slantSamplesPerLine384k ?? 32);
      const ok = ref.e === 0 ? Math.abs(slant) <= 0.1 * smallest : Math.abs(slant / ref.slantSamplesPerLine384k - 1) <= 0.1;
      out.push({ e: ref.e, slant, ref: ref.slantSamplesPerLine384k, ok });
      if (ref.e === 0.05) {
        const d = decodeFrame(x, sync, pw);
        writePng(`${TS96}/free_run_e+0.05.png`, { width: d.width, height: d.height, channels: 1, data: d.gray });
      }
    }
    // dropping the interlace offset: the even/odd comb, at one row per 384 kHz sample as decode_all.py
    const fine = (delta: number) => {
      const pf = { ...p, nRows: Math.trunc(p.w1 - p.w0), delta, parityProfile: null };
      const job = makeJob(x, sync, pf);
      const V = new Float64Array(pf.nRows * job.nLines);
      decodeLines(job, 0, job.nLines, V);
      return measureInterlace(V, pf.nRows, sync.parityLong, 40, 0.5).offset; // IL_MAX_LAG 40, IL_MIN_PEAK 0.5 (decode_all.py)
    };
    const ni = DECODER_DATA.reference.noInterlace;
    const without = fine(0);
    const withOffset = fine(p.delta);
    // the spread of the interlace offset across frames (IQR 6.98 to 8.02 samples, README section 6):
    // a 96 kHz decode of one frame cannot be held closer to the 384 kHz value than that
    const [q1, q3] = DECODER_DATA.reference.interlaceIqr384k;
    const tolIl = q3 - q1;
    const ilOk = Math.abs(without - ni.evenOddShiftWithout384k) <= tolIl && Math.abs(withOffset - ni.evenOddShiftWith384k) <= tolIl && without - withOffset > p.delta / 2;
    const text = out.map((o) => `e ${(o.e * 100).toFixed(0)}%: ${o.slant.toFixed(2)} (ref ${o.ref.toFixed(2)})`).join('; ');
    console.log(`decoder.slant: ${text}; interlace off: comb ${without.toFixed(2)} (ref ${ni.evenOddShiftWithout384k.toFixed(2)}), on: ${withOffset.toFixed(2)} (ref ${ni.evenOddShiftWith384k.toFixed(2)})`);
    const pass = out.every((o) => o.ok) && ilOk;
    recordCheck({
      id: 'decoder.slant',
      claim: 'Procedure self-test of the slant meter: a free-running decode with the line time off by e drifts by e times the period per line, and dropping the interlace offset leaves the even/odd comb measured by the reference.',
      measured: `slant in samples per line: ${text}; even/odd shift ${without.toFixed(2)} samples without the offset, ${withOffset.toFixed(2)} with it`,
      expected: `The reference decoder on the same frame (build/ref/metrics.json wrong_results): comb ${ni.evenOddShiftWithout384k.toFixed(2)} without, ${ni.evenOddShiftWith384k.toFixed(2)} with`,
      tolerance: `Slants within 10% (spec; at e = 0 within 10% of the +1% slant); comb within ${tolIl.toFixed(2)} samples, the interquartile range of the offset across frames (README section 6)`,
      pass,
      notes: 'The browser decodes 96 kHz slices; the reference measured at 384 kHz. The Python reference run once on the same 96 kHz slice gave the same comb values as this decoder (8.379 without, 0.585 with the offset), so the difference from the 384 kHz values is the lower rate, not the port.',
    });
    expect(pass).toBe(true);
  });
});
