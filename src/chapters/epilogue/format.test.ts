import { describe, expect, it } from 'vitest';
import { dateLong, grouped, hoursMinutes, lightDaySentence, numberWord, sig, utcDate, utcHm, utcHms } from './format';

describe('Our Frame formatting', () => {
  it('writes dates and UTC times plainly', () => {
    expect(dateLong('2025-02-25')).toBe('25 February 2025');
    expect(dateLong('1990-02-14')).toBe('14 February 1990');
    const ms = Date.parse('2026-11-18T10:16:18.4Z');
    expect(utcDate(ms)).toBe('18 November 2026');
    expect(utcHms(ms)).toBe('10:16:18');
    expect(utcHm(ms)).toBe('10:16');
    expect(utcHm(Date.parse('2026-11-18T10:16:59.9Z'))).toBe('10:16');
    expect(() => dateLong('soon')).toThrow();
  });

  it('writes numbers in words, in groups and to a few figures', () => {
    expect(numberWord(2)).toBe('two');
    expect(numberWord(10)).toBe('ten');
    expect(numberWord(13)).toBe('thirteen');
    expect(numberWord(40)).toBe('40');
    expect(grouped(44123.6)).toBe('44,124');
    expect(sig(44123.6)).toBe('44,100');
    expect(sig(0.57312, 3)).toBe('0.573');
    expect(hoursMinutes(23.9)).toBe('23 hours 54 minutes');
  });

  it('says the light-day in the future tense before it and the past tense after it, with both times', () => {
    const computed = Date.parse('2026-11-18T10:16:18Z');
    const nasa = Date.parse('2026-11-18T10:16:07Z');
    const before = lightDaySentence(computed, nasa, Date.parse('2026-10-22T00:00:00Z'));
    expect(before).toBe(
      'On 18 November 2026, at about 10:16 UTC, Voyager 1 is one light-day from Earth: light, or a radio message, takes a full day (to within seconds) to cross the gap. NASA gives 10:16:07; these tables give 10:16:18.',
    );
    const after = lightDaySentence(computed, nasa, Date.parse('2027-01-01T00:00:00Z'));
    expect(after).toContain('became one light-day from Earth');
    expect(after).toContain('NASA gives 10:16:07; these tables give 10:16:18.');
    expect(before + after).not.toContain(String.fromCharCode(0x2014));
  });
});
