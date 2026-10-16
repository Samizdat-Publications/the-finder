// The Voices' TypeScript signal processing against the Python reference (tools/voices/analyse.py), on the
// same samples: build/voices/NN.wav, the 16-bit mono mixes the reference itself analysed and wrote. Truth:
// data/voices.json (the reference's numbers) and docs/research/voices.md section 1's table. Skips, saying
// why, when the WAVs are missing (they need the gitignored Ozma FLACs: python -P tools/voices/analyse.py).
// Check ids: voices.ts.levels, voices.ts.pitch, voices.ts.octave, voices.ts.step, voices.ts.spectrum,
// voices.ts.whale.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import voicesJson from '../../data/voices.json';
import { recordCheck } from '../../tests/support/record';
import { readWav } from '../../tests/support/wav';
import { CHROMA_BIN, binCentres, calls, chromaHistogram, chromaPeaks, combScores, heldRunCeiling, notes, octaveOf, yin } from './pitch';
import { frameLevels, quietStretches, segments, silentRuns } from './segment';
import { crossing, meanRows, segmentBands, toDb } from './spectrum';

const V = voicesJson;
const wavPath = (n: string): string => `build/voices/${n}.wav`;
const SKIP = ['01', '02', '03', '14', '21'].every((n) => existsSync(wavPath(n)))
  ? null
  : 'build/voices/*.wav missing: run python -P tools/voices/analyse.py (needs sources/ozma-cd-*/)';
if (SKIP) console.log(`SKIP voices reference tests: ${SKIP}`);

const load = (n: string): { x: Float64Array; sr: number } => {
  const w = readWav(new Uint8Array(readFileSync(wavPath(n))));
  return { x: Float64Array.from(w.samples), sr: w.sampleRate };
};
const yinSet = V.meta.yin;

/** Fraction of frames whose voicing agrees, and the largest pitch difference (cents) where both are voiced. */
function compareTrack(f0: Float64Array, ap: Float64Array, ref: readonly number[]): { agree: number; maxCents: number; jumps: number } {
  let same = 0;
  let maxCents = 0;
  let jumps = 0;
  for (let k = 0; k < ref.length; k++) {
    const v = ap[k]! < yinSet.threshold;
    const rv = ref[k]! > 0;
    if (v === rv) same++;
    if (v && rv) {
      const c = Math.abs(1200 * Math.log2(Math.round(f0[k]! * 100) / 100 / ref[k]!));
      // A frame whose CMND has two dips within rounding of the threshold may take the other one: count those apart.
      if (c > 1) jumps++;
      else maxCents = Math.max(maxCents, c);
    }
  }
  return { agree: same / ref.length, maxCents, jumps };
}

