// The bench's pure parts under Node: the knob mapping onto the decoder's parameters, and the commands that
// need no browser (select, setParam, reset). Truth: referenceParams and the cover's own numbers.
import { describe, expect, it } from 'vitest';
import coverJson from '../../data/cover.json';
import { harnessEnabled } from '../harness/api';
import { BASE_RATE, referenceParams } from '../dsp/params';
import { binaryToSeconds } from '../science/units';
import { dispatch } from './bus';
import { COVER_LINE_MS, COVER_PERIOD_S, REFERENCE_ROWS, groove, lineTimePercentOff, radiusAtItemStart, referenceBench, resampleProfile, timeline, toDecodeParams } from './model';
import { decoder, snapshot, turntable } from './state';

describe('knobs to decoder parameters', () => {
  it('the reference bench is exactly the reference decode', () => {
    for (const ch of ['L', 'R'] as const) expect(toDecodeParams(ch, referenceBench())).toEqual(referenceParams(ch));
  });

  it('line time is the cover value and is only used with sync lock off', () => {
    expect(COVER_LINE_MS).toBeCloseTo(binaryToSeconds(coverJson.picture.lineTime.binary) * 1000, 12);
    expect(COVER_LINE_MS).toBeCloseTo(8.3396, 3);
    const off = toDecodeParams('L', { ...referenceBench(), syncLock: false, lineTimeMs: COVER_LINE_MS * 1.05 });
    expect(off.syncLock).toBe(false);
    expect(off.linePeriod).toBeCloseTo(COVER_LINE_MS * 1.05 * (BASE_RATE / 1000), 9);
    expect(lineTimePercentOff(COVER_LINE_MS * 1.05)).toBeCloseTo(5, 9);
    expect(toDecodeParams('L', { ...referenceBench(), lineTimeMs: 9 }).linePeriod).toBeNull();
  });

  it('turns interlace, droop and polarity off or over, and resamples the row profile', () => {
    const p = toDecodeParams('R', { ...referenceBench(), interlace: false, droop: false, polarity: 'positive', rows: 400 });
    expect(p.delta).toBe(0);
    expect(p.tau).toBe(1e12);
    expect(p.polarity).toBe('positive');
    expect(p.nRows).toBe(400);
    expect(p.parityProfile?.length).toBe(400);
    const prof = [1, 2, 3, 4];
    expect(resampleProfile(prof, 4)).toEqual(prof);
    const up = resampleProfile(prof, 8);
    expect(up.length).toBe(8);
    expect(up[0]).toBe(1);
    expect(up[7]).toBe(4);
    for (let i = 1; i < 8; i++) expect(up[i]!).toBeGreaterThanOrEqual(up[i - 1]!);
  });
});

describe('the record model', () => {
  it('uses the cover period and puts Johnny B. Goode inside the music band of side 1', () => {
    expect(COVER_PERIOD_S).toBeCloseTo(3.59994, 4);
    const e = timeline.entryById('ozma-11');
    expect(e.item.musicNumber).toBe(7);
    expect(e.item.title).toBe('Johnny B. Goode');
    const r = radiusAtItemStart(1, 'ozma-11', 1);
    expect(groove.regionAtRadius(r)).toBe('music');
    expect(timeline.itemAt(1, groove.timeAtRadius(1, r))?.entry.item.id).toBe('ozma-11');
    expect(REFERENCE_ROWS).toBe(355);
  });
});

describe('the command bus (commands that need no browser)', () => {
  it('select, setParam and reset change the state and nothing else does', async () => {
    await dispatch({ type: 'decoder.select', frame: 'R072' });
    expect(decoder.frame.value).toBe('R072');
    await dispatch({ type: 'decoder.setParam', name: 'lineTimeMs', value: 8.75 });
    await dispatch({ type: 'decoder.setParam', name: 'syncLock', value: false });
    expect(snapshot().decoder.bench).toMatchObject({ lineTimeMs: 8.75, syncLock: false });
    await dispatch({ type: 'decoder.reset' });
    expect(snapshot().decoder.bench).toEqual(referenceBench());
    await expect(dispatch({ type: 'decoder.select', frame: 'X999' })).rejects.toThrow();
    await expect(dispatch({ type: 'decoder.setParam', name: 'lineTimeMs', value: -1 })).rejects.toThrow();
    expect(snapshot().decoder.bench.lineTimeMs).toBeCloseTo(COVER_LINE_MS, 12);
  });

  it('speed is set from seconds per turn and reads back as a ratio to the true speed', async () => {
    await dispatch({ type: 'turntable.setSpeed', secondsPerTurn: 3.47 });
    expect(turntable.secondsPerTurn.value).toBe(3.47);
    expect(snapshot().turntable.speedRatio).toBeCloseTo(COVER_PERIOD_S / 3.47, 12);
    await expect(dispatch({ type: 'turntable.setSpeed', secondsPerTurn: 0 })).rejects.toThrow();
    await dispatch({ type: 'turntable.setSpeed', secondsPerTurn: COVER_PERIOD_S });
  });

  it('refuses to drop the needle before a side is loaded', async () => {
    await expect(dispatch({ type: 'turntable.drop', radiusMm: 100 })).rejects.toThrow(/Load a side/);
    expect(turntable.status.value).toBe('error');
  });

  it('the test handle is installed only in dev or with ?harness=1', () => {
    expect(harnessEnabled('', false)).toBe(false);
    expect(harnessEnabled('?x=1', false)).toBe(false);
    expect(harnessEnabled('?harness=1', false)).toBe(true);
    expect(harnessEnabled('', true)).toBe(true);
  });
});
