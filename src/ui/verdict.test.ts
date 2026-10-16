import { describe, expect, it } from 'vitest';
import { splitVerdict } from './verdict';

describe('splitVerdict: a refused result leads with one line', () => {
  it('keeps a short first sentence whole and folds the rest', () => {
    const v = splitVerdict('That is your own star. The machine is passing it now: it moves at 90 deg to the line. It came from somewhere else.');
    expect(v.lead).toBe('That is your own star.');
    expect(v.rest).toBe('The machine is passing it now: it moves at 90 deg to the line. It came from somewhere else.');
  });

  it('cuts a long sentence at its first clause and keeps the comparison it ends on', () => {
    const m =
      "You measure 8.55 deg between the machine's motion relative to Ran and straight away from it; a star it truly flew from would show at most 0.0632 deg 95% of the time (rms 0.0231 deg per axis), and at most 0.11 deg 999 times in 1,000: this is 135 times the 95% cut, beyond the 99.9% one. Something thrown from there would fly straight out of it.";
    const v = splitVerdict(m);
    expect(v.lead).toBe("You measure 8.55 deg between the machine's motion relative to Ran and straight away from it: this is 135 times the 95% cut, beyond the 99.9% one.");
    expect(v.rest.startsWith('A star it truly flew from would show at most 0.0632 deg')).toBe(true);
    expect(v.rest.endsWith('Something thrown from there would fly straight out of it.')).toBe(true);
  });

  it('never invents a number: every figure in the lead is in the message', () => {
    const m = 'Along this axis the ages still scatter by 516.4 years about a straight line. The velocity that fits all the old lines at once lies 48.1 deg from it: a chi-square of 6788.8, more than the 5.99 two angles allow at 95%.';
    const v = splitVerdict(m);
    for (const n of v.lead.match(/\d+(?:\.\d+)?/g) ?? []) expect(m).toContain(n);
    expect(v.lead).toBe('Along this axis the ages still scatter by 516.4 years about a straight line.');
  });

  it('does not take a range after a colon for a conclusion', () => {
    const m = 'The counts (46 uranium-238, 4 uranium-234 and 0 thorium-230 alphas in 100 beats) give a uranium-234 to uranium-238 ratio of 0.087, which a pure start reaches at 1.17 × 10¹² beats; 95%: 4.25 × 10¹¹ beats to 3.39 × 10¹² beats. 4 × 10¹² beats lies outside.';
    const v = splitVerdict(m);
    expect(v.lead).toBe('The counts (46 uranium-238, 4 uranium-234 and 0 thorium-230 alphas in 100 beats) give a uranium-234 to uranium-238 ratio of 0.087, which a pure start reaches at 1.17 × 10¹² beats.');
    expect(v.rest).toBe('95%: 4.25 × 10¹¹ beats to 3.39 × 10¹² beats. 4 × 10¹² beats lies outside.');
  });

  it('falls back to a cut sentence with the whole message beneath when it has no clause break', () => {
    const long = `${'word '.repeat(60)}end.`;
    const v = splitVerdict(long);
    expect(v.lead.endsWith('...')).toBe(true);
    expect(v.lead.length).toBeLessThan(140);
    expect(v.rest).toBe(long.trim());
  });

  it('has an empty rest when the message is one short sentence', () => {
    expect(splitVerdict('Put a pulsar on every line: 3 of 14 have none yet (1, 2, 3).')).toEqual({ lead: 'Put a pulsar on every line: 3 of 14 have none yet (1, 2, 3).', rest: '' });
  });
});
