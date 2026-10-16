// The game's command handlers: the shell, the deduction graph, hints, the codex, settings and the save.
// Only the command bus calls these (rule 5). A command that cannot run rejects with the reason, after the
// reason has also been written to game.error for the interface to show. A WRONG answer is not an error: it
// is recorded as an attempt with what it showed.

import { DEFAULT_SEED, evaluate, nodeStatus, chapterOpen, type Answer, type Attempt } from './deductions';
import { chapterDef, nodeDef, type ChapterView } from './graph';
import { coerceSetting, defaultSettings, type SettingName, type Settings } from './settings';
import { confirmedSet, game, type NodeRecord } from './state';

let clock: () => number = () => Date.now();

/** Tests replace the clock so attempts are reproducible. */
export function setClock(fn: () => number): void {
  clock = fn;
}

function refuse(reason: string): never {
  game.error.value = reason;
  throw new Error(reason);
}

function record(id: string): NodeRecord {
  return game.records.value[id] ?? { confirmed: false, attempts: [], hints: 0 };
}

function putRecord(id: string, r: NodeRecord): void {
  game.records.value = { ...game.records.value, [id]: r };
}

export function enterChapter(view: ChapterView): void {
  if (view !== 'hub') {
    const def = chapterDef(view);
    if (!def) refuse(`no chapter ${String(view)}`);
    if (!def.built) refuse(`${def.title} is for later: its instruments are not built yet`);
    if (!chapterOpen(view, confirmedSet.value)) refuse(`${def.title} is locked`);
  }
  game.error.value = null;
  game.chapter.value = view;
}

export function propose(id: string, answer: Answer): void {
  const def = nodeDef(id);
  if (!def) refuse(`no deduction ${id}`);
  const prior = record(id);
  let outcome;
  try {
    outcome = evaluate(id, answer, confirmedSet.value, prior.attempts.length, game.seed.value);
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  game.error.value = null;
  const attempt: Attempt = { answer, ok: outcome.ok, result: outcome.result, message: outcome.message, at: clock() };
  putRecord(id, { ...prior, confirmed: outcome.ok, attempts: [...prior.attempts, attempt] });
}

/** Reveal the next hint tier of an open deduction: nudge, then method, then answer. */
export function requestHint(id: string): void {
  if (!nodeDef(id)) refuse(`no deduction ${id}`);
  if (nodeStatus(id, confirmedSet.value) !== 'open') refuse(`${id} is not open, so it has no hint to give`);
  const prior = record(id);
  if (prior.hints >= 3) refuse(`all three hints for ${id} are already shown`);
  game.error.value = null;
  putRecord(id, { ...prior, hints: prior.hints + 1 });
}

export function openCodex(id?: string): void {
  if (id !== undefined && !nodeDef(id)) refuse(`no deduction ${id}`);
  game.error.value = null;
  game.codexFocus.value = id ?? null;
  game.codexOpen.value = true;
}

export function closeCodex(): void {
  game.codexOpen.value = false;
  game.codexFocus.value = null;
}

export function setSetting<K extends SettingName>(name: K, value: unknown): void {
  let v: Settings[K];
  try {
    v = coerceSetting(name, value);
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  game.error.value = null;
  game.settings.value = { ...game.settings.value, [name]: v };
}

export function settingsPanel(open: boolean): void {
  game.settingsOpen.value = open;
}

/**
 * Start over: forget every deduction, hint and attempt, and go back to the hub. Settings stay as the player set
 * them. The new playthrough gets a new seed, from the (injectable) clock, so its measurements differ.
 */
export function resetSave(): void {
  game.error.value = null;
  game.records.value = {};
  game.seed.value = `finder-${clock()}`;
  game.chapter.value = 'hub';
  game.codexOpen.value = false;
  game.codexFocus.value = null;
  game.settingsOpen.value = false;
}

/** Back to a first run, settings included (tests only). */
export function resetAll(): void {
  resetSave();
  game.settings.value = defaultSettings();
  game.seed.value = DEFAULT_SEED;
}
