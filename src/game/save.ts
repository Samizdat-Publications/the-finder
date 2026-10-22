// The save: localStorage['finder.save.v1'] holds the version, each deduction's state and attempts, the hints
// shown, the current chapter and the settings. Loaded at start, written (debounced) on every state change,
// migrated by version. Storage is injected so the Node tests need no browser, and every access is guarded
// (private windows and blocked storage must not break the game).

import { effect } from '@preact/signals';
import { chapterDef, nodeDef, parseChapterHash, type ChapterView } from './graph';
import { DEFAULT_SEED, type Answer, type Attempt, type Reading } from './deductions';
import { PLAYTHROUGH_SEEDS, nextSeed } from './seeds';
import { defaultSettings, normalizeSettings, type Settings } from './settings';
import { cleanTour, type TourState } from '../tour/progress';
import { game, type NodeRecord } from './state';

export const SAVE_KEY = 'finder.save.v1';
export const SAVE_VERSION = 1;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface SaveV1 {
  version: 1;
  /** Only deductions that have an attempt, a hint or a confirmation. */
  nodes: Record<string, NodeRecord>;
  chapter: ChapterView;
  settings: Settings;
  /** The playthrough's seed (added in M3 step 3c; a save without one gets DEFAULT_SEED). */
  seed: string;
  /** The guided tour (added with the tour; a save without it loads as off, step 0, furthest 0). */
  tour?: TourState;
  /** Chapters with no deductions that were entered (added with Our Frame; a save without it loads as none visited). */
  visited?: string[];
}

/**
 * The save's seed: the default when it has none. A seed that is neither the default nor validated (a
 * time-based seed from Start over before M4 step 7d, about 1.3% of which fail a check: D-A28) moves to the next
 * validated seed (M4 step 7e). Deductions already confirmed stay confirmed with the readings they recorded.
 */
export function cleanSeed(raw: unknown, list: readonly string[] = PLAYTHROUGH_SEEDS): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 64) return DEFAULT_SEED;
  return raw === DEFAULT_SEED || list.includes(raw) ? raw : nextSeed(raw, list);
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function cleanAttempt(raw: unknown): Attempt | null {
  if (!isObject(raw) || typeof raw.ok !== 'boolean' || typeof raw.message !== 'string') return null;
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0;
  const result = Array.isArray(raw.result)
    ? (raw.result.filter((r) => isObject(r) && typeof r.key === 'string' && (typeof r.value === 'number' || typeof r.value === 'string')) as Reading[])
    : [];
  return { answer: (raw.answer ?? null) as Answer, ok: raw.ok, result, message: raw.message, at };
}

function cleanNodes(raw: unknown): Record<string, NodeRecord> {
  const out: Record<string, NodeRecord> = {};
  if (!isObject(raw)) return out;
  for (const [id, r] of Object.entries(raw)) {
    if (!nodeDef(id) || !isObject(r)) continue; // an id the graph no longer has is dropped
    const attempts = Array.isArray(r.attempts) ? r.attempts.map(cleanAttempt).filter((a): a is Attempt => a !== null) : [];
    const hints = typeof r.hints === 'number' ? Math.min(3, Math.max(0, Math.floor(r.hints))) : 0;
    out[id] = { confirmed: r.confirmed === true, attempts, hints };
  }
  return out;
}

/** The chapters the player has entered: only known, built chapter ids, each once. */
export function cleanVisited(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) if (typeof v === 'string' && chapterDef(v)?.built && !out.includes(v)) out.push(v);
  return out;
}

function cleanChapter(raw: unknown): ChapterView {
  if (typeof raw !== 'string') return 'hub';
  const v = parseChapterHash(raw);
  if (v === null) return 'hub';
  return v === 'hub' || chapterDef(v)?.built ? v : 'hub';
}

