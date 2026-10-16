// The Player's checkers and the groove microscope against independent truth: the cover's turn time
// (3.59994 s, cover.md 1b), turntable speeds whose ratios are known exactly (33 1/3 rpm is twice 16 2/3,
// 45 rpm is 2.7 times), the 12-inch music band and side 1's length (data/record.json meta, 3684.31 s), the
// tape's first frame (15.63 s) and line period (8.326 ms, images-and-audio.md section 1), and the groove model
// (src/record/groove.ts). Ids player.speed, player.start, player.direction, player.firstSound (How it's checked row 11).

import { describe, expect, it } from 'vitest';
import recordJson from '../../../data/record.json';
import { groove } from '../../game/model';
import { R_INNER_MUSIC_MM, R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM } from '../../record/groove';
import { recordCheck } from '../../../tests/support/record';
import { checkDirection, checkFirstSound, checkSpeed, checkStart, readTurntable } from './checkers';
import { SPEED_STEP_S } from './constants';
import { FIRST_LINE_S, FIRST_PICTURE_LINE_S, TRUE_PERIOD_S, grooveDrift, hear, microscopeGrooves, semitones, speedRatio } from './physics';

/** The cover's etched turn time, s (cover.md 1b: 5,113,380,864 hydrogen units = 3.59994 s). */
const COVER_T = 3.59994;
const val = (r: { result: { key: string; value: number | string }[] }, key: string) => r.result.find((x) => x.key === key)?.value;

describe('player.speed', () => {
  it('accepts the cover turn time and reports pitch and tempo shifts for wrong speeds', () => {
    // cover.md 1b quotes 3.59994 s to 6 significant figures: half a unit in the last place.
    expect(Math.abs(TRUE_PERIOD_S - COVER_T)).toBeLessThan(5e-6);
    const right = checkSpeed({ secondsPerTurn: TRUE_PERIOD_S });
    expect(right.ok).toBe(true);
    // The control's grid nearest the cover value is at most half a step off, inside the one-step tolerance.
    expect(checkSpeed({ secondsPerTurn: TRUE_PERIOD_S + SPEED_STEP_S * 0.5 }).ok).toBe(true);
    expect(checkSpeed({ secondsPerTurn: TRUE_PERIOD_S + SPEED_STEP_S * 1.01 }).ok).toBe(false);
    // The tolerance is at most 0.5% of a turn (spec).
    expect(SPEED_STEP_S / TRUE_PERIOD_S).toBeLessThanOrEqual(0.005);

    // 33 1/3 rpm (1.8 s per turn) is exactly twice 16 2/3 rpm: one octave, 12 semitones. The cover's value is
    // 3.6 s truncated to 16 bits (cover.md 1b), so k = 3.59994 / 1.8 = 1.99997: 12 semitones within 0.001.
    const r33 = checkSpeed({ secondsPerTurn: 1.8 });
    expect(r33.ok).toBe(false);
    expect(val(r33, 'speed ratio') as number).toBeCloseTo(COVER_T / 1.8, 5);
    expect(Math.abs((val(r33, 'semitones') as number) - 12)).toBeLessThan(1e-3);
    // 45 rpm (4/3 s per turn) is 2.7 times 16 2/3 rpm: 12 log2 2.7 = 17.196 semitones.
    const r45 = checkSpeed({ secondsPerTurn: 60 / 45 });
    expect(Math.abs((val(r45, 'semitones') as number) - 12 * Math.log2(2.7))).toBeLessThan(1e-3);
    // A slight error: 3.47 s per turn plays 3.59994 / 3.47 = 1.03745 times fast, 0.637 semitones up.
    const slight = checkSpeed({ secondsPerTurn: 3.47 });
    expect(val(slight, 'speed ratio') as number).toBeCloseTo(1.03745, 5);
    expect(val(slight, 'semitones') as number).toBeCloseTo(12 * Math.log2(COVER_T / 3.47), 4);
    expect(slight.message).toMatch(/semitones up/);
    expect(checkSpeed({ secondsPerTurn: 5 }).message).toMatch(/semitones down/);

    recordCheck({
      id: 'player.speed',
      claim: 'The turntable plays right only at the time written round the disc; any other speed shifts pitch and tempo by exactly the speed ratio, as on a real turntable.',
      measured: `cover turn ${TRUE_PERIOD_S.toFixed(5)} s accepted; control step ${(SPEED_STEP_S * 1000).toFixed(3)} ms (${((SPEED_STEP_S / TRUE_PERIOD_S) * 100).toFixed(3)}%); 1.8 s per turn: k ${(val(r33, 'speed ratio') as number).toFixed(5)}, ${(val(r33, 'semitones') as number).toFixed(4)} semitones; 4/3 s: ${(val(r45, 'semitones') as number).toFixed(3)} semitones; 3.47 s: k ${(val(slight, 'speed ratio') as number).toFixed(5)}`,
      expected: 'the cover\'s 3.59994 s (cover.md 1b); 33 1/3 rpm is one octave (12 semitones) above 16 2/3 rpm, 45 rpm is 2.7 times (17.196 semitones)',
      tolerance: 'right speed within one control step (0.121% of a turn, spec cap 0.5%); semitones within 0.001 (the cover value is 3.6 s truncated to 16 bits)',
      pass: true,
    });
  });
});

