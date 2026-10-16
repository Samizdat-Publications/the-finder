// The Voices' checkers: each right answer confirms and each meaningful wrong one is rejected with what the
// analysis computes. Truth is independent of the checkers: docs/research/voices.md section 1's table of pauses
// and its "a few dozen at least"; voices.md 3's slow decay to well over 10 kHz; 2:1 and 2^(1/12) (voices.md 4);
// and for the whale the lead's own reading of the UN greetings track's spectrograms
// (docs/reviews/2026-10-16-M5-science-audit.md: speech to about 188 s, calls alone from about 189 s to about
// 236 s, low moans to about 239.5 s). Every message reads in the alien's units with the human gloss off.
// Check id: voices.checkers.
import { describe, expect, it } from 'vitest';
import voicesJson from '../../../data/voices.json';
import { recordCheck } from '../../../tests/support/record';
import { messageUnitProblems } from '../../../tests/support/units';
import { renderMessage } from '../../ui/message';
import { checkHearing, checkMany, checkOctave, checkOthers } from './checkers';
import { REASONABLE, greetingsAt } from './data';

const V = voicesJson;
const log: string[] = [];
const problems: string[] = [];
let wrongs = 0;
const see = (id: string, r: { ok: boolean; message: string }, ok: boolean): { ok: boolean; message: string } => {
  expect(r.ok, `${id}: ${r.message}`).toBe(ok);
  if (!ok) wrongs++;
  problems.push(...messageUnitProblems(r.message).map((p) => `${id}: ${p}`));
  log.push(`${id} ${ok ? 'right' : 'wrong'}: ${renderMessage(r.message, true)}`);
  return r;
};
/** The lead's reading of the whale stretch and its tolerance: read by eye to about a second; 2 s allowed. */
const SPEECH_ENDS = 188;
const CALLS_END = 236;
const READING_TOL = 2;

