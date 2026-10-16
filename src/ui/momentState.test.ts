// The staged moments' trigger (M4 step 7e): each of the five moments appears once, when its deduction is
// confirmed (never for a save loaded with it already confirmed, never for another deduction); moments confirmed
// together queue in play order; ending one (skip or time) shows the next; and the game state is the same
// before and after a moment. Check id: ui.moments.logic.

import { beforeEach, describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { resetAll } from '../game/gameService';
import { game, snapshot, type NodeRecord } from '../game/state';
import { MOMENT_IDS, activeMoment, endMoment, momentLog, resetMoments, startMoments } from './momentState';

const confirm = (...ids: string[]): void => {
  const next: Record<string, NodeRecord> = { ...game.records.value };
  for (const id of ids) next[id] = { confirmed: true, attempts: [{ answer: 'x', ok: true, result: [], message: 'ok', at: 1 }], hints: 0 };
  game.records.value = next;
};

beforeEach(() => {
  resetMoments();
  resetAll();
});

describe('staged moments', () => {
  it('appear once each on their deduction, queue in play order, and leave the game state as it was', () => {
    // A save that already holds a moment's deduction plays nothing when it loads.
    confirm('map.region');
    const stop = startMoments();
    expect(activeMoment.value).toBeNull();
    // Another deduction: no moment.
    confirm('map.motion');
    expect(activeMoment.value).toBeNull();

    confirm('spot.age');
    expect(activeMoment.value?.id).toBe('spot.age');
    const before = JSON.stringify(snapshot().game);
    endMoment('key');
    expect(JSON.stringify(snapshot().game)).toBe(before);
    expect(activeMoment.value).toBeNull();

    // Two at once queue in play order; each skip shows the next.
    confirm('trail.neighbour', 'trail.origin');
    expect(activeMoment.value?.id).toBe('trail.origin');
    endMoment('button');
    expect(activeMoment.value?.id).toBe('trail.neighbour');
    endMoment('click');
    expect(activeMoment.value).toBeNull();

    // Confirming again (the same set) plays nothing; trail.when plays once, and its time running out ends it.
    confirm('trail.origin');
    expect(activeMoment.value).toBeNull();
    confirm('trail.when');
    expect(activeMoment.value?.id).toBe('trail.when');
    endMoment('timeout');

    // After Start over the same deduction plays its moment again when it is confirmed again.
    resetAll();
    confirm('map.region');
    expect(activeMoment.value?.id).toBe('map.region');
    endMoment('key');
    stop();

    const log = momentLog().map((e) => `${e.id}:${e.ended}`);
    expect(log).toEqual(['spot.age:key', 'trail.origin:button', 'trail.neighbour:click', 'trail.when:timeout', 'map.region:key']);
    expect(new Set(MOMENT_IDS)).toEqual(new Set(momentLog().map((e) => e.id)));
    recordCheck({
      id: 'ui.moments.logic',
      claim: 'The five staged moments appear once each, when their deduction is confirmed (not when a save loads with it confirmed, not for other deductions), queue in play order when confirmed together, end by a key, a click, the button or their time, and leave the game state unchanged',
      measured: `moment log: ${log.join(', ')}; game state identical before and after a moment`,
      expected: 'one moment per confirmation of map.region, spot.age, trail.origin, trail.neighbour, trail.when (spec M4 step 7e section 2)',
      tolerance: 'exact',
      pass: true,
    });
  });
});