describe('player.start', () => {
  it('accepts the outer lead-in and the opening turns, and reports what every other place does', () => {
    expect(checkStart({ radiusMm: (R_OUTER_MUSIC_MM + R_LEAD_IN_OUTER_MM) / 2 }).ok).toBe(true);
    expect(checkStart({ radiusMm: R_OUTER_MUSIC_MM - 0.05 }).ok).toBe(true);
    // Side 1's music band: 85.75 mm over 3684.31 s / 3.59994 s turns (record.json sideDurationsS, 12-inch radii).
    const pitch = (R_OUTER_MUSIC_MM - R_INNER_MUSIC_MM) / (recordJson.meta.sideDurationsS['1'] / COVER_T);
    expect(Math.abs(groove.pitchMm(1) - pitch)).toBeLessThan(1e-4); // side length quoted to 0.01 s
    const later = checkStart({ radiusMm: R_OUTER_MUSIC_MM - 20 * groove.pitchMm(1) });
    expect(later.ok).toBe(false);
    expect(val(later, 'turns into the music') as number).toBeCloseTo(20, 6);

    // The run-out clicks once per turn: every T / k, which is the set seconds per turn.
    const s = 2.4;
    const run = checkStart({ radiusMm: 55, secondsPerTurn: s });
    expect(run.ok).toBe(false);
    expect(val(run, 'needle lands on')).toBe('runout');
    expect(val(run, 'click every') as number).toBeCloseTo(COVER_T / (COVER_T / s), 9);
    const label = checkStart({ radiusMm: 30 });
    expect(label.ok).toBe(false);
    expect(val(label, 'needle lands on')).toBe('label');
    expect(val(checkStart({ radiusMm: 150 }), 'needle lands on')).toBe('rim');
    expect(val(checkStart({ radiusMm: 160 }), 'needle lands on')).toBe('off');

    recordCheck({
      id: 'player.start',
      claim: 'The needle starts at the outer edge, as the cover draws the stylus; dropped in the run-out it only clicks once per turn, and on the label it plays nothing.',
      measured: `lead-in and the first turns accepted; 20 turns in rejected (${(val(later, 'turns into the music') as number).toFixed(3)} turns); run-out at 2.4 s per turn clicks every ${(val(run, 'click every') as number).toFixed(4)} s; label and rim silent`,
      expected: 'NASA: "played from the outside in" with the stylus at the start (cover.md 1b); a locked groove repeats once per turn, every T / k',
      tolerance: 'exact region classification from the groove model; click period to 1e-9 s',
      pass: true,
    });
  });
});

describe('player.direction and the microscope', () => {
  it('the playing direction carries the groove inward by one pitch per turn; the other way plays backward', () => {
    const pitch = (R_OUTER_MUSIC_MM - R_INNER_MUSIC_MM) / (recordJson.meta.sideDurationsS['1'] / COVER_T);
    const cw = grooveDrift(groove, 1, 'cw');
    const ccw = grooveDrift(groove, 1, 'ccw');
    // Against the groove model's own pitch and the side length (1e-9 mm: rounding only).
    expect(cw).toBeCloseTo(-groove.pitchMm(1), 9);
    expect(Math.abs(cw + pitch)).toBeLessThan(1e-4); // record.json quotes side 1 to 0.01 s: 3e-6 relative
    expect(ccw).toBeCloseTo(groove.pitchMm(1), 9);

    const right = checkDirection({ direction: 'cw' });
    const wrong = checkDirection({ direction: 'ccw' });
    expect(right.ok).toBe(true);
    expect(val(right, 'groove carries the needle')).toBe('inward');
    expect(wrong.ok).toBe(false);
    expect(val(wrong, 'groove carries the needle')).toBe('outward');
    expect(val(wrong, 'plays')).toBe('backward');
    expect((val(right, 'drift per turn') as number) * 1000).toBeCloseTo(groove.pitchMm(1), 9);

    // The microscope's picture: grooves a pitch apart; one turn the playing way moves each by the drift, so a
    // quarter turn moves the pattern inward by a quarter pitch (outward for the other way).
    const g0 = microscopeGrooves(0, cw, 0.5);
    const gq = microscopeGrooves(0.25, cw, 0.5);
    const gb = microscopeGrooves(-0.25, cw, 0.5);
    for (let i = 1; i < g0.length; i++) expect(g0[i]! - g0[i - 1]!).toBeCloseTo(groove.pitchMm(1), 9);
    const nearest = (xs: number[], x: number) => xs.reduce((b, y) => (Math.abs(y - x) < Math.abs(b - x) ? y : b));
    const anchor = g0[Math.floor(g0.length / 2)]!;
    expect(nearest(gq, anchor + cw / 4) - (anchor + cw / 4)).toBeCloseTo(0, 9);
    expect(nearest(gb, anchor - cw / 4) - (anchor - cw / 4)).toBeCloseTo(0, 9);
    expect(microscopeGrooves(1, cw, 0.5)).toEqual(g0.map((y) => expect.closeTo(y, 9)));

    recordCheck({
      id: 'player.direction',
      claim: 'No arrow says which way the disc turns; the groove under the microscope does: turned the playing way it carries the needle inward one groove per turn, the other way it plays the side backward.',
      measured: `drift ${(cw * 1000).toFixed(2)} um per turn clockwise, +${(ccw * 1000).toFixed(2)} um counter-clockwise; microscope pattern moves a quarter pitch per quarter turn`,
      expected: `the groove model's pitch for side 1: 85.75 mm over ${recordJson.meta.sideDurationsS['1']} s / 3.59994 s turns = ${(pitch * 1000).toFixed(2)} um (12-inch radii, record.json); NASA "played from the outside in" (cover.md 1b)`,
      tolerance: '1e-9 mm against groove.ts; 1e-4 mm against the quoted side length',
      pass: true,
      notes: 'The groove radii are the 12-inch standard, not documented for the Voyager record; the direction does not depend on them.',
    });
  });
});

