// The Pictures' checkers on real decodes of the 1977 tape's 96 kHz slices (tests/support/wav.ts: the
// reference slices or WAV copies of the committed FLACs). Truth: the reference decoder's measurements in
// tools/ref-decoder/README.md and data/decoder.json "reference" (the slant of a free-running decode at
// e x the period, the 4.6-sample wow and flutter, the 8.4 / 0.6-sample comb at 96 kHz, the circle's 1.00
// at 355 rows) and simple geometry (the circle's axis ratio scales as 355 / rows). Never the code's own
// earlier output.
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../../tests/support/record';
import { loadSlice, slicesUnavailable } from '../../../tests/support/wav';
import { DECODER_DATA } from '../../dsp/params';
import { BEAT_S } from '../../ui/units';
import {
  CHECKER_FRAMES, FIRST_FRAMES, POLARITY_FRAMES, checkAspect, checkCircle, checkFirstFrames, checkInterlace, checkLineTime,
  checkPolarity, checkSync, sliceInfo, type SignalProvider,
} from './checkers';
import {
  COMB_TOLERANCE_384, COVER_LINE_S, REFERENCE_SETTINGS, TAPE_SPEED_OFFSET_MAX, WOW_FLUTTER_RMS_384, decodeCover, frameSignal,
  lineTiming, mountCue, type FrameSignal,
} from './measure';
import { START_SETTINGS } from './start';
import framesData from '../../../data/frames.json';

const SKIP = slicesUnavailable();
if (SKIP) console.log(`SKIP pictures checker tests: ${SKIP}`);

const cache = new Map<string, FrameSignal>();
function load(frame: string): FrameSignal {
  let s = cache.get(frame);
  if (!s) {
    const info = sliceInfo(frame);
    const w = loadSlice(frame);
    if (w.sampleRate !== info.sampleRate) throw new Error(`${frame}: ${w.sampleRate} Hz`);
    s = frameSignal(info, w.samples);
    cache.set(frame, s);
  }
  return s;
}
const all: SignalProvider = (f) => load(f);
const reading = (r: { result: { key: string; value: number | string }[] }, k: string) => r.result.find((x) => x.key === k)?.value;

