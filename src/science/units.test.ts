import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import {
  HYDROGEN_HZ, LAMBDA_H_METRES, SAGAN_HYDROGEN_HZ, T_H_SECONDS, binaryToMetres, binaryToSeconds, parseCoverBinary,
} from './units';

// Etched strings and their decimal values: docs/research/cover.md section 1b and 1c (pixel-verified
// on NASA photo GPN-2000-001978 and two independent transcriptions).
const ROTATION = '100110000110010000000000000000000';
const PLAY = '1000010110000000000000000000000000000000000';
const LINE = '101101001100000000000000';
const LINES = '1000000000';

describe('units: hydrogen constants', () => {
  it('matches the maser value, period and wavelength in clocks.md section 5', () => {
    const ok =
      Math.abs(T_H_SECONDS * 1e9 - 0.70402418376) < 1e-11 && // research quotes 11 decimals in ns
      Math.abs(LAMBDA_H_METRES * 100 - 21.106114054) < 1e-9 && // research quotes 9 decimals in cm
      Math.abs(SAGAN_HYDROGEN_HZ / HYDROGEN_HZ - 1 - 1.6e-10) < 0.1e-10; // research: 1.6e-10 fractional
    recordCheck({
      id: 'units.hydrogen',
      claim: 'The hydrogen key gives a time unit of 0.704 billionths of a second and a length of 21.1 cm.',
      measured: `period ${(T_H_SECONDS * 1e9).toFixed(11)} ns, wavelength ${(LAMBDA_H_METRES * 100).toFixed(9)} cm`,
      expected: '0.70402418376 ns and 21.106114054 cm from the maser frequency 1,420,405,751.768 Hz (clocks.md section 5)',
      tolerance: 'last quoted digit of the research values',
      pass: ok,
      notes: "Sagan et al. 1972 used 1.420405752e9 Hz; the difference is 1.6e-10 fractional and irrelevant here.",
    });
    expect(ok).toBe(true);
  });
});

describe('units: cover binary', () => {
  it('parses binary strictly', () => {
    expect(parseCoverBinary(LINES)).toBe(512);
    expect(() => parseCoverBinary('10a1')).toThrow();
    expect(() => parseCoverBinary('')).toThrow();
    expect(() => parseCoverBinary('1'.repeat(54))).toThrow();
    expect(parseCoverBinary('1'.repeat(53))).toBe(2 ** 53 - 1);
  });

  it('reads the record rotation as 3.59994 s', () => {
    const n = parseCoverBinary(ROTATION);
    const s = binaryToSeconds(ROTATION);
    const ok = n === 5_113_380_864 && Math.abs(s - 3.59994) < 1e-5; // cover.md 1b quotes 3.59994 s (5 decimals)
    recordCheck({
      id: 'cover.record.rotation',
      claim: 'The number around the record, read in hydrogen time units, is one turn every 3.6 seconds (16 2/3 rpm).',
      measured: `${n.toLocaleString('en-US')} units = ${s.toFixed(6)} s`,
      expected: '5,113,380,864 units = 3.59994 s (cover.md 1b; NASA states 3.6 s)',
      tolerance: '1e-5 s, the last digit quoted by the research',
      pass: ok,
    });
    expect(n).toBe(5_113_380_864);
    expect(s).toBeCloseTo(3.59994, 5);
  });

  it('reads the play time as 53.82 minutes', () => {
    const n = parseCoverBinary(PLAY);
    const s = binaryToSeconds(PLAY);
    const ok = n === 4_587_025_072_128 && Math.abs(s - 3229.4) <= 0.05; // cover.md 1b quotes 3229.4 s
    recordCheck({
      id: 'cover.record.playTime',
      claim: 'The side-view number is the playing time of one side: about 53.8 minutes.',
      measured: `${n.toLocaleString('en-US')} units = ${s.toFixed(2)} s = ${(s / 60).toFixed(2)} min`,
      expected: '4,587,025,072,128 units = 3229.4 s = 53.82 min (cover.md 1b)',
      tolerance: '0.05 s, half the last digit quoted by the research',
      pass: ok,
    });
    expect(n).toBe(4_587_025_072_128);
    expect(Math.abs(s - 3229.4)).toBeLessThanOrEqual(0.05);
    expect((s / 60).toFixed(2)).toBe('53.82');
  });

  it('reads the picture line time as 8.3396 ms and the line count as 512', () => {
    const n = parseCoverBinary(LINE);
    const ms = binaryToSeconds(LINE) * 1000;
    const ok = n === 11_845_632 && Math.abs(ms - 8.3396) <= 1e-4; // cover.md 1c quotes 8.3396 ms
    recordCheck({
      id: 'cover.picture.lineTime',
      claim: 'Each picture line lasts about 8.34 milliseconds.',
      measured: `${n.toLocaleString('en-US')} units = ${ms.toFixed(5)} ms`,
      expected: '11,845,632 units = 8.3396 ms (cover.md 1c)',
      tolerance: '0.0001 ms, the last digit quoted by the research',
      pass: ok,
    });
    const lines = parseCoverBinary(LINES);
    recordCheck({
      id: 'cover.picture.lines',
      claim: 'Each picture has 512 vertical lines.',
      measured: `binary 1000000000 = ${lines}`,
      expected: '512 (cover.md 1c; NASA: "512 vertical lines")',
      tolerance: 'exact',
      pass: lines === 512,
    });
    expect(ok).toBe(true);
    expect(lines).toBe(512);
  });

  it('shows the numbers are times, not lengths', () => {
    const metres = binaryToMetres(ROTATION);
    const seconds = binaryToSeconds(ROTATION);
    // As a length the rotation number is about 1.08e9 m (cover.md 1a game note: lengths are absurd);
    // the disc is 30 cm across, so any reading above 1e8 m is absurd by more than 8 orders of magnitude.
    const ok = metres > 1e8 && Math.abs(seconds - 3.6) < 0.001;
    recordCheck({
      id: 'cover.timeNotLength',
      claim: 'Read as lengths the cover numbers are absurd (a 30 cm record a million kilometres around); read as times they make sense.',
      measured: `rotation number as a length: ${(metres / 1e9).toFixed(3)} million km; as a time: ${seconds.toFixed(4)} s`,
      expected: 'a length near 0.3 m would be plausible; 3.6 s per turn matches 16 2/3 rpm (cover.md 1a, 1b)',
      tolerance: 'length reading must exceed 1e8 m (absurd); time within 1 ms of 3.6 s',
      pass: ok,
    });
    expect(metres).toBeGreaterThan(1e8);
    expect(metres).toBeCloseTo(1.0792e9, -6);
    expect(ok).toBe(true);
  });
});