describe('player.firstSound', () => {
  const right = { side: 1, secondsPerTurn: TRUE_PERIOD_S, direction: 'cw', down: true, region: 'music', timeS: FIRST_LINE_S + 2, listenedS: 4 };

  it('hears the picture lines at the right settings, and every wrong state as the physics says', () => {
    // images-and-audio.md section 1: first frame at 15.63 s (quoted to 0.01 s); line period 8.326 ms measured
    // (3197.4 samples at 384 kHz, quoted to 0.1 sample = 0.26 us).
    expect(Math.abs(FIRST_LINE_S - 15.63)).toBeLessThan(0.01);
    expect(Math.abs(FIRST_PICTURE_LINE_S - 3197.4 / 384000)).toBeLessThan(0.05 / 384000);
    expect(Math.abs(FIRST_PICTURE_LINE_S * 1000 - 8.326)).toBeLessThan(0.001);

    const ok = checkFirstSound(right);
    expect(ok.ok).toBe(true);
    expect(val(ok, 'repeats every') as number).toBeCloseTo(FIRST_PICTURE_LINE_S, 12);
    expect(val(ok, 'repeats per turn') as number).toBeCloseTo(COVER_T / 0.0083266, 0);
    expect(ok.message).toMatch(/picture, sent line by line/);

    const fast = checkFirstSound({ ...right, secondsPerTurn: 3.47 });
    expect(fast.ok).toBe(false);
    expect(val(fast, 'speed ratio') as number).toBeCloseTo(1.03745, 5);
    expect(val(fast, 'repeats every') as number).toBeCloseTo(FIRST_PICTURE_LINE_S / (TRUE_PERIOD_S / 3.47), 12);
    const back = checkFirstSound({ ...right, direction: 'ccw' });
    expect(back.ok).toBe(false);
    expect(val(back, 'plays')).toBe('backward');
    const opening = checkFirstSound({ ...right, timeS: 6 });
    expect(opening.ok).toBe(false);
    expect(hear(readTurntable({ ...right, timeS: 6 })).kind).toBe('opening');
    const leadin = checkFirstSound({ ...right, region: 'leadin', timeS: -2 });
    expect(leadin.ok).toBe(false);
    const run = checkFirstSound({ ...right, region: 'runout', timeS: 3684.31, secondsPerTurn: 2.4 });
    expect(val(run, 'click every')).toBe(2.4);
    expect(checkFirstSound({ ...right, down: false, region: null, timeS: null }).ok).toBe(false);
    expect(checkFirstSound({ ...right, listenedS: 1 }).ok).toBe(false);
    expect(checkFirstSound({ ...right, side: 2 }).ok).toBe(false);
    expect(speedRatio(TRUE_PERIOD_S)).toBe(1);
    expect(semitones(2)).toBeCloseTo(12, 12);

    recordCheck({
      id: 'player.firstSound',
      claim: 'With the speed, the start and the direction right, the first sound off side 1 is not music and not speech but a steady pattern repeating every picture line: the first sound is a picture.',
      measured: `first picture line ${FIRST_LINE_S.toFixed(3)} s into the side; it repeats every ${(FIRST_PICTURE_LINE_S * 1000).toFixed(4)} ms (${(COVER_T / FIRST_PICTURE_LINE_S).toFixed(1)} per turn); at 3.47 s per turn every ${((val(fast, 'repeats every') as number) * 1000).toFixed(4)} ms`,
      expected: 'images-and-audio.md section 1: first frame at 15.63 s, line period 8.326 ms measured on the tape (cover: 8.34 ms); side 1 opens with the pictures (D-A17)',
      tolerance: '0.01 s for the first line and 0.001 ms for the period (the research quotes them to those places)',
      pass: true,
      notes: 'The side break and the pictures opening side 1 are an inference (D-A17). The period is frame L000\'s fitted period from the reference decoder.',
    });
  });
});
