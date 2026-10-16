// Message tokens (src/ui/message.ts) and the unit-word detector the message tests rely on (tests/support/units.ts).
// Truth: the alien's units are exact game conventions (units.ts, D-A22: beat 0.871 s, reach 1.37 m, heft 2.29 kg),
// so the expected numbers are plain arithmetic on them.
import { describe, expect, it } from 'vitest';
import { messageUnitProblems, unitWordsIn } from '../../tests/support/units';
import { alienText, countTokens, humanText, pluralKey, q, rangeDigits, renderMessage } from './message';
import { BEAT_S, REACH_M } from './units';

describe('message tokens', () => {
  it('a token is plain ASCII, survives JSON, and renders in the alien units with the gloss off', () => {
    const t = q('time', 8.71);
    expect(t).toMatch(/^[\x20-\x7e]+$/);
    expect(JSON.parse(JSON.stringify({ m: t })).m).toBe(t);
    // 8.71 s is exactly 10 beats.
    expect(renderMessage(`It took ${t}.`, false)).toBe('It took 10 beats.');
    expect(renderMessage(`It took ${t}.`, true)).toBe('It took 10 beats (8.71 s).');
  });

  it('singular for one, plural otherwise; per-beat and labour units do not take an s', () => {
    expect(alienText('time', BEAT_S)).toBe('1 beat');
    expect(alienText('length', 2 * REACH_M)).toBe('2 reaches');
    expect(pluralKey('reach per beat')).toBe('reaches per beat');
    expect(pluralKey('per beat')).toBe('per beat');
    expect(pluralKey('labour per beat')).toBe('labour per beat');
    expect(pluralKey('notch')).toBe('notches');
    expect(pluralKey('square reach')).toBe('square reaches');
  });

  it('the human reading uses years, parsecs and AU for the large ones', () => {
    expect(humanText('time', 44_100 * 31_557_600)).toBe('44,100 years');
    expect(humanText('length', 0.749 * 3.0856775814913673e16)).toBe('0.749 pc');
    expect(humanText('length', 1.495978707e11)).toBe('1 AU');
    expect(humanText('specificEnergy', 2.5e12)).toBe('2,500,000,000,000 J/kg');
  });

  it('digits resolve an interval: 44,100 to 44,140 years reads apart', () => {
    const y = 31_557_600;
    const d = rangeDigits('time', 44_140 * y, 40 * y);
    const lo = alienText('time', 44_100 * y, d);
    const hi = alienText('time', 44_140 * y, d);
    expect(lo).not.toBe(hi);
  });

  it('text without tokens (old saves) and malformed tokens render unchanged', () => {
    const old = 'You measure 0.749 pc; 44,100 years ago.';
    expect(renderMessage(old, false)).toBe(old);
    expect(renderMessage('{{q|colour|1}} and {{q|time|x}}', true)).toBe('{{q|colour|1}} and {{q|time|x}}');
    expect(countTokens(`${q('time', 1)} ${q('length', 2, 4)}`)).toBe(2);
  });
});

describe('the unit-word detector', () => {
  it('catches SI and human units as words or after numbers, and leaves English alone', () => {
    expect(unitWordsIn('0.3625 s')).toContain('number + s');
    expect(unitWordsIn('44,100 years ago')).toContain('years');
    expect(unitWordsIn('0.749 pc behind it')).toContain('pc');
    expect(unitWordsIn('8.7 W of heat')).toContain('number + W');
    expect(unitWordsIn('up to 100 km/s')).toContain('km/s');
    expect(unitWordsIn('3.48 K')).toContain('number + K');
    expect(unitWordsIn('1.5 × 10¹² s')).toContain('number + s');
    // English that must pass: possessives, ordinals, degrees, counts.
    expect(unitWordsIn("the star's light, the second ratio, 20 degrees, 5 of 14 lines, 1 measurement in 20")).toEqual([]);
  });

  it('flags an old SI message and accepts its tokenised form', () => {
    expect(messageUnitProblems('The disc turns once in 3.6 s.').length).toBeGreaterThan(0);
    expect(messageUnitProblems(`The disc turns once in ${q('time', 3.6)}.`)).toEqual([]);
  });
});