describe.skipIf(SKIP !== null)('The Voices: TypeScript vs the Python reference (same samples)', () => {
  it('frame levels, the research table, segments and the accepted range (voices.ts.levels)', () => {
    const { x, sr } = load('02');
    const lv = frameLevels(x, sr);
    const ref = V.greetings.levelsDb10;
    let off = 0;
    for (let k = 0; k < ref.length; k++) if (Math.round(lv[k]! * 10) !== ref[k]) off++;
    const t = V.greetings.researchTable;
    const table = t.thresholdsDb.map((th) => t.gapsS.map((g) => silentRuns(lv, th, g).length));
    const stored = Float64Array.from(ref, (v) => v / 10);
    const [t0, t1] = V.greetings.reasonable.thresholdGridDb as [number, number];
    let lo = Infinity;
    let hi = -Infinity;
    for (let th = t0; th <= t1 + 1e-9; th += 0.5) {
      for (let gi = 15; gi <= 40; gi++) {
        const n = segments(stored, th, gi / 100).length;
        lo = Math.min(lo, n);
        hi = Math.max(hi, n);
      }
    }
    recordCheck({
      id: 'voices.ts.levels',
      claim: "The browser's segmenter reads the greetings exactly as the reference does: the same frame levels, the research's table of pauses, and the same range of voice counts.",
      measured: `${ref.length} frames, ${off} differ after rounding to 0.1 dB; silent runs ${JSON.stringify(table)}; ${lo} to ${hi} segments over the reasonable settings`,
      expected: `voices.md section 1 table ${JSON.stringify(t.research)}; the reference's ${V.greetings.accepted.minVoices} to ${V.greetings.accepted.maxVoices}`,
      tolerance: 'exact (one frame in a thousand may round the other way at 0.05 dB)',
      pass: off <= ref.length / 1000 && JSON.stringify(table) === JSON.stringify(t.research) && lo === V.greetings.accepted.minVoices && hi === V.greetings.accepted.maxVoices,
    });
    expect(off).toBeLessThanOrEqual(ref.length / 1000);
    expect(table).toEqual(t.research);
    expect([lo, hi]).toEqual([V.greetings.accepted.minVoices, V.greetings.accepted.maxVoices]);
  });

  it('pitch tracks of the greetings, one speaker and the speakers\' ceiling (voices.ts.pitch)', () => {
    const t0 = performance.now();
    const g = load('02');
    const sp = yin(g.x, g.sr, yinSet.speech);
    const a = compareTrack(sp.f0, sp.ap, V.greetings.f0Hz100.map((v) => v / 100));
    const w = load('01');
    const one = yin(w.x, w.sr, yinSet.speech);
    const b = compareTrack(one.f0, one.ap, V.greetings.oneSpeaker.f0Hz100.map((v) => v / 100));
    const ceiling = heldRunCeiling(yin(g.x, g.sr, yinSet.calls));
    const ms = performance.now() - t0;
    const pass = a.agree >= 0.999 && b.agree >= 0.999 && a.maxCents < 0.01 && b.maxCents < 0.01 && a.jumps + b.jumps <= 5 && Math.abs(ceiling - V.greetings.speechCeilingHz) < 0.01;
    recordCheck({
      id: 'voices.ts.pitch',
      claim: "The browser's pitch tracker (YIN) follows the greetings and a single speaker exactly as the reference does.",
      measured: `greetings: voicing agrees on ${(a.agree * 100).toFixed(3)}% of frames, pitch within ${a.maxCents.toExponential(1)} cents, ${a.jumps} frames on another dip; Waldheim: ${(b.agree * 100).toFixed(3)}%, ${b.maxCents.toExponential(1)} cents, ${b.jumps} on another dip; speakers' ceiling ${ceiling.toFixed(3)} Hz; three passes in ${(ms / 1000).toFixed(1)} s`,
      expected: `the reference's tracks (data/voices.json) and ceiling ${V.greetings.speechCeilingHz} Hz`,
      tolerance: 'voicing on 99.9% of frames (a CMND within rounding of 0.1 may fall either side); pitch within 0.01 cents after the same 0.01 Hz rounding, except at most 5 frames that take another CMND dip (a value within rounding of a neighbour; about 1 in 5,000 voiced frames)',
      pass,
    });
    expect(a.agree).toBeGreaterThanOrEqual(0.999);
    expect(b.agree).toBeGreaterThanOrEqual(0.999);
    expect(a.maxCents).toBeLessThan(0.01);
    expect(a.jumps + b.jumps).toBeLessThanOrEqual(5);
    expect(Math.abs(ceiling - V.greetings.speechCeilingHz)).toBeLessThan(0.01);
  });

  it('the octave on the violin (voices.ts.octave)', () => {
    const { x, sr } = load('14');
    const tr = yin(x, sr, yinSet.music);
    const ns = notes(tr);
    const nc = ns.map((n) => Math.round(n.cents * 100) / 100);
    const oct = octaveOf(nc)!;
    const ref = V.music.violin;
    const sameNotes = ns.length === ref.notes.length && ns.every((n, i) => n.start === ref.notes[i]![0] && n.frames === ref.notes[i]![1]);
    const pass = sameNotes && Math.abs(oct - ref.octaveCents) < 0.01;
    recordCheck({
      id: 'voices.ts.octave',
      claim: "The browser finds the violin's notes and their repetition at a doubling exactly as the reference does.",
      measured: `${ns.length} notes (${sameNotes ? 'the same' : 'NOT the same'} starts and lengths); octave peak ${oct.toFixed(3)} cents`,
      expected: `the reference's ${ref.notes.length} notes and ${ref.octaveCents} cents`,
      tolerance: 'notes identical; octave within 0.01 cents',
      pass,
    });
    expect(sameNotes).toBe(true);
    expect(Math.abs(oct - ref.octaveCents)).toBeLessThan(0.01);
  });

  it('the comb on the piano (voices.ts.step)', () => {
    const { x, sr } = load('21');
    const pk = chromaPeaks(x, sr);
    const h = chromaHistogram(pk);
    const ref = V.music.piano;
    let maxDiff = 0;
    for (let i = 0; i < h.length; i++) maxDiff = Math.max(maxDiff, Math.abs(h[i]! - ref.hist[i]!));
    const sc = combScores(binCentres(h.length, CHROMA_BIN), h, V.music.violin.octaveCents);
    const k = 2 + sc.indexOf(Math.max(...sc));
    const scoreDiff = Math.max(...sc.map((s, i) => Math.abs(s - ref.combScores[i]!)));
    const pass = pk.cents.length === ref.peaks && maxDiff < 1e-6 && k === ref.combK && scoreDiff < 1e-4;
    recordCheck({
      id: 'voices.ts.step',
      claim: "The browser's spectral peaks and comb read the piano exactly as the reference does: twelve equal steps per doubling.",
      measured: `${pk.cents.length} peaks; histogram within ${maxDiff.toExponential(1)}; best comb ${k} steps; comb scores within ${scoreDiff.toExponential(1)}`,
      expected: `the reference's ${ref.peaks} peaks, histogram, scores and ${ref.combK} steps`,
      tolerance: 'peak count identical; histogram within 1e-6 (stored to 7 places); scores within 1e-4 (stored to 5)',
      pass,
    });
    expect(pk.cents.length).toBe(ref.peaks);
    expect(maxDiff).toBeLessThan(1e-6);
    expect(k).toBe(12);
    expect(scoreDiff).toBeLessThan(1e-4);
  });

  it('the greetings against their silences: where the sound falls into the noise (voices.ts.spectrum)', () => {
    const { x, sr } = load('02');
    const S = V.spectrum;
    const edges = S.bandEdgesHz;
    const nb = edges.length - 1;
    const speech = meanRows(segmentBands(x, sr, S.welch.nperseg, edges), nb);
    const noiseRows = quietStretches(x, sr, V.greetings.reasonable.thresholdDb[0]!, S.welch.nperseg).flatMap((s) => segmentBands(s, sr, S.welch.nperseg, edges));
    const noise = meanRows(noiseRows, nb);
    const sDb = toDb(speech);
    const nDb = toDb(noise);
    let maxDb = 0;
    for (let i = 0; i < nb; i++) maxDb = Math.max(maxDb, Math.abs(sDb[i]! - S.greetingsDb[i]!), Math.abs(nDb[i]! - S.noiseDb[i]!));
    const snr = sDb.map((v, i) => v - nDb[i]!);
    const cx = crossing(snr, edges);
    const pass = noiseRows.length === S.noiseSegments && maxDb < 0.001 && Math.abs(cx - S.crossingHz) < 0.1;
    recordCheck({
      id: 'voices.ts.spectrum',
      claim: "The browser's Welch spectra of the greetings and of their silences, and where the one falls into the other, match the reference.",
      measured: `bands within ${maxDb.toExponential(1)} dB; ${noiseRows.length} noise segments; crossing ${(cx / 1000).toFixed(4)} kHz`,
      expected: `the reference's spectra, ${S.noiseSegments} noise segments and ${(S.crossingHz / 1000).toFixed(4)} kHz (scipy.signal.welch and spectrogram)`,
      tolerance: 'bands within 0.001 dB (stored to 3 places); crossing within 0.1 Hz (stored to 0.1)',
      pass,
    });
    expect(noiseRows.length).toBe(S.noiseSegments);
    expect(maxDb).toBeLessThan(0.001);
    expect(Math.abs(cx - S.crossingHz)).toBeLessThan(0.1);
  });

  it('the long calls on the UN greetings track (voices.ts.whale)', () => {
    const { x, sr } = load('03');
    const cs = calls(yin(x, sr, yinSet.calls), V.greetings.speechCeilingHz);
    const ref = V.whale.calls;
    const same = cs.length === ref.length && cs.every((c, i) => c.start === ref[i]![0] && c.frames === ref[i]![1] && Math.abs(c.medianHz - ref[i]![2]!) < 0.01);
    recordCheck({
      id: 'voices.ts.whale',
      claim: "The browser finds the same long, high calls on the UN greetings track as the reference: the whale song's stretch.",
      measured: `${cs.length} calls, ${cs.length ? `${(cs[0]!.start / 100).toFixed(2)} to ${((cs.at(-1)!.start + cs.at(-1)!.frames) / 100).toFixed(2)} s` : 'none'}`,
      expected: `the reference's ${ref.length} calls, ${V.whale.segmentS?.join(' to ')} s`,
      tolerance: 'identical calls (start, length), pitch within 0.01 Hz',
      pass: same,
    });
    expect(same).toBe(true);
  });
});
