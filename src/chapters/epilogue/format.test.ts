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
    // singular where the count is one (the card once read "20 hours 1 minutes")
    expect(hoursMinutes(20 + 1 / 60)).toBe('20 hours 1 minute');
    expect(hoursMinutes(1 + 1 / 60)).toBe('1 hour 1 minute');
    expect(hoursMinutes(1)).toBe('1 hour 0 minutes');
    expect(hoursMinutes(5.5)).toBe('5 hours 30 minutes');
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
    // After the crossing the one-way light time from the craft stays under a day for about 16 hours (by up to
    // 4.9 s at the crossing; M6 science audit, review/archive/science/m6audit/lightday.txt), so "to within seconds".
    expect(after).toContain('takes a full day or more (to within seconds) to cross the gap');
    expect(after).toContain('NASA gives 10:16:07; these tables give 10:16:18.');
    expect(before + after).not.toContain(String.fromCharCode(0x2014));
  });
});