describe.skipIf(SKIP !== null)('The Pictures checkers on the real tape', () => {
  it('pictures.lineTime: the cover value stands, wrong line times slant as e x the period', () => {
    const L000 = DECODER_DATA.frames.L000!.periodSamples384k;
    const cover = checkLineTime(all, { lineTimeMs: COVER_LINE_S * 1000 });
    const tape = checkLineTime(all, { lineTimeMs: (L000 / 384_000) * 1000 });
    const start = checkLineTime(all, { lineTimeMs: START_SETTINGS.lineTimeMs });
    expect(cover.ok).toBe(true);
    expect(tape.ok).toBe(true);
    expect(start.ok).toBe(false);
    const rows: string[] = [];
    let slantsOk = true;
    // The reference's own free-running decodes (README "Meaningful wrong results"): slant = -e x period.
    for (const ref of DECODER_DATA.reference.freeRun.filter((r) => r.e > 0)) {
      const r = checkLineTime(all, { lineTimeMs: (ref.periodUsed384k / 384_000) * 1000 });
      const slant = (reading(r, 'slant per line') as number) * 384_000;
      // 10%: the tolerance decode.test.ts holds the slant meter to against the same reference numbers
      const within = Math.abs(slant / ref.slantSamplesPerLine384k - 1) <= 0.1;
      slantsOk &&= within && !r.ok;
      rows.push(`e ${(ref.e * 100).toFixed(0)}%: ${slant.toFixed(1)} (ref ${ref.slantSamplesPerLine384k.toFixed(1)}), rejected`);
    }
    // the edges of the accepted window: about the tape speed error either side of the tape's own period
    const edge = (sign: number, f: number) => checkLineTime(all, { lineTimeMs: (L000 * (1 + sign * f * TAPE_SPEED_OFFSET_MAX)) / 384 }).ok;
    const window = edge(1, 0.9) && edge(-1, 0.9) && !edge(1, 1.15) && !edge(-1, 1.15);
    const coverSlant = (reading(cover, 'slant per line') as number) * 384_000;
    const limit = (reading(cover, 'allowed slant') as number) * 384_000;
    console.log(`pictures.lineTime: cover ${coverSlant.toFixed(2)} samples/line (limit ${limit.toFixed(2)}); ${rows.join('; ')}; window edges ${window}`);
    const pass = cover.ok && tape.ok && !start.ok && slantsOk && window;
    recordCheck({
      id: 'pictures.lineTime',
      claim: 'Free-running the decoder at the cover\'s line time holds the calibration picture upright; wrong line times slant it by e times the period per line, as the reference decoder measured.',
      measured: `cover's 8.3396 ms: slant ${coverSlant.toFixed(2)} samples (384 kHz) per line, accepted; the start value ${START_SETTINGS.lineTimeMs.toFixed(3)} ms rejected; ${rows.join('; ')}`,
      expected: 'The reference decoder\'s free-running slants (data/decoder.json reference.freeRun, tools/ref-decoder/README.md); the tape runs 0.14 to 0.29% fast against the cover along the reel (README section 3)',
      tolerance: `Accepted while |slant| <= ${(TAPE_SPEED_OFFSET_MAX * 100).toFixed(3)}% of the period (the most the tape runs fast against the cover, from every frame's fitted period) plus 3 sigma of the slope fit from wow and flutter (${WOW_FLUTTER_RMS_384} samples rms); wrong slants within 10% of the reference`,
      pass,
      notes: 'The spec asked for a threshold set by the wow and flutter rms (4.6 samples); that alone would reject the cover\'s own value (5.0 samples a line at L000), so the limit is the tape\'s documented speed error, which the cover value is inside by construction of the physics, not of the code.',
    });
    expect(pass).toBe(true);
  });

  it('pictures.sync: locking each line to its edge removes the wow and flutter wobble', () => {
    const lineTimeMs = COVER_LINE_S * 1000;
    const on = checkSync(all, { lineTimeMs, syncLock: true });
    const off = checkSync(all, { lineTimeMs, syncLock: false });
    const before = (reading(on, 'wobble free-running') as number) * 384_000;
    const after = (reading(on, 'wobble now') as number) * 384_000;
    // the free-running wobble at the frame's own period is the tape's wow and flutter: README section 3
    // gives 4.6 samples rms (the median over all frames); L000's own straight-line rms is from its fit
    const free = lineTiming(load('L000'), { ...REFERENCE_SETTINGS, syncLock: false, lineTimeMs: (DECODER_DATA.frames.L000!.periodSamples384k / 384_000) * 1000 });
    // 25%: the frame-to-frame spread of the wobble about the README's median (not published; generous)
    const wowOk = Math.abs(free.wobble384 / WOW_FLUTTER_RMS_384 - 1) <= 0.25;
    console.log(`pictures.sync: wobble free-running ${before.toFixed(2)} (at the tape period ${free.wobble384.toFixed(2)}), locked ${after.toFixed(4)} samples rms at 384 kHz`);
    const pass = on.ok && !off.ok && wowOk;
    recordCheck({
      id: 'pictures.sync',
      claim: 'Locking every line to its own falling sync edge removes the line-start wobble a free-running decoder shows (the 1977 tape transport\'s wow and flutter).',
      measured: `over the cover's 512 lines of L000: free-running at the cover's line time ${before.toFixed(2)} samples rms (384 kHz) about the drift; at the tape's period ${free.wobble384.toFixed(2)}; locked: ${after.toFixed(4)}`,
      expected: `Wow and flutter ${WOW_FLUTTER_RMS_384} samples rms (README section 3); a lock leaves no wobble above the edges' own jitter`,
      tolerance: 'Locked wobble at most the 1.8-sample rms short-term edge jitter (README section 3, = 0.45 samples at 96 kHz); free-running wobble at the tape period within 25% of 4.6',
      pass,
      notes: 'Measured over the first 512 lines (the cover raster; README section 3 measured the wow and flutter there). Over the 536-line decode (D-A30) the free-running wobble at the cover line time read 8.92, since a longer drift fit spans more of the tape wow (M5 science audit, finding 9).',
    });
    expect(pass).toBe(true);
  });

  it('pictures.interlace: the even/odd comb is there without the offset and gone with it', () => {
    const off = checkInterlace(all, { interlace: false });
    const on = checkInterlace(all, { interlace: true });
    const without = (reading(off, 'even and odd shift') as number) * 384_000;
    const withIt = (reading(on, 'even and odd shift') as number) * 384_000;
    // the reference decoder on the same 96 kHz slice over the cover's 512 lines: 8.379 without, 0.585 with
    // (src/dsp/decode.test.ts decoder.slant notes; decode_all.py measures the comb on those 512 lines); held to
    // the across-frame interquartile range, as decoder.slant does
    const ref96 = { without: 8.379, with: 0.585 };
    const near = Math.abs(without - ref96.without) <= COMB_TOLERANCE_384 && Math.abs(withIt - ref96.with) <= COMB_TOLERANCE_384;
    console.log(`pictures.interlace: comb ${without.toFixed(3)} without, ${withIt.toFixed(3)} with (tolerance ${COMB_TOLERANCE_384.toFixed(2)})`);
    const pass = !off.ok && on.ok && near;
    recordCheck({
      id: 'pictures.interlace',
      claim: 'Without the interlace offset the long-pulse and short-pulse lines are shifted against each other (a comb on vertical edges); with it they line up.',
      measured: `even/odd shift ${without.toFixed(3)} samples (384 kHz) without, ${withIt.toFixed(3)} with, over the cover's 512 lines`,
      expected: `The reference decoder on the same 96 kHz slice over the same 512 lines: ${ref96.without} without, ${ref96.with} with (decoder.slant; 384 kHz decode: ${DECODER_DATA.reference.noInterlace.evenOddShiftWithout384k.toFixed(2)} and ${DECODER_DATA.reference.noInterlace.evenOddShiftWith384k.toFixed(2)})`,
      tolerance: `Accepted while the shift is at most ${COMB_TOLERANCE_384.toFixed(2)} samples, the interquartile range of the offset across frames (README section 6)`,
      pass,
      notes: 'Measured over the first 512 lines, the cover raster, which every frame carries in full (M5 science audit, finding 9): measured over the 536-line decode (D-A30) the comb read 8.30 and 0.73, because the flat lines after a 534 or 535-line raster entered the measurement.',
    });
    expect(pass).toBe(true);
  });

  it('pictures.polarity: the slide mounts come out dark only in the negative reading', () => {
    const neg = checkPolarity(all, { polarity: 'negative' });
    const pos = checkPolarity(all, { polarity: 'positive' });
    const margins: { f: string; m: number }[] = [];
    for (const f of (framesData.frames as { frame: string }[]).map((x) => x.frame)) {
      margins.push({ f, m: mountCue(decodeCover(load(f), REFERENCE_SETTINGS)).margin });
    }
    const holdL = margins.filter((x) => x.f.startsWith('L') && x.m > 0).length;
    const holdR = margins.filter((x) => x.f.startsWith('R') && x.m > 0).length;
    const sorted = [...margins].sort((a, b) => a.m - b.m);
    const median = sorted[Math.floor(sorted.length / 2)]!.m;
    const used = POLARITY_FRAMES.map((f) => margins.find((x) => x.f === f)!.m.toFixed(0)).join(', ');
    console.log(`pictures.polarity: cue holds on ${holdL} of 78 left and ${holdR} of 78 right frames; median margin ${median.toFixed(0)} grey levels, worst ${sorted[0]!.m.toFixed(0)} (${sorted[0]!.f}); checker frames ${used}`);
    // spec: the cue must hold on at least 20 frames across both channels (here: 10 on each channel at least)
    const pass = neg.ok && !pos.ok && holdL + holdR >= 20 && holdL >= 10 && holdR >= 10;
    recordCheck({
      id: 'pictures.polarity',
      claim: 'Read with more signal as darker, the slide mounts at the edges of the frames come out dark, as a mount that lets no light through must; read the other way they glow.',
      measured: `mount darker than the centre on ${holdL} of 78 left and ${holdR} of 78 right frames (median margin ${median.toFixed(0)} grey levels, worst ${sorted[0]!.m.toFixed(0)} on ${sorted[0]!.f}); on the checker's frames (${POLARITY_FRAMES.join(', ')}) ${used}`,
      expected: 'Polarity: more signal is darker (images-and-audio.md section 1: Barry, aizquier, gourneau)',
      tolerance: 'The cue must hold on at least 20 frames across both channels (spec); the checker accepts the reading that darkens the mount on most of its five frames',
      pass,
      notes: `Mount = the outer ${4} pixels of the 512 x 355 frame (the cover's raster, decoded on its own: measure.ts decodeCover), chosen before measuring; 7 border widths and statistics tried while exploring held on 129 to 145 frames. Frames where it fails are pictures with bright content at the edges or dark centres (L039, the two figures, worst). Over the 536-line decode (D-A30) the ring's right side fell in the flat lines after a 534 or 535-line raster and the margins moved (76 and 70 frames, checker frames 118, 93, 96, 104, 108): the cue is measured on the picture only (M5 science audit, finding 9).`,
    });
    expect(pass).toBe(true);
  });

  it('pictures.aspect: the circle is round at 355 rows and squashed as 355 / rows otherwise', () => {
    const right = checkAspect(all, { rows: 355 });
    const r355 = reading(right, 'axis ratio') as number;
    const out: string[] = [];
    let wrongOk = true;
    for (const n of [300, 340, 370, 512]) {
      const r = checkAspect(all, { rows: n });
      const ratio = reading(r, 'axis ratio') as number;
      // geometry: the ring's height in rows scales with the row count, so the ratio goes as 355 / n;
      // 1%: the README's roundness tolerance
      const predicted = (r355 * 355) / n;
      wrongOk &&= !r.ok && Math.abs(ratio / predicted - 1) <= 0.01;
      out.push(`${n} rows: ${ratio.toFixed(4)} (predicted ${predicted.toFixed(4)})`);
    }
    console.log(`pictures.aspect: 355 rows ${r355}; ${out.join('; ')}`);
    const pass = right.ok && Math.abs(r355 - DECODER_DATA.reference.circle.axisRatio) <= 0.01 && wrongOk;
    recordCheck({
      id: 'pictures.aspect',
      claim: 'Procedure: the player sets the rows until the calibration circle is round; at the reference 355 rows it is, and any other row count squashes it into an ellipse by exactly 355 / rows.',
      measured: `355 rows: axis ratio ${r355.toFixed(4)}; ${out.join('; ')}`,
      expected: `A circle (the reference decoder: ${DECODER_DATA.reference.circle.axisRatio.toFixed(4)} at 355 rows); wrong row counts: 355 / rows`,
      tolerance: '1.00 +/- 0.01 (tools/ref-decoder/README.md section 7); wrong ratios within 1% of the geometric prediction',
      pass,
      notes: 'A procedure self-test, like decoder.ref.circle: the record gives the circle exactly so its reader can set the aspect. The independent geometry check is decoder.ref.aspectIndependent.',
    });
    expect(pass).toBe(true);
  });

  it('pictures.circle: confirmed only with all five settings right', () => {
    const ok = checkCircle(all, REFERENCE_SETTINGS as never);
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain('They see.');
    for (const wrong of [{ syncLock: false }, { interlace: false }, { polarity: 'positive' }, { rows: 512 }, { lineTimeMs: 7.8 }]) {
      expect(checkCircle(all, { ...REFERENCE_SETTINGS, ...wrong } as never).ok).toBe(false);
    }
  });

  it('pictures.firstFrames: three pictures developed with the same settings', () => {
    expect(FIRST_FRAMES.length).toBe(8);
    const s = REFERENCE_SETTINGS as never;
    expect(checkFirstFrames(all, { watched: FIRST_FRAMES.slice(0, 3) as string[], settings: s }).ok).toBe(true);
    expect(checkFirstFrames(all, { watched: FIRST_FRAMES.slice(0, 2) as string[], settings: s }).ok).toBe(false);
    expect(checkFirstFrames(all, { watched: ['L000', 'L040', FIRST_FRAMES[0]!], settings: s }).ok).toBe(false);
    expect(checkFirstFrames(all, { watched: FIRST_FRAMES.slice(0, 3) as string[], settings: { ...REFERENCE_SETTINGS, syncLock: false, lineTimeMs: 8.0 } as never }).ok).toBe(false);
  });

  it('refuses when a slice is not loaded, and is deterministic', () => {
    const none: SignalProvider = () => undefined;
    expect(() => checkLineTime(none, { lineTimeMs: 8.34 })).toThrow(/not loaded/);
    const a = checkAspect(all, { rows: 352 });
    const b = checkAspect(all, { rows: 352 });
    expect(a).toEqual(b);
    expect(CHECKER_FRAMES.length).toBe(9);
    // the start value is a whole number of thousandths of a beat on the knob (the alien unit)
    expect(Math.abs((START_SETTINGS.lineTimeMs / 1000 / BEAT_S) * 1e4 - Math.round((START_SETTINGS.lineTimeMs / 1000 / BEAT_S) * 1e4))).toBeLessThan(1e-9);
  });
});

describe('the cover\'s picture diagrams as a plate of their own', () => {
  it('keeps every picture string, inside the round plate', async () => {
    const { readFileSync } = await import('node:fs');
    const { picturesPlate } = await import('./coverPictures');
    const plate = picturesPlate(readFileSync('public/media/cover/cover.svg', 'utf8'));
    const ids = plate.groups.map((g) => g.id);
    expect(ids).toContain('picture.lineTime');
    expect(ids).toContain('picture.rasterLines');
    expect(ids.every((id) => id.startsWith('picture.'))).toBe(true);
    // the line time string reads the cover's 24 digits (cover.md section 1c), bar = 1
    const lt = plate.groups.find((g) => g.id === 'picture.lineTime')!;
    expect(lt.bits.map((b) => (b.kind === 'across' ? '1' : '0')).join('')).toBe('101101001100000000000000');
    const R = plate.size / 2;
    for (const d of plate.drawables) {
      const pts = d.kind === 'poly' ? d.pts : [[d.cx, d.cy] as [number, number]];
      for (const p of pts) expect(Math.hypot(p[0] - R, p[1] - R)).toBeLessThanOrEqual(R);
    }
  });
});
