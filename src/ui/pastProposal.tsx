// Past verdicts marked as past (M4 step 7c): once the player changes an instrument's input after a proposal, the
// result still on show is a verdict on the last proposal, not on what the instrument shows now. Every chapter's
// result area asks isPastProposal with the instrument's current answer (what Propose would send now) and, when
// it is past, dims itself and wears the PastLabel. A confirmed result is never past. Pure apart from the label.

import type { Answer, Attempt } from '../game/deductions';

/** Canonical JSON: object keys sorted, so the same answer always gives the same text. */
function canonical(a: Answer | undefined): string {
  if (a === undefined) return 'undefined';
  if (a === null || typeof a !== 'object') return JSON.stringify(a);
  if (Array.isArray(a)) return `[${a.map(canonical).join(',')}]`;
  return `{${Object.keys(a).sort().map((k) => `${JSON.stringify(k)}:${canonical(a[k])}`).join(',')}}`;
}

/** True when two answers are the same proposal. */
export function sameAnswer(a: Answer | undefined, b: Answer | undefined): boolean {
  return canonical(a) === canonical(b);
}

/**
 * True when the shown result belongs to a proposal the instrument no longer holds: the last attempt was refused
 * and the instrument's current answer differs from it. An instrument that does not say its current answer
 * (undefined) never marks its result as past; neither does a confirmed result.
 */
export function isPastProposal(last: Pick<Attempt, 'ok' | 'answer'> | null | undefined, current: Answer | undefined): boolean {
  return !!last && !last.ok && current !== undefined && !sameAnswer(last.answer, current);
}

/** The small label a past result wears (the result area also gets the class "is-past", dimmed in shell.css). */
export function PastLabel() {
  return (
    <p class="past-label" data-past-label="">
      your last proposal
    </p>
  );
}