/**
 * Bring a stored value up to the current version. Returns null when it cannot be read (not an object, or
 * from a newer version of the game than this one, which must not be overwritten by guesswork).
 *
 * Version 0 (before saves had a version number) kept `{ done: [ids], current: chapter, sound: volume }`.
 */
export function migrate(raw: unknown): SaveV1 | null {
  if (!isObject(raw)) return null;
  const version = raw.version === undefined ? 0 : raw.version;
  if (version === 0) {
    const done = Array.isArray(raw.done) ? raw.done.filter((x): x is string => typeof x === 'string') : [];
    const nodes: Record<string, NodeRecord> = {};
    for (const id of done) if (nodeDef(id)) nodes[id] = { confirmed: true, attempts: [], hints: 0 };
    const settings = defaultSettings();
    if (typeof raw.sound === 'number' && Number.isFinite(raw.sound)) settings.masterVolume = Math.min(1, Math.max(0, raw.sound));
    return { version: 1, nodes, chapter: cleanChapter(raw.current), settings, seed: DEFAULT_SEED };
  }
  if (version === 1) {
    const tour = cleanTour(raw.tour);
    const out: SaveV1 = { version: 1, nodes: cleanNodes(raw.nodes), chapter: cleanChapter(raw.chapter), settings: normalizeSettings(raw.settings), seed: cleanSeed(raw.seed) };
    if (tour) out.tour = tour;
    const visited = cleanVisited(raw.visited);
    if (visited.length > 0) out.visited = visited;
    return out;
  }
  return null;
}

/** The current game state as a save. */
export function serialize(): SaveV1 {
  const nodes: Record<string, NodeRecord> = {};
  for (const [id, r] of Object.entries(game.records.value)) {
    if (r.confirmed || r.attempts.length > 0 || r.hints > 0) nodes[id] = r;
  }
  const out: SaveV1 = { version: 1, nodes, chapter: game.chapter.value, settings: game.settings.value, seed: game.seed.value };
  const t = game.tour.value;
  if (t.on || t.step > 0 || t.furthest > 0) out.tour = { ...t };
  if (game.visited.value.length > 0) out.visited = [...game.visited.value];
  return out;
}

export function applySave(s: SaveV1): void {
  game.records.value = s.nodes;
  game.chapter.value = s.chapter;
  game.settings.value = s.settings;
  game.seed.value = s.seed;
  game.tour.value = s.tour ? { ...s.tour } : { on: false, step: 0, furthest: 0 };
  game.visited.value = s.visited ? [...s.visited] : [];
}

/** Load from storage into the game state. Returns true when a save was found and used. */
export function loadFromStorage(storage: StorageLike): boolean {
  try {
    const text = storage.getItem(SAVE_KEY);
    if (!text) return false;
    const s = migrate(JSON.parse(text));
    if (!s) return false;
    applySave(s);
    return true;
  } catch {
    return false;
  }
}

export function saveToStorage(storage: StorageLike): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize()));
  } catch {
    // storage full or blocked: the game goes on without saving
  }
}

let active: { flush: () => void } | null = null;

/** Write the save now, if autosave is running (the page is closing, or a reset has just happened). */
export function flushSave(): void {
  active?.flush();
}

/**
 * Save on every state change that matters, debounced. Returns a function that stops it. The first run of
 * the effect (the state just loaded) writes nothing.
 */
export function startAutosave(storage: StorageLike, debounceMs = 250): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  const flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (dirty) saveToStorage(storage);
    dirty = false;
  };
  let first = true;
  const stopEffect = effect(() => {
    // Read every part of the save so the effect re-runs when any of them changes.
    void [game.records.value, game.chapter.value, game.settings.value, game.seed.value, game.tour.value, game.visited.value];
    if (first) {
      first = false;
      return;
    }
    dirty = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });
  const onHide = (): void => flush();
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
  }
  active = { flush };
  return () => {
    stopEffect();
    flush();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    }
    if (active?.flush === flush) active = null;
  };
}