describe('The Voices checkers', () => {
  it('voices.many: one definition of reasonable settings, the count over it and the pitch spread', () => {
    // Independent truth: the research's table counts the silent runs; the segments lie between them.
    const t = V.greetings.researchTable;
    for (const [i, th] of t.thresholdsDb.entries()) {
      for (const [j, gap] of t.gapsS.entries()) {
        expect(Math.abs(greetingsAt(th, gap).count - t.research[i]![j]!)).toBeLessThanOrEqual(1);
      }
    }
    // "A few dozen at least" (voices.md 1) everywhere on the reasonable grid.
    expect(V.greetings.accepted.minVoices).toBeGreaterThanOrEqual(24);
    const mid = greetingsAt(-30, 0.25);
    expect(mid.voices).toBeGreaterThanOrEqual(2);
    const right = see('many', checkMany({ threshold: -30, gap: 0.25, groups: mid.voices }), true);
    expect(right.message).toMatch(/about 55/);
    expect(right.message).not.toMatch(/cannot give|wholly above/);
    see('many', checkMany({ threshold: -30, gap: 0.25, groups: 2 }), true);
    // The reasonable grid's corners are all accepted (the one definition: tools/voices/analyse.py REASONABLE_GAPS).
    for (const th of REASONABLE.thresholdDb) for (const gap of REASONABLE.gapS) see('many', checkMany({ threshold: th, gap, groups: 2 }), true);
    see('many', checkMany({ threshold: -50, gap: 0.4, groups: 2 }), false);
    see('many', checkMany({ threshold: REASONABLE.thresholdDb[0] - 0.5, gap: 0.25, groups: 2 }), false);
    see('many', checkMany({ threshold: -30, gap: 1.2, groups: 2 }), false);
    see('many', checkMany({ threshold: -30, gap: 0.03, groups: 2 }), false);
    see('many', checkMany({ threshold: -15, gap: 0.25, groups: 2 }), false);
    see('many', checkMany({ threshold: -30, gap: 0.25, groups: 1 }), false);
    see('many', checkMany({ threshold: -30, gap: 0.25, groups: mid.voices + 3 }), false);
    // The settings that give about the published 55 lie outside the reasonable band, and the checker says what they give.
    const near = V.greetings.nearPublished;
    expect(Math.abs(greetingsAt(near.thresholdDb, near.gapS).count - 55)).toBeLessThanOrEqual(2);
    see('many', checkMany({ threshold: near.thresholdDb, gap: near.gapS, groups: 2 }), false);
  });

  it('voices.hearing: the mark inside the measured crossing band, with no claim about hearing', () => {
    const S = V.spectrum;
    const r = see('hearing', checkHearing({ topHz: S.crossingHz }), true);
    expect(r.message).not.toMatch(/they hear|hear at least|made to be heard/);
    see('hearing', checkHearing({ topHz: S.crossingBandHz[0]! + 1 }), true);
    see('hearing', checkHearing({ topHz: 8000 }), false);
    see('hearing', checkHearing({ topHz: 21_000 }), false);
    // Independent of the checker: the crossing lies well over 10 kHz, as voices.md 3 measured, and inside the
    // spread the edge's definition alone causes.
    expect(S.crossingBandHz[0]!).toBeGreaterThan(10_000);
    expect(S.definitions.spreadHz[0]! < S.crossingHz && S.crossingHz < S.definitions.spreadHz[1]!).toBe(true);
  });

  it('voices.octave: 2:1 and a twelfth of it, every other ratio judged by the same fold', () => {
    const oct = V.music.violin.octaveCents;
    const r = 2 ** (oct / 1200);
    const at = (c: number): number => 2 ** (c / 1200);
    const named = V.music.violin.fold.named;
    see('octave', checkOctave({ ratio: r, step: r ** (1 / 12) }), true);
    see('octave', checkOctave({ ratio: 2, step: 2 ** (1 / 12) }), true);
    expect(see('octave', checkOctave({ ratio: at(named['3:2']!), step: at(named['3:2']!) ** (1 / 7) }), false).message).toMatch(/3 to 2/);
    expect(see('octave', checkOctave({ ratio: 1.5, step: 1.5 ** (1 / 7) }), false).message).toMatch(/3 to 2/);
    see('octave', checkOctave({ ratio: 4 / 3, step: (4 / 3) ** (1 / 5) }), false);
    expect(see('octave', checkOctave({ ratio: at(named['two 3:2']!), step: at(named['two 3:2']!) ** (1 / 12) }), false).message).toMatch(/two 3 to 2/);
    expect(see('octave', checkOctave({ ratio: at(named['4:1']!), step: at(named['4:1']!) ** (1 / 24) }), false).message).toMatch(/two doublings/);
    see('octave', checkOctave({ ratio: at(named['3:1']!), step: at(named['3:1']!) ** (1 / 19) }), false);
    see('octave', checkOctave({ ratio: 2.4, step: 2.4 ** (1 / 12) }), false);
    see('octave', checkOctave({ ratio: r, step: r ** (1 / 7) }), false);
    see('octave', checkOctave({ ratio: r, step: r ** (1 / 13) }), false);
    // Independent truth: 2:1 lies inside the measured tolerance (voices.md 4).
    expect(Math.abs(oct - 1200)).toBeLessThanOrEqual(V.music.violin.octaveTolCents);
  });

  it("voices.others: held calls and no speech, judged against the lead's reading", () => {
    const lo = SPEECH_ENDS + READING_TOL;
    const hi = CALLS_END - READING_TOL;
    // Inside the calls alone: accepted (the tour's own drag, 3 s in from each end of the reference's calls, among them).
    see('others', checkOthers({ track: 'ozma-03', start: lo, end: hi }), true);
    see('others', checkOthers({ track: 'ozma-03', start: 200, end: 220 }), true);
    see('others', checkOthers({ track: 'ozma-03', start: 193.64, end: 233.09 }), true);
    // Into the low moans after the calls (not speech): accepted.
    see('others', checkOthers({ track: 'ozma-03', start: 195, end: 239 }), true);
    // Taking in speech: refused, saying what was measured.
    expect(see('others', checkOthers({ track: 'ozma-03', start: SPEECH_ENDS - READING_TOL - 1, end: 230 }), false).message).toMatch(/speech/);
    see('others', checkOthers({ track: 'ozma-03', start: 150, end: 200 }), false);
    expect(see('others', checkOthers({ track: 'ozma-03', start: 20, end: 40 }), false).message).toMatch(/Speakers/);
    see('others', checkOthers({ track: 'ozma-02', start: 100, end: 110 }), false);
    see('others', checkOthers({ track: 'ozma-01', start: 5, end: 40 }), false);
    // A piece of music: refused with the held-tone count, whatever it holds.
    const mus = see('others', checkOthers({ track: 'ozma-14', start: 0, end: 170 }), false);
    expect(mus.message).toMatch(/held tone/);
    expect(mus.message).toMatch(/cannot tell/);
  });

  it.todo("voices.others on the Sounds of Earth (ozma-04): pending the lead's reading of the spectrogram panels (review/archive/*-sounds-spectrograms/)");

  it('records the checkers (voices.checkers)', () => {
    for (const l of log) console.log(l);
    const pass = problems.length === 0;
    recordCheck({
      id: 'voices.checkers',
      claim: "The Voices' four checkers accept the readings the real record supports and reject each meaningful wrong one with what the analysis computes for it, in the alien's units.",
      measured: `${log.length} answers, ${wrongs} wrong ones rejected, each with its own result; unit problems: ${problems.length ? problems.join('; ') : 'none'}`,
      expected:
        "voices.md 1's table (counts within one of its silent runs at all 12 settings) and 'a few dozen at least'; the crossing over 10 kHz (voices.md 3); 2:1 and 2^(1/12) (voices.md 4); the lead's reading of the whale stretch (speech to about 188 s, calls alone to about 236 s); a piece of music always refused",
      tolerance: "exact verdicts; segment count within one of the silent-run count (a leading or trailing silence is a run but bounds no segment); the reading of the whale stretch within 2 s (read by eye to about a second). The Sounds of Earth case is pending the lead's reading",
      pass,
    });
    expect(problems).toEqual([]);
  });
});
