// The guided tour's commands, its saved state and its pure helpers, under Node (no browser).
import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch } from '../game/bus';
import { resetAll } from '../game/gameService';
import { SAVE_KEY, loadFromStorage, migrate, saveToStorage, serialize, type StorageLike } from '../game/save';
import { NODES } from '../game/graph';
import { game, snapshot } from '../game/state';
import { TOUR_OFF, cleanTour, clampStep, firstUnfinished, lastRefused, nodeUnlocked, parseText, partDots, progressFraction, startStep, stopDone } from './progress';
import { PARTS, STOPS } from './script';
import type { Stop } from './types';

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

beforeEach(() => resetAll());

/** Every deduction confirmed, so every chapter (the last stops sit in gated chapters) can be entered. */
const confirmAll = (): void => {
  game.records.value = Object.fromEntries(NODES.map((n) => [n.id, { confirmed: true, attempts: [], hints: 0 }]));
};

const arrivalStop = STOPS.findIndex((s) => s.chapter === 'arrival');

describe('tour commands', () => {
  it('a fresh game has the tour off at step 0, and the snapshot says so', () => {
    expect(game.tour.value).toEqual(TOUR_OFF);
    expect(snapshot().game.tour).toEqual({ on: false, step: 0, furthest: 0 });
    expect(game.chapter.value).toBe('hub');
  });

  it('tour.start on a fresh save goes to step 0 and turns the human units on', async () => {
    expect(game.settings.value.humanGloss).toBe(false);
    await dispatch({ type: 'tour.start' });
    expect(game.tour.value).toEqual({ on: true, step: 0, furthest: 0 });
    expect(game.settings.value.humanGloss).toBe(true);
    expect(game.chapter.value).toBe(STOPS[0]?.chapter);
  });

  it('tour.goto clamps to the script, raises furthest and enters the stop\'s chapter', async () => {
    await dispatch({ type: 'tour.start' });
    expect(arrivalStop).toBeGreaterThan(0);
    await dispatch({ type: 'tour.goto', step: arrivalStop });
    expect(game.tour.value).toEqual({ on: true, step: arrivalStop, furthest: arrivalStop });
    expect(game.chapter.value).toBe('arrival');
    await dispatch({ type: 'tour.goto', step: 0 });
    expect(game.tour.value).toEqual({ on: true, step: 0, furthest: arrivalStop }); // furthest never goes down
    expect(game.chapter.value).toBe(STOPS[0]?.chapter);
    confirmAll();
    await dispatch({ type: 'tour.goto', step: 10_000 });
    expect(game.tour.value.step).toBe(STOPS.length - 1);
    await dispatch({ type: 'tour.goto', step: -5 });
    expect(game.tour.value.step).toBe(0);
  });

  it('tour.goto closes the codex and the settings drawer', async () => {
    await dispatch({ type: 'tour.start' });
    await dispatch({ type: 'codex.open' });
    await dispatch({ type: 'settings.panel', open: true });
    await dispatch({ type: 'tour.goto', step: 1 });
    expect(game.codexOpen.value).toBe(false);
    expect(game.settingsOpen.value).toBe(false);
  });

  it('tour.exit turns the tour off, keeps the step and goes to the hub; tour.start then resumes there', async () => {
    await dispatch({ type: 'tour.start' });
    await dispatch({ type: 'tour.goto', step: arrivalStop });
    await dispatch({ type: 'tour.exit' });
    expect(game.tour.value).toEqual({ on: false, step: arrivalStop, furthest: arrivalStop });
    expect(game.chapter.value).toBe('hub');
    await dispatch({ type: 'tour.start' });
    expect(game.tour.value).toEqual({ on: true, step: arrivalStop, furthest: arrivalStop });
    expect(game.chapter.value).toBe('arrival');
  });

  it('a stop in a locked chapter is refused and the tour stays where it was', async () => {
    await dispatch({ type: 'tour.start' });
    await expect(dispatch({ type: 'tour.goto', step: STOPS.length - 1 })).rejects.toThrow(/locked/);
    expect(game.tour.value.step).toBe(0);
  });

  it('tour.start with a step goes there, clamped', async () => {
    await dispatch({ type: 'tour.start', step: 1 });
    expect(game.tour.value.step).toBe(1);
    confirmAll();
    await dispatch({ type: 'tour.start', step: 999 });
    expect(game.tour.value.step).toBe(STOPS.length - 1);
  });

  it('start over turns the tour off and forgets how far it got', async () => {
    await dispatch({ type: 'tour.start', step: arrivalStop });
    await dispatch({ type: 'save.reset' });
    expect(game.tour.value).toEqual(TOUR_OFF);
  });
});

