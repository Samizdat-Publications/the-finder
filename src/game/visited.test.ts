// A chapter with no deductions (Our Frame) is "done" once the player has entered it: the visit is remembered in
// the save (an optional field, like the tour's), a save without it still loads, and Start over forgets it.
// Check id: game.visited.
import { beforeEach, describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { dispatch } from './bus';
import { chapterOpen, chapterStatus, clearCheckers, installTestCheckers } from './deductions';
import { resetAll, setClock } from './gameService';
import { NODES, chapterDef } from './graph';
import { cleanVisited, loadFromStorage, migrate, saveToStorage, serialize, type StorageLike } from './save';
import { confirmedSet, game, snapshot, visitedSet } from './state';

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const confirm = (id: string): Promise<void> => dispatch({ type: 'deduction.propose', id, answer: 'correct' });

/** Confirm every deduction in play, pass after pass (each pass confirms what has opened), until the chapter opens. */
async function openChapter(chapter: 'epilogue'): Promise<void> {
  for (let pass = 0; pass < 20 && !chapterOpen(chapter, confirmedSet.value); pass++) {
    for (const n of NODES) if (!confirmedSet.value.has(n.id)) await confirm(n.id).catch(() => undefined);
  }
  expect(chapterOpen(chapter, confirmedSet.value)).toBe(true);
}

beforeEach(() => {
  resetAll();
  clearCheckers();
  installTestCheckers();
  let t = 9000;
  setClock(() => (t += 1));
});

describe('a chapter with no deductions', () => {
  it('Our Frame has no deductions and is built', () => {
    expect(chapterDef('epilogue')?.built).toBe(true);
    expect(NODES.some((n) => n.chapter === 'epilogue')).toBe(false);
  });

  it('is open when its prerequisites are confirmed, and done once entered, not before', async () => {
    expect(chapterStatus('epilogue', confirmedSet.value, visitedSet.value)).toBe('locked');
    await openChapter('epilogue');
    expect(chapterStatus('epilogue', confirmedSet.value, visitedSet.value)).toBe('open');
    expect(snapshot().game.chapterStatus.epilogue).toBe('open');
    await dispatch({ type: 'chapter.enter', chapter: 'epilogue' });
    expect(game.chapter.value).toBe('epilogue');
    expect(game.visited.value).toEqual(['epilogue']);
    expect(chapterStatus('epilogue', confirmedSet.value, visitedSet.value)).toBe('done');
    expect(snapshot().game.chapterStatus.epilogue).toBe('done');
    // Entering again does not duplicate, and a chapter with deductions is never recorded.
    await dispatch({ type: 'chapter.enter', chapter: 'hub' });
    await dispatch({ type: 'chapter.enter', chapter: 'epilogue' });
    await dispatch({ type: 'chapter.enter', chapter: 'arrival' });
    expect(game.visited.value).toEqual(['epilogue']);
    // A chapter with deductions ignores the visited list: entering it is not finishing it, and a locked one stays locked.
    expect(chapterStatus('arrival', new Set(), new Set(['arrival']))).toBe('open');
    expect(chapterStatus('key', new Set(), new Set(['key']))).toBe('locked');
    recordCheck({
      id: 'game.visited',
      claim: 'A chapter with no deductions (Our Frame) is done once entered, and the visit is saved.',
      measured: 'open before entering, done after, visited list [epilogue]',
      expected: 'open, then done',
      tolerance: 'exact',
      pass: true,
    });
  });

  it('refuses it while locked', async () => {
    await expect(dispatch({ type: 'chapter.enter', chapter: 'epilogue' })).rejects.toThrow(/locked/);
    expect(game.visited.value).toEqual([]);
  });

  it('keeps the visit in the save, reads a save without the field, and cleans a damaged list', async () => {
    await openChapter('epilogue');
    await dispatch({ type: 'chapter.enter', chapter: 'epilogue' });
    const storage = fakeStorage();
    saveToStorage(storage);
    expect(JSON.parse(storage.data.get('finder.save.v1') ?? '{}').visited).toEqual(['epilogue']);
    resetAll();
    expect(game.visited.value).toEqual([]);
    expect(loadFromStorage(storage)).toBe(true);
    expect(game.visited.value).toEqual(['epilogue']);
    expect(chapterStatus('epilogue', confirmedSet.value, visitedSet.value)).toBe('done');

    // A save from before the field loads as none visited, and writes no field back.
    const old = migrate({ version: 1, nodes: {}, chapter: 'hub', settings: {}, seed: 'finder-1' });
    expect(old?.visited).toBeUndefined();
    resetAll();
    expect(Object.keys(serialize())).not.toContain('visited');

    expect(cleanVisited(['epilogue', 'epilogue', 'nonsense', 3])).toEqual(['epilogue']); // an unknown chapter is dropped, each kept once
    expect(cleanVisited('epilogue')).toEqual([]);
    expect(cleanVisited(undefined)).toEqual([]);
    expect(migrate({ version: 1, settings: {}, visited: ['epilogue', 'bogus'] })?.visited).toEqual(['epilogue']);
  });

  it('is forgotten by Start over', async () => {
    await openChapter('epilogue');
    await dispatch({ type: 'chapter.enter', chapter: 'epilogue' });
    expect(game.visited.value).toEqual(['epilogue']);
    await dispatch({ type: 'save.reset' });
    expect(game.visited.value).toEqual([]);
  });
});
