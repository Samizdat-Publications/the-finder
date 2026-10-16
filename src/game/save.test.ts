// The save under Node with a fake storage: round trip, a version 0 save migrated, bad data refused, settings
// persisted, autosave debounced, start over. Check id: game.save.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { dispatch } from './bus';
import { clearCheckers, installTestCheckers } from './deductions';
import { resetAll, setClock } from './gameService';
import { SAVE_KEY, flushSave, loadFromStorage, migrate, saveToStorage, serialize, startAutosave, type StorageLike } from './save';
import { defaultSettings, normalizeSettings } from './settings';
import { confirmedSet, game, snapshot } from './state';

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const propose = (id: string, answer: string): Promise<void> => dispatch({ type: 'deduction.propose', id, answer });

beforeEach(() => {
  resetAll();
  clearCheckers();
  installTestCheckers();
  let t = 5000;
  setClock(() => (t += 1));
});
afterEach(() => vi.useRealTimers());

describe('the save', () => {
  it('round trips confirmed nodes, wrong attempts, hints, the chapter and the settings', async () => {
    await propose('arrival.purpose', 'wrong guess');
    await propose('arrival.purpose', 'correct');
    await dispatch({ type: 'hint.request', id: 'arrival.heat' }).catch(() => undefined); // locked at first: refused
    await dispatch({ type: 'chapter.enter', chapter: 'key' });
    await dispatch({ type: 'hint.request', id: 'key.binary' });
    await dispatch({ type: 'settings.set', name: 'humanGloss', value: true });
    await dispatch({ type: 'settings.set', name: 'masterVolume', value: 0.35 });
    const before = snapshot().game;
    const storage = fakeStorage();
    saveToStorage(storage);
    expect(Object.keys(JSON.parse(storage.data.get(SAVE_KEY) ?? '{}')).sort()).toEqual(['chapter', 'nodes', 'seed', 'settings', 'version']);

    resetAll();
    expect(snapshot().game.confirmed).toEqual([]);
    expect(loadFromStorage(storage)).toBe(true);
    const after = snapshot().game;
    expect(after.confirmed).toEqual(before.confirmed);
    expect(after.chapter).toBe('key');
    expect(after.settings).toEqual({ ...defaultSettings(), humanGloss: true, masterVolume: 0.35 });
    expect(after.nodes['arrival.purpose']?.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(after.nodes['arrival.purpose']?.attempts).toEqual(before.nodes['arrival.purpose']?.attempts);
    expect(after.nodes['key.binary']?.hints).toBe(1);
    expect(confirmedSet.value.has('arrival.purpose')).toBe(true);
  });

  it('migrates a version 0 save and refuses what it cannot read', () => {
    const v0 = { done: ['arrival.purpose', 'arrival.heat', 'gone.forever'], current: 'arrival', sound: 0.5 };
    const s = migrate(v0);
    expect(s).not.toBeNull();
    expect(s?.version).toBe(1);
    expect(Object.keys(s?.nodes ?? {}).sort()).toEqual(['arrival.heat', 'arrival.purpose']); // the id the graph lacks is dropped
    expect(s?.nodes['arrival.heat']?.confirmed).toBe(true);
    expect(s?.chapter).toBe('arrival');
    expect(s?.settings.masterVolume).toBe(0.5);
    expect(s?.settings.humanGloss).toBe(false);

    expect(migrate({ version: 2, nodes: {} })).toBeNull(); // from a newer game: left alone
    expect(migrate(null)).toBeNull();
    expect(migrate('text')).toBeNull();
    const damaged = migrate({ version: 1, nodes: { 'arrival.purpose': { confirmed: 'yes', attempts: [{ ok: 'x' }, 5], hints: 99 } }, chapter: 'voices', settings: { masterVolume: 'loud' } });
    expect(damaged?.nodes['arrival.purpose']).toEqual({ confirmed: false, attempts: [], hints: 3 });
    expect(damaged?.chapter).toBe('hub'); // voices is not built
    expect(damaged?.settings).toEqual(defaultSettings());

    const storage = fakeStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadFromStorage(storage)).toBe(false);
    expect(loadFromStorage(fakeStorage())).toBe(false);
    const throwing: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
    expect(loadFromStorage(throwing)).toBe(false);
    expect(() => saveToStorage(throwing)).not.toThrow();
  });

  it('keeps settings across loads, validates them, and lets the OS reduced-motion preference set the default', async () => {
    expect(defaultSettings().humanGloss).toBe(false);
    expect(defaultSettings(true).reducedMotion).toBe(true);
    await dispatch({ type: 'settings.set', name: 'reducedMotion', value: true });
    await dispatch({ type: 'settings.set', name: 'soundCaptions', value: true });
    await expect(dispatch({ type: 'settings.set', name: 'masterVolume', value: 'loud' as unknown as number })).rejects.toThrow(/number/);
    await dispatch({ type: 'settings.set', name: 'masterVolume', value: 7 });
    expect(game.settings.value.masterVolume).toBe(1);
    const storage = fakeStorage();
    saveToStorage(storage);
    resetAll();
    loadFromStorage(storage);
    expect(game.settings.value).toEqual({ humanGloss: false, masterVolume: 1, reducedMotion: true, soundCaptions: true, showWorking: false });
    expect(normalizeSettings({ humanGloss: 'maybe', masterVolume: 0.2 }).humanGloss).toBe(false);
  });

  it('autosaves, debounced, on every state change; and flushes when asked', async () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    const stop = startAutosave(storage, 250);
    expect(storage.data.size).toBe(0); // loading writes nothing
    await propose('arrival.purpose', 'correct');
    await dispatch({ type: 'settings.set', name: 'humanGloss', value: true });
    expect(storage.data.size).toBe(0);
    vi.advanceTimersByTime(300);
    expect(JSON.parse(storage.data.get(SAVE_KEY) ?? '{}').nodes['arrival.purpose'].confirmed).toBe(true);
    await dispatch({ type: 'chapter.enter', chapter: 'arrival' });
    flushSave();
    expect(JSON.parse(storage.data.get(SAVE_KEY) ?? '{}').chapter).toBe('arrival');
    stop();
  });

  it('start over (save.reset) forgets the progress, keeps the settings and writes the empty save', async () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    const stop = startAutosave(storage, 250);
    await propose('arrival.purpose', 'correct');
    await dispatch({ type: 'settings.set', name: 'humanGloss', value: true });
    await dispatch({ type: 'chapter.enter', chapter: 'key' });
    flushSave();
    expect(Object.keys(JSON.parse(storage.data.get(SAVE_KEY) ?? '{}').nodes)).toEqual(['arrival.purpose']);
    await dispatch({ type: 'save.reset' });
    const saved = JSON.parse(storage.data.get(SAVE_KEY) ?? '{}');
    expect(saved.nodes).toEqual({});
    expect(saved.chapter).toBe('hub');
    expect(saved.settings.humanGloss).toBe(true);
    expect(snapshot().game.confirmed).toEqual([]);
    expect(serialize().nodes).toEqual({});
    stop();

    recordCheck({
      id: 'game.save',
      claim: 'The game saves every deduction, wrong attempt, hint and setting, loads them back exactly, migrates an old save, and start over clears the progress.',
      measured: 'round trip of confirmed nodes, attempts, hints, chapter and settings is exact; a version 0 save migrates (unknown ids dropped); damaged and newer-version saves are refused; autosave is debounced and flushes on request; save.reset writes an empty progress and keeps settings',
      expected: 'the save format described in docs/plans/M3_specs/step1-shell-graph-codex.md (finder.save.v1)',
      tolerance: 'exact',
      pass: true,
    });
  });
});