describe('the saved tour', () => {
  it('round trips through the save', async () => {
    await dispatch({ type: 'tour.start', step: arrivalStop });
    const storage = fakeStorage();
    saveToStorage(storage);
    expect(JSON.parse(storage.data.get(SAVE_KEY) ?? '{}').tour).toEqual({ on: true, step: arrivalStop, furthest: arrivalStop });
    resetAll();
    expect(game.tour.value).toEqual(TOUR_OFF);
    expect(loadFromStorage(storage)).toBe(true);
    expect(game.tour.value).toEqual({ on: true, step: arrivalStop, furthest: arrivalStop });
  });

  it('a save without a tour loads as off, 0, 0 and a default tour is not written', async () => {
    await dispatch({ type: 'tour.start', step: 2 });
    const storage = fakeStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, nodes: {}, chapter: 'hub' }));
    expect(loadFromStorage(storage)).toBe(true);
    expect(game.tour.value).toEqual(TOUR_OFF);
    expect(serialize().tour).toBeUndefined();
    expect(migrate({ done: [], current: 'hub' })?.tour).toBeUndefined();
  });

  it('cleans bad values', () => {
    const top = STOPS.length - 1;
    expect(cleanTour(undefined)).toBeUndefined();
    expect(cleanTour('on')).toBeUndefined();
    expect(cleanTour([1, 2])).toBeUndefined();
    expect(cleanTour({ on: 'yes', step: 'x', furthest: null })).toEqual({ on: false, step: 0, furthest: 0 });
    expect(cleanTour({ on: true, step: 99_999, furthest: 3 })).toEqual({ on: true, step: top, furthest: top });
    expect(cleanTour({ on: true, step: -4, furthest: 1.9 })).toEqual({ on: true, step: 0, furthest: 1 });
    expect(cleanTour({ on: true, step: 2, furthest: 0 })).toEqual({ on: true, step: Math.min(2, top), furthest: Math.min(2, top) }); // furthest is never behind step
    expect(cleanTour({ on: true, step: Number.NaN, furthest: Infinity })).toEqual({ on: true, step: 0, furthest: 0 });
    const s = migrate({ version: 1, nodes: {}, chapter: 'hub', tour: { on: 1, step: 'a' } });
    expect(s?.tour).toEqual({ on: false, step: 0, furthest: 0 });
  });
});

const story = (id: string, part: Stop['part'] = 'prologue'): Stop => ({ id, part, kind: 'story', chapter: 'hub', title: id, look: 'x' });
const doStop = (id: string, node: string, part: Stop['part'] = 'arrival'): Stop => ({ id, part, kind: 'do', chapter: 'arrival', node, title: id, look: 'x', todo: 'y' });

