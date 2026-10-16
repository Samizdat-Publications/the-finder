// The Voices' checkers: each right answer confirms and each meaningful wrong one is rejected with what the
// analysis computes. Truth is independent of the checkers: docs/research/voices.md section 1's table of pauses,
// the reference's measured crossing and bands (data/voices.json from tools/voices/analyse.py), 2:1 and
// 2^(1/12) (voices.md 4), and the reference's whale stretch. Every message reads in the alien's units with the
// human gloss off. Check id: voices.checkers.
import { describe, expect, it } from 'vitest';
import voicesJson from '../../../data/voices.json';
import { recordCheck } from '../../../tests/support/record';
import { messageUnitProblems } from '../../../tests/support/units';
import { renderMessage } from '../../ui/message';
import { checkHearing, checkMany, checkOctave, checkOthers } from './checkers';
import { greetingsAt } from './data';

const V = voicesJson;
const log: string[] = [];
const problems: string[] = [];
let wrongs = 0;
const see = (id: string, r: { ok: boolean; message: string }, ok: boolean): void => {
  expect(r.ok, `${id}: ${r.message}`).toBe(ok);
  if (!ok) wrongs++;
  problems.push(...messageUnitProblems(r.message).map((p) => `${id}: ${p}`));
  log.push(`${id} ${ok ? 'right' : 'wrong'}: ${renderMessage(r.message, true)}`);
};

describe('The Voices checkers', () => {
  it('voices.many: the count over reasonable settings and the pitch spread', () => {
    // Independent truth: the research's table counts the silent runs; the segments lie between them.
    const t = V.greetings.researchTable;
    for (const [i, th] of t.thresholdsDb.entries()) {
      for (const [j, gap] of t.gapsS.entries()) {
        expect(Math.abs(greetingsAt(th, gap).count - t.research[i]![j]!)).toBeLessThanOrEqual(1);
      }
    }
    const mid = greetingsAt(-30, 0.25);
    expect(mid.voices).toBeGreaterThanOrEqual(2);
    see('many', checkMany({ threshold: -30, gap: 0.25, groups: mid.voices }), true);
    see('many', checkMany({ threshold: -30, gap: 0.25, groups: 2 }), true);
    see('many', checkMany({ threshold: -50, gap: 0.4, groups: 2 }), false);
    see('many', checkMany({ threshold: -30, gap: 1.2, groups: 2 }), false);
    see('many', checkMany({ threshold: -30, gap: 0.03, groups: 2 }), false);
    see('many', checkMany({ threshold: -15, gap: 0.25, groups: 2 }), false);
    see('many', checkMany({ threshold: -30, gap: 0.25, groups: 1 }), false);
    see('many', checkMany({ threshold: -30, gap: 0.25, groups: mid.voices + 3 }), false);
  });

  it('voices.hearing: the mark inside the measured crossing band', () => {
    const S = V.spectrum;
    see('hearing', checkHearing({ topHz: S.crossingHz }), true);
    see('hearing', checkHearing({ topHz: S.crossingBandHz[0]! + 1 }), true);
    see('hearing', checkHearing({ topHz: 8000 }), false);
    see('hearing', checkHearing({ topHz: 21_000 }), false);
    // Independent of the checker: the crossing lies well over 10 kHz, as voices.md 3 measured.
    expect(S.crossingBandHz[0]!).toBeGreaterThan(10_000);
  });

  it('voices.octave: 2:1 and a twelfth of it', () => {
    const oct = V.music.violin.octaveCents;
    const r = 2 ** (oct / 1200);
    see('octave', checkOctave({ ratio: r, step: r ** (1 / 12) }), true);
    see('octave', checkOctave({ ratio: 2, step: 2 ** (1 / 12) }), true);
    see('octave', checkOctave({ ratio: 1.5, step: 1.5 ** (1 / 7) }), false);
    see('octave', checkOctave({ ratio: 4 / 3, step: (4 / 3) ** (1 / 5) }), false);
    see('octave', checkOctave({ ratio: 2.4, step: 2.4 ** (1 / 12) }), false);
    see('octave', checkOctave({ ratio: r, step: r ** (1 / 7) }), false);
    see('octave', checkOctave({ ratio: r, step: r ** (1 / 13) }), false);
  });

  it('voices.others: inside the whale song, not the speech', () => {
    const [s0, s1] = V.whale.segmentS as [number, number];
    see('others', checkOthers({ track: 'ozma-03', start: s0 + 1, end: s1 - 1 }), true);
    see('others', checkOthers({ track: 'ozma-03', start: 200, end: 220 }), true);
    see('others', checkOthers({ track: 'ozma-02', start: 200, end: 220 }), false);
    see('others', checkOthers({ track: 'ozma-03', start: 20, end: 40 }), false);
    see('others', checkOthers({ track: 'ozma-03', start: 150, end: 200 }), false);
  });

  it('records the checkers (voices.checkers)', () => {
    for (const l of log) console.log(l);
    const pass = problems.length === 0;
    recordCheck({
      id: 'voices.checkers',
      claim: "The Voices' four checkers accept the readings the real record supports and reject each meaningful wrong one with what the analysis computes for it, in the alien's units.",
      measured: `${log.length} answers, ${wrongs} wrong ones rejected, each with its own result; unit problems: ${problems.length ? problems.join('; ') : 'none'}`,
      expected: "voices.md 1's table (counts within one of its silent runs at all 12 settings); the measured crossing band; 2:1 and 2^(1/12) (voices.md 4); the reference's whale stretch",
      tolerance: 'exact verdicts; segment count within one of the silent-run count (a leading or trailing silence is a run but bounds no segment)',
      pass,
    });
    expect(problems).toEqual([]);
  });
});
