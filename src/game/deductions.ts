// The deduction graph's logic: what is locked, open or confirmed, the checkers that confirm a deduction, and
// hint tiers. Pure: no signals, no DOM. The state lives in state.ts; only the command bus (gameService.ts)
// changes it. Every deduction is confirmed by a checker that calls the science (rule 1); step 1 registers
// test checkers only, behind a flag.

import { NODES, chapterDef, nodeDef, type ChapterId, type NodeDef } from './graph';

export type NodeStatus = 'locked' | 'open' | 'confirmed';
export type ChapterStatus = 'later' | 'locked' | 'open' | 'done';

/** A value a player can propose: anything that survives JSON, so it can be saved. */
export type Answer = string | number | boolean | null | Answer[] | { [key: string]: Answer };

/** One reading in a checker's result. A reading with a dimension holds SI (seconds or metres). */
export interface Reading {
  /** English key, shown as a glyph label. */
  key: string;
  value: number | string;
  dim?: 'time' | 'length';
}

export interface CheckResult {
  ok: boolean;
  /** What the checker measured or computed: the alien's notation in the codex is built from this. */
  result: Reading[];
  /** What this answer showed, in plain English (also for a wrong one: PLAN.md "Principles"). */
  message: string;
}

export interface CheckContext {
  /** Attempts already made on this node. */
  attempts: number;
  confirmed: ReadonlySet<string>;
}

export type Checker = (answer: Answer, ctx: CheckContext) => CheckResult;

export interface Attempt {
  answer: Answer;
  ok: boolean;
  result: Reading[];
  message: string;
  /** Milliseconds since the epoch of the machine that played. */
  at: number;
}

export const HINT_TIER_NAMES = ['nudge', 'method', 'answer'] as const;

const checkers = new Map<string, Checker>();

export function registerChecker(id: string, checker: Checker): void {
  if (!nodeDef(id)) throw new Error(`no deduction ${id}`);
  checkers.set(id, checker);
}

export function hasChecker(id: string): boolean {
  return checkers.has(id);
}

export function getChecker(id: string): Checker | undefined {
  return checkers.get(id);
}

export function clearCheckers(): void {
  checkers.clear();
}

/** True when every id is in the confirmed set. */
function allConfirmed(ids: readonly string[], confirmed: ReadonlySet<string>): boolean {
  return ids.every((id) => confirmed.has(id));
}

/** A built chapter is open when everything it requires is confirmed. An unbuilt chapter is never open. */
export function chapterOpen(chapter: ChapterId, confirmed: ReadonlySet<string>): boolean {
  const def = chapterDef(chapter);
  if (!def || !def.built) return false;
  return allConfirmed(def.requires, confirmed);
}

export function chapterStatus(chapter: ChapterId, confirmed: ReadonlySet<string>): ChapterStatus {
  const def = chapterDef(chapter);
  if (!def || !def.built) return 'later';
  if (!chapterOpen(chapter, confirmed)) return 'locked';
  const mine = NODES.filter((n) => n.chapter === chapter);
  return mine.length > 0 && mine.every((n) => confirmed.has(n.id)) ? 'done' : 'open';
}

export function nodeStatus(id: string, confirmed: ReadonlySet<string>): NodeStatus {
  const def = nodeDef(id);
  if (!def) throw new Error(`no deduction ${id}`);
  if (confirmed.has(id)) return 'confirmed';
  return chapterOpen(def.chapter, confirmed) && allConfirmed(def.requires, confirmed) ? 'open' : 'locked';
}

/** The requirements of a node, chapter included, that are not confirmed yet. */
export function missingFor(id: string, confirmed: ReadonlySet<string>): string[] {
  const def = nodeDef(id);
  if (!def) throw new Error(`no deduction ${id}`);
  const chapter = chapterDef(def.chapter);
  const need = [...(chapter?.requires ?? []), ...def.requires];
  return need.filter((r, i) => need.indexOf(r) === i && !confirmed.has(r));
}

/** The nodes that are open right now in a chapter. */
export function openNodes(chapter: ChapterId, confirmed: ReadonlySet<string>): NodeDef[] {
  return NODES.filter((n) => n.chapter === chapter && nodeStatus(n.id, confirmed) === 'open');
}

/** Run the node's checker. Throws when the node is unknown, not open, or has no checker yet. */
export function evaluate(id: string, answer: Answer, confirmed: ReadonlySet<string>, attempts: number): CheckResult {
  const status = nodeStatus(id, confirmed);
  if (status === 'confirmed') throw new Error(`${id} is already confirmed`);
  if (status === 'locked') {
    throw new Error(`${id} is locked: it needs ${missingFor(id, confirmed).join(', ')} first`);
  }
  const checker = checkers.get(id);
  if (!checker) throw new Error(`${id} has no checker yet`);
  return checker(answer, { attempts, confirmed });
}

/** The flag the browser uses to ask for test checkers: the test handle must be on as well. */
export function testCheckersEnabled(search: string, harnessOn: boolean): boolean {
  return harnessOn && new URLSearchParams(search).get('testcheckers') === '1';
}

/**
 * Test checkers for every deduction that has no real checker: the answer "correct" confirms, anything else
 * is wrong and says so. Steps 3 to 6 register the real ones, which call the science.
 */
export function installTestCheckers(): void {
  for (const n of NODES) {
    if (checkers.has(n.id)) continue;
    checkers.set(n.id, (answer) => {
      const ok = answer === 'correct';
      return {
        ok,
        result: [{ key: 'test answer', value: typeof answer === 'string' ? answer : JSON.stringify(answer) }],
        message: ok ? 'The test checker accepts this.' : 'The test checker accepts only the word "correct".',
      };
    });
  }
}