describe('tour helpers', () => {
  const stops: Stop[] = [story('a'), story('b'), doStop('n1', 'node.one'), doStop('n2', 'node.two', 'key'), story('z', 'finale')];

  it('clamps steps', () => {
    expect(clampStep(-1, stops)).toBe(0);
    expect(clampStep(2.9, stops)).toBe(2);
    expect(clampStep(99, stops)).toBe(4);
    expect(clampStep(Number.NaN, stops)).toBe(0);
    expect(clampStep(3, [])).toBe(0);
  });

  it('a story stop is done once passed, a do stop once its node is confirmed', () => {
    const none = new Set<string>();
    expect(stopDone(stops[0] as Stop, 0, 0, none)).toBe(false);
    expect(stopDone(stops[0] as Stop, 0, 1, none)).toBe(true);
    expect(stopDone(stops[2] as Stop, 2, 9, none)).toBe(false);
    expect(stopDone(stops[2] as Stop, 2, 0, new Set(['node.one']))).toBe(true);
  });

  it('finds where to start', () => {
    const none = new Set<string>();
    expect(firstUnfinished(none, 0, stops)).toBe(0);
    expect(firstUnfinished(none, 2, stops)).toBe(2);
    expect(firstUnfinished(new Set(['node.one']), 2, stops)).toBe(3);
    expect(firstUnfinished(new Set(['node.one', 'node.two']), 5, stops)).toBe(4);
    expect(startStep(TOUR_OFF, none, undefined, stops)).toBe(0);
    expect(startStep({ on: false, step: 3, furthest: 3 }, none, undefined, stops)).toBe(3);
    expect(startStep({ on: false, step: 3, furthest: 3 }, none, 1, stops)).toBe(1);
    expect(startStep({ on: false, step: 0, furthest: 2 }, none, undefined, stops)).toBe(2);
  });

  it('Next stays locked on a do stop until its node is confirmed', () => {
    expect(nodeUnlocked(stops[0] as Stop, new Set())).toBe(true);
    expect(nodeUnlocked(stops[2] as Stop, new Set())).toBe(false);
    expect(nodeUnlocked(stops[2] as Stop, new Set(['node.one']))).toBe(true);
  });

  it('reads the last attempt', () => {
    const a = (ok: boolean) => ({ answer: null, ok, result: [], message: '', at: 0 });
    expect(lastRefused(undefined)).toBe(false);
    expect(lastRefused([])).toBe(false);
    expect(lastRefused([a(true), a(false)])).toBe(true);
    expect(lastRefused([a(false), a(true)])).toBe(false);
  });

  it('draws one dot per part that has stops, done, current, ahead, reachable up to furthest', () => {
    const dots = partDots(2, 2, stops, PARTS);
    expect(dots.map((d) => [d.id, d.state, d.reachable])).toEqual([
      ['prologue', 'done', true],
      ['arrival', 'current', true],
      ['key', 'ahead', false],
      ['finale', 'ahead', false],
    ]);
    expect(partDots(3, 3, stops, PARTS).find((d) => d.id === 'key')?.first).toBe(3);
  });

  it('gives the progress over the whole tour', () => {
    expect(progressFraction(0, stops)).toBeCloseTo(0.2, 12);
    expect(progressFraction(4, stops)).toBe(1);
    expect(progressFraction(0, [])).toBe(0);
  });
});

describe('the text formatter', () => {
  it('splits paragraphs on a blank line and marks **bold**, nothing else', () => {
    expect(parseText('One **two** three.\n\nSecond <b>para</b> *x*.')).toEqual([
      [
        { text: 'One ', bold: false },
        { text: 'two', bold: true },
        { text: ' three.', bold: false },
      ],
      [{ text: 'Second <b>para</b> *x*.', bold: false }],
    ]);
    expect(parseText('')).toEqual([]);
    expect(parseText('a\n \n\n \nb')).toEqual([[{ text: 'a', bold: false }], [{ text: 'b', bold: false }]]);
    expect(parseText('**all bold**')).toEqual([[{ text: 'all bold', bold: true }]]);
    expect(parseText('open **never closed')).toEqual([
      [
        { text: 'open ', bold: false },
        { text: 'never closed', bold: true },
      ],
    ]);
  });
});
